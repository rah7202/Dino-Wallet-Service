'use strict';

const requestLogger = (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;

        const color = status >= 500 ? '\x1b[31m'   // red
            : status >= 400 ? '\x1b[33m'   // yellow
                : status >= 200 ? '\x1b[32m'   // green
                    : '\x1b[0m';                    // default
        const reset = '\x1b[0m';

        console.log(
            `${color}${status}${reset} ${req.method.padEnd(6)} ${req.originalUrl} — ${duration}ms`
        );
    });

    next();
};

module.exports = { requestLogger };