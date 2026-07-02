'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { buildApp } = require('../src/app');
const { MatchingEngine } = require('../src/orderbook/MatchingEngine');
const { RiskEngine } = require('../src/risk/RiskEngine');

function freshApp() {
  const riskEngine = new RiskEngine({ defaultExposureLimit: 10_000_000, defaultPositionLimit: 1_000_000 });
  const engines = new Map([['TEST', new MatchingEngine('TEST', { riskEngine })]]);
  return buildApp({ engines, riskEngine, db: null });
}

async function tokenFor(app, accountId, role) {
  const res = await request(app).post('/api/auth/token').send({ accountId, role });
  return res.body.token;
}

test('GET /health responds ok without auth', async () => {
  const app = freshApp();
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('GET /docs serves the Swagger UI', async () => {
  const app = freshApp();
  const res = await request(app).get('/docs/');
  assert.equal(res.status, 200);
  assert.match(res.text, /swagger/i);
});

test('requests without a token are rejected', async () => {
  const app = freshApp();
  const res = await request(app).get('/api/account');
  assert.equal(res.status, 401);
});

test('POST /api/auth/token requires an accountId', async () => {
  const app = freshApp();
  const res = await request(app).post('/api/auth/token').send({});
  assert.equal(res.status, 400);
});

test('a trader can submit an order and read their own account', async () => {
  const app = freshApp();
  const token = await tokenFor(app, 'trader1');

  const orderRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ symbol: 'TEST', side: 'buy', type: 'limit', price: 100, qty: 5 });
  assert.equal(orderRes.status, 201);
  assert.equal(orderRes.body.status, 'open');

  const acctRes = await request(app)
    .get('/api/account')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(acctRes.status, 200);
  assert.equal(acctRes.body.accountId, 'trader1');
});

test('submitting to an unknown symbol returns 404', async () => {
  const app = freshApp();
  const token = await tokenFor(app, 'trader1');
  const res = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ symbol: 'NOPE', side: 'buy', qty: 1 });
  assert.equal(res.status, 404);
});

test('a trader cannot cancel another trader\'s order', async () => {
  const app = freshApp();
  const ownerToken = await tokenFor(app, 'owner');
  const otherToken = await tokenFor(app, 'other');

  const order = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ symbol: 'TEST', side: 'buy', type: 'limit', price: 50, qty: 1 });

  const cancelRes = await request(app)
    .delete(`/api/orders/${order.body.id}?symbol=TEST`)
    .set('Authorization', `Bearer ${otherToken}`);
  assert.equal(cancelRes.status, 403);
});

test('a trader can cancel their own order', async () => {
  const app = freshApp();
  const token = await tokenFor(app, 'owner2');
  const order = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ symbol: 'TEST', side: 'buy', type: 'limit', price: 50, qty: 1 });

  const cancelRes = await request(app)
    .delete(`/api/orders/${order.body.id}?symbol=TEST`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.cancelled, true);
});

test('an admin can cancel someone else\'s order', async () => {
  const app = freshApp();
  const ownerToken = await tokenFor(app, 'owner3');
  const adminToken = await tokenFor(app, 'admin1', 'admin');

  const order = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ symbol: 'TEST', side: 'buy', type: 'limit', price: 50, qty: 1 });

  const cancelRes = await request(app)
    .delete(`/api/orders/${order.body.id}?symbol=TEST`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.cancelled, true);
});

test('a trader is forbidden from the admin account-lookup route', async () => {
  const app = freshApp();
  const traderToken = await tokenFor(app, 'trader2');
  const res = await request(app)
    .get('/api/admin/accounts/someone-else')
    .set('Authorization', `Bearer ${traderToken}`);
  assert.equal(res.status, 403);
});

test('an admin can look up any account and set its limits', async () => {
  const app = freshApp();
  const adminToken = await tokenFor(app, 'admin2', 'admin');

  const lookup = await request(app)
    .get('/api/admin/accounts/some-trader')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.accountId, 'some-trader');

  const setLimits = await request(app)
    .put('/api/admin/accounts/some-trader/limits')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ exposureLimit: 1234, positionLimit: 56 });
  assert.equal(setLimits.status, 200);
  assert.equal(setLimits.body.exposureLimit, 1234);
  assert.equal(setLimits.body.positionLimit, 56);
});

test('a token with no role claim behaves as a trader (least privilege)', async () => {
  // Simulates an old token minted before roles existed.
  const app = freshApp();
  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('../src/api/middleware');
  const legacyToken = jwt.sign({ accountId: 'legacy' }, JWT_SECRET, { expiresIn: '1h' });

  const res = await request(app)
    .get('/api/admin/accounts/someone')
    .set('Authorization', `Bearer ${legacyToken}`);
  assert.equal(res.status, 403);
});

test('a bogus role in the token request falls back to trader', async () => {
  const app = freshApp();
  const token = await tokenFor(app, 'sneaky', 'superadmin');
  const res = await request(app)
    .get('/api/admin/accounts/someone')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403);
});
