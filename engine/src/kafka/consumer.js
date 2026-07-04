'use strict';

const { Kafka } = require('kafkajs');
const { buildKafkaAuthConfig } = require('./config');

function makeConsumer(brokers, groupId, engines, db = null) {
  const kafka = new Kafka({ clientId: 'marketpulse-engine', brokers, ...buildKafkaAuthConfig() });
  const consumer = kafka.consumer({ groupId });

  return {
    async start() {
      await consumer.connect();
      await consumer.subscribe({ topic: 'orders.intake', fromBeginning: false });
      await consumer.run({
        eachMessage: async ({ message }) => {
          const order = JSON.parse(message.value.toString());
          const engine = engines.get(order.symbol);
          if (!engine) return; // unknown symbol, drop (would dead-letter in prod)
          const accepted = engine.submit(order);
          // Mirrors what the synchronous HTTP path does: log the order
          // event once it's actually been submitted to the engine.
          if (db) await db.logOrderEvent(accepted).catch((e) => console.error('logOrderEvent failed', e.message));
        },
      });
    },
    async stop() {
      await consumer.disconnect();
    },
  };
}

module.exports = { makeConsumer };