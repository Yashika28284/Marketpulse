'use strict';

require('dotenv').config();
const http = require('http');

const { MatchingEngine } = require('./orderbook/MatchingEngine');
const { RiskEngine } = require('./risk/RiskEngine');
const { FeedServer } = require('./ws/FeedServer');
const { buildApp } = require('./app');
const { Db } = require('./db/postgres');

const SYMBOLS = (process.env.SYMBOLS || 'AAPL,MSFT,BTC-USD').split(',');
const PORT = process.env.PORT || 4000;

async function main() {
  // Refuse to boot in production with the checked-in dev secret — anyone
  // who has ever seen this repo (or a screenshot of it) knows that value
  // and can forge admin tokens offline, bypassing every RBAC check.
  const jwtSecret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && (!jwtSecret || jwtSecret === 'dev-secret-change-me')) {
    console.error('Fatal: refusing to start in production without a real JWT_SECRET env var.');
    console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
  }

  const riskEngine = new RiskEngine({
    defaultExposureLimit: Number(process.env.DEFAULT_EXPOSURE_LIMIT || 1_000_000),
    defaultPositionLimit: Number(process.env.DEFAULT_POSITION_LIMIT || 10_000),
  });

  const engines = new Map();
  for (const symbol of SYMBOLS) {
    const engine = new MatchingEngine(symbol, { riskEngine });
    engines.set(symbol, engine);
  }

  let db = null;
  if (process.env.DATABASE_URL) {
    db = new Db(process.env.DATABASE_URL);
    await db.init();

    // Replay-on-startup: RiskEngine.positions is a plain in-memory Map,
    // so without this, every restart — a redeploy, a crash, Render's
    // free-tier idle spin-down, a local `docker compose down` — wipes
    // positions/exposure back to zero even though the trades already
    // happened and are sitting right there in the trades table.
    //
    // Reuses the exact same riskEngine.applyFill() the matching engine
    // calls on a live trade, so replayed state and live state are
    // computed identically — no separate reconstruction logic to drift.
    // Called directly (not through engine.submit()) since these trades
    // already matched; re-submitting them would re-run matching against
    // an empty book and produce nothing.
    //
    // Known limitation, not fixed by this: open resting orders that
    // never filled are NOT reconstructed — the order book itself starts
    // empty after a restart even though positions are correct. Trades
    // are logged in full (db.logTrade on every fill), but order_events
    // only captures an order at submission time, not later cancels or
    // partial fills, so the book can't be rebuilt from it yet.
    const pastTrades = await db.getAllTrades();
    for (const trade of pastTrades) {
      riskEngine.applyFill(trade);
    }
    if (pastTrades.length > 0) {
      console.log(`Replayed ${pastTrades.length} trades — positions/exposure restored from history.`);
    }

    for (const engine of engines.values()) {
      engine.on('trade', (trade) => db.logTrade(trade).catch((e) => console.error('logTrade failed', e.message)));
    }
  }

  const app = buildApp({ engines, riskEngine, db });

  const server = http.createServer(app);
  new FeedServer(server, engines); // attaches /  (default path) ws upgrade handler

  server.listen(PORT, () => {
    console.log(`MarketPulse engine listening on :${PORT}`);
    console.log(`Symbols: ${SYMBOLS.join(', ')}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
