// db.js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const defaultDbPath = path.resolve('/home/container/data/cspanel.db');
const fallbackDbPath = path.resolve(process.cwd(), 'data', 'cspanel.db');
const preferredDbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : defaultDbPath;

function openDb(dbFilePath) {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  return new Database(dbFilePath);
}

let better_sqlite_client;
try {
  better_sqlite_client = openDb(preferredDbPath);
} catch (err) {
  console.warn(
    `[db] Failed to open DB at ${preferredDbPath} (${err.message}). Falling back to ${fallbackDbPath}.`
  );
  better_sqlite_client = openDb(fallbackDbPath);
}

// === 1) Tabellen erstellen, falls sie noch nicht existieren ===
better_sqlite_client.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY,
    serverIP TEXT NOT NULL,
    serverPort INTEGER NOT NULL,
    rconPassword TEXT NOT NULL
  )
`);

better_sqlite_client.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  )
`);

// === 2) Migration: neue Spalten in 'servers' hinzufügen, falls noch nicht vorhanden ===
{
  // PRAGMA table_info liefert alle Spalten der Tabelle
  const cols = better_sqlite_client
    .prepare(`PRAGMA table_info(servers)`)
    .all()
    .map((row) => row.name);

  if (!cols.includes('last_map')) {
    better_sqlite_client.exec(`ALTER TABLE servers ADD COLUMN last_map TEXT;`);
  }
  if (!cols.includes('last_game_type')) {
    better_sqlite_client.exec(`ALTER TABLE servers ADD COLUMN last_game_type TEXT;`);
  }
  if (!cols.includes('last_game_mode')) {
    better_sqlite_client.exec(`ALTER TABLE servers ADD COLUMN last_game_mode TEXT;`);
  }
}

// === 3) Default-User anlegen, falls noch nicht vorhanden ===
const default_username = 'cspanel';
const default_password = 'v67ic55x4ghvjfj';
const allow_default_credentials = process.env.ALLOW_DEFAULT_CREDENTIALS === 'true';
const env_username = process.env.DEFAULT_USERNAME;
const env_password = process.env.DEFAULT_PASSWORD;
const has_env_credentials = Boolean(env_username && env_password);

const user_count = better_sqlite_client.prepare(`SELECT COUNT(1) AS count FROM users`).get().count;

if (user_count > 0) {
  console.log('Users already exist; skipping default user creation.');
} else {
  let username = env_username;
  let password = env_password;

  if (!has_env_credentials) {
    if (!allow_default_credentials) {
      console.error(
        '[db] DEFAULT_USERNAME/DEFAULT_PASSWORD are required unless ALLOW_DEFAULT_CREDENTIALS=true.'
      );
      throw new Error(
        'Default credentials are not allowed without ALLOW_DEFAULT_CREDENTIALS=true.'
      );
    }
    username = default_username;
    password = default_password;
    console.warn('[db] Using built-in default credentials because ALLOW_DEFAULT_CREDENTIALS=true.');
  } else if (
    !allow_default_credentials &&
    username === default_username &&
    password === default_password
  ) {
    console.error('[db] Default credentials are blocked unless ALLOW_DEFAULT_CREDENTIALS=true.');
    throw new Error('Default credentials are not allowed without ALLOW_DEFAULT_CREDENTIALS=true.');
  }

  const hashed_password = bcrypt.hashSync(password, 10);
  better_sqlite_client
    .prepare(
      `
      INSERT INTO users (username, password)
      VALUES (?, ?)
    `
    )
    .run(username, hashed_password);
  console.log('Default user created successfully.');
}

module.exports = {
  better_sqlite_client,
};
