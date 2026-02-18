'use strict';

const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: config.DB_POOL_IDLE_MS,


    ssl: {
        rejectUnauthorized: false
    }
});


pool.on('connect', (client) => {
    client.query(`SET statement_timeout = ${config.DB_STATEMENT_TIMEOUT_MS}`);
});

pool.on('error', (err) => {
    console.error('Unexpected pool error:', err.message);
});


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


            const isRetryable = err.code === '40001' || err.code === '40P01';

            if (isRetryable && attempt < maxRetries - 1) {
                attempt++;
                console.warn(`Retryable DB error (${err.code}), attempt ${attempt + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, 100 * attempt));
                continue;
            }

            throw err;
        } finally {
            client.release();
        }
    }
};


pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        process.exit(1);
    }
    console.log('Database connected:', res.rows[0].now);
});

module.exports = { pool, withTransaction };