import React, { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Real login/register — hits /auth/register and /auth/login, which check
// (and for register, create) a password-backed account in Postgres. This
// replaces the old flow where the dashboard silently minted a dev token
// for a hardcoded "demo_account" with no password at all.
export default function AuthForm({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
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
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel auth-form">
      <div className="auth-tabs">
        <button
          type="button"
          className={mode === 'login' ? 'active' : ''}
          onClick={() => { setMode('login'); setError(null); }}
        >
          Log in
        </button>
        <button
          type="button"
          className={mode === 'register' ? 'active' : ''}
          onClick={() => { setMode('register'); setError(null); }}
        >
          Register
        </button>
      </div>
      <form onSubmit={submit}>
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder={mode === 'register' ? 'password (min 8 characters)' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={mode === 'register' ? 8 : undefined}
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? 'please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
        {error && <div className="status error">{error}</div>}
      </form>
    </div>
  );
}
