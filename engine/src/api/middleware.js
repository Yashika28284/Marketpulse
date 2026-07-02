'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing bearer token' });
  try {
    req.account = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid token' });
  }
}

// Minimal in-memory fixed-window rate limiter (per accountId).
// Good enough for a demo; swap for Redis-backed sliding window for real use.
const hits = new Map();
function rateLimit({ windowMs = 1000, max = 50 } = {}) {
  return (req, res, next) => {
    const key = req.account?.accountId || req.ip;
    const now = Date.now();
    const bucket = hits.get(key) || { start: now, count: 0 };
    if (now - bucket.start > windowMs) {
      bucket.start = now;
      bucket.count = 0;
    }
    bucket.count += 1;
    hits.set(key, bucket);
    if (bucket.count > max) return res.status(429).json({ error: 'rate limit exceeded' });
    next();
  };
}

// role: 'trader' (default) or 'admin'. Dev-only token minting — see
// router.js /auth/token comment for why this isn't a real login flow.
function issueToken(accountId, role = 'trader') {
  if (!['trader', 'admin'].includes(role)) role = 'trader';
  return jwt.sign({ accountId, role }, JWT_SECRET, { expiresIn: '12h' });
}

// RBAC middleware: gate a route to one or more roles. Must run after
// `authenticate` so req.account.role is populated. Traders default to
// role 'trader' even on old tokens minted before roles existed (no
// `role` claim => treated as 'trader', least privilege).
function requireRole(...allowed) {
  return (req, res, next) => {
    const role = req.account?.role || 'trader';
    if (!allowed.includes(role)) {
      return res.status(403).json({ error: `requires role: ${allowed.join(' or ')}` });
    }
    next();
  };
}

module.exports = { authenticate, rateLimit, issueToken, requireRole, JWT_SECRET };
