'use strict';

const { pool } = require('../src/db/pool');
require('dotenv').config();

async function setup() {
    console.log('Running database setup...\n');

    try {
        // Import and run migrations
        console.log('Running migrations...');
        const migrate = require('../src/db/migrate');
        await migrate();

        // Import and run seed
        console.log('Running seed...');
        const seed = require('../src/db/seed');
        await seed();

        console.log('Database setup complete!');
        process.exit(0);
    } catch (err) {
        console.error('Setup failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

setup();