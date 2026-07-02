'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OrderBook } = require('../src/orderbook/OrderBook');

function mkOrder(id, side, price, remaining) {
  return { id, side, price, remaining, status: 'open' };
}

test('bestBid/bestAsk return null on an empty book', () => {
  const book = new OrderBook('TEST');
  assert.equal(book.bestBid(), null);
  assert.equal(book.bestAsk(), null);
});

test('bestBid tracks the highest resting buy price', () => {
  const book = new OrderBook('TEST');
  book._addToBook('buy', mkOrder('b1', 'buy', 100, 5));
  book._addToBook('buy', mkOrder('b2', 'buy', 105, 5));
  book._addToBook('buy', mkOrder('b3', 'buy', 102, 5));
  assert.equal(book.bestBid(), 105);
});

test('bestAsk tracks the lowest resting sell price', () => {
  const book = new OrderBook('TEST');
  book._addToBook('sell', mkOrder('a1', 'sell', 110, 5));
  book._addToBook('sell', mkOrder('a2', 'sell', 108, 5));
  book._addToBook('sell', mkOrder('a3', 'sell', 112, 5));
  assert.equal(book.bestAsk(), 108);
});

test('orders at the same price level are FIFO', () => {
  const book = new OrderBook('TEST');
  book._addToBook('buy', mkOrder('first', 'buy', 100, 5));
  book._addToBook('buy', mkOrder('second', 'buy', 100, 5));
  const level = book.bids.get(100);
  assert.deepEqual(level.map((o) => o.id), ['first', 'second']);
});

test('cancel removes an order and frees an emptied price level', () => {
  const book = new OrderBook('TEST');
  book._addToBook('buy', mkOrder('b1', 'buy', 100, 5));
  assert.equal(book.cancel('b1'), true);
  assert.equal(book.bids.has(100), false);
  assert.equal(book.bestBid(), null);
});

test('cancel on an unknown id returns false', () => {
  const book = new OrderBook('TEST');
  assert.equal(book.cancel('nope'), false);
});

test('bestBid/bestAsk lazily skip stale emptied price levels', () => {
  const book = new OrderBook('TEST');
  book._addToBook('buy', mkOrder('b1', 'buy', 105, 5));
  book._addToBook('buy', mkOrder('b2', 'buy', 100, 5));
  book.cancel('b1'); // empties the top (105) level without a compaction pass
  assert.equal(book.bestBid(), 100);
});

test('depth() aggregates qty and order count per price level, sorted best-first', () => {
  const book = new OrderBook('TEST');
  book._addToBook('buy', mkOrder('b1', 'buy', 100, 5));
  book._addToBook('buy', mkOrder('b2', 'buy', 100, 3));
  book._addToBook('buy', mkOrder('b3', 'buy', 101, 2));
  const d = book.depth(10);
  assert.deepEqual(d.bids[0], { price: 101, qty: 2, orders: 1 });
  assert.deepEqual(d.bids[1], { price: 100, qty: 8, orders: 2 });
});

test('getOrder returns the live order object or null', () => {
  const book = new OrderBook('TEST');
  const order = mkOrder('b1', 'buy', 100, 5);
  book._addToBook('buy', order);
  assert.equal(book.getOrder('b1'), order);
  assert.equal(book.getOrder('missing'), null);
});
