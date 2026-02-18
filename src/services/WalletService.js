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


const SYSTEM_REFS = {
    TREASURY: 'system:treasury',
    BONUS_POOL: 'system:bonus_pool',
    REVENUE: 'system:revenue',
};

class WalletService {

    constructor({ walletRepo, ledgerRepo, txRepo, assetRepo, idemRepo }) {
        this.walletRepo = walletRepo;
        this.ledgerRepo = ledgerRepo;
        this.txRepo = txRepo;
        this.assetRepo = assetRepo;
        this.idemRepo = idemRepo;
    }


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


    async listAssets() {
        return this.assetRepo.listActive();
    }


    async listWallets() {
        return this.walletRepo.listAll();
    }


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


        const numAmount = parseFloat(amount);

        if (isNaN(numAmount) || numAmount <= 0) {
            throw new BadRequestError('Amount must be a positive number');
        }


        const requestHash = IdempotencyRepository.hashRequest({
            assetTypeId,
            amount,
            reference,
        });

        const existing = await this.idemRepo.get(idemKey);
        if (existing) {

            if (existing.request_hash !== requestHash) {
                throw new ConflictError(
                    'Idempotency-Key already used with a different request body'
                );
            }


            console.log(`Idempotency cache hit: ${idemKey}`);
            return { data: existing.response_body, fromCache: true };
        }


        const asset = await this.assetRepo.getById(assetTypeId);
        if (!asset) {
            throw new NotFoundError(`Asset type not found: ${assetTypeId}`);
        }
        if (!asset.is_active) {
            throw new BadRequestError('Asset type is not active');
        }


        const result = await withTransaction(async (client) => {


            const walletMap = await this.walletRepo.lockWallets(
                client,
                fromWalletId,
                toWalletId
            );


            if (!walletMap[fromWalletId].is_active) {
                throw new BadRequestError('Source wallet is inactive');
            }
            if (!walletMap[toWalletId].is_active) {
                throw new BadRequestError('Destination wallet is inactive');
            }


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


            const txId = uuidv4();
            const tx = await this.txRepo.insert(client, {
                id: txId,
                transactionType: txType,
                reference,
                initiatedBy,
                metadata,
            });


            await this.ledgerRepo.insertEntry(client, {
                transactionId: txId,
                walletId: fromWalletId,
                assetTypeId,
                direction: 'debit',
                amount: numAmount,
            });


            await this.ledgerRepo.insertEntry(client, {
                transactionId: txId,
                walletId: toWalletId,
                assetTypeId,
                direction: 'credit',
                amount: numAmount,
            });


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

        console.log(`${txType} completed: ${result.transaction_id}`);
        return { data: result, fromCache: false };
    }
}

module.exports = WalletService;