'use strict';

const { pool } = require('./pool');


const SEEDS = {
    assets: {
        goldCoins: '11111111-0000-0000-0000-000000000001',
        diamonds: '11111111-0000-0000-0000-000000000002',
        loyaltyPoints: '11111111-0000-0000-0000-000000000003',
    },
    wallets: {
        treasury: '22222222-0000-0000-0000-000000000001',
        bonusPool: '22222222-0000-0000-0000-000000000002',
        revenue: '22222222-0000-0000-0000-000000000003',
        alice: '33333333-0000-0000-0000-000000000001',
        bob: '33333333-0000-0000-0000-000000000002',
    },
    transactions: {
        aliceGold: 'aaaaaaaa-0000-0000-0000-000000000001',
        aliceDia: 'aaaaaaaa-0000-0000-0000-000000000002',
        bobGold: 'aaaaaaaa-0000-0000-0000-000000000003',
        bobLpt: 'aaaaaaaa-0000-0000-0000-000000000004',
    },
};

async function seed() {
    const client = await pool.connect();
    console.log('Seeding database...');

    try {
        await client.query('BEGIN');

        console.log('  → Inserting asset types...');
        await client.query(`
      INSERT INTO asset_types (id, name, symbol, description) VALUES
        ($1, 'Gold Coins',     'GLD', 'Primary in-game currency'),
        ($2, 'Diamonds',       'DIA', 'Premium currency for rare items'),
        ($3, 'Loyalty Points', 'LPT', 'Earned through platform activity')
      ON CONFLICT (id) DO NOTHING
    `, [SEEDS.assets.goldCoins, SEEDS.assets.diamonds, SEEDS.assets.loyaltyPoints]);

        console.log('  → Creating system wallets...');
        await client.query(`
      INSERT INTO wallets (id, owner_ref, owner_type, label) VALUES
        ($1, 'system:treasury',   'system', 'Treasury'),
        ($2, 'system:bonus_pool', 'system', 'Bonus Pool'),
        ($3, 'system:revenue',    'system', 'Revenue')
      ON CONFLICT (id) DO NOTHING
    `, [SEEDS.wallets.treasury, SEEDS.wallets.bonusPool, SEEDS.wallets.revenue]);

        console.log('  → Creating user wallets...');
        await client.query(`
      INSERT INTO wallets (id, owner_ref, owner_type, label) VALUES
        ($1, 'user:alice', 'user', 'alice@dino.gg'),
        ($2, 'user:bob',   'user', 'bob@dino.gg')
      ON CONFLICT (id) DO NOTHING
    `, [SEEDS.wallets.alice, SEEDS.wallets.bob]);



        console.log('  → Seeding initial balances...');


        await client.query(`
      INSERT INTO transactions (id, transaction_type, reference, initiated_by)
      VALUES ($1, 'topup', 'SEED-ALICE-GOLD', 'system')
      ON CONFLICT (id) DO NOTHING
    `, [SEEDS.transactions.aliceGold]);

        await client.query(`
      INSERT INTO ledger_entries (transaction_id, wallet_id, asset_type_id, direction, amount)
      VALUES
        ($1, $2, $3, 'debit',  1000),
        ($1, $4, $3, 'credit', 1000)
      ON CONFLICT DO NOTHING
    `, [SEEDS.transactions.aliceGold, SEEDS.wallets.treasury, SEEDS.assets.goldCoins, SEEDS.wallets.alice]);

        await client.query(`
      INSERT INTO transactions (id, transaction_type, reference, initiated_by)
      VALUES ($1, 'topup', 'SEED-ALICE-DIA', 'system')
      ON CONFLICT (id) DO NOTHING
    `, [SEEDS.transactions.aliceDia]);

        await client.query(`
      INSERT INTO ledger_entries (transaction_id, wallet_id, asset_type_id, direction, amount)
      VALUES
        ($1, $2, $3, 'debit',  50),
        ($1, $4, $3, 'credit', 50)
      ON CONFLICT DO NOTHING
    `, [SEEDS.transactions.aliceDia, SEEDS.wallets.treasury, SEEDS.assets.diamonds, SEEDS.wallets.alice]);

        await client.query(`
      INSERT INTO transactions (id, transaction_type, reference, initiated_by)
      VALUES ($1, 'topup', 'SEED-BOB-GOLD', 'system')
      ON CONFLICT (id) DO NOTHING
    `, [SEEDS.transactions.bobGold]);

        await client.query(`
      INSERT INTO ledger_entries (transaction_id, wallet_id, asset_type_id, direction, amount)
      VALUES
        ($1, $2, $3, 'debit',  500),
        ($1, $4, $3, 'credit', 500)
      ON CONFLICT DO NOTHING
    `, [SEEDS.transactions.bobGold, SEEDS.wallets.treasury, SEEDS.assets.goldCoins, SEEDS.wallets.bob]);

        await client.query(`
      INSERT INTO transactions (id, transaction_type, reference, initiated_by)
      VALUES ($1, 'bonus', 'SEED-BOB-LPT', 'system')
      ON CONFLICT (id) DO NOTHING
    `, [SEEDS.transactions.bobLpt]);

        await client.query(`
      INSERT INTO ledger_entries (transaction_id, wallet_id, asset_type_id, direction, amount)
      VALUES
        ($1, $2, $3, 'debit',  200),
        ($1, $4, $3, 'credit', 200)
      ON CONFLICT DO NOTHING
    `, [SEEDS.transactions.bobLpt, SEEDS.wallets.bonusPool, SEEDS.assets.loyaltyPoints, SEEDS.wallets.bob]);

        await client.query('COMMIT');
        console.log('Initial balances created');

        const verifyResult = await pool.query(`
      SELECT
        w.label,
        at.symbol,
        SUM(CASE WHEN le.direction = 'credit' THEN le.amount ELSE -le.amount END) AS balance
      FROM   ledger_entries le
      JOIN   wallets      w  ON w.id  = le.wallet_id
      JOIN   asset_types  at ON at.id = le.asset_type_id
      GROUP  BY w.label, at.symbol
      HAVING SUM(CASE WHEN le.direction = 'credit' THEN le.amount ELSE -le.amount END) != 0
      ORDER  BY w.label, at.symbol
    `);

        console.log('Ledger Verification:');
        console.table(verifyResult.rows);

        console.log('Seed completed successfully!\n');
        console.log('Quick Reference IDs:');
        console.log('─'.repeat(50));
        console.log('Assets:');
        console.log(`  Gold Coins    : ${SEEDS.assets.goldCoins}`);
        console.log(`  Diamonds      : ${SEEDS.assets.diamonds}`);
        console.log(`  Loyalty Points: ${SEEDS.assets.loyaltyPoints}`);
        console.log('\nWallets:');
        console.log(`  Alice         : ${SEEDS.wallets.alice}`);
        console.log(`  Bob           : ${SEEDS.wallets.bob}`);
        console.log(`  Treasury      : ${SEEDS.wallets.treasury}`);
        console.log(`  Bonus Pool    : ${SEEDS.wallets.bonusPool}`);
        console.log(`  Revenue       : ${SEEDS.wallets.revenue}`);
        console.log('─'.repeat(50));

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Seed failed:', err.message);
        process.exit(1);
    } finally {
        client.release();

    }
}

if (require.main === module) {
    seed();
}

module.exports = seed;