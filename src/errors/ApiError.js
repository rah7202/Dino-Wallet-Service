'use strict';

/**
 * Base API Error class
 */
class APIError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'APIError';
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * 400 Bad Request - Invalid input
 */
class BadRequestError extends APIError {
    constructor(message = 'Bad request') {
        super(400, message);
        this.name = 'BadRequestError';
    }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
class NotFoundError extends APIError {
    constructor(message = 'Resource not found') {
        super(404, message);
        this.name = 'NotFoundError';
    }
}

/**
 * 409 Conflict - Duplicate or conflicting request
 */
class ConflictError extends APIError {
    constructor(message = 'Conflict') {
        super(409, message);
        this.name = 'ConflictError';
    }
}

/**
 * 422 Unprocessable Entity - Valid syntax but business logic error
 */
class UnprocessableEntityError extends APIError {
    constructor(message = 'Unprocessable entity') {
        super(422, message);
        this.name = 'UnprocessableEntityError';
    }
}

/**
 * 500 Internal Server Error
 */
class InternalError extends APIError {
    constructor(message = 'Internal server error') {
        super(500, message);
        this.name = 'InternalError';
    }
}

module.exports = {
    APIError,
    BadRequestError,
    NotFoundError,
    ConflictError,
    UnprocessableEntityError,
    InternalError,
};