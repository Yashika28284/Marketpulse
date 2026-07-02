'use strict';

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');

const { buildRouter } = require('./api/router');

/**
 * Builds the Express app (routes + middleware) without binding to a port.
 * Split out from index.js so tests can exercise the HTTP layer via
 * supertest without opening a real socket, and so index.js stays focused
 * on process wiring (DB connections, server.listen, signal handling).
 */
function buildApp({ engines, riskEngine, db }) {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ ok: true, symbols: [...engines.keys()] }));

  const openapiPath = path.join(__dirname, '..', 'openapi.yaml');
  const openapiDoc = YAML.load(openapiPath);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));

  app.use('/api', buildRouter({ engines, riskEngine, db }));

  return app;
}

module.exports = { buildApp };
