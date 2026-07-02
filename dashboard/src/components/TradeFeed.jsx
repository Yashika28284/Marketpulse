import React from 'react';

export default function TradeFeed({ trades }) {
  return (
    <div className="panel">
      <h3>Trade Prints</h3>
      <div className="trade-list">
        {trades.map((t) => (
          <div key={t.id} className="row trade">
            <span>{t.symbol}</span>
            <span>{t.price.toFixed(2)}</span>
            <span>{t.qty}</span>
            <span>{new Date(t.ts).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
