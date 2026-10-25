const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = '1h';

const users = new Map();
const revoked = new Set();

const getToken = (req) => (req.get('authorization') || '').replace(/^Bearer /, '');

const verifyToken = (token) => {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    return revoked.has(payload.jti) ? null : payload;
  } catch {
    return null;
  }
};

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
  const token = jwt.sign({ role: user.role }, JWT_SECRET, {
    algorithm: 'HS256',
    subject: username,
    expiresIn: JWT_EXPIRES_IN,
    jwtid: crypto.randomUUID(),
  });
  res.json({ token });
});

router.post('/logout', (req, res) => {
  const payload = verifyToken(getToken(req));
  if (payload) revoked.add(payload.jti);
  res.json({ loggedOut: true });
});

const requireAuth = (req, res, next) => {
  const payload = verifyToken(getToken(req));
  if (!payload) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = { username: payload.sub, role: payload.role };
  next();
};

module.exports = { router, requireAuth };
