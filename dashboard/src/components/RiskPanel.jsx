import React, { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export default function RiskPanel({ token }) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!token) return;
    const fetchSummary = () => {
      fetch(`${API_URL}/account`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(setSummary)
        .catch(() => {});
    };
    fetchSummary();
    const id = setInterval(fetchSummary, 3000);
    return () => clearInterval(id);
  }, [token]);

  if (!summary) return <div className="panel">Risk: loading...</div>;

  const pct = summary.exposureLimit ? (summary.exposure / summary.exposureLimit) * 100 : 0;

  return (
    <div className="panel">
      <h3>Account Risk</h3>
      <div>Exposure: ${summary.exposure.toFixed(2)} / ${summary.exposureLimit.toFixed(2)}</div>
      <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(pct, 100)}%` }} /></div>
      <h4>Positions</h4>
      {Object.entries(summary.positions).map(([symbol, qty]) => (
        <div key={symbol} className="row">
          <span>{symbol}</span>
          <span>{qty}</span>
        </div>
      ))}
    </div>
  );
}
