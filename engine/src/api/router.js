'use strict';

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, rateLimit, issueToken, requireRole } = require('./middleware');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Resolves whatever an admin typed into an accountId field into the
// actual accountId (UUID) that RiskEngine/positions are keyed by, and
// reports whether it corresponds to a real, registered user.
//
// Fixes a real bug: pasting a user's email into an admin route that
// expects an accountId used to silently succeed with a zeroed-out
// summary (wrong map key => empty position map => default limits),
// which looked like "the admin sees different exposure than the user
// sees for themselves" but was actually just a lookup-key mismatch.
//
// Without a db connected (dev-only /auth/token mode, no real users
// table), there's nothing to verify against, so we trust the caller
// and keep the old lenient behavior — `found` is null, not false.
async function resolveAccountId(db, raw) {
  if (!db) return { accountId: raw, found: null };

  if (EMAIL_RE.test(raw)) {
    const user = await db.getUserByEmail(raw).catch(() => null);
    return { accountId: user ? user.account_id : raw, found: !!user };
  }

  const user = await db.getUserByAccountId(raw).catch(() => null);
  return { accountId: raw, found: !!user };
}

function buildRouter({ engines, riskEngine, db, kafkaProducer, redisCache }) {
  const router = express.Router();

  // Dev-only: mint a token for any accountId (+ optional role), no
  // credential check. Kept around for local testing / the test suite —
  // real clients should use /auth/register + /auth/login below, which
  // actually verify a password.
  //
  // Gated out of production entirely: this route has no auth check at
  // all, so leaving it reachable on a deployed instance means anyone
  // can mint themselves an admin token with a single POST. Set
  // NODE_ENV=production (or ALLOW_DEV_TOKEN=false explicitly) to kill it.
  const devTokenEnabled = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_TOKEN !== 'false';
  if (devTokenEnabled) {
    router.post('/auth/token', (req, res) => {
      const { accountId, role } = req.body;
      if (!accountId) return res.status(400).json({ error: 'accountId required' });
      res.json({ token: issueToken(accountId, role) });
    });
  }

  // Real auth routes get their own stricter rate limit — unlike the
  // main API limiter below, this applies before authentication (keyed
  // by IP), so failed-login/signup-spam attempts are throttled too.
  const authRateLimit = rateLimit({ windowMs: 60_000, max: 10 });

  // Real auth: create an account with a hashed password.
  router.post('/auth/register', authRateLimit, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'database not available' });
    const { email, password } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'valid email required' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });

    const existing = await db.getUserByEmail(email).catch(() => null);
    if (existing) return res.status(409).json({ error: 'an account with that email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const accountId = crypto.randomUUID();
    try {
      // role is always 'trader' here, never taken from the request body —
      // this is the only place accounts get created, so this is the only
      // place that matters for keeping admin non-self-servable.
      const user = await db.createUser({ accountId, email, passwordHash, role: 'trader' });
      res.status(201).json({ token: issueToken(user.account_id, user.role), accountId: user.account_id, email: user.email });
    } catch (err) {
      res.status(500).json({ error: 'could not create account' });
    }
  });

  // Real auth: verify email + password, then issue a JWT the same way
  // /auth/token does — same tokens, same downstream RBAC, just backed by
  // a real credential check this time.
  router.post('/auth/login', authRateLimit, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'database not available' });
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = await db.getUserByEmail(email).catch(() => null);
    if (!user) return res.status(401).json({ error: 'invalid email or password' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid email or password' });

    res.json({ token: issueToken(user.account_id, user.role), accountId: user.account_id, email: user.email });
  });

  router.use(authenticate, rateLimit({ windowMs: 1000, max: 100 }));

  router.post('/orders', async (req, res) => {
    const { symbol, side, type, price, stopPrice, qty } = req.body;
    const engine = engines.get(symbol);
    if (!engine) return res.status(404).json({ error: `unknown symbol ${symbol}` });
    if (!['buy', 'sell'].includes(side)) return res.status(400).json({ error: 'side must be buy/sell' });
    if (!qty || qty <= 0) return res.status(400).json({ error: 'qty must be > 0' });

    const orderInput = {
      accountId: req.account.accountId,
      symbol,
      side,
      type,
      price,
      stopPrice,
      qty,
    };

    // Kafka is required infrastructure (index.js refuses to boot without
    // it), so this always takes the async path: publish to orders.intake
    // and return 202 immediately. A separate consumer (started in
    // index.js) reads the topic and calls engine.submit() off the HTTP
    // request path. Clients get the accepted order back over the
    // WebSocket feed (order:accepted) rather than in this response.
    // The `kafkaProducer` check remains as defense-in-depth in case a
    // test harness constructs the router without one.
    if (kafkaProducer) {
      const pendingId = crypto.randomUUID();
      try {
        await kafkaProducer.sendOrder({ ...orderInput, clientOrderId: pendingId });
      } catch (err) {
        return res.status(503).json({ error: 'order intake unavailable' });
      }
      return res.status(202).json({ status: 'pending', clientOrderId: pendingId, symbol, side, type, price, stopPrice, qty });
    }

    const order = engine.submit(orderInput);

    if (db) await db.logOrderEvent(order).catch(() => { });
    res.status(201).json(order);
  });

  router.delete('/orders/:id', (req, res) => {
    const { symbol } = req.query;
    const engine = engines.get(symbol);
    if (!engine) return res.status(404).json({ error: `unknown symbol ${symbol}` });

    const order = engine.getOrder(req.params.id);
    if (!order) return res.status(404).json({ cancelled: false });

    const isOwner = order.accountId === req.account.accountId;
    const isAdmin = req.account.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'not your order' });
    }

    const ok = engine.cancel(req.params.id);
    res.status(ok ? 200 : 404).json({ cancelled: ok });
  });

  router.get('/orderbook/:symbol', async (req, res) => {
    const engine = engines.get(req.params.symbol);
    if (!engine) return res.status(404).json({ error: 'unknown symbol' });

    const levels = Number(req.query.levels) || 10;

    // Read-through cache, default levels only (10) — matches what
    // FeedServer writes on every broadcast. Non-default level requests
    // skip the cache and go straight to the engine, since caching every
    // possible levels value isn't worth it here. Redis is required
    // infrastructure (index.js refuses to boot without it); the
    // `redisCache` check remains as defense-in-depth in case a test
    // harness constructs the router without one.
    if (redisCache && levels === 10) {
      try {
        const cached = await redisCache.getCachedDepth(req.params.symbol);
        if (cached) return res.json(cached);
      } catch (err) {
        // Redis hiccup shouldn't take down the endpoint — fall through to engine.
      }
      const depth = engine.depth(levels);
      redisCache.cacheDepth(req.params.symbol, depth).catch(() => { });
      return res.json(depth);
    }

    res.json(engine.depth(levels));
  });

  router.get('/account', (req, res) => {
    res.json(riskEngine.accountSummary(req.account.accountId));
  });

  // The account's own trade history, most recent first. Backed by
  // Postgres (the same `trades` table logTrade() writes to for the
  // audit log / boot replay), so it survives a page reload or a
  // completely new login — unlike the WebSocket feed, which only ever
  // shows fills that happen while that tab is connected.
  //
  // Without a db connected (dev-only in-memory mode, no Postgres), there
  // is nothing to look up — the dashboard falls back to showing only
  // trades that occur while it's open, which is already how it behaves.
  router.get('/trades', async (req, res) => {
    if (!db) return res.json({ trades: [] });
    try {
      const trades = await db.getTradesForAccount(req.account.accountId);
      res.json({ trades });
    } catch (err) {
      res.status(500).json({ error: 'could not load trade history' });
    }
  });

  // Admin-only: every registered account, with their live position/
  // exposure summary attached. This is the actual "look up all users"
  // view — /admin/accounts/:accountId (below) only ever shows one
  // account at a time, and only if you already know its accountId.
  router.get('/admin/accounts', requireRole('admin'), async (req, res) => {
    if (!db) return res.status(503).json({ error: 'database not available' });
    try {
      const users = await db.listUsers();
      const accounts = users.map((u) => ({
        accountId: u.account_id,
        email: u.email,
        role: u.role,
        createdAt: u.created_at,
        ...riskEngine.accountSummary(u.account_id),
      }));
      res.json({ accounts });
    } catch (err) {
      res.status(500).json({ error: 'could not list accounts' });
    }
  });

  // Admin-only: inspect any account's exposure/positions, or override
  // risk limits for an account. Traders can only ever see their own
  // (via GET /account above).
  router.get('/admin/accounts/:accountId', requireRole('admin'), async (req, res) => {
    const { accountId, found } = await resolveAccountId(db, req.params.accountId);
    if (found === false) {
      return res.status(404).json({ error: `no account found for '${req.params.accountId}'` });
    }
    res.json(riskEngine.accountSummary(accountId));
  });

  router.put('/admin/accounts/:accountId/limits', requireRole('admin'), async (req, res) => {
    const { exposureLimit, positionLimit } = req.body;
    if (exposureLimit == null || positionLimit == null) {
      return res.status(400).json({ error: 'exposureLimit and positionLimit required' });
    }
    const { accountId, found } = await resolveAccountId(db, req.params.accountId);
    if (found === false) {
      return res.status(404).json({ error: `no account found for '${req.params.accountId}'` });
    }
    riskEngine.setAccountLimits(accountId, { exposureLimit, positionLimit });
    res.json(riskEngine.accountSummary(accountId));
  });

  return router;
}

module.exports = { buildRouter };