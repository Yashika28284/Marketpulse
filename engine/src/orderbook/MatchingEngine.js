'use strict';

const { EventEmitter } = require('events');
const { OrderBook, nextOrderId } = require('./OrderBook');

/**
 * Order shape:
 * {
 *   id, accountId, symbol, side: 'buy'|'sell',
 *   type: 'limit'|'market'|'stop',
 *   price,        // null for market orders
 *   stopPrice,    // only for 'stop' orders
 *   qty, remaining,
 *   status: 'open'|'filled'|'partial'|'cancelled'|'pending', // 'pending' = stop not triggered yet
 *   ts
 * }
 *
 * Single-threaded by design: Node's event loop processes one order at a
 * time off the intake queue, so there is no fine-grained locking and no
 * partial-write races on the book. This is the same trick real matching
 * engines use (a single sequencer thread per symbol) rather than trying
 * to make the book itself thread-safe. Cross-symbol parallelism is
 * achieved by sharding: one MatchingEngine instance per symbol.
 */
class MatchingEngine extends EventEmitter {
  constructor(symbol, { riskEngine } = {}) {
    super();
    this.symbol = symbol;
    this.book = new OrderBook(symbol);
    this.riskEngine = riskEngine || null;
    this.trades = [];
    this.pendingStops = []; // stop orders waiting to trigger
  }

  /**
   * Entry point. Returns the order object (now with fills applied).
   */
  submit(rawOrder) {
    const order = {
      id: rawOrder.id || nextOrderId(),
      accountId: rawOrder.accountId,
      symbol: this.symbol,
      side: rawOrder.side,
      type: rawOrder.type || 'limit',
      price: rawOrder.price ?? null,
      stopPrice: rawOrder.stopPrice ?? null,
      qty: rawOrder.qty,
      remaining: rawOrder.qty,
      status: 'open',
      ts: Date.now(),
    };

    if (this.riskEngine) {
      const check = this.riskEngine.checkOrder(order);
      if (!check.ok) {
        order.status = 'rejected';
        order.rejectReason = check.reason;
        this.emit('order:rejected', order);
        return order;
      }
    }

    if (order.type === 'stop') {
      order.status = 'pending';
      this.pendingStops.push(order);
      this.emit('order:accepted', order);
      return order;
    }

    this._match(order);
    this._checkStopTriggers();
    return order;
  }

  cancel(orderId) {
    const ok = this.book.cancel(orderId);
    if (ok) this.emit('order:cancelled', { id: orderId });
    return ok;
  }

  getOrder(orderId) {
    return this.book.getOrder(orderId);
  }

  _match(order) {
    const isBuy = order.side === 'buy';
    const oppositeBest = () => (isBuy ? this.book.bestAsk() : this.book.bestBid());
    const oppositeMap = isBuy ? this.book.asks : this.book.bids;

    while (order.remaining > 0) {
      const bestPrice = oppositeBest();
      if (bestPrice === null) break; // no liquidity left

      // Limit order: stop matching once price is no longer marketable
      if (order.type === 'limit') {
        if (isBuy && order.price < bestPrice) break;
        if (!isBuy && order.price > bestPrice) break;
      }
      // Market orders always cross at the best available price.

      const level = oppositeMap.get(bestPrice);
      while (level && level.length > 0 && order.remaining > 0) {
        const resting = level[0];

        // Self-trade prevention: skip/cancel resting order from the same
        // account rather than letting an account trade with itself.
        if (resting.accountId === order.accountId) {
          level.shift();
          resting.status = 'cancelled';
          this.book.orderIndex.delete(resting.id);
          this.emit('order:cancelled', { id: resting.id, reason: 'self-trade-prevention' });
          continue;
        }

        const fillQty = Math.min(order.remaining, resting.remaining);
        const fillPrice = bestPrice; // resting order's price = price-time priority

        order.remaining -= fillQty;
        resting.remaining -= fillQty;
        order.status = order.remaining === 0 ? 'filled' : 'partial';
        resting.status = resting.remaining === 0 ? 'filled' : 'partial';

        // Remove the exhausted resting order from the book BEFORE
        // emitting 'trade' — FeedServer's depth broadcast listens on
        // 'trade' and reads book state synchronously as soon as it
        // fires. If cleanup ran after emit, the snapshot sent to
        // clients would still contain a price level whose quantity is
        // already 0 but hasn't been removed yet, showing as a
        // never-clearing "ghost" row on the dashboard until some later
        // event happened to refresh it.
        if (resting.remaining === 0) {
          level.shift();
          this.book.orderIndex.delete(resting.id);
        }

        const trade = {
          id: nextOrderId(),
          symbol: this.symbol,
          price: fillPrice,
          qty: fillQty,
          buyOrderId: isBuy ? order.id : resting.id,
          sellOrderId: isBuy ? resting.id : order.id,
          buyAccountId: isBuy ? order.accountId : resting.accountId,
          sellAccountId: isBuy ? resting.accountId : order.accountId,
          ts: Date.now(),
        };
        this.trades.push(trade);
        this.emit('trade', trade);

        if (this.riskEngine) this.riskEngine.applyFill(trade);
      }

      if (!level || level.length === 0) oppositeMap.delete(bestPrice);
    }

    if (order.remaining > 0) {
      if (order.type === 'market') {
        // Unfilled remainder of a market order is cancelled, not rested.
        order.status = order.status === 'partial' ? 'partial' : 'cancelled';
        this.emit('order:cancelled', { id: order.id, reason: 'market-no-liquidity' });
      } else {
        this.book._addToBook(order.side, order);
        order.status = order.remaining === order.qty ? 'open' : 'partial';
        this.emit('order:accepted', order);
      }
    } else {
      this.emit('order:filled', order);
    }
  }

  _checkStopTriggers() {
    if (this.pendingStops.length === 0) return;
    const last = this.trades[this.trades.length - 1];
    if (!last) return;

    const stillPending = [];
    for (const stop of this.pendingStops) {
      const triggered =
        (stop.side === 'buy' && last.price >= stop.stopPrice) ||
        (stop.side === 'sell' && last.price <= stop.stopPrice);
      if (triggered) {
        stop.status = 'open';
        stop.type = 'market';
        this.emit('order:triggered', stop);
        this._match(stop);
      } else {
        stillPending.push(stop);
      }
    }
    this.pendingStops = stillPending;
  }

  depth(levels = 10) {
    return this.book.depth(levels);
  }
}

module.exports = { MatchingEngine };