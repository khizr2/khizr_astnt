// Configuration routes - Secure environment variable serving
const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');

// Environment variables safe to expose to client
const CLIENT_SAFE_ENV_VARS = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'API_BASE_URL',
    'NODE_ENV',
    'ENABLE_ANALYTICS',
    'ENABLE_ERROR_REPORTING',
    'ENABLE_PATTERN_LEARNING',
    'ENABLE_DADDY_AGENT',
    'ENABLE_GMAIL_INTEGRATION',
    'DEFAULT_THEME',
    'ANIMATIONS_ENABLED',
    'NOTIFICATIONS_ENABLED'
];

// GET /api/config/env - Serve client-safe environment variables
router.get('/env', (req, res) => {
    try {
        // Only serve environment variables that are safe for client-side consumption
        const clientEnv = {};

        CLIENT_SAFE_ENV_VARS.forEach(key => {
            if (process.env[key] !== undefined) {
                clientEnv[key] = process.env[key];
            }
        });

        // Add some derived configuration
        clientEnv.IS_PRODUCTION = process.env.NODE_ENV === 'production';
        clientEnv.IS_DEVELOPMENT = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        clientEnv.TIMESTAMP = new Date().toISOString();

        logger.info('Environment configuration served to client', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            envKeys: Object.keys(clientEnv)
        });

        res.json(clientEnv);
    } catch (error) {
        logger.error('Error serving environment configuration:', error);
        res.status(500).json({
            error: 'Failed to load environment configuration',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/config/health - Health check endpoint
router.get('/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime()
    };

    // Check critical dependencies
    const checks = {
        database: process.env.SUPABASE_URL ? 'configured' : 'missing',
        supabase_key: process.env.SUPABASE_ANON_KEY ? 'configured' : 'missing',
        port: process.env.PORT || 'default (10000)'
    };

    health.checks = checks;

    const isHealthy = checks.database === 'configured' && checks.supabase_key === 'configured';

    if (!isHealthy) {
        health.status = 'degraded';
        health.warnings = [];

        if (checks.database === 'missing') {
            health.warnings.push('Database configuration missing');
        }
        if (checks.supabase_key === 'missing') {
            health.warnings.push('Supabase key configuration missing');
        }
    }

    const statusCode = isHealthy ? 200 : 503; // 503 Service Unavailable for degraded

    logger.info(`Health check: ${health.status}`, {
        ip: req.ip,
        checks: health.checks
    });

    res.status(statusCode).json(health);
});

// GET /api/config/info - System information (for debugging)
router.get('/info', (req, res) => {
    // Only allow in development or with proper authentication
    if (process.env.NODE_ENV === 'production' && !req.headers.authorization) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const info = {
        node_version: process.version,
        platform: process.platform,
        architecture: process.arch,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 10000
    };

    logger.info('System info requested', { ip: req.ip });

    res.json(info);
});

module.exports = router;
