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
