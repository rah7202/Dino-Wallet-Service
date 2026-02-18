'use strict';

const express = require('express');
const { pool } = require('./db/pool');
const walletRoutes = require('./handlers/walletRoutes');
const healthRoutes = require('./handlers/healthRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const config = require('./config');

const app = express();

// ══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════

app.use(express.json());
app.use(requestLogger);

// ══════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════

app.use('/health', healthRoutes(pool));
app.use('/api/v1', walletRoutes(pool));

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: `Route ${req.method} ${req.path} not found`,
    });
});

// Global error handler (MUST be last)
app.use(errorHandler);

// ══════════════════════════════════════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════════════════════════════════════

const server = app.listen(config.PORT, () => {
    console.log('');
    console.log('🦕 Dino Wallet Service');
    console.log('─'.repeat(50));
    console.log(`Environment : ${config.NODE_ENV}`);
    console.log(`Port        : ${config.PORT}`);
    console.log(`Health check: http://localhost:${config.PORT}/health`);
    console.log('─'.repeat(50));
    console.log('');
});

// ══════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ══════════════════════════════════════════════════════════════════════════

const shutdown = async (signal) => {
    console.log(`\n${signal} received — shutting down gracefully...`);

    server.close(async () => {
        console.log('HTTP server closed');

        try {
            await pool.end();
            console.log('Database pool closed');
            console.log('Goodbye 👋\n');
            process.exit(0);
        } catch (err) {
            console.error('Error during shutdown:', err);
            process.exit(1);
        }
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;