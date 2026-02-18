'use strict';

const crypto = require('crypto');

class IdempotencyRepository {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Hash request body to detect duplicate requests with different payload
     */
    static hashRequest(body) {
        const normalized = JSON.stringify(body, Object.keys(body).sort());
        return crypto.createHash('sha256').update(normalized).digest('hex');
    }

    /**
     * Get unexpired idempotency record
     */
    async get(idemKey) {
        const { rows } = await this.pool.query(`
      SELECT
        idem_key,
        endpoint,
        request_hash,
        response_status,
        response_body,
        transaction_id,
        created_at
      FROM idempotency_keys
      WHERE idem_key  = $1
        AND expires_at > NOW()
    `, [idemKey]);

        return rows[0] || null;
    }

    /**
     * Store idempotency record (must be in transaction)
     * Uses ON CONFLICT to handle race condition where two identical
     * requests both pass the initial GET check
     */
    async store(client, { idemKey, endpoint, requestHash, responseStatus, responseBody, transactionId }) {
        await client.query(`
      INSERT INTO idempotency_keys
        (idem_key, endpoint, request_hash, response_status, response_body, transaction_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (idem_key) DO NOTHING
    `, [
            idemKey,
            endpoint,
            requestHash,
            responseStatus,
            JSON.stringify(responseBody),
            transactionId
        ]);
    }
}

module.exports = IdempotencyRepository;