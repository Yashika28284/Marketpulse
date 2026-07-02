'use strict';

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

/**
 * Builds the Express app (routes + middleware) without binding to a port.
 * Split out from index.js so tests can exercise the HTTP layer via
 * supertest without opening a real socket, and so index.js stays focused
 * on process wiring (DB connections, server.listen, signal handling).
 */
function buildApp({ engines, riskEngine, db }) {
  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ ok: true, symbols: [...engines.keys()] }));

  const openapiPath = path.join(__dirname, '..', 'openapi.yaml');
  const openapiDoc = YAML.load(openapiPath);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));

  app.use('/api', buildRouter({ engines, riskEngine, db }));

  return app;
}

module.exports = { buildApp };
