'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RiskEngine } = require('../src/risk/RiskEngine');

test('an order within limits is accepted', () => {
  const risk = new RiskEngine({ defaultExposureLimit: 100_000, defaultPositionLimit: 1000 });
  const check = risk.checkOrder({ accountId: 'a1', symbol: 'AAPL', side: 'buy', price: 100, qty: 10 });
  assert.equal(check.ok, true);
});

test('an order breaching the position limit is rejected', () => {
  const risk = new RiskEngine({ defaultExposureLimit: 1_000_000, defaultPositionLimit: 10 });
  const check = risk.checkOrder({ accountId: 'a1', symbol: 'AAPL', side: 'buy', price: 100, qty: 20 });
  assert.equal(check.ok, false);
  assert.match(check.reason, /position limit/);
});

test('an order breaching the exposure limit is rejected', () => {
  const risk = new RiskEngine({ defaultExposureLimit: 500, defaultPositionLimit: 1000 });
  const check = risk.checkOrder({ accountId: 'a1', symbol: 'AAPL', side: 'buy', price: 100, qty: 10 });
  assert.equal(check.ok, false);
  assert.match(check.reason, /exposure limit/);
});

test('applyFill updates position and last price, which feeds later checks', () => {
  const risk = new RiskEngine({ defaultExposureLimit: 100_000, defaultPositionLimit: 1000 });
  risk.applyFill({ symbol: 'AAPL', price: 100, qty: 5, buyAccountId: 'buyer', sellAccountId: 'seller' });

  const summary = risk.accountSummary('buyer');
  assert.equal(summary.positions.AAPL, 5);
  assert.equal(summary.exposure, 500);

  const sellerSummary = risk.accountSummary('seller');
  assert.equal(sellerSummary.positions.AAPL, -5);
});

test('per-account limits override the defaults', () => {
  const risk = new RiskEngine({ defaultExposureLimit: 100_000, defaultPositionLimit: 1000 });
  risk.setAccountLimits('a1', { exposureLimit: 50, positionLimit: 5 });
  const check = risk.checkOrder({ accountId: 'a1', symbol: 'AAPL', side: 'buy', price: 100, qty: 1 });
  assert.equal(check.ok, false);
  assert.match(check.reason, /exposure limit/);
});

test('a market order with no price falls back to last trade price for the exposure check', () => {
  const risk = new RiskEngine({ defaultExposureLimit: 100_000, defaultPositionLimit: 1000 });
  risk.applyFill({ symbol: 'AAPL', price: 200, qty: 1, buyAccountId: 'x', sellAccountId: 'y' });
  const check = risk.checkOrder({ accountId: 'a1', symbol: 'AAPL', side: 'buy', qty: 100 });
  // 100 * 200 = 20,000, within the 100,000 default limit
  assert.equal(check.ok, true);
});

test('accountSummary for an account with no history returns zeroed defaults', () => {
  const risk = new RiskEngine({ defaultExposureLimit: 1000, defaultPositionLimit: 10 });
  const summary = risk.accountSummary('never-traded');
  assert.deepEqual(summary.positions, {});
  assert.equal(summary.exposure, 0);
  assert.equal(summary.exposureLimit, 1000);
});

test('replaying stored trade history reconstructs the same state as live trading (restart-survival)', () => {
  // Simulates index.js's boot-time replay: a fresh RiskEngine (as if the
  // process just restarted) fed trades in the shape Db.getAllTrades()
  // returns them — camelCase keys, price/qty already cast to numbers.
  const live = new RiskEngine({ defaultExposureLimit: 1_000_000, defaultPositionLimit: 100_000 });
  const restarted = new RiskEngine({ defaultExposureLimit: 1_000_000, defaultPositionLimit: 100_000 });

  const tradeHistory = [
    { symbol: 'AAPL', price: 100, qty: 5, buyAccountId: 'alice', sellAccountId: 'bob' },
    { symbol: 'AAPL', price: 102, qty: 2, buyAccountId: 'bob', sellAccountId: 'alice' },
    { symbol: 'MSFT', price: 50, qty: 10, buyAccountId: 'alice', sellAccountId: 'carol' },
  ];

  for (const trade of tradeHistory) live.applyFill(trade);
  for (const trade of tradeHistory) restarted.applyFill(trade); // <- the replay step

  assert.deepEqual(restarted.accountSummary('alice'), live.accountSummary('alice'));
  assert.deepEqual(restarted.accountSummary('bob'), live.accountSummary('bob'));
  assert.deepEqual(restarted.accountSummary('carol'), live.accountSummary('carol'));
  // Net AAPL for alice: +5 - 2 = 3
  assert.equal(restarted.accountSummary('alice').positions.AAPL, 3);
});
