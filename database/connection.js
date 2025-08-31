const { Pool } = require('pg');
const { logger } = require('../utils/logger');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
    logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    logger.error('Database connection error:', err);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};
