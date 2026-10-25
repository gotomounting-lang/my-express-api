const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ACCESS_EXPIRES_IN = '15m';
const REFRESH_EXPIRES_IN = '7d';

const users = new Map();
const revoked = new Set();
const refreshTokens = new Set();

const getToken = (req) => (req.get('authorization') || '').replace(/^Bearer /, '');

const verifyToken = (token, type) => {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (payload.type !== type) return null;
    return revoked.has(payload.jti) ? null : payload;
  } catch {
    return null;
  }
};

const signToken = (username, role, type, expiresIn) =>
  jwt.sign({ role, type }, JWT_SECRET, {
    algorithm: 'HS256',
    subject: username,
    expiresIn,
    jwtid: crypto.randomUUID(),
  });

const issueTokens = (username, role) => {
  const refreshToken = signToken(username, role, 'refresh', REFRESH_EXPIRES_IN);
  refreshTokens.add(jwt.decode(refreshToken).jti);
  return {
    accessToken: signToken(username, role, 'access', ACCESS_EXPIRES_IN),
    refreshToken,
  };
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
  res.json(issueTokens(username, user.role));
});

router.post('/refresh', (req, res) => {
  const payload = verifyToken(String((req.body || {}).refreshToken), 'refresh');
  if (!payload || !refreshTokens.delete(payload.jti)) {
    return res.status(401).json({ error: 'invalid refresh token' });
  }
  const user = users.get(payload.sub);
  if (!user) {
    return res.status(401).json({ error: 'invalid refresh token' });
  }
  res.json(issueTokens(payload.sub, user.role));
});

router.post('/logout', (req, res) => {
  const access = verifyToken(getToken(req), 'access');
  if (access) revoked.add(access.jti);
  const refresh = verifyToken(String((req.body || {}).refreshToken), 'refresh');
  if (refresh) refreshTokens.delete(refresh.jti);
  res.json({ loggedOut: true });
});

const requireAuth = (req, res, next) => {
  const payload = verifyToken(getToken(req), 'access');
  if (!payload) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = { username: payload.sub, role: payload.role };
  next();
};

module.exports = { router, requireAuth };
