'use strict';

const { Pool } = require('pg');
const config = require('../config');

// Create connection pool
const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: config.DB_POOL_IDLE_MS,

    // Neon requires SSL
    ssl: {
        rejectUnauthorized: false
    }
});

// Set statement timeout on every connection
pool.on('connect', (client) => {
    client.query(`SET statement_timeout = ${config.DB_STATEMENT_TIMEOUT_MS}`);
});

pool.on('error', (err) => {
    console.error('Unexpected pool error:', err.message);
});

/**
 * Transaction wrapper with automatic retry on serialization failures
 */
const withTransaction = async (fn, maxRetries = 3) => {
    let attempt = 0;

    while (attempt < maxRetries) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        } catch (err) {
            await client.query('ROLLBACK');

            // Retry on serialization failure or deadlock
            const isRetryable = err.code === '40001' || err.code === '40P01';

            if (isRetryable && attempt < maxRetries - 1) {
                attempt++;
                console.warn(`Retryable DB error (${err.code}), attempt ${attempt + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, 100 * attempt)); // backoff
                continue;
            }

            throw err;
        } finally {
            client.release();
        }
    }
};

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }
    console.log('✅ Database connected:', res.rows[0].now);
});

module.exports = { pool, withTransaction };