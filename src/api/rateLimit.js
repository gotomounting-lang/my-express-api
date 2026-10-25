const { rateLimit } = require('express-rate-limit');

const createLimiter = (limit, windowMs = 15 * 60 * 1000) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'too many requests' },
  });

const globalLimiter = createLimiter(Number(process.env.RATE_LIMIT) || 100);
const authLimiter = createLimiter(Number(process.env.AUTH_RATE_LIMIT) || 10);

module.exports = { createLimiter, globalLimiter, authLimiter };
