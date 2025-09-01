const express = require('express');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const router = express.Router();

// Debug endpoint to test database connection
router.get('/db-test', async (req, res) => {
    try {
        logger.info('Testing database connection...');
        
        // Test basic query
        const result = await query('SELECT NOW() as current_time, version() as db_version');
        
        res.json({
            status: 'success',
            database: 'connected',
            current_time: result.rows[0].current_time,
            db_version: result.rows[0].db_version.substring(0, 50) + '...',
            env: {
                node_env: process.env.NODE_ENV,
                has_db_url: !!process.env.DATABASE_URL,
                has_jwt_secret: !!process.env.JWT_SECRET
            }
        });
        
    } catch (error) {
        logger.error('Database test error:', error);
        res.status(500).json({
            status: 'error',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Check environment variables
router.get('/env-check', (req, res) => {
    const dbUrl = process.env.DATABASE_URL;
    const maskedDbUrl = dbUrl ? dbUrl.replace(/:[^:@]*@/, ':****@') : 'NOT_SET';
    
    res.json({
        status: 'success',
        env: {
            NODE_ENV: process.env.NODE_ENV,
            PORT: process.env.PORT,
            DATABASE_URL: maskedDbUrl,
            DATABASE_URL_LENGTH: dbUrl ? dbUrl.length : 0,
            JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'NOT_SET',
            OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'NOT_SET',
            GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID ? 'SET' : 'NOT_SET',
            GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET ? 'SET' : 'NOT_SET',
            FRONTEND_URL: process.env.FRONTEND_URL,
            GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI,
            LOG_LEVEL: process.env.LOG_LEVEL
        }
    });
});

// Test users table
router.get('/users-test', async (req, res) => {
    try {
        const result = await query('SELECT COUNT(*) as user_count FROM users');
        res.json({
            status: 'success',
            user_count: result.rows[0].user_count
        });
    } catch (error) {
        logger.error('Users test error:', error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

module.exports = router;
