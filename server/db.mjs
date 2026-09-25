// AceMate's database: one SQLite file (Node's built-in node:sqlite, no native
// add-ons). Tables mirror the original Supabase schema — chats, notes and
// Companion sessions per user — plus users and sign-in sessions.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function openDb(file) {
  const path = resolve(file);
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

    CREATE TABLE IF NOT EXISTS chats (
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id         TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT 'New chat',
      messages   TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX IF NOT EXISTS chats_user_updated ON chats (user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS notes (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject    TEXT NOT NULL DEFAULT '',
      title      TEXT,
      result     TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS notes_user_created ON notes (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS companion_sessions (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject       TEXT NOT NULL DEFAULT '',
      message_count INTEGER NOT NULL DEFAULT 1,
      started_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS companion_user_started ON companion_sessions (user_id, started_at DESC);
  `);

  return db;
}
