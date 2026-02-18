'use strict';

require('dotenv').config();

const config = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),

    DATABASE_URL: process.env.DATABASE_URL,

    DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '10', 10),
    DB_POOL_IDLE_MS: parseInt(process.env.DB_IDLE_MS || '30000', 10),

    DB_STATEMENT_TIMEOUT_MS: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '10000', 10),
};

if (!config.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is required');
    console.error('Please check your .env file exists and contains DATABASE_URL');
    process.exit(1);
}

module.exports = config;
