import React, { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export default function OrderForm({ symbols, token }) {
  const [form, setForm] = useState({
    symbol: symbols[0],
    side: 'buy',
    type: 'limit',
    price: '',
    stopPrice: '',
    qty: 1,
  });
  const [status, setStatus] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setStatus('submitting...');
    try {
      const res = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          price: form.price ? Number(form.price) : null,
          stopPrice: form.stopPrice ? Number(form.stopPrice) : null,
          qty: Number(form.qty),
        }),
      });
      const data = await res.json();
      setStatus(res.ok ? `Order ${data.status}` : `Error: ${data.error}`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  return (
    <form className="panel order-form" onSubmit={submit}>
      <h3>Submit Order</h3>
      <select value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}>
        {symbols.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })}>
        <option value="buy">Buy</option>
        <option value="sell">Sell</option>
      </select>
      <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
        <option value="limit">Limit</option>
        <option value="market">Market</option>
        <option value="stop">Stop</option>
      </select>
      {form.type !== 'market' && (
        <input
          type="number"
          step="0.01"
          placeholder={form.type === 'stop' ? 'stop price' : 'price'}
          value={form.type === 'stop' ? form.stopPrice : form.price}
          onChange={(e) =>
            setForm(
              form.type === 'stop'
                ? { ...form, stopPrice: e.target.value }
                : { ...form, price: e.target.value }
            )
          }
        />
      )}
      <input
        type="number"
        min="1"
        placeholder="qty"
        value={form.qty}
        onChange={(e) => setForm({ ...form, qty: e.target.value })}
      />
      <button type="submit">Submit</button>
      {status && <div className="status">{status}</div>}
    </form>
  );
}
