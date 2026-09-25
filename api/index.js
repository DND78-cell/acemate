// AceMate's API as a Vercel Function. vercel.json sends every /api/... address
// here; Vercel serves the website itself from dist/web.
// Needs a Postgres database (DATABASE_URL) and ANTHROPIC_API_KEY.

import { openDatabase } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";

let appPromise = null;

function getApp() {
  if (!appPromise) {
    appPromise = openDatabase().then((db) => createApp({ db }));
    // Try again on the next request if the database couldn't be opened.
    appPromise.catch(() => {
      appPromise = null;
    });
  }
  return appPromise;
}

const REWRITTEN = new Set(["/api", "/api/", "/api/index", "/api/index.js"]);

/**
 * vercel.json rewrites /api/<path> to /api?__acemate_path=<path>. Vercel usually
 * hands the function the original address anyway; if it hands over the
 * rewritten one, rebuild the original from the query parameter.
 */
function originalRequest(request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("__acemate_path");
  if (path === null) return request;
  url.searchParams.delete("__acemate_path");
  if (REWRITTEN.has(url.pathname)) url.pathname = "/api/" + path.replace(/^\/+/, "");
  const init = { method: request.method, headers: request.headers, signal: request.signal };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  return new Request(url, init);
}

function failure(status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function handle(request) {
  let app;
  try {
    app = await getApp();
  } catch (err) {
    if (err?.code !== "no_database") console.error("couldn't open the database:", err?.message ?? err);
    return failure(
      503,
      "no_database",
      err?.code === "no_database"
        ? "No database is connected. Add a Postgres database to the Vercel project."
        : "The database isn't reachable right now.",
    );
  }
  return app.fetch(originalRequest(request));
}

export default { fetch: handle };
