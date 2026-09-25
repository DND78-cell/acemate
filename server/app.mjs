// AceMate's API: sign-in, saved data, and Claude. Shared by the regular
// server (server/index.mjs) and the Vercel function (api/index.js).

import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { bodyLimit } from "hono/body-limit";
import { stream } from "hono/streaming";
import { createAuth } from "./auth.mjs";
import { createLimiter } from "./limits.mjs";
import { aiConfigured, generateJson, streamChat, IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES } from "./ai.mjs";

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const MODELS = new Set(["aceOne", "aceUltra"]);
const EFFORTS = new Set(["quick", "balanced", "max"]);

const NOTES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "keyPoints", "terms", "flashcards", "quiz"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    terms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "definition"],
        properties: { term: { type: "string" }, definition: { type: "string" } },
      },
    },
    flashcards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer"],
        properties: { question: { type: "string" }, answer: { type: "string" } },
      },
    },
    quiz: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "options", "correctIndex"],
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correctIndex: { type: "integer" },
        },
      },
    },
  },
};

function checkImages(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > MAX_IMAGES) return null;
  const out = [];
  for (const img of list) {
    if (!img || !IMAGE_TYPES.includes(img.mediaType) || typeof img.data !== "string") return null;
    if (!/^[A-Za-z0-9+/=]+$/.test(img.data) || img.data.length * 0.75 > MAX_IMAGE_BYTES) return null;
    out.push({ mediaType: img.mediaType, data: img.data });
  }
  return out;
}

function checkTurns(list) {
  if (!Array.isArray(list) || list.length === 0 || list.length > 400) return null;
  let total = 0;
  for (const t of list) {
    if (!t || (t.role !== "user" && t.role !== "assistant") || typeof t.content !== "string" || !t.content.trim()) return null;
    total += t.content.length;
  }
  if (total > 600_000) return null;
  if (list[0].role !== "user" || list[list.length - 1].role !== "user") return null;
  return list.map((t) => ({ role: t.role, content: t.content }));
}

function titleFromMessages(messages) {
  const first = messages.find((m) => m && m.role === "user");
  const part = first?.parts?.find?.((p) => p && p.type === "text");
  const text = typeof part?.text === "string" ? part.text.trim() : "";
  if (!text) return "New chat";
  const clipped = text.length > 40 ? text.slice(0, 40) : text;
  return clipped.replace(/[\s.,;:!?—-]+$/u, "").trim() || "New chat";
}

const fail = (c, status, code, message) => c.json({ error: { code, message } }, status);

export function createApp({ db, env = process.env }) {
  const REQUIRE_SIGNIN = env.ACEMATE_REQUIRE_SIGNIN === "true";
  // On Vercel the platform's proxy is always in front.
  const TRUST_PROXY = env.ACEMATE_TRUST_PROXY ? env.ACEMATE_TRUST_PROXY === "true" : Boolean(env.VERCEL);
  const USER_AI_PER_HOUR = Number(env.ACEMATE_AI_LIMIT_PER_HOUR || 60);
  const GUEST_AI_PER_HOUR = Number(env.ACEMATE_GUEST_AI_LIMIT_PER_HOUR || 10);
  const SECURE_COOKIES = env.ACEMATE_SECURE_COOKIES ? env.ACEMATE_SECURE_COOKIES === "true" : undefined;

  const auth = createAuth(db, { secureCookies: SECURE_COOKIES });
  const userAiLimit = createLimiter(db, { name: "ai-user", limit: USER_AI_PER_HOUR, windowMs: 3_600_000 });
  const guestAiLimit = createLimiter(db, { name: "ai-guest", limit: GUEST_AI_PER_HOUR, windowMs: 3_600_000 });
  const authLimit = createLimiter(db, { name: "auth", limit: 20, windowMs: 15 * 60_000 });

  function clientIp(c) {
    if (TRUST_PROXY) {
      // The address the hosting proxy saw. Earlier X-Forwarded-For entries come
      // from the visitor and could be faked, so only the last one is used.
      const real = c.req.header("x-real-ip");
      if (real) return real.trim();
      const forwarded = c.req.header("x-forwarded-for");
      if (forwarded) return forwarded.split(",").pop().trim();
    }
    try {
      return getConnInfo(c).remote.address ?? "unknown";
    } catch {
      return "unknown";
    }
  }

  /** The signed-in user, looked up once per request. */
  async function userOf(c) {
    if (!c.get("userLoaded")) {
      c.set("user", await auth.currentUser(c));
      c.set("userLoaded", true);
    }
    return c.get("user");
  }

  async function requireUser(c) {
    const user = await userOf(c);
    if (!user) return [null, fail(c, 401, "sign_in_required", "Sign in to use this.")];
    return [user, null];
  }

  /** Counts one AI request against the person's (or guest IP's) hourly budget. */
  async function aiGate(c) {
    const user = await userOf(c);
    if (!user && REQUIRE_SIGNIN) return fail(c, 401, "sign_in_required", "Sign in to use AceMate.");
    const wait = user ? await userAiLimit(user.id) : await guestAiLimit(clientIp(c));
    if (wait) {
      c.header("Retry-After", String(wait));
      return fail(c, 429, "rate_limited", user ? "Hourly limit reached." : "Guest limit reached. Sign in for more.");
    }
    return null;
  }

  const app = new Hono();

  app.onError((err, c) => {
    console.error("request failed:", err?.message ?? err);
    return fail(c, 500, "server_error", "Something went wrong on the server.");
  });

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("X-Frame-Options", "SAMEORIGIN");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  });

  // Changing requests must carry AceMate's header. Other sites can't add a
  // custom header without a CORS preflight this server never approves, which
  // blocks cross-site request forgery against signed-in people.
  app.use("/api/*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD" && c.req.header("x-acemate") !== "1") {
      return fail(c, 403, "forbidden", "Missing request header.");
    }
    await next();
  });

  const tooLarge = (c) => fail(c, 413, "too_large", "That request is too large.");
  app.use("/api/ai/*", bodyLimit({ maxSize: 40 * 1024 * 1024, onError: tooLarge }));
  app.use("/api/*", async (c, next) => {
    if (c.req.path.startsWith("/api/ai/")) return next();
    return bodyLimit({ maxSize: 4 * 1024 * 1024, onError: tooLarge })(c, next);
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/me", async (c) =>
    c.json({
      user: await userOf(c),
      requireSignIn: REQUIRE_SIGNIN,
      aiConfigured: aiConfigured(),
      images: { maxCount: MAX_IMAGES, maxInputBytes: 20 * 1024 * 1024, mediaTypes: IMAGE_TYPES },
    }),
  );

  // ─── Accounts ──────────────────────────────────────────────────────────────

  async function authRoute(c, action) {
    if (await authLimit(clientIp(c))) return fail(c, 429, "rate_limited", "Too many attempts. Try again in a few minutes.");
    const body = await c.req.json().catch(() => ({}));
    const result = await action(c, body.email, body.password);
    if (result.error) return fail(c, 400, "auth_failed", result.error);
    return c.json({ user: result.user });
  }

  app.post("/api/auth/signup", (c) => authRoute(c, auth.signUp));
  app.post("/api/auth/signin", (c) => authRoute(c, auth.signIn));
  app.post("/api/auth/signout", async (c) => {
    await auth.signOut(c);
    return c.json({ ok: true });
  });

  // ─── Claude ────────────────────────────────────────────────────────────────

  app.post("/api/ai/chat", async (c) => {
    const blocked = await aiGate(c);
    if (blocked) return blocked;
    const body = await c.req.json().catch(() => null);
    const turns = checkTurns(body?.turns);
    const images = checkImages(body?.images);
    const system = typeof body?.system === "string" ? body.system.slice(0, 40_000) : "";
    if (!turns || !images || !MODELS.has(body?.model) || !EFFORTS.has(body?.effort)) {
      return fail(c, 400, "bad_request", "That request wasn't in the expected shape.");
    }

    c.header("Content-Type", "application/x-ndjson; charset=utf-8");
    c.header("Cache-Control", "no-store");
    c.header("X-Accel-Buffering", "no");
    return stream(c, async (out) => {
      const ctl = new AbortController();
      out.onAbort(() => ctl.abort());
      let writes = Promise.resolve();
      const send = (event) => {
        writes = writes.then(() => out.write(JSON.stringify(event) + "\n")).catch(() => ctl.abort());
      };
      await streamChat({ system, turns, images, model: body.model, effort: body.effort, signal: ctl.signal }, send);
      await writes;
    });
  });

  app.post("/api/ai/notes", async (c) => {
    const blocked = await aiGate(c);
    if (blocked) return blocked;
    const body = await c.req.json().catch(() => null);
    const images = checkImages(body?.images);
    const prompt = typeof body?.prompt === "string" ? body.prompt.slice(0, 40_000) : "";
    if (!prompt || !images || !images.length || !MODELS.has(body?.model) || !EFFORTS.has(body?.effort)) {
      return fail(c, 400, "bad_request", "That request wasn't in the expected shape.");
    }
    const ctl = new AbortController();
    c.req.raw.signal?.addEventListener("abort", () => ctl.abort());
    const result = await generateJson({
      prompt,
      images,
      schema: NOTES_SCHEMA,
      model: body.model,
      effort: body.effort,
      signal: ctl.signal,
    });
    if (result.error) return fail(c, result.error === "not_configured" ? 503 : 502, result.error, "Couldn't make notes.");
    return c.json({ result: result.data });
  });

  // ─── Saved chats ───────────────────────────────────────────────────────────

  app.get("/api/chats", async (c) => {
    const [user, err] = await requireUser(c);
    if (err) return err;
    const chats = await db.all(
      "SELECT id, title, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20",
      [user.id],
    );
    return c.json({ chats });
  });

  app.get("/api/chats/:id", async (c) => {
    const [user, err] = await requireUser(c);
    if (err) return err;
    const row = await db.get("SELECT messages FROM chats WHERE user_id = ? AND id = ?", [user.id, c.req.param("id")]);
    if (!row) return fail(c, 404, "not_found", "No such chat.");
    return c.json({ messages: JSON.parse(row.messages) });
  });

  app.put("/api/chats/:id", async (c) => {
    const [user, err] = await requireUser(c);
    if (err) return err;
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    if (!ID_RE.test(id) || !Array.isArray(body?.messages) || !body.messages.length) {
      return fail(c, 400, "bad_request", "That chat wasn't in the expected shape.");
    }
    const json = JSON.stringify(body.messages);
    const now = new Date().toISOString();
    // The title is set once, from the first message, and kept after that.
    await db.run(
      `INSERT INTO chats (user_id, id, title, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at`,
      [user.id, id, titleFromMessages(body.messages), json, now, now],
    );
    return c.json({ ok: true });
  });

  // ─── Chapter notes ─────────────────────────────────────────────────────────

  app.post("/api/notes", async (c) => {
    const [user, err] = await requireUser(c);
    if (err) return err;
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.result !== "object" || body.result === null) {
      return fail(c, 400, "bad_request", "Those notes weren't in the expected shape.");
    }
    const id = randomUUID();
    const subject = typeof body.subject === "string" ? body.subject.slice(0, 200) : "";
    const title = typeof body.result.title === "string" ? body.result.title.slice(0, 200) : null;
    await db.run("INSERT INTO notes (id, user_id, subject, title, result, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
      id,
      user.id,
      subject,
      title,
      JSON.stringify(body.result),
      new Date().toISOString(),
    ]);
    return c.json({ id });
  });

  app.get("/api/notes", async (c) => {
    const [user, err] = await requireUser(c);
    if (err) return err;
    const notes = await db.all(
      "SELECT id, subject, title, created_at FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
      [user.id],
    );
    return c.json({ notes });
  });

  app.get("/api/notes/:id", async (c) => {
    const [user, err] = await requireUser(c);
    if (err) return err;
    const row = await db.get("SELECT result FROM notes WHERE user_id = ? AND id = ?", [user.id, c.req.param("id")]);
    if (!row) return fail(c, 404, "not_found", "No such notes.");
    return c.json({ result: JSON.parse(row.result) });
  });

  // ─── Companion activity ────────────────────────────────────────────────────

  app.post("/api/companion", async (c) => {
    const [user, err] = await requireUser(c);
    if (err) return err;
    const body = await c.req.json().catch(() => ({}));
    const id = randomUUID();
    const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 200) : "";
    await db.run(
      "INSERT INTO companion_sessions (id, user_id, subject, message_count, started_at) VALUES (?, ?, ?, 1, ?)",
      [id, user.id, subject, new Date().toISOString()],
    );
    return c.json({ id });
  });

  app.patch("/api/companion/:id", async (c) => {
    const [user, err] = await requireUser(c);
    if (err) return err;
    const body = await c.req.json().catch(() => null);
    const count = Number(body?.message_count);
    if (!Number.isInteger(count) || count < 1 || count > 100_000) return fail(c, 400, "bad_request", "Bad count.");
    await db.run("UPDATE companion_sessions SET message_count = ? WHERE user_id = ? AND id = ?", [
      count,
      user.id,
      c.req.param("id"),
    ]);
    return c.json({ ok: true });
  });

  app.get("/api/companion/activity", async (c) => {
    const [user, err] = await requireUser(c);
    if (err) return err;
    const year = Number(c.req.query("year"));
    const month = Number(c.req.query("month"));
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return fail(c, 400, "bad_request", "Invalid year or month.");
    }
    // One day of slack each side covers every time zone; the page keeps its own month.
    const start = new Date(Date.UTC(year, month - 1, 0)).toISOString();
    const end = new Date(Date.UTC(year, month, 2)).toISOString();
    const sessions = await db.all(
      "SELECT started_at, message_count FROM companion_sessions WHERE user_id = ? AND started_at >= ? AND started_at < ? ORDER BY started_at",
      [user.id, start, end],
    );
    return c.json({ sessions: sessions.map((s) => ({ started_at: s.started_at, message_count: Number(s.message_count) })) });
  });

  app.all("/api/*", (c) => fail(c, 404, "not_found", "No such endpoint."));

  return app;
}
