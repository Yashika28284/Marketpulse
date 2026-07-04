# MarketPulse — Low-Latency Trading Engine

A price-time priority matching engine with a pre-trade risk/exposure layer,
async order intake over Kafka, live WebSocket market data, and a React
dashboard — deployable locally via Docker or as a free-tier cloud stack
(Render + Neon + Upstash + Aiven).

**Live deployment:**
- Dashboard: https://marketpulse-1-k8wu.onrender.com
- API: https://marketpulse-mpmf.onrender.com/api · [Swagger docs](https://marketpulse-mpmf.onrender.com/docs) · [/health](https://marketpulse-mpmf.onrender.com/health)

> Both run on free-tier infrastructure — see [Free-tier caveats](#free-tier-caveats-read-this) before assuming something's broken when it's just cold-starting.

---

## Table of contents
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quickstart (local)](#quickstart-local)
- [Environment variables](#environment-variables)
- [Deploying to production](#deploying-to-production-render--neon--upstash--aiven)
- [Free-tier caveats](#free-tier-caveats-read-this)
- [API reference](#api-reference)
- [Testing & benchmarking](#testing--benchmarking)
- [Key design decisions](#key-design-decisions-and-what-id-defend-in-an-interview)
- [Known limitations](#whats-not-in-this-build-explicitly-to-avoid-overclaiming)
- [Project structure](#project-structure)

---

## Architecture

```
                         ┌──────────────────────┐
 HTTP order ───────────▶ │   REST API (Express) │
                         └──────────┬───────────┘
                                    ▼
                   RiskEngine.checkOrder()  (pre-trade exposure/position check)
                                    │
                                    ▼
                    Kafka  orders.intake  (async, partitioned by symbol)
                                    │
                                    ▼
                    MatchingEngine.submit()  (one instance per symbol)
                                    │
                     price-level map + heap (OrderBook, price-time priority)
                                    │
                            trade ──┴──▶ RiskEngine.applyFill()
                                          ├──▶ Postgres  (append-only audit log)
                                          ├──▶ Redis     (order book depth cache)
                                          └──▶ WebSocket ──▶ React dashboard
```

Kafka sits in front of the matching engine as the order-intake buffer —
`POST /api/orders` publishes to `orders.intake` and returns `202` immediately;
a consumer (started alongside the producer in `index.js`) is what actually
calls `engine.submit()`, off the HTTP request path. Orders are keyed by
`symbol`, so a single partition preserves time-priority within that symbol
while different symbols are consumed independently.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Engine runtime | Node.js 20, Express | Single-threaded event loop matches the matching engine's concurrency model (see below) |
| Order intake | KafkaJS → Aiven Kafka | Decouples "accept the order" from "match the order"; SASL_SSL in production, plaintext locally |
| Depth cache | `redis` client → Upstash Redis | Read-through/write-through cache for order book depth reads |
| Persistence | `pg` → Neon Postgres (serverless) | Append-only audit log (`order_events`, `trades`); enables replay-on-restart |
| Auth | `jsonwebtoken`, `bcryptjs` | JWT with a `role` claim (`trader`/`admin`); dev-only token mint, see limitations |
| Realtime feed | `ws` | Broadcasts trades/book updates to the dashboard |
| API docs | `swagger-ui-express` from `openapi.yaml` | Served at `/docs`, optionally HTTP-Basic-gated |
| Frontend | React 18 + Vite + Tailwind v4 | `dashboard/` — static build, no server-side rendering |
| Hosting | Render (Web Service + Static Site) | Free tier for both engine and dashboard |

## Quickstart (local)

### Option A — Docker (full stack)
```bash
cp .env.example .env
docker compose up --build
```
- Engine API: http://localhost:4000
- Dashboard: http://localhost:5173

`docker-compose.yml` spins up Postgres, Redis, Zookeeper, and Kafka with no
auth (SASL is off locally) — the engine detects this automatically; see
[Environment variables](#environment-variables).

### Option B — Local, engine only (no Kafka/Postgres/Redis)
The engine still requires `REDIS_URL` and `KAFKA_BROKERS` to be set (both are
treated as required infrastructure, not optional — see `index.js`), but if
you omit `DATABASE_URL` it skips persistence/audit logging and matches purely
in-memory. Point `REDIS_URL`/`KAFKA_BROKERS` at local Docker containers or a
free cloud instance of each if you don't want to run the full compose stack.

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

### Run the tests
```bash
cd engine
npm test
```
46 tests (Node's built-in test runner) covering the heap, order book,
matching engine (crossing, partial fills, self-trade prevention, market/stop
orders, risk rejection), risk engine, and the HTTP API end-to-end via
`supertest`. CI (`.github/workflows/ci.yml`) runs this on Node 20 and 22 on
every push/PR, plus a benchmark smoke run and a dashboard build check.

### Run the latency benchmark
```bash
cd engine
npm run benchmark
```
Outputs throughput and p50/p90/p99/p99.9 latency in microseconds, measured
in-process via HDR histogram. See `src/benchmark/load.js` for exact
methodology and what it deliberately does not account for (no network hop,
no GC pause isolation, single-threaded).

### API docs
With the engine running, open `http://localhost:4000/docs` for a Swagger UI
generated from `engine/openapi.yaml`.

## Environment variables

### Engine (`engine/`)

| Variable | Required? | Notes |
|---|---|---|
| `NODE_ENV` | recommended | `production` enables the checked-in-secret guard below |
| `PORT` | no (default `4000`) | |
| `DATABASE_URL` | no | Postgres connection string. Omit to run without persistence. Neon's string already includes `sslmode=require` — use it as-is |
| `REDIS_URL` | **yes** | `redis://` locally, `rediss://` (TLS) for Upstash — engine refuses to boot without it |
| `KAFKA_BROKERS` | **yes** | Comma-separated `host:port` list — engine refuses to boot without it |
| `KAFKA_SASL_USERNAME` / `KAFKA_SASL_PASSWORD` | only for managed Kafka | Leave unset for local plaintext Kafka; setting these switches the client to SASL_SSL automatically |
| `KAFKA_SASL_MECHANISM` | no (default `scram-sha-256`) | Match whatever your Kafka provider's console shows for the default user |
| `KAFKA_CA_CERT_BASE64` | only alongside SASL creds | **Preferred** over `KAFKA_CA_CERT`. Generate with `node -e "console.log(require('fs').readFileSync('ca.pem').toString('base64'))"` — note: no `'utf-8'` argument to `readFileSync`, or you'll re-encode text instead of bytes and silently produce a corrupt cert |
| `KAFKA_CA_CERT` | fallback | Raw PEM text. Many dashboard text boxes strip newlines on multi-line paste and corrupt this — prefer the base64 variant unless you've confirmed your platform preserves newlines |
| `JWT_SECRET` | **yes in production** | Engine refuses to boot in `NODE_ENV=production` without a real value (i.e. anything other than the checked-in `dev-secret-change-me`). Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and paste only the output — never commit it |
| `SYMBOLS` | no (default `AAPL,MSFT,BTC-USD`) | Comma-separated list; one `MatchingEngine` instance per symbol |
| `DEFAULT_EXPOSURE_LIMIT` | no (default `1000000`) | Per-account, in quote currency |
| `DEFAULT_POSITION_LIMIT` | no (default `10000`) | Per-account, in base units |
| `CORS_ORIGINS` | recommended | Comma-separated list of allowed dashboard origins. Defaults to localhost dev ports only — **set this to your deployed dashboard URL or the browser will block every request** |
| `DOCS_USER` / `DOCS_PASSWORD` | no | HTTP Basic Auth in front of `/docs`. Unset = open (fine for local dev, consider setting in production) |

### Dashboard (`dashboard/`)

These are **build-time** Vite variables — they're baked into the JS bundle
when `vite build` runs, not read at container/request runtime. Changing them
requires a rebuild, not just a redeploy/restart.

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000/api` | Point at the engine's `/api` path |
| `VITE_WS_URL` | `ws://localhost:4000` | Use `wss://` (not `ws://`) for any HTTPS-served deployment, or the browser blocks it as mixed content |
| `VITE_SYMBOLS` | `AAPL,MSFT,BTC-USD` | Should match the engine's `SYMBOLS` |

## Deploying to production (Render + Neon + Upstash + Aiven)

This is the exact free-tier stack the live deployment above runs on.

**Why not Render's own Postgres:** Render's free Postgres hard-deletes after
30 days (with a 14-day grace period), by design as a trial mechanism. Neon's
free tier has no forced-deletion clock — it just idles/cold-starts.

1. **Database — Neon**
   - neon.tech → new project → copy the connection string as-is (already includes `?sslmode=require`) → this is `DATABASE_URL`.
   - Free tier: 0.5 GB storage, 100 compute-hours/month, scales to zero on inactivity (cold start ~1-2s, not a deletion).

2. **Cache — Upstash Redis**
   - Create a database → copy the `rediss://` connection string (TLS) → this is `REDIS_URL`.

3. **Message broker — Aiven Kafka**
   - Create a service → **enable SASL explicitly** under Advanced Configuration (`kafka_authentication_methods.sasl`) — it's off by default, and without it the client gets an unhelpful `Closed connection` error with no further detail.
   - From Connection Information: broker host:port → `KAFKA_BROKERS`; username/password → `KAFKA_SASL_USERNAME`/`KAFKA_SASL_PASSWORD`; download `ca.pem` and base64-encode it (see the `KAFKA_CA_CERT_BASE64` note above) → `KAFKA_CA_CERT_BASE64`.

4. **Engine — Render Web Service**
   - New → Web Service → connect the repo → **Root Directory: `engine`** → Render auto-detects the Dockerfile.
   - Add all engine env vars from the table above.
   - Health Check Path: `/health`.
   - Deploy, then confirm in the logs: `✅ Connected to PostgreSQL`, `[redis] connected`, `[kafka] connected`, `MarketPulse engine listening on :4000`.

5. **Dashboard — Render Static Site** (not a Web Service — no Docker needed)
   - New → Static Site → same repo → **Root Directory: `dashboard`**.
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
   - Set `VITE_API_URL`/`VITE_WS_URL`/`VITE_SYMBOLS` **before** the first build (build-time, per above).

6. **Close the CORS loop**
   - Once the Static Site has a URL, go back to the engine's env vars and set `CORS_ORIGINS` to that exact URL (no trailing slash) → save → engine redeploys.
   - This order matters: the dashboard needs the engine URL to build correctly, and the engine needs the dashboard's URL to allow it — there's an inherent one-redeploy chicken-and-egg here.

## Free-tier caveats (read this)

- **Render Web Service** spins down after ~15 min idle; the first request after that takes 30-60s to wake up.
- **Neon Postgres** scales to zero after inactivity; first query after idle adds ~1-2s, not an outage.
- **Both idle at once** → the very first request after a long gap can feel slow (sum of both cold starts). Nothing is broken — it's just waking up.
- **Aiven Kafka SASL** is off by default even after you've set up the service — it must be explicitly enabled in Advanced Configuration or every client connection is silently dropped.

## API reference

Full request/response schemas are in `engine/openapi.yaml` (served live at
`/docs`). Summary:

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/auth/register` | none | Creates an account |
| `POST` | `/api/auth/login` | none | Returns a JWT |
| `POST` | `/api/auth/token` | none | Dev-only token mint — see limitations below |
| `POST` | `/api/orders` | Bearer | Publishes to Kafka, returns `202` |
| `DELETE` | `/api/orders/:id` | Bearer | Owner-only, or admin |
| `GET` | `/api/orderbook/:symbol` | Bearer | Current book depth (Redis-cached) |
| `GET` | `/api/account` | Bearer | Own account/positions/limits |
| `GET` | `/api/trades` | Bearer | Own trade history |
| `GET` | `/api/admin/accounts` | Bearer, `admin` | List all accounts |
| `GET` | `/api/admin/accounts/:accountId` | Bearer, `admin` | Any account's detail |
| `PUT` | `/api/admin/accounts/:accountId/limits` | Bearer, `admin` | Set exposure/position limits |
| `GET` | `/health` | none | Liveness + configured symbols |

## Testing & benchmarking

Covered above in [Quickstart](#quickstart-local) — `npm test` and
`npm run benchmark` from `engine/`.

## Key design decisions (and what I'd defend in an interview)

**Why a price-level map + heap, not a heap-per-order.**
Orders at an existing price level are pushed onto a FIFO array — O(1). A heap
of price levels (max-heap for bids, min-heap for asks) gives O(log n) only
when a brand-new price level appears. This matches how real venues structure
books; a naive heap-of-orders pays O(log n) on every single order regardless
of whether its price already exists.

**Concurrency model.**
Each symbol has exactly one `MatchingEngine` instance, processed
single-threaded off Node's event loop (fed by a single Kafka partition for
that symbol). There's no fine-grained locking because there's nothing to
lock — order intake is sequenced, not parallel, within a symbol.
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
their own orders and read their own account; a token with no `role` claim at
all (e.g. one minted before RBAC existed) is treated as `trader`, not a
default-open failure mode. Admins can cancel any order and read/set risk
limits for any account.

**Audit log / replay.**
Every order event and trade is appended to Postgres (`order_events`,
`trades`), intentionally append-only so book state can be reconstructed by
replaying events. On engine startup, past trades are replayed through the
exact same `riskEngine.applyFill()` the matching engine calls on a live
trade, so restored state and live state are computed identically. Known
limitation: open resting orders that never filled are not reconstructed —
the order book itself starts empty after a restart even though positions are
correct.

**Kafka auth is opt-in by env var, not a separate "prod mode" flag.**
`buildKafkaAuthConfig()` returns `{}` (plaintext) unless
`KAFKA_SASL_USERNAME`/`PASSWORD` are set, in which case it switches to
SASL_SSL automatically. This means the same code path runs unmodified against
local plaintext Docker Kafka and managed SASL_SSL Kafka — no flag to
remember to flip between environments.

## What's NOT in this build (explicitly, to avoid overclaiming)
- No sharding/recovery orchestration beyond "one engine per symbol"
- No `worker_threads` / multi-core matching — single-threaded by design, see above
- Rate limiting and JWT auth are minimal/demo-grade (in-memory limiter, dev-only
  token mint with no password/identity check), not hardened for production
- RBAC is two flat roles (trader/admin), not fine-grained permissions
- Dashboard has no per-symbol WS subscription filtering (broadcasts everything)
- Tests cover the engine's unit and HTTP-layer logic; no load/soak tests, no
  tests against a real Postgres/Kafka (those paths are exercised manually)

## Project structure

```
marketpulse/
├── docker-compose.yml        # Full local stack: postgres, redis, kafka, engine, dashboard
├── .env.example
├── engine/
│   ├── Dockerfile
│   ├── openapi.yaml           # Source for the /docs Swagger UI
│   ├── src/
│   │   ├── index.js           # Process wiring: env checks, connections, graceful shutdown
│   │   ├── app.js             # Express app: CORS, /health, /docs, /api mount
│   │   ├── api/                # router.js, middleware.js (auth, RBAC, rate limiting)
│   │   ├── orderbook/           # Heap.js, OrderBook.js, MatchingEngine.js
│   │   ├── risk/                # RiskEngine.js
│   │   ├── kafka/               # producer.js, consumer.js, config.js (SASL/SSL builder)
│   │   ├── db/                  # postgres.js, redis.js
│   │   ├── ws/                  # FeedServer.js
│   │   └── benchmark/           # load.js
│   ├── scripts/
│   │   └── promote-admin.js
│   └── test/
└── dashboard/
    ├── Dockerfile              # Dev-mode only (vite dev --host); production uses a Static Site build, not Docker
    ├── vite.config.ts
    └── src/
        ├── App.jsx
        ├── components/          # OrderForm, RiskPanel, TradeFeed, AuthForm, ui/
        └── hooks/               # useMarketFeed.js
```