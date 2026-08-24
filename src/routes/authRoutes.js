const express = require('express');
const { readDb, writeDb, genId } = require('../db');
const { hashPassword, verifyPassword } = require('../utils/password');
const { issueToken, revokeToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  const db = readDb();
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const { hash, salt } = hashPassword(password);
  const user = {
    id: genId('user'),
    name,
    email,
    phone: phone || '',
    passwordHash: hash,
    salt,
    role: 'patient'
  };
  db.users.push(user);
  writeDb(db);

  const token = issueToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const db = readDb();
  const user = db.users.find((u) => u.email.toLowerCase() === (email || '').toLowerCase());
  if (!user || !verifyPassword(password || '', user.salt, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = issueToken(user);
  res.json({ token, user: publicUser(user) });
});

router.post('/logout', requireAuth, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.slice(7);
  revokeToken(token);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const db = readDb();
  const user = db.users.find((u) => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

function publicUser(user) {
  const { passwordHash, salt, ...safe } = user;
  return safe;
}

module.exports = router;
