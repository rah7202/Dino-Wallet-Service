'use strict';

class AssetRepository {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * List all active asset types
     */
    async listActive() {
        const { rows } = await this.pool.query(`
      SELECT id, name, symbol, description, is_active, created_at
      FROM asset_types
      WHERE is_active = TRUE
      ORDER BY name
    `);
        return rows;
    }

    /**
     * Get asset type by ID
     */
    async getById(id) {
        const { rows } = await this.pool.query(`
      SELECT id, name, symbol, description, is_active
      FROM asset_types
      WHERE id = $1
    `, [id]);
        return rows[0] || null;
    }
}

module.exports = AssetRepository;