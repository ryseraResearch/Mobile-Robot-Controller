const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { WebSocketServer } = require('ws');

const db            = require('./db');
const { PORT, HOST } = require('./config');

const app    = express();
const server = http.createServer(app);

// ─────────────────────── Middleware ──────────────────────────────
app.use(cors());
app.use(express.json());

// ─────────────────────── WebSocket server ────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(msg);
    }
  }
}

wss.on('connection', (ws) => {
  // Send current leaderboard + config to newly connected client
  ws.send(JSON.stringify({ type: 'leaderboard', data: getLeaderboard() }));
  ws.send(JSON.stringify({ type: 'config',      data: getAllConfig()   }));

  // Relay any message a client sends to ALL other connected clients.
  // Used so the admin dashboard can broadcast countdown/commands to the mobile app.
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const out = JSON.stringify(msg);
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === client.OPEN) {
          client.send(out);
        }
      }
    } catch { /* ignore malformed */ }
  });
});

// ─────────────────────── DB helpers ──────────────────────────────
function getLeaderboard() {
  return db.prepare(`
    SELECT id, name, score, time_ms, time_bonus, final_score, eliminated, created_at
    FROM competitors
    ORDER BY final_score DESC, time_ms ASC
    LIMIT 20
  `).all();
}

function getAllConfig() {
  const rows = db.prepare('SELECT key, value FROM config').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ─────────────────────── REST: config ────────────────────────────
// GET /api/config
app.get('/api/config', (req, res) => {
  res.json(getAllConfig());
});

// PUT /api/config  body: { key, value }
app.put('/api/config', (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: 'key and value are required' });
  }
  db.prepare(`
    INSERT INTO config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(key), String(value));

  broadcast({ type: 'config', data: getAllConfig() });
  res.json({ ok: true });
});

// ─────────────────────── REST: race ──────────────────────────────
// POST /api/race/start  body: { name }
app.post('/api/race/start', (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const trimmed = String(name).trim();

  const existing = db.prepare(
    'SELECT id FROM competitors WHERE name = ? COLLATE NOCASE LIMIT 1'
  ).get(trimmed);
  if (existing) {
    return res.status(409).json({ error: 'name_taken' });
  }

  const result = db.prepare(`
    INSERT INTO competitors (name, score, time_ms, time_bonus, final_score, eliminated)
    VALUES (?, 0, 0, 0, 0, 0)
  `).run(trimmed);

  res.json({ raceId: result.lastInsertRowid });
  broadcast({ type: 'race_start', name: trimmed });
});

// POST /api/race/:id/finish  body: { score, time_ms, time_bonus, eliminated }
app.post('/api/race/:id/finish', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { score, time_ms, time_bonus, eliminated } = req.body;

  if (isNaN(id)) {
    return res.status(400).json({ error: 'invalid race id' });
  }

  const s     = parseInt(score,      10) || 0;
  const t     = parseInt(time_ms,    10) || 0;
  const bonus = parseInt(time_bonus, 10) || 0;
  const elim  = eliminated ? 1 : 0;
  const final = elim ? 0 : Math.max(0, s + bonus);

  const info = db.prepare(`
    UPDATE competitors
    SET score = ?, time_ms = ?, time_bonus = ?, final_score = ?, eliminated = ?
    WHERE id = ?
  `).run(s, t, bonus, final, elim, id);

  if (info.changes === 0) {
    return res.status(404).json({ error: 'race not found' });
  }

  broadcast({ type: 'leaderboard', data: getLeaderboard() });
  res.json({ ok: true, final_score: final });
});

// ─────────────────────── REST: leaderboard ───────────────────────
// GET /api/leaderboard
app.get('/api/leaderboard', (req, res) => {
  res.json(getLeaderboard());
});

// DELETE /api/leaderboard
app.delete('/api/leaderboard', (req, res) => {
  db.prepare('DELETE FROM competitors').run();
  broadcast({ type: 'leaderboard', data: [] });
  res.json({ ok: true });
});

// ─────────────────────── Start ───────────────────────────────────
server.listen(PORT, HOST, () => {
  console.log(`[server] Listening on http://${HOST}:${PORT}`);
  console.log(`[ws]     WebSocket ready at ws://${HOST}:${PORT}/ws`);
});
