'use strict';

const { Kafka } = require('kafkajs');

function makeConsumer(brokers, groupId, engines) {
  const kafka = new Kafka({ clientId: 'marketpulse-engine', brokers });
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
          engine.submit(order);
        },
      });
    },
    async stop() {
      await consumer.disconnect();
    },
  };
}

module.exports = { makeConsumer };
