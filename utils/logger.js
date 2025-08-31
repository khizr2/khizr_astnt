const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'khizr-assistant' },
    transports: [
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Only add file transports in development
if (process.env.NODE_ENV === 'development') {
    logger.add(new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error' 
    }));
    logger.add(new winston.transports.File({ 
        filename: 'logs/combined.log' 
    }));
}

module.exports = { logger };
