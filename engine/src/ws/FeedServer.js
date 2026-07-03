'use strict';

const { WebSocketServer } = require('ws');

/**
 * Broadcasts depth snapshots + trade prints to all connected clients.
 * Kept deliberately simple: no per-client subscription filtering yet
 * (everyone gets every symbol). Fine for a single-symbol demo; the README
 * notes per-symbol subscription as a next step.
 */
class FeedServer {
  constructor(server, engines, redisCache = null) {
    this.wss = new WebSocketServer({ server });
    this.engines = engines; // Map<symbol, MatchingEngine>
    this.redisCache = redisCache;

    this.wss.on('connection', (ws) => {
      // Send an initial snapshot on connect
      for (const [symbol, engine] of this.engines.entries()) {
        ws.send(JSON.stringify({ type: 'depth', symbol, data: engine.depth() }));
      }
    });

    for (const [symbol, engine] of this.engines.entries()) {
      engine.on('trade', (trade) => this._broadcast({ type: 'trade', symbol, data: trade }));
      const pushDepth = () => {
        const depth = engine.depth();
        this._broadcast({ type: 'depth', symbol, data: depth });
        // Write-through: keeps the REST /orderbook cache close to
        // real-time instead of only refreshing on TTL expiry/cache miss.
        if (this.redisCache) this.redisCache.cacheDepth(symbol, depth).catch(() => {});
      };
      engine.on('trade', pushDepth);
      engine.on('order:accepted', pushDepth);
      engine.on('order:cancelled', pushDepth);
    }
  }

  _broadcast(msg) {
    const payload = JSON.stringify(msg);
    for (const client of this.wss.clients) {
      if (client.readyState === 1) client.send(payload);
    }
  }
}

module.exports = { FeedServer };
