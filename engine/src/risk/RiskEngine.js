'use strict';

/**
 * Deliberately simple, deliberately explained. The honest scope here is:
 *   exposure = sum(|position_qty| * last_price) per symbol, per account
 *   reject new orders that would push exposure over the account's limit
 *
 * What this does NOT do (call this out proactively in interviews):
 *   - no cross-margin / portfolio netting across correlated symbols
 *   - no intraday mark-to-market revaluation loop (positions are marked
 *     at last trade price on demand, not on a timer)
 *   - no multi-leg / spread margining
 * Next step if extending: a periodic mark-to-market job that re-prices
 * all open positions off the latest trade and re-checks limits, so a
 * price move (not just a new order) can also trigger a margin breach.
 */
class RiskEngine {
  constructor({ defaultExposureLimit = 1_000_000, defaultPositionLimit = 10_000 } = {}) {
    this.defaultExposureLimit = defaultExposureLimit;
    this.defaultPositionLimit = defaultPositionLimit;

    // accountId -> { exposureLimit, positionLimit }
    this.accountLimits = new Map();
    // accountId -> symbol -> signed qty (+long / -short)
    this.positions = new Map();
    // symbol -> last trade price
    this.lastPrice = new Map();
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

  _accountExposure(accountId) {
    const acct = this.positions.get(accountId);
    if (!acct) return 0;
    let total = 0;
    for (const [symbol, qty] of acct.entries()) {
      const px = this.lastPrice.get(symbol) || 0;
      total += Math.abs(qty) * px;
    }
    return total;
  }

  /**
   * Pre-trade check, run before an order touches the book.
   * Uses a conservative worst-case assumption: assume the order fully
   * fills at its limit price (or last trade price for market orders).
   */
  checkOrder(order) {
    const { exposureLimit, positionLimit } = this._limitsFor(order.accountId);
    const refPrice = order.price ?? this.lastPrice.get(order.symbol) ?? 0;

    const currentQty = this._getPosition(order.accountId, order.symbol);
    const delta = order.side === 'buy' ? order.qty : -order.qty;
    const projectedQty = currentQty + delta;

    if (Math.abs(projectedQty) > positionLimit) {
      return { ok: false, reason: `position limit exceeded (${projectedQty} > ${positionLimit})` };
    }

    const currentExposure = this._accountExposure(order.accountId);
    const projectedExposure =
      currentExposure - Math.abs(currentQty) * (this.lastPrice.get(order.symbol) || 0) +
      Math.abs(projectedQty) * refPrice;

    if (projectedExposure > exposureLimit) {
      return { ok: false, reason: `exposure limit exceeded ($${projectedExposure.toFixed(2)} > $${exposureLimit})` };
    }

    return { ok: true };
  }

  /**
   * Called by the matching engine after a trade executes — updates real
   * positions and marks the symbol's last price.
   */
  applyFill(trade) {
    this.lastPrice.set(trade.symbol, trade.price);

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
