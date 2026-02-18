'use strict';

require('dotenv').config();

async function setup() {
    console.log('🔄 Running database setup...\n');

    try {
        // Import and run migrations
        console.log('1️⃣ Running migrations...');
        const migrate = require('../src/db/migrate');
        await migrate();

        // Import and run seed
        console.log('\n2️⃣ Running seed...');
        const seed = require('../src/db/seed');
        await seed();

        console.log('\n✅ Database setup complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Setup failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

setup();