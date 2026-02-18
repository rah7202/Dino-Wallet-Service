'use strict';

class LedgerRepository {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Get balance by wallet ID
     * 
     * Balance is NEVER stored as a column - always computed from ledger:
     * Balance = SUM(credits) - SUM(debits)
     */
    async getBalance(walletId) {
        const { rows } = await this.pool.query(`
      SELECT
        le.asset_type_id,
        at.name    AS asset_name,
        at.symbol,
        SUM(
          CASE WHEN le.direction = 'credit' THEN le.amount
               ELSE -le.amount END
        ) AS balance
      FROM ledger_entries le
      JOIN asset_types    at ON at.id = le.asset_type_id
      WHERE le.wallet_id = $1
      GROUP BY le.asset_type_id, at.name, at.symbol
      HAVING SUM(
        CASE WHEN le.direction = 'credit' THEN le.amount
             ELSE -le.amount END
      ) != 0
      ORDER BY at.name
    `, [walletId]);
        return rows;
    }

    /**
     * Get balance for a specific asset within a transaction
     * Used to check sufficient funds before spending
     */
    async getBalanceForAsset(client, walletId, assetTypeId) {
        const { rows } = await client.query(`
      SELECT COALESCE(
        SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END),
        0
      ) AS balance
      FROM ledger_entries
      WHERE wallet_id = $1
        AND asset_type_id = $2
    `, [walletId, assetTypeId]);

        return parseFloat(rows[0].balance);
    }

    /**
     * Insert a ledger entry (must be in transaction)
     */
    async insertEntry(client, { transactionId, walletId, assetTypeId, direction, amount }) {
        const { rows } = await client.query(`
      INSERT INTO ledger_entries
        (transaction_id, wallet_id, asset_type_id, direction, amount)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, created_at
    `, [transactionId, walletId, assetTypeId, direction, amount]);

        return rows[0];
    }

    /**
     * Get transaction history for a wallet (paginated)
     */
    async getHistory(walletId, { limit = 20, offset = 0 } = {}) {
        const { rows } = await this.pool.query(`
      SELECT
        le.id,
        le.transaction_id,
        le.wallet_id,
        le.asset_type_id,
        at.name    AS asset_name,
        at.symbol,
        le.direction,
        le.amount,
        le.created_at,
        t.transaction_type,
        t.reference
      FROM ledger_entries le
      JOIN asset_types   at ON at.id = le.asset_type_id
      JOIN transactions   t ON  t.id = le.transaction_id
      WHERE le.wallet_id = $1
      ORDER BY le.created_at DESC
      LIMIT  $2
      OFFSET $3
    `, [walletId, limit, offset]);

        return rows;
    }

    /**
     * Get total entry count for pagination
     */
    async getTotalCount(walletId) {
        const { rows } = await this.pool.query(`
      SELECT COUNT(*) AS total
      FROM ledger_entries
      WHERE wallet_id = $1
    `, [walletId]);

        return parseInt(rows[0].total, 10);
    }
}

module.exports = LedgerRepository;