'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MatchingEngine } = require('../src/orderbook/MatchingEngine');
const { RiskEngine } = require('../src/risk/RiskEngine');

test('a resting limit order sits on the book unmatched', () => {
  const engine = new MatchingEngine('TEST');
  const order = engine.submit({ accountId: 'a1', side: 'buy', type: 'limit', price: 100, qty: 10 });
  assert.equal(order.status, 'open');
  assert.equal(order.remaining, 10);
  assert.equal(engine.depth().bids[0].price, 100);
});

test('a crossing limit order fully fills against a resting order', () => {
  const engine = new MatchingEngine('TEST');
  engine.submit({ accountId: 'seller', side: 'sell', type: 'limit', price: 100, qty: 10 });
  const buy = engine.submit({ accountId: 'buyer', side: 'buy', type: 'limit', price: 100, qty: 10 });
  assert.equal(buy.status, 'filled');
  assert.equal(buy.remaining, 0);
  assert.equal(engine.trades.length, 1);
  assert.equal(engine.trades[0].price, 100);
  assert.equal(engine.trades[0].qty, 10);
});

test('a partial fill leaves the remainder resting on the book', () => {
  const engine = new MatchingEngine('TEST');
  engine.submit({ accountId: 'seller', side: 'sell', type: 'limit', price: 100, qty: 4 });
  const buy = engine.submit({ accountId: 'buyer', side: 'buy', type: 'limit', price: 100, qty: 10 });
  assert.equal(buy.status, 'partial');
  assert.equal(buy.remaining, 6);
  // the ask side should be fully drained, and the unfilled 6 should now
  // be resting on the bid side at 100
  assert.equal(engine.depth().asks.length, 0);
  const bidLevel = engine.depth().bids.find((b) => b.price === 100);
  assert.equal(bidLevel.qty, 6);
});

test('price-time priority: earlier order at same price fills first', () => {
  const engine = new MatchingEngine('TEST');
  engine.submit({ accountId: 'first', side: 'sell', type: 'limit', price: 100, qty: 5 });
  engine.submit({ accountId: 'second', side: 'sell', type: 'limit', price: 100, qty: 5 });
  engine.submit({ accountId: 'buyer', side: 'buy', type: 'limit', price: 100, qty: 5 });
  assert.equal(engine.trades[0].sellAccountId, 'first');
});

test('a limit order does not cross at an unmarketable price', () => {
  const engine = new MatchingEngine('TEST');
  engine.submit({ accountId: 'seller', side: 'sell', type: 'limit', price: 105, qty: 5 });
  const buy = engine.submit({ accountId: 'buyer', side: 'buy', type: 'limit', price: 100, qty: 5 });
  assert.equal(buy.status, 'open');
  assert.equal(engine.trades.length, 0);
});

test('a market order takes available liquidity at the resting price', () => {
  const engine = new MatchingEngine('TEST');
  engine.submit({ accountId: 'seller', side: 'sell', type: 'limit', price: 100, qty: 5 });
  const buy = engine.submit({ accountId: 'buyer', side: 'buy', type: 'market', qty: 5 });
  assert.equal(buy.status, 'filled');
  assert.equal(engine.trades[0].price, 100);
});

test('an unfilled market order remainder is cancelled, not rested', () => {
  const engine = new MatchingEngine('TEST');
  const buy = engine.submit({ accountId: 'buyer', side: 'buy', type: 'market', qty: 5 });
  assert.equal(buy.status, 'cancelled');
  assert.equal(engine.depth().bids.length, 0);
});

test('self-trade prevention cancels the resting order instead of matching it', () => {
  const engine = new MatchingEngine('TEST');
  engine.submit({ accountId: 'same', side: 'sell', type: 'limit', price: 100, qty: 5 });
  const buy = engine.submit({ accountId: 'same', side: 'buy', type: 'limit', price: 100, qty: 5 });
  // resting sell should have been cancelled, and the buy order rests unfilled
  assert.equal(engine.trades.length, 0);
  assert.equal(buy.status, 'open');
  assert.equal(engine.depth().asks.length, 0);
});

test('stop order stays pending until the trigger price trades', () => {
  const engine = new MatchingEngine('TEST');
  const stop = engine.submit({ accountId: 'trader', side: 'buy', type: 'stop', stopPrice: 110, qty: 5 });
  assert.equal(stop.status, 'pending');

  // a trade at 105 should not trigger a >=110 buy-stop
  engine.submit({ accountId: 'seller', side: 'sell', type: 'limit', price: 105, qty: 1 });
  engine.submit({ accountId: 'buyer', side: 'buy', type: 'limit', price: 105, qty: 1 });
  assert.equal(stop.status, 'pending');

  // a trade at 110 should trigger it and convert it into a market order.
  // seller2 offers more than buyer2 takes, so liquidity remains at 110
  // for the triggered stop to fill against.
  engine.submit({ accountId: 'seller2', side: 'sell', type: 'limit', price: 110, qty: 10 });
  engine.submit({ accountId: 'buyer2', side: 'buy', type: 'limit', price: 110, qty: 5 });
  assert.equal(stop.status, 'filled');
});

test('cancel() removes a resting order from the book', () => {
  const engine = new MatchingEngine('TEST');
  const order = engine.submit({ accountId: 'a1', side: 'buy', type: 'limit', price: 100, qty: 5 });
  assert.equal(engine.cancel(order.id), true);
  assert.equal(engine.getOrder(order.id), null);
});

test('risk engine rejection prevents an order from reaching the book', () => {
  const riskEngine = new RiskEngine({ defaultExposureLimit: 100, defaultPositionLimit: 1000 });
  const engine = new MatchingEngine('TEST', { riskEngine });
  const order = engine.submit({ accountId: 'a1', side: 'buy', type: 'limit', price: 1000, qty: 5 });
  assert.equal(order.status, 'rejected');
  assert.ok(order.rejectReason.includes('exposure limit'));
  assert.equal(engine.depth().bids.length, 0);
});
