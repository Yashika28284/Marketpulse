'use strict';

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');

const { buildRouter } = require('./api/router');

// The dashboard (localhost:5173 in dev) calls this API from the browser.
// Without CORS enabled, the browser silently blocks those fetches — no
// error in the terminal, requests just never reach here. That's why
// OrderForm/RiskPanel appeared to "do nothing": the token fetch itself
// was being blocked.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:4173')
  .split(',')
  .map((o) => o.trim());

// Constant-time string comparison via hash digests (not raw length
// comparison — comparing raw strings/buffers of different lengths leaks
// length info and, done naively, can leak timing per differing byte).
// Uses Node's built-in crypto instead of a package like express-basic-auth
// to avoid adding a new npm dependency.
function timingSafeStringEqual(a, b) {
  const bufA = crypto.createHash('sha256').update(String(a)).digest();
  const bufB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}

// /docs (Swagger UI) is unauthenticated by default — fine for local dev,
// but on a public deploy it hands anyone your entire API surface: every
// route, every request/response shape, and (via "Try it out") a live
// console to call them from. This is opt-in gating: set DOCS_USER and
// DOCS_PASSWORD to require HTTP Basic Auth before /docs loads; leave
// them unset and it stays open, same as before (so this can't silently
// lock you out of your own docs if you forget to set them).
function docsAuth(req, res, next) {
  const user = process.env.DOCS_USER;
  const pass = process.env.DOCS_PASSWORD;
  if (!user || !pass) return next();

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const sepIdx = decoded.indexOf(':');
    const suppliedUser = sepIdx === -1 ? decoded : decoded.slice(0, sepIdx);
    const suppliedPass = sepIdx === -1 ? '' : decoded.slice(sepIdx + 1);
    if (timingSafeStringEqual(suppliedUser, user) && timingSafeStringEqual(suppliedPass, pass)) {
      return next();
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="MarketPulse docs"');
  return res.status(401).send('Authentication required');
}

/**
 * Builds the Express app (routes + middleware) without binding to a port.
 * Split out from index.js so tests can exercise the HTTP layer via
 * supertest without opening a real socket, and so index.js stays focused
 * on process wiring (DB connections, server.listen, signal handling).
 */
function buildApp({ engines, riskEngine, db, kafkaProducer, redisCache }) {
  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ ok: true, symbols: [...engines.keys()] }));

  const openapiPath = path.join(__dirname, '..', 'openapi.yaml');
  const openapiDoc = YAML.load(openapiPath);
  app.use('/docs', docsAuth, swaggerUi.serve, swaggerUi.setup(openapiDoc));

  app.use('/api', buildRouter({ engines, riskEngine, db, kafkaProducer, redisCache }));

  return app;
}

module.exports = { buildApp };
