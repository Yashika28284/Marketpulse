# MarketPulse — Real-Time Order Matching & Risk Engine

A price-time priority matching engine with a risk/exposure layer, live WebSocket
market data, and a React dashboard.

## Quickstart

### Option A — Docker (full stack)
```bash
cp .env.example .env
docker compose up --build
```
- Engine API: http://localhost:4000
- Dashboard: http://localhost:5173

### Option B — Local, engine only (no Kafka/Postgres/Redis)
The engine runs fine without `DATABASE_URL`/Kafka set — it just skips
persistence and audit logging, matching purely in-memory.
```bash
cd engine
npm install
npm start
```
Then in another terminal:
```bash
cd dashboard
npm install
npm run dev
```

### Run the latency benchmark
```bash
cd engine
npm run benchmark
```
Outputs throughput and p50/p90/p99/p99.9 latency in microseconds, measured
in-process via HDR histogram (see `src/benchmark/load.js` for exact methodology
and what it deliberately does NOT account for — no network hop, no GC pause
isolation, single-threaded).

### Run the tests
```bash
cd engine
npm test
```
46 tests (Node's built-in test runner, no external test framework) covering
the heap, order book, matching engine (crossing, partial fills, self-trade
prevention, market/stop orders, risk rejection), risk engine, and the HTTP
API end-to-end via `supertest` (auth, ownership-checked cancel, RBAC on
admin routes). CI (`.github/workflows/ci.yml`) runs this on Node 20 and 22
on every push/PR, plus a benchmark smoke run and a dashboard build check.

### API docs
With the engine running, open `http://localhost:4000/docs` for a Swagger UI
generated from `engine/openapi.yaml`.

## Architecture

```
HTTP order ──▶ REST API ──▶ RiskEngine.checkOrder() ──▶ MatchingEngine.submit()
                                                              │
                                            price-level map + heap (OrderBook)
                                                              │
                                          trade ──▶ RiskEngine.applyFill()
                                                ├──▶ Postgres (audit log)
                                                └──▶ WebSocket broadcast ──▶ dashboard
```

Kafka sits in front of the matching engine as an optional intake buffer
(`producer.js` / `consumer.js`) — orders are keyed by symbol so a single
partition preserves time-priority within that symbol while different symbols
can be consumed in parallel.

## Key design decisions (and what I'd defend in an interview)

**Why a price-level map + heap, not a heap-per-order.**
Orders at an existing price level are pushed onto a FIFO array — O(1). A heap
of price levels (max-heap for bids, min-heap for asks) gives O(log n) only
when a brand-new price level appears. This matches how real venues structure
books; a naive heap-of-orders pays O(log n) on every single order regardless
of whether its price already exists.

**Concurrency model.**
Each symbol has exactly one `MatchingEngine` instance, processed
single-threaded off Node's event loop (optionally fed by a single Kafka
partition for that symbol). There's no fine-grained locking because there's
nothing to lock — order intake is sequenced, not parallel, within a symbol.
Cross-symbol parallelism comes from running independent engine instances,
not from threading inside one book.

**Self-trade prevention.**
If a resting order would match the same `accountId`, the resting order is
cancelled (not filled) and the engine continues looking at the next order in
that price level. See `MatchingEngine._match`.

**Risk layer — explicit scope.**
`RiskEngine` does pre-trade exposure/position checks:
`exposure = sum(|position_qty| * last_trade_price)` per account, rejecting
orders that would breach a configurable limit. This does **not** do
cross-margin netting across correlated symbols, a periodic mark-to-market
sweep (positions are only repriced when a new order references that symbol),
or multi-leg/spread margining. Next step: a timer-driven MTM job that
re-checks limits on price moves alone, not just on new orders.

**RBAC.**
Two roles: `trader` and `admin`. JWTs carry a `role` claim (`POST
/api/auth/token` is a dev-only token mint — no real login flow, so a real
deployment would source `role` from an identity provider or DB, not let the
caller self-assign `admin` via the request body). Traders can only cancel
their own orders and read their own account; a token with no `role` claim
at all (e.g. one minted before RBAC existed) is treated as `trader`, not a
default-open failure mode. Admins can cancel any order and read/set risk
limits for any account via `/api/admin/accounts/:accountId`.

**Audit log / replay.**
Every order event and trade is appended to Postgres (`order_events`,
`trades`). This is intentionally append-only so the book state can be
reconstructed by replaying events — a real exchange concern, cheap to add
since persistence is already wired in.

## What's NOT in this build (explicitly, to avoid overclaiming)
- No sharding/recovery orchestration beyond "one engine per symbol"
- No worker_threads / multi-core matching — single-threaded by design, see above
- Rate limiting and JWT auth are minimal/demo-grade (in-memory limiter, dev-only
  token mint with no password/identity check), not hardened for production
- RBAC is two flat roles (trader/admin), not fine-grained permissions
- Dashboard has no per-symbol WS subscription filtering (broadcasts everything)
- Tests cover the engine's unit and HTTP-layer logic; no load/soak tests, no
  tests against a real Postgres/Kafka (those paths are exercised manually)

## Project layout
See top-level tree in this repo for the full file map (`engine/` = Node.js
matching engine + risk + API + WS, `dashboard/` = React frontend).
