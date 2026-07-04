'use strict';

/**
 * Builds the `ssl`/`sasl` portion of a kafkajs client config from env vars.
 *
 * Local docker-compose Kafka has no auth at all, so if none of the SASL
 * env vars are set, this returns `{}` and the client connects plaintext
 * exactly like before. As soon as KAFKA_SASL_USERNAME/PASSWORD are set
 * (Aiven, Confluent Cloud, etc.), it switches to SASL_SSL automatically —
 * no separate "prod mode" flag to remember to flip.
 *
 * CA cert can come in two forms:
 *   - KAFKA_CA_CERT_BASE64: one unbroken line, safe to paste into any
 *     dashboard text box (preferred — see comment below).
 *   - KAFKA_CA_CERT: the raw PEM text. Many web dashboards collapse
 *     multi-line paste into a single line and strip the newlines that
 *     PEM format requires, which silently corrupts the cert. Prefer the
 *     base64 variant unless you've confirmed your platform preserves
 *     newlines in multi-line env var values.
 */
function buildKafkaAuthConfig() {
    const username = process.env.KAFKA_SASL_USERNAME;
    const password = process.env.KAFKA_SASL_PASSWORD;

    // No SASL creds configured -> local/plaintext Kafka. Nothing to add.
    if (!username || !password) {
        return {};
    }

    const mechanism = (process.env.KAFKA_SASL_MECHANISM || 'scram-sha-256').toLowerCase();

    let ca;
    if (process.env.KAFKA_CA_CERT_BASE64) {
        ca = [Buffer.from(process.env.KAFKA_CA_CERT_BASE64.trim(), 'base64').toString('utf-8')];
    } else if (process.env.KAFKA_CA_CERT) {
        ca = [process.env.KAFKA_CA_CERT];
    }

    if (!ca) {
        throw new Error(
            'KAFKA_SASL_USERNAME/PASSWORD are set but no CA cert was found. ' +
            'Set KAFKA_CA_CERT_BASE64 (preferred) or KAFKA_CA_CERT.'
        );
    }

    // TEMPORARY DIAGNOSTIC — remove once the "self-signed certificate in
    // certificate chain" issue is resolved. Prints the shape of the decoded
    // cert (never the cert body itself) so we can tell from Render's logs
    // whether the base64 env var actually decodes to a complete, well-formed
    // PEM. A healthy cert: starts with "-----BEGIN CERTIFICATE-----",
    // ends with "-----END CERTIFICATE-----", length usually 1000-2000 chars,
    // and beginCount === endCount === 1 (a chain would have more, but Aiven's
    // is normally a single cert).
    const certText = ca[0];
    const beginCount = (certText.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
    const endCount = (certText.match(/-----END CERTIFICATE-----/g) || []).length;
    console.log('[kafka][debug] decoded CA cert diagnostic:', {
        length: certText.length,
        startsCorrectly: certText.startsWith('-----BEGIN CERTIFICATE-----'),
        endsCorrectly: certText.trim().endsWith('-----END CERTIFICATE-----'),
        beginCount,
        endCount,
        first40: certText.slice(0, 40),
        last40: certText.slice(-40),
    });

    return {
        ssl: { ca },
        sasl: { mechanism, username, password },
    };
}

module.exports = { buildKafkaAuthConfig };