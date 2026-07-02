import React, { useEffect, useState } from 'react';
import { useMarketFeed } from './hooks/useMarketFeed';
import OrderBookView from './components/OrderBook.jsx';
import TradeFeed from './components/TradeFeed.jsx';
import OrderForm from './components/OrderForm.jsx';
import RiskPanel from './components/RiskPanel.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const SYMBOLS = (import.meta.env.VITE_SYMBOLS || 'AAPL,MSFT,BTC-USD').split(',');

export default function App() {
  const { depthBySymbol, trades, connected } = useMarketFeed();
  const [token, setToken] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'demo_account' }),
    })
      .then((r) => r.json())
      .then((d) => setToken(d.token))
      .catch(() => {});
  }, []);

  return (
    <div className="app">
      <header>
        <h1>MarketPulse</h1>
        <span className={`status-dot ${connected ? 'up' : 'down'}`} />
        <span>{connected ? 'live' : 'disconnected'}</span>
      </header>
      <div className="grid">
        <div className="books">
          {SYMBOLS.map((s) => (
            <OrderBookView key={s} symbol={s} depth={depthBySymbol[s]} />
          ))}
        </div>
        <div className="side-col">
          {token && <OrderForm symbols={SYMBOLS} token={token} />}
          {token && <RiskPanel token={token} />}
          <TradeFeed trades={trades} />
        </div>
      </div>
    </div>
  );
}
