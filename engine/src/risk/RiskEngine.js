'use strict';

/**
 * Deliberately simple, deliberately explained. The honest scope here is:
 *   exposure = sum(|position_qty| * mark_price) per symbol, per account
 *   reject new orders that would push exposure over the account's limit
 *
 * Mark price = a rolling VWAP over the last MARK_PRICE_WINDOW trades for
 * that symbol, not the single last print. In a thin book (exactly what
 * this engine has — one matching engine, no real market makers), a
 * single outlier order can otherwise become the mark price for an
 * entire position instantly. That's the same mechanism behind real
 * "marking the close" manipulation: print one weird trade, and every
 * position in that symbol gets revalued off it. A short VWAP window
 * smooths that out without pulling in real-market infrastructure
 * (NBBO/settlement feeds) this project has no need to simulate.
 *
 * What this does NOT do (call this out proactively in interviews):
 *   - no cross-margin / portfolio netting across correlated symbols
 *   - no intraday mark-to-market revaluation loop (positions are marked
 *     on demand, off the trade history, not on a timer)
 *   - no multi-leg / spread margining
 * Next step if extending: a periodic mark-to-market job that re-prices
 * all open positions on a timer (not just on new trades) and re-checks
 * limits, so a price move alone (not just a new order) can also trigger
 * a margin breach.
 */
const MARK_PRICE_WINDOW = 20; // number of recent trades per symbol to VWAP over

class RiskEngine {
  constructor({ defaultExposureLimit = 1_000_000, defaultPositionLimit = 10_000 } = {}) {
    this.defaultExposureLimit = defaultExposureLimit;
    this.defaultPositionLimit = defaultPositionLimit;

    // accountId -> { exposureLimit, positionLimit }
    this.accountLimits = new Map();
    // accountId -> symbol -> signed qty (+long / -short)
    this.positions = new Map();
    // symbol -> last trade price (used as a fallback ref price for
    // market orders — not for exposure, see _markPrice below)
    this.lastPrice = new Map();
    // symbol -> array of { price, qty } for the most recent trades,
    // capped at MARK_PRICE_WINDOW entries, oldest first
    this.tradeHistory = new Map();
  }

  setAccountLimits(accountId, { exposureLimit, positionLimit }) {
    this.accountLimits.set(accountId, { exposureLimit, positionLimit });
  }

  _limitsFor(accountId) {
    return (
      this.accountLimits.get(accountId) || {
        exposureLimit: this.defaultExposureLimit,
        positionLimit: this.defaultPositionLimit,
      }
    );
  }

  _getPosition(accountId, symbol) {
    if (!this.positions.has(accountId)) this.positions.set(accountId, new Map());
    const acct = this.positions.get(accountId);
    if (!acct.has(symbol)) acct.set(symbol, 0);
    return acct.get(symbol);
  }

  /**
   * Volume-weighted average price over the last MARK_PRICE_WINDOW trades
   * for a symbol. Falls back to the raw last trade price if there's no
   * history yet (e.g. right after boot, before any trade has occurred),
   * and to 0 if the symbol has never traded at all.
   */
  _markPrice(symbol) {
    const history = this.tradeHistory.get(symbol);
    if (!history || history.length === 0) {
      return this.lastPrice.get(symbol) || 0;
    }
    let notional = 0;
    let volume = 0;
    for (const { price, qty } of history) {
      notional += price * qty;
      volume += qty;
    }
    return volume > 0 ? notional / volume : 0;
  }

  _recordTrade(symbol, price, qty) {
    if (!this.tradeHistory.has(symbol)) this.tradeHistory.set(symbol, []);
    const history = this.tradeHistory.get(symbol);
    history.push({ price, qty });
    if (history.length > MARK_PRICE_WINDOW) history.shift();
  }

  _accountExposure(accountId) {
    const acct = this.positions.get(accountId);
    if (!acct) return 0;
    let total = 0;
    for (const [symbol, qty] of acct.entries()) {
      total += Math.abs(qty) * this._markPrice(symbol);
    }
    return total;
  }

  /**
   * Pre-trade check, run before an order touches the book.
   * Uses a conservative worst-case assumption: assume the order fully
   * fills at its limit price (or the current mark price for market
   * orders, since there's no limit price to fall back on).
   */
  checkOrder(order) {
    const { exposureLimit, positionLimit } = this._limitsFor(order.accountId);
    const refPrice = order.price ?? this._markPrice(order.symbol);

    const currentQty = this._getPosition(order.accountId, order.symbol);
    const delta = order.side === 'buy' ? order.qty : -order.qty;
    const projectedQty = currentQty + delta;

    if (Math.abs(projectedQty) > positionLimit) {
      return { ok: false, reason: `position limit exceeded (${projectedQty} > ${positionLimit})` };
    }

    const currentExposure = this._accountExposure(order.accountId);
    const projectedExposure =
      currentExposure - Math.abs(currentQty) * this._markPrice(order.symbol) +
      Math.abs(projectedQty) * refPrice;

    if (projectedExposure > exposureLimit) {
      return { ok: false, reason: `exposure limit exceeded ($${projectedExposure.toFixed(2)} > $${exposureLimit})` };
    }

    return { ok: true };
  }

  /**
   * Called by the matching engine after a trade executes — updates real
   * positions, marks the symbol's last price (for market-order ref
   * pricing), and feeds the trade into the VWAP window used for
   * exposure calculations.
   */
  applyFill(trade) {
    this.lastPrice.set(trade.symbol, trade.price);
    this._recordTrade(trade.symbol, trade.price, trade.qty);

    const buyerQty = this._getPosition(trade.buyAccountId, trade.symbol);
    this.positions.get(trade.buyAccountId).set(trade.symbol, buyerQty + trade.qty);

    const sellerQty = this._getPosition(trade.sellAccountId, trade.symbol);
    this.positions.get(trade.sellAccountId).set(trade.symbol, sellerQty - trade.qty);
  }

  accountSummary(accountId) {
    const acct = this.positions.get(accountId) || new Map();
    const { exposureLimit, positionLimit } = this._limitsFor(accountId);
    return {
      accountId,
      positions: Object.fromEntries(acct),
      exposure: this._accountExposure(accountId),
      exposureLimit,
      positionLimit,
    };
  }
}

module.exports = { RiskEngine };