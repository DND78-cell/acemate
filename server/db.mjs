// AceMate's database, behind one small async interface:
//   db.get(sql, params)  → first row or null
//   db.all(sql, params)  → rows
//   db.run(sql, params)  → nothing
// SQL uses `?` placeholders and works on both engines:
//   - Postgres when DATABASE_URL (or POSTGRES_URL) is set, e.g. the Neon
//     database Vercel adds to a project;
//   - otherwise one SQLite file on disk (Railway, Docker, your computer).

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS chats (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id         TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT 'New chat',
    messages   TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS chats_user_updated ON chats (user_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS notes (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject    TEXT NOT NULL DEFAULT '',
    title      TEXT,
    result     TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS notes_user_created ON notes (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS companion_sessions (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject       TEXT NOT NULL DEFAULT '',
    message_count INTEGER NOT NULL DEFAULT 1,
    started_at    TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS companion_user_started ON companion_sessions (user_id, started_at DESC)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key      TEXT PRIMARY KEY,
    count    INTEGER NOT NULL,
    reset_at BIGINT NOT NULL
  )`,
];

/** Wraps a Postgres query function `(text, params) => rows`. */
export function postgresAdapter(query) {
  const toPg = (sql) => {
    let n = 0;
    return sql.replace(/\?/g, () => `$${++n}`);
  };
  return {
    dialect: "postgres",
    all: (sql, params = []) => query(toPg(sql), params),
    get: async (sql, params = []) => (await query(toPg(sql), params))[0] ?? null,
    run: async (sql, params = []) => {
      await query(toPg(sql), params);
    },
    async migrate() {
      const [found] = await query("SELECT to_regclass('rate_limits') AS t", []);
      if (found?.t) return; // already set up
      for (const statement of SCHEMA) {
        try {
          await query(statement, []);
        } catch (err) {
          // Another server starting at the same moment may have just created it.
          await new Promise((r) => setTimeout(r, 250));
          await query(statement, []);
        }
      }
    },
  };
}

async function openPostgres(url) {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  return postgresAdapter((text, params) => sql.query(text, params));
}

async function openSqlite(file) {
  const { DatabaseSync } = await import("node:sqlite");
  const { mkdirSync } = await import("node:fs");
  const { dirname, resolve } = await import("node:path");
  const path = resolve(file);
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  const statements = new Map();
  const prepare = (sql) => {
    let stmt = statements.get(sql);
    if (!stmt) statements.set(sql, (stmt = db.prepare(sql)));
    return stmt;
  };
  return {
    dialect: "sqlite",
    all: async (sql, params = []) => prepare(sql).all(...params),
    get: async (sql, params = []) => prepare(sql).get(...params) ?? null,
    run: async (sql, params = []) => {
      prepare(sql).run(...params);
    },
    async migrate() {
      db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
      for (const statement of SCHEMA) db.exec(statement);
    },
  };
}

/** The Postgres address. On Vercel, also one added under a custom prefix (e.g. STORAGE_DATABASE_URL). */
function databaseUrl(env) {
  if (env.DATABASE_URL || env.POSTGRES_URL) return env.DATABASE_URL || env.POSTGRES_URL;
  if (!env.VERCEL) return "";
  const key = Object.keys(env).find((k) => /_(DATABASE_URL|POSTGRES_URL)$/.test(k) && env[k]);
  return key ? env[key] : "";
}

export async function openDatabase(env = process.env) {
  const url = databaseUrl(env);
  if (!url && env.VERCEL) {
    throw Object.assign(new Error("DATABASE_URL is not set"), { code: "no_database" });
  }
  const db = url ? await openPostgres(url) : await openSqlite(env.ACEMATE_DB_PATH || "data/acemate.db");
  await db.migrate();
  return db;
}
