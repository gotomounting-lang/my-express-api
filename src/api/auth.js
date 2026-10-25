const crypto = require('crypto');
const express = require('express');

const router = express.Router();

const users = new Map();
const tokens = new Map();

const hashPassword = (password, salt) =>
  crypto.scryptSync(password, salt, 64).toString('hex');

router.post('/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (users.has(username)) {
    return res.status(409).json({ error: 'username already exists' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const role = users.size === 0 ? 'admin' : 'user';
  users.set(username, { salt, hash: hashPassword(password, salt), role });
  res.status(201).json({ username, role });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = users.get(username);
  if (!user) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const actual = Buffer.from(user.hash, 'hex');
  const given = Buffer.from(hashPassword(String(password), user.salt), 'hex');
  if (!crypto.timingSafeEqual(actual, given)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, username);
  res.json({ token });
});

router.post('/logout', (req, res) => {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  tokens.delete(token);
  res.json({ loggedOut: true });
});

const requireAuth = (req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  const username = tokens.get(token);
  if (!username) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = { username, role: users.get(username).role };
  next();
};

module.exports = { router, requireAuth };
