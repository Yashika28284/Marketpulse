'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Db } = require('../src/db/postgres');

// Db's constructor creates a real `pg` Pool, but Pool doesn't touch the
// network until a query actually runs — so we can safely construct a
// real Db and just stub `.pool.query` to test the row-mapping/casting
// logic in isolation, no live Postgres required.
function dbWithStubbedRows(rows) {
  const db = new Db('postgresql://unused:unused@localhost:5432/unused');
  db.pool.query = async () => ({ rows });
  return db;
}

test('getAllTrades casts NUMERIC price/qty to real numbers, not strings', async () => {
  // pg returns NUMERIC columns as strings by default — this is exactly
  // the bug that would silently turn RiskEngine's `buyerQty + trade.qty`
  // into string concatenation ("0" + "5" -> "05") during replay.
  const db = dbWithStubbedRows([
    {
      trade_id: 't1',
      symbol: 'AAPL',
      price: '100.50',
      qty: '5',
      buy_order_id: 'o1',
      sell_order_id: 'o2',
      buy_account_id: 'buyer-uuid',
      sell_account_id: 'seller-uuid',
      ts: new Date('2026-01-01T00:00:00Z'),
    },
  ]);

  const trades = await db.getAllTrades();
  assert.equal(trades.length, 1);
  assert.equal(typeof trades[0].price, 'number');
  assert.equal(typeof trades[0].qty, 'number');
  assert.equal(trades[0].price, 100.5);
  assert.equal(trades[0].qty, 5);
  assert.equal(trades[0].buyAccountId, 'buyer-uuid');
  assert.equal(trades[0].sellAccountId, 'seller-uuid');
});

test('getAllTrades returns an empty array when there is no trade history yet', async () => {
  const db = dbWithStubbedRows([]);
  const trades = await db.getAllTrades();
  assert.deepEqual(trades, []);
});
