'use strict';

const { createClient } = require('redis');

class RedisCache {
  constructor(url) {
    this.client = createClient({ url });
    this.client.on('error', (err) => console.error('[redis] error', err.message));
  }

  async connect() {
    await this.client.connect();
  }

  async cacheDepth(symbol, depth, ttlSeconds = 5) {
    await this.client.set(`depth:${symbol}`, JSON.stringify(depth), { EX: ttlSeconds });
  }

  async getCachedDepth(symbol) {
    const raw = await this.client.get(`depth:${symbol}`);
    return raw ? JSON.parse(raw) : null;
  }
}

module.exports = { RedisCache };
