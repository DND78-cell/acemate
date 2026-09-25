# AceMate

An AI chat and study assistant powered by Claude: chat with image upload, a Code
screen with live preview, Chapter Notes (photos → summary, flashcards, quiz) and a
study Companion with an activity heatmap.

It's laid out like a student's exercise book: a margin rule down each conversation,
question numbers (Q1, Q2…) in the margin, and the date in the corner of the page.
Type is Bricolage Grotesque for headings and Atkinson Hyperlegible for reading.
Themes: Graphite (default), Ocean, Chalkboard, Paper.

The same code runs two ways:

| | Standalone website | claude.ai page |
|---|---|---|
| AI | Your Anthropic API key, on the server | The viewer's own claude.ai account |
| Sign-in | Email + password accounts | The claude.ai account |
| Saved data | Postgres (on Vercel) or a SQLite file on your server | The viewer's private claude.ai storage |
| Build | `npm run build` + `npm start` | `npm run build:artifact` → `out/acemate.html` |

## Run the website on your computer

Needs **Node.js 22.13 or newer**.

```sh
npm install
cp .env.example .env        # then put your key in ANTHROPIC_API_KEY
npm run build               # builds the site into dist/web
npm start                   # http://localhost:8787
```

While changing the code, run `npm run dev:server` and `npm run dev` in two
terminals and open the address Vite prints; the page reloads as you edit.

## Put it online

**On Vercel** (the included `vercel.json` sets everything up; the API runs as a
Vercel Function from `api/index.js`):

1. Put this folder in a GitHub repository, then in Vercel choose **Add New →
   Project** and import that repository. Keep the settings it detects (Vite,
   `npm run build`, output `dist/web`). Under **Environment Variables**, add
   `ANTHROPIC_API_KEY` with your key, then press **Deploy**.
2. In the project's **Storage** tab, create a **Neon** Postgres database and
   connect it to the project. Vercel adds `DATABASE_URL` for you; AceMate
   creates its tables on the first request.
3. Open **Deployments**, choose the latest one's **⋯ → Redeploy** so it picks up
   the database, then open your `….vercel.app` address.

Photos are shrunk in the browser so each request stays under Vercel's 4.5 MB
limit, and answers stream as they're written.

**Elsewhere**, any host that runs Node or Docker works. Three things matter:

1. **Set `ANTHROPIC_API_KEY`** in the host's environment settings.
2. **Keep the database on persistent storage.** Accounts, chats and notes live in
   one SQLite file (`ACEMATE_DB_PATH`, default `data/acemate.db`). On Render,
   Railway or Fly, attach a volume/disk and point `ACEMATE_DB_PATH` into it;
   otherwise every redeploy wipes your users' data.
3. **Serve it over HTTPS** (hosts like Render, Railway and Fly do this for you),
   and set `ACEMATE_TRUST_PROXY=true` when running behind their proxy.

**On Railway** (the included `Dockerfile` and `railway.json` are picked up automatically):

1. Get the code to Railway: *New Project → Deploy from GitHub repo*, or from this
   folder with the Railway CLI: `railway login`, `railway init`, `railway up`.
2. In the service's **Variables**, add `ANTHROPIC_API_KEY` (your key) and
   `ACEMATE_TRUST_PROXY=true`.
3. Add a **Volume** to the service with mount path `/data` (the database lives
   there; without it, every redeploy erases accounts and chats).
4. In **Settings → Networking**, press **Generate Domain** to get the public address.

**With Docker** (Render, Fly.io, a VPS):

```sh
docker build -t acemate .
docker run -p 8787:8787 -e ANTHROPIC_API_KEY=sk-ant-... -v acemate-data:/data acemate
```

**Without Docker** (a VPS): `npm ci && npm run build && npm start`, kept running
with a process manager such as `pm2` or systemd, behind Caddy or nginx for HTTPS.

## Settings

All in `.env` (see `.env.example`):

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required. Every answer is billed to this key. |
| `ACEMATE_MODEL` | `claude-opus-5` | Model for Ace Ultra (and Ace One unless set below) |
| `ACEMATE_FAST_MODEL` | same as above | Model for Ace One, e.g. `claude-haiku-4-5` for speed |
| `ACEMATE_FALLBACKS` | `on` | Re-run requests Claude's safety checks decline on Anthropic's recommended fallback model |
| `ACEMATE_AI_LIMIT_PER_HOUR` | `60` | AI requests per signed-in person per hour |
| `ACEMATE_GUEST_AI_LIMIT_PER_HOUR` | `10` | AI requests per guest (per IP address) per hour |
| `ACEMATE_REQUIRE_SIGNIN` | `false` | Require an account before chatting |
| `ACEMATE_TRUST_PROXY` | `false` (`true` on Vercel) | Trust `X-Forwarded-For` (set `true` behind a proxy) |
| `DATABASE_URL` | — | A Postgres (Neon) address. When set, it's used instead of the SQLite file |
| `ACEMATE_DB_PATH` | `data/acemate.db` | Where the SQLite database file lives |
| `PORT` | `8787` | Web server port |

**Models and effort.** Ace One and Ace Ultra map to the models above; the Effort
picker sets Claude's effort level (Ace One: low / medium / high, Ace Ultra:
medium / high / max). Claude's thinking is on and its summaries appear under
"Thought for …" in answers.

## How it's built

```
server/        The backend (Node, Hono, Anthropic SDK)
  app.mjs      Routes: /api/auth, /api/ai/chat (streaming), /api/ai/notes,
               /api/chats, /api/notes, /api/companion
  index.mjs    Runs app.mjs and serves dist/web (npm start, Docker, Railway)
  ai.mjs       Claude calls: streaming chat, structured JSON for notes
  auth.mjs     Accounts (scrypt-hashed passwords) and cookie sessions
  db.mjs       Schema; Postgres (Neon) when DATABASE_URL is set, else SQLite
  limits.mjs   Per-person and per-guest hourly limits
api/index.js   The same routes as a Vercel Function
vercel.json    Vercel build, /api routing and headers
src/           The React app (Vite, Tailwind, TanStack Router)
  platform/    web.ts (talks to server/) and artifact.ts (claude.ai page)
  routes/      Chat, Code, Notes, Companion, Settings, Sign in
assemble.mjs   Inlines the artifact build into one claude.ai page
```

## Security notes

- The API key never reaches the browser; only the server calls Claude.
- Passwords are hashed with scrypt; sessions are random tokens in HttpOnly,
  SameSite cookies (Secure over HTTPS), stored only as hashes.
- Changing requests must carry an `X-AceMate` header, which blocks cross-site
  request forgery.
- Accounts aren't email-verified and there's no password reset yet. Add an email
  provider before relying on either.
- Hourly limits are counted in the database, so they hold across restarts and
  across Vercel's many function instances.

## Credits

`src/components/ui/corner-button.tsx` is CornerButton from
[VengeanceUI](https://github.com/Ashutoshx7/VengeanceUI) (MIT License).
