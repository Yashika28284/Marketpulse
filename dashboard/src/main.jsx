import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { DemoOne } from './components/hero-with-video-demo';
import './index.css';

// Landing page (hero) is the default. The live trading dashboard lives at
// http://localhost:5173/#dashboard — the hero's "Get Started" buttons
// navigate there.
const RootView = window.location.hash === '#dashboard' ? App : DemoOne;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootView />
  </React.StrictMode>
);
