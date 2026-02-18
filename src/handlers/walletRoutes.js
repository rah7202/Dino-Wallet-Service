'use strict';

const { Router } = require('express');
const WalletService = require('../services/WalletService');
const WalletRepository = require('../repositories/WalletRepository');
const LedgerRepository = require('../repositories/LedgerRepository');
const TransactionRepository = require('../repositories/TransactionRepository');
const AssetRepository = require('../repositories/AssetRepository');
const IdempotencyRepository = require('../repositories/IdempotencyRepository');
const { BadRequestError } = require('../errors/ApiError');

/**
 * Wallet routes factory - wires up dependencies and returns router
 */
module.exports = function walletRoutes(pool) {
    const router = Router();

    // Initialize repositories
    const walletRepo = new WalletRepository(pool);
    const ledgerRepo = new LedgerRepository(pool);
    const txRepo = new TransactionRepository(pool);
    const assetRepo = new AssetRepository(pool);
    const idemRepo = new IdempotencyRepository(pool);

    // Initialize service
    const service = new WalletService({
        walletRepo,
        ledgerRepo,
        txRepo,
        assetRepo,
        idemRepo,
    });

    // ══════════════════════════════════════════════════════════════════════════
    // READ ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * GET /api/v1/assets
     * List all active asset types
     */
    router.get('/assets', async (req, res, next) => {
        try {
            const assets = await service.listAssets();
            res.json({ assets });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/v1/wallets
     * List all wallets
     */
    router.get('/wallets', async (req, res, next) => {
        try {
            const wallets = await service.listWallets();
            res.json({ wallets });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/v1/wallets/:walletId/balance
     * Get wallet balance (computed from ledger)
     */
    router.get('/wallets/:walletId/balance', async (req, res, next) => {
        try {
            const result = await service.getBalance(req.params.walletId);
            res.json(result);
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/v1/wallets/:walletId/transactions
     * Get transaction history (paginated)
     * 
     * Query params:
     *   - limit: max results (1-100, default 20)
     *   - offset: skip N results (default 0)
     */
    router.get('/wallets/:walletId/transactions', async (req, res, next) => {
        try {
            const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20', 10)));
            const offset = Math.max(0, parseInt(req.query.offset || '0', 10));

            const result = await service.getTransactions(req.params.walletId, { limit, offset });
            res.json(result);
        } catch (err) {
            next(err);
        }
    });

    // ══════════════════════════════════════════════════════════════════════════
    // WRITE ENDPOINTS (The Three Flows)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * POST /api/v1/wallets/:walletId/topup
     * 
     * FLOW 1: Top-up (Purchase)
     * User purchases credits with real money
     * 
     * Headers:
     *   - Idempotency-Key: <uuid> (required)
     * 
     * Body:
     *   - asset_type_id: UUID of asset (required)
     *   - amount: positive number (required)
     *   - reference: business reference like "PAY-123" (required)
     *   - initiated_by: who initiated (optional, default "system")
     *   - metadata: arbitrary JSON (optional)
     */
    router.post('/wallets/:walletId/topup', async (req, res, next) => {
        try {
            const idemKey = requireIdempotencyKey(req);
            const body = validateTransferBody(req.body);
            const endpoint = `topup:${req.params.walletId}`;

            const { data, fromCache } = await service.topUp(
                req.params.walletId,
                body,
                idemKey,
                endpoint
            );

            res.status(fromCache ? 200 : 201).json({
                data,
                from_cache: fromCache,
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/v1/wallets/:walletId/bonus
     * 
     * FLOW 2: Bonus / Incentive
     * System issues free credits to user
     * 
     * Headers:
     *   - Idempotency-Key: <uuid> (required)
     * 
     * Body: (same as topup)
     */
    router.post('/wallets/:walletId/bonus', async (req, res, next) => {
        try {
            const idemKey = requireIdempotencyKey(req);
            const body = validateTransferBody(req.body);
            const endpoint = `bonus:${req.params.walletId}`;

            const { data, fromCache } = await service.bonus(
                req.params.walletId,
                body,
                idemKey,
                endpoint
            );

            res.status(fromCache ? 200 : 201).json({
                data,
                from_cache: fromCache,
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/v1/wallets/:walletId/spend
     * 
     * FLOW 3: Spend / Purchase
     * User spends credits to buy service
     * 
     * Headers:
     *   - Idempotency-Key: <uuid> (required)
     * 
     * Body: (same as topup)
     */
    router.post('/wallets/:walletId/spend', async (req, res, next) => {
        try {
            const idemKey = requireIdempotencyKey(req);
            const body = validateTransferBody(req.body);
            const endpoint = `spend:${req.params.walletId}`;

            const { data, fromCache } = await service.spend(
                req.params.walletId,
                body,
                idemKey,
                endpoint
            );

            res.status(fromCache ? 200 : 201).json({
                data,
                from_cache: fromCache,
            });
        } catch (err) {
            next(err);
        }
    });

    return router;
};

// ══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Extract and validate Idempotency-Key header
 */
function requireIdempotencyKey(req) {
    const key = req.headers['idempotency-key'];

    if (!key || key.trim() === '') {
        throw new BadRequestError('Idempotency-Key header is required');
    }

    if (key.length > 255) {
        throw new BadRequestError('Idempotency-Key must be 255 characters or fewer');
    }

    return key.trim();
}

/**
 * Validate transfer request body
 */
function validateTransferBody(body) {
    if (!body || typeof body !== 'object') {
        throw new BadRequestError('Request body must be a JSON object');
    }

    const { asset_type_id, amount, reference, initiated_by, metadata } = body;

    // Validate asset_type_id
    if (!asset_type_id || typeof asset_type_id !== 'string') {
        throw new BadRequestError('asset_type_id is required (UUID string)');
    }

    // Validate amount
    if (amount === undefined || amount === null) {
        throw new BadRequestError('amount is required');
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
        throw new BadRequestError('amount must be a positive number');
    }

    // Validate reference
    if (!reference || typeof reference !== 'string' || reference.trim() === '') {
        throw new BadRequestError('reference is required (e.g., "PAY-123", "BONUS-001")');
    }

    return {
        assetTypeId: asset_type_id.trim(),
        amount: numAmount,
        reference: reference.trim(),
        initiatedBy: initiated_by || 'system',
        metadata: metadata || null,
    };
}