'use strict';

const { v4: uuidv4 } = require('uuid');
const { withTransaction } = require('../db/pool');
const {
    BadRequestError,
    NotFoundError,
    ConflictError,
    UnprocessableEntityError,
} = require('../errors/ApiError');
const IdempotencyRepository = require('../repositories/IdempotencyRepository');

// System wallet references
const SYSTEM_REFS = {
    TREASURY: 'system:treasury',
    BONUS_POOL: 'system:bonus_pool',
    REVENUE: 'system:revenue',
};

class WalletService {
    /**
     * Initialize service with all repositories
     */
    constructor({ walletRepo, ledgerRepo, txRepo, assetRepo, idemRepo }) {
        this.walletRepo = walletRepo;
        this.ledgerRepo = ledgerRepo;
        this.txRepo = txRepo;
        this.assetRepo = assetRepo;
        this.idemRepo = idemRepo;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // READ OPERATIONS
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Get wallet balance (computed from ledger)
     */
    async getBalance(walletId) {
        const wallet = await this.walletRepo.getById(walletId);
        if (!wallet) throw new NotFoundError('Wallet not found');

        const balances = await this.ledgerRepo.getBalance(walletId);

        return {
            wallet_id: walletId,
            label: wallet.label,
            balances,
        };
    }

    /**
     * Get transaction history (paginated)
     */
    async getTransactions(walletId, { limit = 20, offset = 0 } = {}) {
        const wallet = await this.walletRepo.getById(walletId);
        if (!wallet) throw new NotFoundError('Wallet not found');

        const [entries, total] = await Promise.all([
            this.ledgerRepo.getHistory(walletId, { limit, offset }),
            this.ledgerRepo.getTotalCount(walletId),
        ]);

        return {
            wallet_id: walletId,
            label: wallet.label,
            total,
            limit,
            offset,
            entries,
        };
    }

    /**
     * List all asset types
     */
    async listAssets() {
        return this.assetRepo.listActive();
    }

    /**
     * List all wallets
     */
    async listWallets() {
        return this.walletRepo.listAll();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // THE THREE FLOWS (Write Operations)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * FLOW 1: Top-up (Purchase)
     * User purchases credits with real money
     * Treasury → User wallet
     */
    async topUp(walletId, { assetTypeId, amount, reference, initiatedBy, metadata }, idemKey, endpoint) {
        const treasuryWallet = await this.walletRepo.getSystemWalletByRef(SYSTEM_REFS.TREASURY);
        if (!treasuryWallet) {
            throw new NotFoundError('Treasury system wallet not configured');
        }

        return this._executeTransfer({
            fromWalletId: treasuryWallet.id,
            toWalletId: walletId,
            txType: 'topup',
            assetTypeId,
            amount,
            reference,
            initiatedBy,
            metadata,
            idemKey,
            endpoint,
        });
    }

    /**
     * FLOW 2: Bonus / Incentive
     * System issues free credits to user
     * Bonus Pool → User wallet
     */
    async bonus(walletId, { assetTypeId, amount, reference, initiatedBy, metadata }, idemKey, endpoint) {
        const bonusPool = await this.walletRepo.getSystemWalletByRef(SYSTEM_REFS.BONUS_POOL);
        if (!bonusPool) {
            throw new NotFoundError('Bonus Pool system wallet not configured');
        }

        return this._executeTransfer({
            fromWalletId: bonusPool.id,
            toWalletId: walletId,
            txType: 'bonus',
            assetTypeId,
            amount,
            reference,
            initiatedBy,
            metadata,
            idemKey,
            endpoint,
        });
    }

    /**
     * FLOW 3: Spend / Purchase
     * User spends credits to buy service
     * User wallet → Revenue
     */
    async spend(walletId, { assetTypeId, amount, reference, initiatedBy, metadata }, idemKey, endpoint) {
        const revenueWallet = await this.walletRepo.getSystemWalletByRef(SYSTEM_REFS.REVENUE);
        if (!revenueWallet) {
            throw new NotFoundError('Revenue system wallet not configured');
        }

        return this._executeTransfer({
            fromWalletId: walletId,
            toWalletId: revenueWallet.id,
            txType: 'spend',
            assetTypeId,
            amount,
            reference,
            initiatedBy,
            metadata,
            idemKey,
            endpoint,
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CORE TRANSFER ENGINE
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * _executeTransfer — THE SINGLE CODE PATH FOR ALL BALANCE MUTATIONS
     *
     * This function enforces ALL critical requirements:
     *
     * ✅ 1. IDEMPOTENCY
     *    - Check cache before executing
     *    - Store result atomically in same transaction
     *    - Return cached response if duplicate request
     *
     * ✅ 2. VALIDATION
     *    - Amount must be positive
     *    - Asset type must exist and be active
     *    - Wallets must exist and be active
     *    - Sufficient balance for spend operations
     *
     * ✅ 3. DEADLOCK PREVENTION
     *    - Lock wallets in SORTED UUID order (canonical ordering)
     *    - Two concurrent txs touching same wallets will ALWAYS
     *      acquire locks in same order → no circular wait
     *
     * ✅ 4. DOUBLE-ENTRY LEDGER
     *    - Every transfer creates exactly 2 ledger entries:
     *      * DEBIT from source wallet
     *      * CREDIT to destination wallet
     *    - Same amount, same asset, same transaction
     *
     * ✅ 5. ATOMICITY
     *    - All DB writes in single ACID transaction
     *    - Auto-retry on serialization failures
     *    - Rollback on any error
     *
     * @returns {Object} { data: TransferResult, fromCache: boolean }
     */
    async _executeTransfer({
        fromWalletId,
        toWalletId,
        txType,
        assetTypeId,
        amount,
        reference,
        initiatedBy = 'system',
        metadata,
        idemKey,
        endpoint,
    }) {

        // ── STEP 1: Validate Amount ─────────────────────────────────────────────
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            throw new BadRequestError('Amount must be a positive number');
        }

        // ── STEP 2: Check Idempotency (Optimistic Read) ─────────────────────────
        const requestHash = IdempotencyRepository.hashRequest({
            assetTypeId,
            amount,
            reference,
        });

        const existing = await this.idemRepo.get(idemKey);
        if (existing) {
            // Found existing record
            if (existing.request_hash !== requestHash) {
                throw new ConflictError(
                    'Idempotency-Key already used with a different request body'
                );
            }

            // Cache hit - return stored response
            console.log(`💾 Idempotency cache hit: ${idemKey}`);
            return { data: existing.response_body, fromCache: true };
        }

        // ── STEP 3: Validate Asset Type ─────────────────────────────────────────
        const asset = await this.assetRepo.getById(assetTypeId);
        if (!asset) {
            throw new NotFoundError(`Asset type not found: ${assetTypeId}`);
        }
        if (!asset.is_active) {
            throw new BadRequestError('Asset type is not active');
        }

        // ── STEP 4: Execute in ACID Transaction ─────────────────────────────────
        const result = await withTransaction(async (client) => {

            // 🔒 DEADLOCK PREVENTION: Lock wallets in SORTED order
            // This is THE critical step that prevents deadlocks
            const walletMap = await this.walletRepo.lockWallets(
                client,
                fromWalletId,
                toWalletId
            );

            // Validate both wallets are active
            if (!walletMap[fromWalletId].is_active) {
                throw new BadRequestError('Source wallet is inactive');
            }
            if (!walletMap[toWalletId].is_active) {
                throw new BadRequestError('Destination wallet is inactive');
            }

            // For SPEND: check sufficient balance AFTER acquiring lock
            // (checking before lock = race condition)
            if (txType === 'spend') {
                const balance = await this.ledgerRepo.getBalanceForAsset(
                    client,
                    fromWalletId,
                    assetTypeId
                );

                if (balance < numAmount) {
                    throw new UnprocessableEntityError(
                        `Insufficient balance: have ${balance}, need ${numAmount}`
                    );
                }
            }

            // Create transaction record
            const txId = uuidv4();
            const tx = await this.txRepo.insert(client, {
                id: txId,
                transactionType: txType,
                reference,
                initiatedBy,
                metadata,
            });

            // Write double-entry ledger:
            // 1. DEBIT source wallet
            await this.ledgerRepo.insertEntry(client, {
                transactionId: txId,
                walletId: fromWalletId,
                assetTypeId,
                direction: 'debit',
                amount: numAmount,
            });

            // 2. CREDIT destination wallet
            await this.ledgerRepo.insertEntry(client, {
                transactionId: txId,
                walletId: toWalletId,
                assetTypeId,
                direction: 'credit',
                amount: numAmount,
            });

            // Build response
            const transferResult = {
                transaction_id: txId,
                transaction_type: txType,
                reference,
                asset_type_id: assetTypeId,
                asset_symbol: asset.symbol,
                amount: numAmount,
                from_wallet_id: fromWalletId,
                to_wallet_id: toWalletId,
                created_at: tx.created_at,
            };

            // Store idempotency record ATOMICALLY (same transaction)
            await this.idemRepo.store(client, {
                idemKey,
                endpoint,
                requestHash,
                responseStatus: 201,
                responseBody: transferResult,
                transactionId: txId,
            });

            return transferResult;
        });

        console.log(`✅ ${txType} completed: ${result.transaction_id}`);
        return { data: result, fromCache: false };
    }
}

module.exports = WalletService;