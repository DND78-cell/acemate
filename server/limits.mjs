// In-memory request limits. Every AI request spends the site owner's Claude
// credits, so each person (or, for guests, each IP address) gets a budget per
// window. Limits reset when the server restarts; for several server
// instances, put a shared limiter (e.g. Redis) in front instead.

export function createLimiter({ limit, windowMs }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  /** Count one request; returns seconds to wait when over the limit, else 0. */
  return function take(key) {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count > limit ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  };
}
