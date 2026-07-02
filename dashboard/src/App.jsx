import React, { useEffect, useState } from 'react';
import { useMarketFeed } from './hooks/useMarketFeed';
import OrderBookView from './components/OrderBook.jsx';
import TradeFeed from './components/TradeFeed.jsx';
import OrderForm from './components/OrderForm.jsx';
import RiskPanel from './components/RiskPanel.jsx';
import AuthForm from './components/AuthForm.jsx';

const SYMBOLS = (import.meta.env.VITE_SYMBOLS || 'AAPL,MSFT,BTC-USD').split(',');
const STORAGE_KEY = 'marketpulse_auth';

export default function App() {
  const { depthBySymbol, trades, connected } = useMarketFeed();
  const [auth, setAuth] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // "Join Now" on the landing page hands off { mode, email } here via
  // sessionStorage (see hero-with-video.tsx's goToRegister). Read it once,
  // then clear it so it doesn't stick around on a later manual visit.
  const [authPrefill] = useState(() => {
    try {
      const raw = sessionStorage.getItem('marketpulse_prefill');
      sessionStorage.removeItem('marketpulse_prefill');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  function handleAuthenticated(nextAuth) {
    setAuth(nextAuth);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAuth));
  }

  function logout() {
    setAuth(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div className="app">
      <header>
        <h1>MarketPulse</h1>
        <span className={`status-dot ${connected ? 'up' : 'down'}`} />
        <span>{connected ? 'live' : 'disconnected'}</span>
        {auth && (
          <span style={{ marginLeft: '1rem', color: '#888', fontSize: '0.85rem' }}>
            {auth.email}
          </span>
        )}
        {auth && (
          <button
            onClick={logout}
            style={{ marginLeft: '0.75rem', background: 'none', border: '1px solid #444', color: '#ccc', borderRadius: '6px', padding: '0.25rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Log out
          </button>
        )}
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); window.location.href = window.location.pathname; }}
          style={{ marginLeft: 'auto', color: '#888', fontSize: '0.85rem' }}
        >
          ← back to home
        </a>
      </header>

      {!auth ? (
        <div className="grid" style={{ justifyContent: 'center' }}>
          <AuthForm
            onAuthenticated={handleAuthenticated}
            initialMode={authPrefill?.mode || 'login'}
            initialEmail={authPrefill?.email || ''}
          />
        </div>
      ) : (
        <div className="grid">
          <div className="books">
            {SYMBOLS.map((s) => (
              <OrderBookView key={s} symbol={s} depth={depthBySymbol[s]} />
            ))}
          </div>
          <div className="side-col">
            <OrderForm symbols={SYMBOLS} token={auth.token} />
            <RiskPanel token={auth.token} />
            <TradeFeed trades={trades} />
          </div>
        </div>
      )}
    </div>
  );
}
