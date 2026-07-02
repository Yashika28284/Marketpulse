'use strict';

const hdr = require('hdr-histogram-js');
const { MatchingEngine } = require('../orderbook/MatchingEngine');
const { RiskEngine } = require('../risk/RiskEngine');

/**
 * Standalone, in-process benchmark (no HTTP/network hop) so the number
 * reflects matching engine performance specifically, not Express/JSON
 * overhead. Document that distinction explicitly in the README — a
 * latency number without stating what it does/doesn't include is the
 * "adjective, not evidence" trap.
 *
 * Methodology:
 *  - single-threaded, in-process (Node main thread, no worker_threads)
 *  - random walk around a mid price so orders cross realistically
 *  - per-order latency timed with process.hrtime.bigint() (ns precision)
 *  - percentiles computed via HDR histogram, not naive array sort
 *  - run once "cold" then discard, then run the timed pass (JIT warmup)
 */
function runBenchmark({ symbol = 'BENCH', orders = 100_000, accounts = 50, midPrice = 100 } = {}) {
  const riskEngine = new RiskEngine({ defaultExposureLimit: 1e9, defaultPositionLimit: 1e9 });
  const engine = new MatchingEngine(symbol, { riskEngine });
  const histogram = hdr.build({ lowestDiscernibleValue: 1, highestTrackableValue: 1e6, numberOfSignificantValueDigits: 3 });

  const accountIds = Array.from({ length: accounts }, (_, i) => `acct_${i}`);

  function randomOrder() {
    const side = Math.random() < 0.5 ? 'buy' : 'sell';
    const drift = (Math.random() - 0.5) * 2; // +-1.00 around mid
    const price = Math.round((midPrice + drift) * 100) / 100;
    return {
      accountId: accountIds[Math.floor(Math.random() * accountIds.length)],
      symbol,
      side,
      type: 'limit',
      price,
      qty: 1 + Math.floor(Math.random() * 10),
    };
  }

  // Warmup pass (let JIT compile hot paths) — not measured.
  for (let i = 0; i < 5000; i++) engine.submit(randomOrder());

  const start = process.hrtime.bigint();
  for (let i = 0; i < orders; i++) {
    const o = randomOrder();
    const t0 = process.hrtime.bigint();
    engine.submit(o);
    const t1 = process.hrtime.bigint();
    histogram.recordValue(Number(t1 - t0) / 1000); // ns -> microseconds
  }
  const end = process.hrtime.bigint();

  const totalMs = Number(end - start) / 1e6;
  const result = {
    orders,
    totalMs: Math.round(totalMs * 100) / 100,
    throughputPerSec: Math.round((orders / totalMs) * 1000),
    latencyMicros: {
      p50: histogram.getValueAtPercentile(50),
      p90: histogram.getValueAtPercentile(90),
      p99: histogram.getValueAtPercentile(99),
      p999: histogram.getValueAtPercentile(99.9),
      max: histogram.getValueAtPercentile(100),
    },
    note: 'in-process, single-threaded, no network hop, no GC pause isolation performed',
  };
  return result;
}

if (require.main === module) {
  const result = runBenchmark();
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { runBenchmark };
