'use strict';

const { NotFoundError } = require('../errors/ApiError');

class WalletRepository {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Get wallet by ID
     */
    async getById(id) {
        const { rows } = await this.pool.query(`
      SELECT id, owner_ref, owner_type, label, is_active, created_at, updated_at
      FROM wallets
      WHERE id = $1
    `, [id]);
        return rows[0] || null;
    }

    /**
     * Get system wallet by owner_ref (e.g., 'system:treasury')
     */
    async getSystemWalletByRef(ref) {
        const { rows } = await this.pool.query(`
      SELECT id, owner_ref, owner_type, label, is_active
      FROM wallets
      WHERE owner_ref = $1
        AND owner_type = 'system'
        AND is_active = TRUE
    `, [ref]);
        return rows[0] || null;
    }

    /**
     * List all wallets
     */
    async listAll() {
        const { rows } = await this.pool.query(`
      SELECT id, owner_ref, owner_type, label, is_active, created_at
      FROM wallets
      ORDER BY owner_type DESC, label ASC
    `);
        return rows;
    }

    /**
     * 🔒 DEADLOCK PREVENTION: Lock wallets in SORTED UUID order
     * 
     * This is the core concurrency strategy:
     * - Always acquire row locks in ascending UUID order
     * - Two concurrent transactions touching wallets A and B will ALWAYS
     *   lock A first, then B (never B then A)
     * - This eliminates circular wait → no deadlocks
     * 
     * Must be called within a transaction (client).
     */
    async lockWallets(client, ...walletIds) {
        // Remove duplicates and sort ascending → CANONICAL ORDER
        const sortedIds = [...new Set(walletIds)].sort();

        const wallets = [];
        for (const id of sortedIds) {
            const { rows } = await client.query(`
        SELECT id, owner_ref, owner_type, label, is_active
        FROM wallets
        WHERE id = $1
        FOR UPDATE
      `, [id]);

            if (!rows[0]) {
                throw new NotFoundError(`Wallet not found: ${id}`);
            }
            wallets.push(rows[0]);
        }

        // Return as map: walletId → wallet object
        return Object.fromEntries(wallets.map(w => [w.id, w]));
    }
}

module.exports = WalletRepository;