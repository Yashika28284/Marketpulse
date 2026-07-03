'use strict';

require('dotenv').config();
const http = require('http');

const { MatchingEngine } = require('./orderbook/MatchingEngine');
const { RiskEngine } = require('./risk/RiskEngine');
const { FeedServer } = require('./ws/FeedServer');
const { buildApp } = require('./app');
const { Db } = require('./db/postgres');
const { RedisCache } = require('./db/redis');
const { makeProducer } = require('./kafka/producer');
const { makeConsumer } = require('./kafka/consumer');

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

  // Redis: optional read-through/write-through cache for order book
  // depth. Absent REDIS_URL, redisCache stays null and router.js /
  // FeedServer.js fall back to computing depth directly — no behavior
  // change, same as before this was wired in.
  let redisCache = null;
  if (process.env.REDIS_URL) {
    redisCache = new RedisCache(process.env.REDIS_URL);
    await redisCache.connect();
    console.log('[redis] connected — order book depth caching enabled');
  }

  // Kafka: optional async order intake. Absent KAFKA_BROKERS,
  // kafkaProducer stays null and POST /orders keeps calling
  // engine.submit() directly (synchronous, same response shape the
  // test suite and existing clients expect). With it set, POST /orders
  // publishes to orders.intake and returns 202; the consumer started
  // below is what actually calls engine.submit(), off the request path.
  let kafkaProducer = null;
  let kafkaConsumer = null;
  if (process.env.KAFKA_BROKERS) {
    const brokers = process.env.KAFKA_BROKERS.split(',').map((b) => b.trim());
    kafkaProducer = makeProducer(brokers);
    await kafkaProducer.connect();

    kafkaConsumer = makeConsumer(brokers, process.env.KAFKA_GROUP_ID || 'marketpulse-engine', engines, db);
    await kafkaConsumer.start();
    console.log(`[kafka] connected (${brokers.join(', ')}) — async order intake enabled`);
  }

  const app = buildApp({ engines, riskEngine, db, kafkaProducer, redisCache });

  const server = http.createServer(app);
  new FeedServer(server, engines, redisCache); // attaches /  (default path) ws upgrade handler

  server.listen(PORT, () => {
    console.log(`MarketPulse engine listening on :${PORT}`);
    console.log(`Symbols: ${SYMBOLS.join(', ')}`);
  });

  // Graceful shutdown: without this, a redeploy or `docker compose down`
  // kills the process while Kafka/Redis connections are still open,
  // which can leave the consumer group in a bad rebalance state or drop
  // in-flight Redis writes. SIGTERM is what Docker/Render send first.
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received, shutting down gracefully...`);

    server.close();

    if (kafkaConsumer) await kafkaConsumer.stop().catch((e) => console.error('[kafka] consumer stop failed', e.message));
    if (kafkaProducer) await kafkaProducer.disconnect().catch((e) => console.error('[kafka] producer disconnect failed', e.message));
    if (redisCache) await redisCache.client.quit().catch((e) => console.error('[redis] quit failed', e.message));
    if (db) await db.close?.().catch((e) => console.error('[db] close failed', e.message));

    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
