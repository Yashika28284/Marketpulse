'use strict';

const { MaxHeap, MinHeap } = require('./Heap');

let _orderSeq = 0;
const nextOrderId = () => `o_${Date.now()}_${++_orderSeq}`;

/**
 * Price-time priority order book.
 *
 * Structure: a Map<price, FIFO queue of orders> per side, plus a heap of
 * price levels per side so we can find the best price in O(1) (peek) and
 * insert a brand-new price level in O(log n). Orders hitting an existing
 * price level are O(1) (push to the back of that level's queue).
 *
 * This hybrid is closer to how real venues implement books than a naive
 * "one entry per order in a heap" design, which would cost O(log n) on
 * every single order regardless of whether its price level already exists.
 */
class OrderBook {
  constructor(symbol) {
    this.symbol = symbol;

    // price -> array of orders (FIFO within a price level)
    this.bids = new Map();
    this.asks = new Map();

    this.bidHeap = new MaxHeap(); // best (highest) bid price on top
    this.askHeap = new MinHeap(); // best (lowest) ask price on top

    this.orderIndex = new Map(); // orderId -> { side, price, order }
  }

  bestBid() {
    while (this.bidHeap.size > 0) {
      const top = this.bidHeap.peek();
      const level = this.bids.get(top);
      if (level && level.length > 0) return top;
      this.bidHeap.pop(); // stale empty level, drop it
    }
    return null;
  }

  bestAsk() {
    while (this.askHeap.size > 0) {
      const top = this.askHeap.peek();
      const level = this.asks.get(top);
      if (level && level.length > 0) return top;
      this.askHeap.pop();
    }
    return null;
  }

  /**
   * Add a resting order to the book (called once an order has no more
   * counter-liquidity to match against, or for the unfilled remainder).
   */
  _addToBook(side, order) {
    const map = side === 'buy' ? this.bids : this.asks;
    const heap = side === 'buy' ? this.bidHeap : this.askHeap;

    if (!map.has(order.price)) {
      map.set(order.price, []);
      heap.push(order.price);
    }
    map.get(order.price).push(order);
    this.orderIndex.set(order.id, { side, price: order.price, order });
  }

  getOrder(orderId) {
    const entry = this.orderIndex.get(orderId);
    return entry ? entry.order : null;
  }

  cancel(orderId) {
    const entry = this.orderIndex.get(orderId);
    if (!entry) return false;
    const { side, price, order } = entry;
    const map = side === 'buy' ? this.bids : this.asks;
    const level = map.get(price);
    if (!level) return false;
    const idx = level.findIndex((o) => o.id === orderId);
    if (idx === -1) return false;
    level.splice(idx, 1);
    order.status = 'cancelled';
    this.orderIndex.delete(orderId);
    if (level.length === 0) map.delete(price);
    return true;
  }

  /**
   * Depth snapshot for the WebSocket feed / dashboard.
   * levels = how many price levels per side to return.
   */
  depth(levels = 10) {
    const bidPrices = [...this.bids.keys()].sort((a, b) => b - a).slice(0, levels);
    const askPrices = [...this.asks.keys()].sort((a, b) => a - b).slice(0, levels);
    const agg = (map, prices) =>
      prices
        .map((p) => ({
          price: p,
          qty: map.get(p).reduce((sum, o) => sum + o.remaining, 0),
          orders: map.get(p).length,
        }))
        // Defense-in-depth: a level should never legitimately be at 0
        // qty and still present (the book removes exhausted orders as
        // they fill), but if it ever happens, don't ship a ghost row
        // to clients.
        .filter((lvl) => lvl.qty > 0);
    return { symbol: this.symbol, bids: agg(this.bids, bidPrices), asks: agg(this.asks, askPrices) };
  }
}

module.exports = { OrderBook, nextOrderId };