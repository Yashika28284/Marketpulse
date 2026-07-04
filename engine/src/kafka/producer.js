'use strict';

const { Kafka, Partitioners } = require('kafkajs');
const { buildKafkaAuthConfig } = require('./config');

/**
 * Order intake -> Kafka -> matching engine. This decouples "accepting an
 * order over HTTP" from "matching it", so a burst of inbound orders can't
 * stall the API and the matching engine can consume at its own pace,
 * single-threaded, off one partition per symbol (partition key = symbol)
 * to preserve time-priority ordering within a symbol.
 */
function makeProducer(brokers) {
  const kafka = new Kafka({ clientId: 'marketpulse-api', brokers, ...buildKafkaAuthConfig() });
  const producer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });

  return {
    async connect() {
      await producer.connect();
    },
    async sendOrder(order) {
      await producer.send({
        topic: 'orders.intake',
        messages: [{ key: order.symbol, value: JSON.stringify(order) }],
      });
    },
    async disconnect() {
      await producer.disconnect();
    },
  };
}

module.exports = { makeProducer };