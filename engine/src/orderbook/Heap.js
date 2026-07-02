'use strict';

/**
 * Generic binary heap. Used here NOT to store every order (that would be
 * O(log n) per order, which is overkill), but to track the best PRICE
 * LEVELS only. Orders within a price level live in a FIFO queue inside
 * OrderBook's price-level map, giving O(1) for the common case (an order
 * arriving at a price level that already exists) and O(log n) only when a
 * brand new price level is created or fully drained.
 *
 * compareFn(a, b) < 0  => a has higher priority (comes out first)
 */
class Heap {
  constructor(compareFn) {
    this._compare = compareFn;
    this._data = [];
  }

  get size() {
    return this._data.length;
  }

  peek() {
    return this._data[0];
  }

  push(value) {
    this._data.push(value);
    this._bubbleUp(this._data.length - 1);
  }

  pop() {
    if (this._data.length === 0) return undefined;
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._bubbleDown(0);
    }
    return top;
  }

  // Lazily remove a specific value (used when a price level empties out
  // but isn't necessarily at the top of the heap). O(n) — acceptable
  // because price-level churn is far rarer than order churn.
  remove(value) {
    const idx = this._data.indexOf(value);
    if (idx === -1) return false;
    const last = this._data.pop();
    if (idx < this._data.length) {
      this._data[idx] = last;
      this._bubbleDown(idx);
      this._bubbleUp(idx);
    }
    return true;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._compare(this._data[i], this._data[parent]) < 0) {
        this._swap(i, parent);
        i = parent;
      } else break;
    }
  }

  _bubbleDown(i) {
    const n = this._data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this._compare(this._data[l], this._data[smallest]) < 0) smallest = l;
      if (r < n && this._compare(this._data[r], this._data[smallest]) < 0) smallest = r;
      if (smallest === i) break;
      this._swap(i, smallest);
      i = smallest;
    }
  }

  _swap(i, j) {
    [this._data[i], this._data[j]] = [this._data[j], this._data[i]];
  }
}

// Bid side: highest price = highest priority
class MaxHeap extends Heap {
  constructor() {
    super((a, b) => b - a);
  }
}

// Ask side: lowest price = highest priority
class MinHeap extends Heap {
  constructor() {
    super((a, b) => a - b);
  }
}

module.exports = { Heap, MaxHeap, MinHeap };
