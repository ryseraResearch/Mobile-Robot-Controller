const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'game.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS competitors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    score       INTEGER NOT NULL DEFAULT 0,
    time_ms     INTEGER NOT NULL DEFAULT 0,
    time_bonus  INTEGER NOT NULL DEFAULT 0,
    final_score INTEGER NOT NULL DEFAULT 0,
    eliminated  BOOLEAN NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Seed default config values if not already present
const upsertConfig = db.prepare(`
  INSERT INTO config (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO NOTHING
`);

const defaults = [
  ['baseVelocity',    '180'],
  ['initialScore',    '1000'],
  ['timeBonusEnabled','true'],
];

db.exec('BEGIN');
for (const [key, value] of defaults) {
  upsertConfig.run(key, value);
}
db.exec('COMMIT');

module.exports = db;
