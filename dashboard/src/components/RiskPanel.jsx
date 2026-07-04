import React, { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export default function RiskPanel({ token, onAuthError }) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!token) return;
    const fetchSummary = () => {
      fetch(`${API_URL}/account`, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (r) => {
          // A 401 here means the stored token is invalid/expired (e.g.
          // stale localStorage from an earlier run). Don't treat the
          // error body as a summary — that's how "invalid token" ends
          // up masquerading as { positions: undefined } and crashing
          // the Object.entries() below. Bounce back to the login screen
          // instead so the person can re-authenticate.
          if (r.status === 401) {
            onAuthError?.();
            return null;
          }
          if (!r.ok) return null;
          return r.json();
        })
        .then((data) => {
          if (data) setSummary(data);
        })
        .catch(() => {});
    };
    fetchSummary();
    const id = setInterval(fetchSummary, 3000);
    return () => clearInterval(id);
  }, [token, onAuthError]);

  if (!summary) return <div className="panel">Risk: loading...</div>;

  const pct = summary.exposureLimit ? (summary.exposure / summary.exposureLimit) * 100 : 0;

  // A position that's been fully closed out (bought then sold the same
  // qty, or vice versa) nets to exactly 0 — that's "no position", not
  // worth showing as a row. Only display symbols you're actually
  // holding one side of right now.
  const openPositions = Object.entries(summary.positions || {}).filter(([, qty]) => qty !== 0);

  return (
    <div className="panel">
      <h3>Account Risk</h3>
      <div>Exposure: ${summary.exposure.toFixed(2)} / ${summary.exposureLimit.toFixed(2)}</div>
      <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(pct, 100)}%` }} /></div>
      <h4>Positions</h4>
      {openPositions.length === 0 ? (
        <div className="status">No open positions</div>
      ) : (
        <>
          <div className="status" style={{ marginBottom: 4 }}>
            positive = Long (you bought) &nbsp;·&nbsp; negative = Short (you sold)
          </div>
          {openPositions.map(([symbol, qty]) => {
            const isLong = qty > 0;
            return (
              <div key={symbol} className="row">
                <span>{symbol}</span>
                <span className={isLong ? 'pos-long' : 'pos-short'}>
                  {isLong ? '+' : ''}{qty} · {isLong ? 'Long' : 'Short'}
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
