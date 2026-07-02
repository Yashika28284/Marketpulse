'use strict';

const { Pool } = require('pg');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  type TEXT NOT NULL,
  price NUMERIC,
  qty NUMERIC NOT NULL,
  remaining NUMERIC NOT NULL,
  status TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trades (
  id BIGSERIAL PRIMARY KEY,
  trade_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  price NUMERIC NOT NULL,
  qty NUMERIC NOT NULL,
  buy_order_id TEXT NOT NULL,
  sell_order_id TEXT NOT NULL,
  buy_account_id TEXT NOT NULL,
  sell_account_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'trader',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_account ON order_events(account_id);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
`;

class Db {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString });
  }

  async init() {
    const maxRetries = 30;

    for (let i = 1; i <= maxRetries; i++) {
      try {
        await this.pool.query("SELECT 1");
        console.log("✅ Connected to PostgreSQL");

        await this.pool.query(SCHEMA);
        console.log("✅ Database schema initialized");

        return;
      } catch (err) {
        console.log(
          `PostgreSQL not ready (attempt ${i}/${maxRetries}). Retrying in 2 seconds...`
        );

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    throw new Error("Unable to connect to PostgreSQL after multiple retries.");
  }

  // Append-only event log => full audit trail and the basis for
  // deterministic replay (rebuild book state by replaying order_events).
  async logOrderEvent(order) {
    await this.pool.query(
      `INSERT INTO order_events (order_id, account_id, symbol, side, type, price, qty, remaining, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [order.id, order.accountId, order.symbol, order.side, order.type, order.price, order.qty, order.remaining, order.status]
    );
  }

  async logTrade(trade) {
    await this.pool.query(
      `INSERT INTO trades (trade_id, symbol, price, qty, buy_order_id, sell_order_id, buy_account_id, sell_account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [trade.id, trade.symbol, trade.price, trade.qty, trade.buyOrderId, trade.sellOrderId, trade.buyAccountId, trade.sellAccountId]
    );
  }

  // --- Users (real register/login, separate from the dev /auth/token flow) ---

  async createUser({ accountId, email, passwordHash, role = 'trader' }) {
    const result = await this.pool.query(
      `INSERT INTO users (account_id, email, password_hash, role)
       VALUES ($1,$2,$3,$4)
       RETURNING id, account_id, email, role, created_at`,
      [accountId, email.toLowerCase(), passwordHash, role]
    );
    return result.rows[0];
  }

  async getUserByEmail(email) {
    const result = await this.pool.query(
      `SELECT id, account_id, email, password_hash, role FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );
    return result.rows[0] || null;
  }

  // Every registered account, oldest first. Used by the admin-only
  // "list all accounts" endpoint — separate from RiskEngine's positions
  // map, which only knows about accounts that have actually traded.
  async listUsers() {
    const result = await this.pool.query(
      `SELECT account_id, email, role, created_at FROM users ORDER BY created_at ASC`
    );
    return result.rows;
  }
}

module.exports = { Db };
