'use strict';

const { APIError } = require('../errors/ApiError');

/**
 * Global error handler - converts errors to JSON responses
 * Must be the LAST middleware in the chain
 */
const errorHandler = (err, req, res, next) => {

    // Known API errors (validation, not found, etc.)
    if (err instanceof APIError) {
        return res.status(err.statusCode).json({
            error: err.message,
            statusCode: err.statusCode,
        });
    }

    // PostgreSQL-specific errors
    if (err.code) {
        switch (err.code) {
            case '23505': // unique_violation
                return res.status(409).json({
                    error: 'Duplicate resource - unique constraint violated',
                });

            case '23503': // foreign_key_violation
                return res.status(422).json({
                    error: 'Referenced resource does not exist',
                });

            case '23514': // check_violation
                return res.status(422).json({
                    error: 'Data constraint violated: ' + (err.detail || err.message),
                });

            case '40001': // serialization_failure
                return res.status(503).json({
                    error: 'Service temporarily unavailable, please retry',
                });

            case '40P01': // deadlock_detected
                return res.status(503).json({
                    error: 'Transaction conflict, please retry',
                });

            case '57014': // query_canceled (statement timeout)
                return res.status(503).json({
                    error: 'Request timed out',
                });
        }
    }

    // Unexpected errors - log internally, return generic message
    console.error('❌ Unhandled error:', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });

    return res.status(500).json({
        error: 'Internal server error',
    });
};

module.exports = { errorHandler };