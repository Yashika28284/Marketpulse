import React from 'react';

export default function OrderBook({ symbol, depth }) {
  if (!depth) return <div className="panel">Loading {symbol} book...</div>;

  return (
    <div className="panel">
      <h3>{symbol}</h3>
      <div className="book">
        <div className="side asks">
          {[...depth.asks].reverse().map((lvl) => (
            <div key={lvl.price} className="row ask">
              <span>{lvl.price?.toFixed?.(2) ?? "-"}</span>
              <span>{lvl.qty?.toFixed?.(2) ?? "-"}</span>
            </div>
          ))}
        </div>
        <div className="side bids">
          {depth.bids.map((lvl) => (
            <div key={lvl.price} className="row bid">
              <span>{lvl.price.toFixed(2)}</span>
              <span>{lvl.qty}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}