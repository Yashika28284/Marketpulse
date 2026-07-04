import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

type AuthMode = 'login' | 'register';

interface NeuralAuthFormProps {
  onAuthenticated: (auth: { token: string; accountId: string; email: string }) => void;
  initialMode?: AuthMode;
  initialEmail?: string;
}

const NeuralAuthForm: React.FC<NeuralAuthFormProps> = ({
  onAuthenticated,
  initialMode = 'login',
  initialEmail = '',
}) => {
  // Generate static random values once per mount to prevent hydration errors
  const blobsData = useMemo(() => {
    return Array.from({ length: 6 }).map(() => ({
      size: Math.random() * 200 + 150,
      left: Math.random() * 80 + 10,
      top: Math.random() * 80 + 10,
      animationDelay: Math.random() * -20,
      animationDuration: Math.random() * 15 + 15,
    }));
  }, []);

  const blobRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      blobRefs.current.forEach((blob, index) => {
        if (blob) {
          const speed = (index + 1) * 20;
          blob.style.marginLeft = `${x * speed}px`;
          blob.style.marginTop = `${y * speed}px`;
        }
      });
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // --- real auth wiring (same contract as the old AuthForm.jsx) ---
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'something went wrong');
        return;
      }
      onAuthenticated({ token: data.token, accountId: data.accountId, email: data.email });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('mercury-wrapper')}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;800&family=Space+Mono&display=swap');

        :root {
          --bg: #050505;
          --mercury: #e0e0e0;
          --mercury-dark: #666666;
          --accent: #ffffff;
          --text-dim: rgba(255, 255, 255, 0.5);
          --filter-goo: url('#gooey');
        }

        .mercury-wrapper {
          background-color: var(--bg);
          color: var(--accent);
          font-family: 'Inter', sans-serif;
          min-height: 100vh;
          width: 100%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .mercury-wrapper * {
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
        }

        .stage {
          position: absolute;
          width: 100%;
          height: 100%;
          z-index: 0;
          filter: var(--filter-goo);
          opacity: 0.6;
        }

        .blob {
          position: absolute;
          background: linear-gradient(135deg, var(--mercury), #888);
          border-radius: 50%;
          filter: blur(20px);
          animation: float 20s infinite alternate ease-in-out;
          box-shadow: inset -10px -10px 20px rgba(0,0,0,0.5),
                      10px 10px 30px rgba(255,255,255,0.2);
          transition: margin 0.1s ease-out;
        }

        @keyframes float {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(10vw, 20vh) scale(1.2); }
          66% { transform: translate(-5vw, 10vh) scale(0.8); }
          100% { transform: translate(5vw, -10vh) scale(1.1); }
        }

        .auth-container {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 440px;
          padding: 40px;
        }

        .header {
          margin-bottom: 40px;
          text-align: left;
        }

        .brand-id {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: var(--text-dim);
          margin-bottom: 8px;
          display: block;
        }

        .header h1 {
          font-weight: 800;
          font-size: 3rem;
          line-height: 0.9;
          letter-spacing: -2px;
          margin-left: -4px;
          margin-top: 0;
        }

        /* Login / Register mode tabs */
        .mode-tabs {
          display: flex;
          gap: 24px;
          margin-bottom: 40px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .mode-tabs button {
          background: none;
          border: none;
          color: var(--text-dim);
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          padding: 0 0 14px 0;
          cursor: pointer;
          position: relative;
        }

        .mode-tabs button.active {
          color: var(--accent);
        }

        .mode-tabs button.active::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: -1px;
          height: 2px;
          background: var(--mercury);
          box-shadow: 0 0 10px var(--mercury);
        }

        .form-group {
          position: relative;
          margin-bottom: 30px;
          transition: transform 0.4s cubic-bezier(0.2, 1, 0.3, 1);
        }

        .form-group:focus-within {
          transform: translateX(10px);
        }

        .form-group label {
          display: block;
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          color: var(--text-dim);
          margin-bottom: 12px;
          text-transform: uppercase;
        }

        .form-group input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--accent);
          padding: 12px 0;
          font-size: 18px;
          outline: none;
          transition: border-color 0.4s;
        }

        .input-glow {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 0%;
          height: 2px;
          background: var(--mercury);
          transition: width 0.6s cubic-bezier(0.2, 1, 0.3, 1);
          box-shadow: 0 0 15px var(--mercury);
        }

        .form-group input:focus + .input-glow {
          width: 100%;
        }

        .submit-wrap {
          margin-top: 50px;
          position: relative;
          filter: var(--filter-goo);
        }

        .btn-base {
          background: var(--accent);
          color: #000;
          border: none;
          padding: 20px 40px;
          font-size: 14px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 2px;
          cursor: pointer;
          width: 100%;
          position: relative;
          z-index: 2;
          transition: letter-spacing 0.3s;
        }

        .btn-base:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-base:hover:not(:disabled) {
          letter-spacing: 4px;
        }

        .mercury-drop {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 100%;
          height: 100%;
          background: var(--mercury);
          transform: translate(-50%, -50%);
          z-index: 1;
          border-radius: 50px;
          transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .submit-wrap:hover .mercury-drop {
          transform: translate(-50%, -50%) scale(1.05, 1.2);
          filter: brightness(1.2);
        }

        .error-line {
          margin-top: 20px;
          font-family: 'Space Mono', monospace;
          font-size: 12px;
          color: #ff6b6b;
        }

        .footer-nav {
          margin-top: 40px;
          display: flex;
          justify-content: space-between;
          font-family: 'Space Mono', monospace;
          font-size: 10px;
        }

        .footer-nav span {
          color: var(--text-dim);
        }

        .svg-filter-hidden {
          position: absolute;
          width: 0;
          height: 0;
        }
      `}</style>

      <svg className="svg-filter-hidden">
        <defs>
          <filter id="gooey">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div className="stage">
        {blobsData.map((data, index) => (
          <div
            key={index}
            ref={(el) => (blobRefs.current[index] = el)}
            className="blob"
            style={{
              width: `${data.size}px`,
              height: `${data.size}px`,
              left: `${data.left}%`,
              top: `${data.top}%`,
              animationDelay: `${data.animationDelay}s`,
              animationDuration: `${data.animationDuration}s`,
            }}
          />
        ))}
      </div>

      <main className="auth-container">
        <header className="header">
          <span className="brand-id">System Node: MarketPulse</span>
          <h1>NEURAL<br />ACCESS</h1>
        </header>

        <div className="mode-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError(null); }}
          >
            Log In
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => { setMode('register'); setError(null); }}
          >
            Register
          </button>
        </div>

        <form autoComplete="off" onSubmit={submit}>
          <div className="form-group">
            <label>User Identity</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className="input-glow"></div>
          </div>

          <div className="form-group">
            <label>Sequence Key</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === 'register' ? 8 : undefined}
              required
            />
            <div className="input-glow"></div>
          </div>

          <div className="submit-wrap">
            <div className="mercury-drop"></div>
            <button type="submit" className="btn-base" disabled={busy}>
              {busy ? 'Please Wait...' : mode === 'login' ? 'Start trading' : 'Create Access Node'}
            </button>
          </div>

          {error && <div className="error-line">{error}</div>}
        </form>

        <footer className="footer-nav">
          <span>ENCRYPTED RECOVERY</span>
          <span>v1.0 · MARKETPULSE</span>
        </footer>
      </main>
    </div>
  );
};

export default NeuralAuthForm;