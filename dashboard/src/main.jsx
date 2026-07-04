import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import MarketPulseHero from './components/ui/marketpulse-hero';
import './index.css';

// Landing page (hero) is the default. The live trading dashboard lives at
// http://localhost:5173/#dashboard — the hero's "Get Started"/"Login"
// buttons navigate there.
const RootView = window.location.hash === '#dashboard' ? App : MarketPulseHero;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootView />
  </React.StrictMode>
);