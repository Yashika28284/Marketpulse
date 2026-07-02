'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MaxHeap, MinHeap } = require('../src/orderbook/Heap');

test('MaxHeap pops highest value first', () => {
  const h = new MaxHeap();
  for (const v of [5, 1, 9, 3, 7]) h.push(v);
  const out = [];
  while (h.size > 0) out.push(h.pop());
  assert.deepEqual(out, [9, 7, 5, 3, 1]);
});

test('MinHeap pops lowest value first', () => {
  const h = new MinHeap();
  for (const v of [5, 1, 9, 3, 7]) h.push(v);
  const out = [];
  while (h.size > 0) out.push(h.pop());
  assert.deepEqual(out, [1, 3, 5, 7, 9]);
});

test('peek does not remove', () => {
  const h = new MaxHeap();
  h.push(10);
  h.push(20);
  assert.equal(h.peek(), 20);
  assert.equal(h.size, 2);
});

test('remove() takes out an arbitrary value and heap stays valid', () => {
  const h = new MaxHeap();
  for (const v of [5, 1, 9, 3, 7]) h.push(v);
  assert.equal(h.remove(9), true);
  const out = [];
  while (h.size > 0) out.push(h.pop());
  assert.deepEqual(out, [7, 5, 3, 1]);
});

test('remove() on a missing value returns false', () => {
  const h = new MaxHeap();
  h.push(1);
  assert.equal(h.remove(999), false);
});

test('pop() on empty heap returns undefined', () => {
  const h = new MaxHeap();
  assert.equal(h.pop(), undefined);
});
