'use strict';


class APIError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'APIError';
        Error.captureStackTrace(this, this.constructor);
    }
}


class BadRequestError extends APIError {
    constructor(message = 'Bad request') {
        super(400, message);
        this.name = 'BadRequestError';
    }
}


class NotFoundError extends APIError {
    constructor(message = 'Resource not found') {
        super(404, message);
        this.name = 'NotFoundError';
    }
}


class ConflictError extends APIError {
    constructor(message = 'Conflict') {
        super(409, message);
        this.name = 'ConflictError';
    }
}


class UnprocessableEntityError extends APIError {
    constructor(message = 'Unprocessable entity') {
        super(422, message);
        this.name = 'UnprocessableEntityError';
    }
}


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