const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'leaderboard.json');

// Secret Developer Passkey - Stored strictly on server
const DEV_PASSKEY = "yy950271";

// Active admin session tokens (In-memory)
const activeAdminTokens = new Set();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure leaderboard.json exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ players: [] }, null, 2));
}

function getLeaderboardData() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { players: [] };
  }
}

function saveLeaderboardData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// 1. Get Top 10 Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const db = getLeaderboardData();
  db.players.sort((a, b) => b.streak - a.streak || b.score - a.score);
  res.json({ players: db.players.slice(0, 10) });
});

// 2. Submit Score with Anti-Cheat Sanity Check
app.post('/api/score', (req, res) => {
  const { name, streak, score, cps } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: "Invalid player name." });
  }

  // Anti-Cheat: Reject impossible click speeds (e.g., bot clicking > 40 CPS)
  if (cps && cps > 40) {
    return res.status(403).json({ error: "Rate limit exceeded (bot detected)." });
  }

  const cleanName = name.trim().slice(0, 14);
  const db = getLeaderboardData();

  let existing = db.players.find(p => p.name.toLowerCase() === cleanName.toLowerCase());

  if (existing) {
    if (streak > existing.streak) existing.streak = streak;
    if (score > existing.score) existing.score = score;
  } else {
    db.players.push({
      name: cleanName,
      streak: Number(streak) || 0,
      score: Number(score) || 0
    });
  }

  saveLeaderboardData(db);
  res.json({ success: true });
});

// 3. Admin Authentication Endpoint
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === DEV_PASSKEY) {
    const token = crypto.randomBytes(24).toString('hex');
    activeAdminTokens.add(token);
    return res.json({ success: true, token });
  }
  return res.status(401).json({ error: "Invalid developer passkey." });
});

// Middleware to verify admin token
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token && activeAdminTokens.has(token)) {
    return next();
  }
  return res.status(403).json({ error: "Unauthorized access." });
}

// 4. Admin Edit Player
app.post('/api/admin/edit', requireAdmin, (req, res) => {
  const { name, streak, score } = req.body;
  const db = getLeaderboardData();
  const player = db.players.find(p => p.name.toLowerCase() === name.toLowerCase());

  if (!player) return res.status(404).json({ error: "Player not found." });

  player.streak = Math.max(0, parseInt(streak, 10) || 0);
  player.score = Math.max(0, parseInt(score, 10) || 0);

  saveLeaderboardData(db);
  res.json({ success: true });
});

// 5. Admin Delete Player
app.post('/api/admin/delete', requireAdmin, (req, res) => {
  const { name } = req.body;
  const db = getLeaderboardData();
  db.players = db.players.filter(p => p.name.toLowerCase() !== name.toLowerCase());
  saveLeaderboardData(db);
  res.json({ success: true });
});

// 6. Admin Wipe Entire Board
app.post('/api/admin/wipe', requireAdmin, (req, res) => {
  saveLeaderboardData({ players: [] });
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
