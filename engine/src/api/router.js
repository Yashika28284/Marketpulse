'use strict';

const express = require('express');
const { authenticate, rateLimit, issueToken, requireRole } = require('./middleware');

function buildRouter({ engines, riskEngine, db }) {
  const router = express.Router();

  // Dev-only: mint a token for an accountId (+ optional role), no real
  // login flow / credential check here. In a real deployment this
  // endpoint wouldn't let the caller self-assign 'admin' — role would
  // come from an identity provider or a DB lookup, not the request body.
  router.post('/auth/token', (req, res) => {
    const { accountId, role } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId required' });
    res.json({ token: issueToken(accountId, role) });
  });

  router.use(authenticate, rateLimit({ windowMs: 1000, max: 100 }));

  router.post('/orders', async (req, res) => {
    const { symbol, side, type, price, stopPrice, qty } = req.body;
    const engine = engines.get(symbol);
    if (!engine) return res.status(404).json({ error: `unknown symbol ${symbol}` });
    if (!['buy', 'sell'].includes(side)) return res.status(400).json({ error: 'side must be buy/sell' });
    if (!qty || qty <= 0) return res.status(400).json({ error: 'qty must be > 0' });

    const order = engine.submit({
      accountId: req.account.accountId,
      symbol,
      side,
      type,
      price,
      stopPrice,
      qty,
    });

    if (db) await db.logOrderEvent(order).catch(() => {});
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

  router.get('/orderbook/:symbol', (req, res) => {
    const engine = engines.get(req.params.symbol);
    if (!engine) return res.status(404).json({ error: 'unknown symbol' });
    res.json(engine.depth(Number(req.query.levels) || 10));
  });

  router.get('/account', (req, res) => {
    res.json(riskEngine.accountSummary(req.account.accountId));
  });

  // Admin-only: inspect any account's exposure/positions, or override
  // risk limits for an account. Traders can only ever see their own
  // (via GET /account above).
  router.get('/admin/accounts/:accountId', requireRole('admin'), (req, res) => {
    res.json(riskEngine.accountSummary(req.params.accountId));
  });

  router.put('/admin/accounts/:accountId/limits', requireRole('admin'), (req, res) => {
    const { exposureLimit, positionLimit } = req.body;
    if (exposureLimit == null || positionLimit == null) {
      return res.status(400).json({ error: 'exposureLimit and positionLimit required' });
    }
    riskEngine.setAccountLimits(req.params.accountId, { exposureLimit, positionLimit });
    res.json(riskEngine.accountSummary(req.params.accountId));
  });

  return router;
}

module.exports = { buildRouter };
