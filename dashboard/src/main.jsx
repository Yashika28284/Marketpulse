import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { DemoOne } from './components/hero-with-video-demo';
import './index.css';

// Visit http://localhost:5173/#hero-demo to preview the new hero component
// in isolation. Default (no hash) still renders the trading dashboard.
const RootView = window.location.hash === '#hero-demo' ? DemoOne : App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootView />
  </React.StrictMode>
);
