// Email + password accounts with cookie sessions.
// Passwords: scrypt with a per-user salt. Sessions: a random token in an
// HttpOnly cookie; only its SHA-256 hash is stored.

import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

const scrypt = promisify(scryptCb);

export const SESSION_COOKIE = "acemate_session";
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

async function verifyPassword(password, stored) {
  const [kind, N, r, p, saltB64, keyB64] = String(stored).split("$");
  if (kind !== "scrypt") return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return expected.length === key.length && timingSafeEqual(expected, key);
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export function createAuth(db, { secureCookies }) {
  const q = {
    userByEmail: db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?"),
    insertUser: db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"),
    insertSession: db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"),
    sessionUser: db.prepare(
      "SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    ),
    deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
    purgeExpired: db.prepare("DELETE FROM sessions WHERE expires_at <= ?"),
  };

  const isSecure = (c) =>
    secureCookies ?? (c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:");

  function startSession(c, userId) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
    q.insertSession.run(sha256(token), userId, now.toISOString(), expires.toISOString());
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isSecure(c),
      sameSite: "Lax",
      path: "/",
      expires,
    });
  }

  /** The signed-in user for this request, or null. */
  function currentUser(c) {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) return null;
    const row = q.sessionUser.get(sha256(token), new Date().toISOString());
    return row ? { id: row.id, email: row.email } : null;
  }

  async function signUp(c, email, password) {
    email = String(email ?? "").trim();
    password = String(password ?? "");
    if (!EMAIL_RE.test(email) || email.length > 254) return { error: "Enter a valid email address." };
    if (password.length < 8) return { error: "Use a password of at least 8 characters." };
    if (password.length > 256) return { error: "That password is too long." };
    if (q.userByEmail.get(email)) return { error: "An account with that email already exists. Sign in instead." };
    const id = randomUUID();
    q.insertUser.run(id, email, await hashPassword(password), new Date().toISOString());
    startSession(c, id);
    return { user: { id, email } };
  }

  async function signIn(c, email, password) {
    const row = q.userByEmail.get(String(email ?? "").trim());
    // Hash even when the account doesn't exist so timing doesn't reveal it.
    const ok = row
      ? await verifyPassword(String(password ?? ""), row.password_hash)
      : (await hashPassword("placeholder"), false);
    if (!row || !ok) return { error: "That email and password don't match an account." };
    startSession(c, row.id);
    return { user: { id: row.id, email: row.email } };
  }

  function signOut(c) {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) q.deleteSession.run(sha256(token));
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
  }

  // Tidy expired sessions now and then.
  const purge = () => q.purgeExpired.run(new Date().toISOString());
  purge();
  setInterval(purge, 6 * 3_600_000).unref();

  return { currentUser, signUp, signIn, signOut };
}
