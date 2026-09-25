// AceMate server: the website and its API in one Node process.
//   npm run build   (once, builds the site into dist/web)
//   npm start       (serves it on PORT, default 8787)
// On Vercel, api/index.js runs the same API and Vercel serves the site.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { openDatabase } from "./db.mjs";
import { createApp } from "./app.mjs";
import { aiConfigured } from "./ai.mjs";

const env = process.env;
const PORT = Number(env.PORT || 8787);
const HOST = env.HOST || "0.0.0.0";
const WEB_ROOT = resolve(env.ACEMATE_WEB_ROOT || "dist/web");

const db = await openDatabase(env);
const app = createApp({ db, env });

// ─── The website ─────────────────────────────────────────────────────────────

if (!existsSync(resolve(WEB_ROOT, "index.html"))) {
  console.warn(`No built site at ${WEB_ROOT}. Run "npm run build" first; the API still works.`);
}

app.use(
  "/assets/*",
  serveStatic({
    root: WEB_ROOT,
    rewriteRequestPath: (p) => p,
    onFound: (_path, c) => c.header("Cache-Control", "public, max-age=31536000, immutable"),
  }),
);
app.use("*", serveStatic({ root: WEB_ROOT }));

// Every other page address belongs to the single-page app.
app.get("*", (c) => {
  const index = resolve(WEB_ROOT, "index.html");
  if (!existsSync(index)) return c.text("AceMate's site hasn't been built yet. Run: npm run build", 503);
  c.header("Cache-Control", "no-cache");
  return c.html(readFileSync(index, "utf8"));
});

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`AceMate is running on http://localhost:${info.port} (database: ${db.dialect})`);
  if (!aiConfigured()) console.warn("ANTHROPIC_API_KEY is not set: answers will fail until you add it.");
});
