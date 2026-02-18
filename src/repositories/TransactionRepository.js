'use strict';

class TransactionRepository {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Insert transaction record (must be in transaction)
     */
    async insert(client, { id, transactionType, reference, initiatedBy = 'system', metadata = null }) {
        const { rows } = await client.query(`
      INSERT INTO transactions
        (id, transaction_type, reference, initiated_by, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, transaction_type, reference, initiated_by, created_at
    `, [
            id,
            transactionType,
            reference,
            initiatedBy,
            metadata ? JSON.stringify(metadata) : null
        ]);

        return rows[0];
    }

    /**
     * Get transaction by ID
     */
    async getById(id) {
        const { rows } = await this.pool.query(`
      SELECT id, transaction_type, reference, initiated_by, metadata, created_at
      FROM transactions
      WHERE id = $1
    `, [id]);

        return rows[0] || null;
    }
}

module.exports = TransactionRepository;