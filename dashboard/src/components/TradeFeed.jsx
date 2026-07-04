import React, { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function TradeFeed({ trades, accountId, token, onAuthError }) {
  // The WebSocket feed only ever carries trades that happen while this
  // tab is connected — it has no memory of anything before that. This
  // pulls the account's persisted history from Postgres once on mount
  // (or on login/token change) so a reload or a fresh session still
  // shows past fills, not just a blank panel until something new prints.
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${API_URL}/trades`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (r.status === 401) {
          onAuthError?.();
          return null;
        }
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (!cancelled && data) setHistory(data.trades || []);
      })
      .catch(() => { })
      .finally(() => {
        if (!cancelled) setHistoryLoaded(true);
      });
    return () => { cancelled = true; };
  }, [token, onAuthError]);

  // The feed carries every trade on the exchange (both sides, every
  // account) since that's what the order-book depth view needs. For a
  // personal "trade prints" section, only the fills this account was
  // actually a party to are relevant. Merge live + persisted history
  // and dedupe by trade id (a fill that just happened arrives over the
  // WebSocket before it's necessarily reflected in a re-fetch of history).
  const live = accountId
    ? trades.filter((t) => t.buyAccountId === accountId || t.sellAccountId === accountId)
    : trades;

  const byId = new Map();
  for (const t of [...live, ...history]) byId.set(t.id, t);
  const mine = Array.from(byId.values()).sort((a, b) => new Date(b.ts) - new Date(a.ts));

  // Running totals per symbol — qty and notional value on each side —
  // so "how much did I buy vs sell" is a glance, not something you have
  // to add up from the raw print list yourself.
  const totalsBySymbol = {};
  for (const t of mine) {
    const bought = t.buyAccountId === accountId;
    const sold = t.sellAccountId === accountId;
    if (!bought && !sold) continue; // shouldn't happen given the filter above
    if (!totalsBySymbol[t.symbol]) {
      totalsBySymbol[t.symbol] = { boughtQty: 0, boughtValue: 0, soldQty: 0, soldValue: 0 };
    }
    if (bought) {
      totalsBySymbol[t.symbol].boughtQty += t.qty;
      totalsBySymbol[t.symbol].boughtValue += t.qty * t.price;
    }
    if (sold) {
      totalsBySymbol[t.symbol].soldQty += t.qty;
      totalsBySymbol[t.symbol].soldValue += t.qty * t.price;
    }
  }
  const symbols = Object.keys(totalsBySymbol);

  return (
    <div className="panel">
      <h3>Trade Prints</h3>

      {!historyLoaded ? (
        <div className="status">Loading trade history...</div>
      ) : mine.length === 0 ? (
        <div className="status">
          No fills yet — trades appear here the moment an order matches.
        </div>
      ) : (
        <>
          {/* Summary: total bought/sold per symbol */}
          <div style={{ marginBottom: 10 }}>
            {symbols.map((symbol) => {
              const s = totalsBySymbol[symbol];
              return (
                <div key={symbol} style={{ marginBottom: 6 }}>
                  <div className="row" style={{ fontWeight: 600 }}>
                    <span>{symbol}</span>
                    <span />
                  </div>
                  {s.boughtQty > 0 && (
                    <div className="row" style={{ paddingLeft: 8 }}>
                      <span className="pos-long">Bought {s.boughtQty}</span>
                      <span className="pos-long">{formatCurrency(s.boughtValue)}</span>
                    </div>
                  )}
                  {s.soldQty > 0 && (
                    <div className="row" style={{ paddingLeft: 8 }}>
                      <span className="pos-short">Sold {s.soldQty}</span>
                      <span className="pos-short">{formatCurrency(s.soldValue)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Detailed prints, most recent first */}
          <div className="trade-list">
            {mine.map((t) => {
              const bought = t.buyAccountId === accountId;
              return (
                <div key={t.id} className="row trade">
                  <span className={bought ? 'pos-long' : 'pos-short'}>{bought ? 'Buy' : 'Sell'}</span>
                  <span>{t.symbol}</span>
                  <span>{t.qty} @ {t.price.toFixed(2)}</span>
                  <span>{new Date(t.ts).toLocaleTimeString()}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}