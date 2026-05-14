import { z } from 'zod';

export class ApiError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'ApiError';
    }
}

export class ValidationError extends ApiError {
    constructor(message, zodError) {
        super(400, message);
        this.name = 'ValidationError';
        this.zodError = zodError;
    }
}

export class NotFoundError extends ApiError {
    constructor(message = 'Resource not found') {
        super(404, message);
        this.name = 'NotFoundError';
    }
}

export class AuthenticationError extends ApiError {
    constructor(message = 'Authentication required') {
        super(401, message);
        this.name = 'AuthenticationError';
    }
}

export class AuthorizationError extends ApiError {
    constructor(message = 'Access denied') {
        super(403, message);
        this.name = 'AuthorizationError';
    }
}

export function handleErrors(err, _req, res, _next) {
    console.error('[ERROR]', err.name, err.message);

    if (err instanceof z.ZodError) {
        return res.status(400).json({
            message: 'Invalid request payload',
            errors: err.flatten(),
            errorDetails: err.issues.map((issue) => ({
                path: formatIssuePath(issue.path),
                message: issue.message,
                code: issue.code,
            })),
        });
    }

    if (err instanceof ValidationError) {
        return res.status(err.statusCode).json({
            message: err.message,
            ...(err.zodError && {
                errors: err.zodError.flatten(),
            }),
        });
    }

    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            message: err.message,
        });
    }

    // Unhandled error
    res.status(500).json({
        message: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && {
            error: err.message,
            stack: err.stack,
        }),
    });
}

function formatIssuePath(path = []) {
    if (!Array.isArray(path) || path.length === 0) {
        return '';
    }

    return path
        .map((segment) => (typeof segment === 'number' ? String(segment) : segment))
        .join('.');
}
