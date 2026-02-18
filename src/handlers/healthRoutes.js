'use strict';

const { Router } = require('express');

/**
 * Health check endpoint factory
 */
module.exports = function healthRoutes(pool) {
    const router = Router();

    /**
     * GET /health
     * Returns API and database status
     */
    router.get('/', async (req, res) => {
        let dbStatus = 'ok';
        let dbLatencyMs = null;

        try {
            const start = Date.now();
            await pool.query('SELECT 1');
            dbLatencyMs = Date.now() - start;
        } catch (err) {
            dbStatus = 'unreachable';
            console.error('Health check DB error:', err.message);
        }

        const httpStatus = dbStatus === 'ok' ? 200 : 503;

        res.status(httpStatus).json({
            status: httpStatus === 200 ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            checks: {
                api: { status: 'ok' },
                database: {
                    status: dbStatus,
                    latency_ms: dbLatencyMs,
                },
            },
        });
    });

    return router;
};