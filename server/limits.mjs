// Request limits. Every AI request spends the site owner's Claude credits,
// so each person (or, for guests, each IP address) gets a budget per window.
// Counts live in the database, so they hold across restarts and across every
// copy of the server (Vercel runs many).

const TAKE = `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
ON CONFLICT (key) DO UPDATE SET
  count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
  reset_at = CASE WHEN rate_limits.reset_at <= ? THEN ? ELSE rate_limits.reset_at END
RETURNING count, reset_at`;

const PEEK = "SELECT count, reset_at FROM rate_limits WHERE key = ?";

export function createLimiter(db, { name, limit, windowMs }) {
  const keyOf = (key) => `${name}:${key}`;
  return {
    limit,
    windowMs,

    /** Count one request; resolves to seconds to wait when over the limit, else 0. */
    async take(key) {
      const now = Date.now();
      try {
        const row = await db.get(TAKE, [keyOf(key), now + windowMs, now, now, now + windowMs]);
        if (Math.random() < 0.01) {
          db.run("DELETE FROM rate_limits WHERE reset_at <= ?", [now]).catch(() => undefined);
        }
        const count = Number(row?.count ?? 1);
        const resetAt = Number(row?.reset_at ?? now + windowMs);
        return count > limit ? Math.max(1, Math.ceil((resetAt - now) / 1000)) : 0;
      } catch (err) {
        // A counting hiccup shouldn't lock people out.
        console.error("rate limit check failed:", err?.message ?? err);
        return 0;
      }
    },

    /**
     * This window's use, without counting anything. `resetAt` (ms) is null
     * until the first request starts a window.
     */
    async peek(key) {
      try {
        const row = await db.get(PEEK, [keyOf(key)]);
        const resetAt = Number(row?.reset_at ?? 0);
        if (!row || resetAt <= Date.now()) return { used: 0, resetAt: null };
        return { used: Number(row.count ?? 0), resetAt };
      } catch (err) {
        console.error("rate limit read failed:", err?.message ?? err);
        return { used: 0, resetAt: null };
      }
    },
  };
}
