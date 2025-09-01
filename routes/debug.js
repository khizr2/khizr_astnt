const express = require('express');
const { supabase } = require('../database/connection');
const { logger } = require('../utils/logger');

const router = express.Router();

// Debug endpoint to test database connection
router.get('/db-test', async (req, res) => {
    try {
        logger.info('Testing Supabase connection...');
        
        // Test basic query using Supabase client
        const { data, error } = await supabase
            .from('users')
            .select('id')
            .limit(1);
        
        if (error) {
            throw error;
        }
        
        res.json({
            status: 'success',
            database: 'connected',
            current_time: new Date().toISOString(),
            user_count: data ? data.length : 0,
            env: {
                node_env: process.env.NODE_ENV,
                has_supabase_url: !!process.env.SUPABASE_URL,
                has_supabase_key: !!process.env.SUPABASE_ANON_KEY,
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
    const supabaseUrl = process.env.SUPABASE_URL;
    const maskedUrl = supabaseUrl ? supabaseUrl.replace(/https:\/\/([^.]+)\./, 'https://***.') : 'NOT_SET';
    
    res.json({
        status: 'success',
        env: {
            NODE_ENV: process.env.NODE_ENV,
            PORT: process.env.PORT,
            SUPABASE_URL: maskedUrl,
            SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT_SET',
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT_SET',
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
        const { count, error } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });
        
        if (error) {
            throw error;
        }
        
        res.json({
            status: 'success',
            user_count: count || 0
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
