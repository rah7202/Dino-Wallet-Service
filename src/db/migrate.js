'use strict';

const { pool } = require('./pool');

const MIGRATION_SQL = `
-- ============================================================================
-- Dino Wallet Service — Double-Entry Ledger Schema
-- ============================================================================

BEGIN;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Asset Types ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_types (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT         NOT NULL UNIQUE,
  symbol      VARCHAR(10)  NOT NULL UNIQUE,
  description TEXT         NOT NULL DEFAULT '',
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Wallets ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_ref   TEXT        NOT NULL,
  owner_type  TEXT        NOT NULL CHECK (owner_type IN ('user', 'system')),
  label       TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_owner_ref ON wallets(owner_ref);
CREATE INDEX IF NOT EXISTS idx_wallets_active ON wallets(owner_type) WHERE is_active = TRUE;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON wallets;
CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Transactions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type TEXT        NOT NULL CHECK (transaction_type IN ('topup', 'bonus', 'spend')),
  reference        TEXT        NOT NULL,
  initiated_by     TEXT        NOT NULL DEFAULT 'system',
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_ref ON transactions(reference);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

-- ── Ledger Entries (Double-Entry) ──────────────────────────────────────────
-- Every transaction creates exactly TWO entries: debit + credit
-- Balance = SUM(credits) - SUM(debits)
CREATE TABLE IF NOT EXISTS ledger_entries (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID          NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  wallet_id       UUID          NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  asset_type_id   UUID          NOT NULL REFERENCES asset_types(id) ON DELETE RESTRICT,
  direction       TEXT          NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount          NUMERIC(28,8) NOT NULL CHECK (amount > 0),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet_asset ON ledger_entries(wallet_id, asset_type_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transaction ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created ON ledger_entries(created_at DESC);

-- ── Idempotency Keys ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  idem_key        TEXT        NOT NULL UNIQUE,
  endpoint        TEXT        NOT NULL,
  request_hash    TEXT        NOT NULL,
  response_status INTEGER     NOT NULL,
  response_body   JSONB       NOT NULL,
  transaction_id  UUID,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idem_key ON idempotency_keys(idem_key);
CREATE INDEX IF NOT EXISTS idx_idem_expires ON idempotency_keys(expires_at);

COMMIT;
`;

async function migrate() {
    console.log('Running migrations...');

    try {
        await pool.query(MIGRATION_SQL);
        console.log('✅ Migrations completed successfully');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    migrate();
}

module.exports = migrate;