// db.js
const Database = require('better-sqlite3');
const bcrypt  = require('bcrypt');

const better_sqlite_client = new Database('/home/container/data/cspanel.db');

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
    .map(row => row.name);

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
const default_username = process.env.DEFAULT_USERNAME || 'cspanel';
const default_password = process.env.DEFAULT_PASSWORD || 'v67ic55x4ghvjfj';
const hashed_password  = bcrypt.hashSync(default_password, 10);

const existing_user = better_sqlite_client
  .prepare(`SELECT 1 FROM users WHERE username = ?`)
  .get(default_username);

if (existing_user) {
  console.log('Default user already exists');
} else {
  better_sqlite_client
    .prepare(`
      INSERT INTO users (username, password)
      VALUES (?, ?)
    `)
    .run(default_username, hashed_password);
  console.log('Default user created successfully.');
}

module.exports = {
  better_sqlite_client
};
