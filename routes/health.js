const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { PerformanceMonitor } = require('../services/performance-monitor');
const { GlobalPreferenceLearner } = require('../services/PreferenceLearner');
const { SystemEvaluator } = require('../evaluate-system');
const { supabase } = require('../database/connection');
const { logger } = require('../utils/logger');

const router = express.Router();
const performanceMonitor = new PerformanceMonitor();
const preferenceLearner = new GlobalPreferenceLearner();

// Initialize automated monitoring
performanceMonitor.startAutomatedMonitoring();

// Public health check endpoint
router.get('/system/health', async (req, res) => {
    try {
        logger.info('System health check requested', {
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        const healthData = await getSystemHealthData();

        // Determine HTTP status based on health score
        const statusCode = healthData.health_score >= 80 ? 200 :
                          healthData.health_score >= 60 ? 200 : 503; // Service unavailable

        res.status(statusCode).json({
            status: statusCode === 200 ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            ...healthData
        });

    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Health check failed',
            message: error.message
        });
    }
});

// Detailed health metrics (requires authentication)
router.get('/api/health/detailed', authenticateToken, async (req, res) => {
    try {
        const healthData = await getDetailedHealthData();

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            ...healthData
        });

    } catch (error) {
        logger.error('Detailed health check failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get detailed health data',
            message: error.message
        });
    }
});

// Performance metrics endpoint
router.get('/api/health/performance', authenticateToken, async (req, res) => {
    try {
        const { timeRange = '24h', userId } = req.query;

        const report = await performanceMonitor.generatePerformanceReport(userId);

        res.json({
            success: true,
            timeRange,
            ...report
        });

    } catch (error) {
        logger.error('Performance report failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate performance report',
            message: error.message
        });
    }
});

// Learning system health endpoint
router.get('/api/health/learning', authenticateToken, async (req, res) => {
    try {
        const learningHealth = await getLearningSystemHealth();

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            ...learningHealth
        });

    } catch (error) {
        logger.error('Learning system health check failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get learning system health',
            message: error.message
        });
    }
});

// User-specific health data
router.get('/api/health/user/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        // Verify user can access this data
        if (req.user.id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const userHealth = await getUserHealthData(userId);

        res.json({
            success: true,
            userId,
            timestamp: new Date().toISOString(),
            ...userHealth
        });

    } catch (error) {
        logger.error('User health data failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user health data',
            message: error.message
        });
    }
});

// System alerts endpoint
router.get('/api/health/alerts', authenticateToken, async (req, res) => {
    try {
        const { severity, limit = 50 } = req.query;

        let query = supabase
            .from('performance_alerts')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (severity) {
            query = query.eq('severity', severity);
        }

        const { data: alerts, error } = await query;

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            alerts: alerts || [],
            total: alerts?.length || 0
        });

    } catch (error) {
        logger.error('Alerts retrieval failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve alerts',
            message: error.message
        });
    }
});

// Cache performance endpoint
router.get('/api/health/cache', authenticateToken, async (req, res) => {
    try {
        const { data: cacheMetrics, error } = await supabase
            .from('cache_metrics')
            .select('*')
            .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('timestamp', { ascending: false });

        if (error) {
            throw error;
        }

        const cacheStats = {};
        cacheMetrics?.forEach(metric => {
            if (!cacheStats[metric.cache_type]) {
                cacheStats[metric.cache_type] = {
                    hit_rate: [],
                    total_requests: 0
                };
            }
            cacheStats[metric.cache_type].hit_rate.push(metric.hit_rate);
            cacheStats[metric.cache_type].total_requests += metric.total_requests;
        });

        // Calculate averages
        Object.keys(cacheStats).forEach(type => {
            const stats = cacheStats[type];
            stats.average_hit_rate = stats.hit_rate.reduce((a, b) => a + b, 0) / stats.hit_rate.length;
            stats.hit_rate_trend = stats.hit_rate.slice(-10); // Last 10 measurements
        });

        res.json({
            success: true,
            cache_performance: cacheStats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Cache performance check failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get cache performance',
            message: error.message
        });
    }
});

// System optimization recommendations
router.get('/api/health/recommendations', authenticateToken, async (req, res) => {
    try {
        const healthData = await getSystemHealthData();
        const recommendations = generateOptimizationRecommendations(healthData);

        res.json({
            success: true,
            health_score: healthData.health_score,
            recommendations,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Recommendations generation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate recommendations',
            message: error.message
        });
    }
});

// Helper functions

async function getSystemHealthData() {
    const [
        systemHealth,
        dbHealth,
        cacheHealth
    ] = await Promise.allSettled([
        performanceMonitor.getSystemHealth(),
        checkDatabaseHealth(),
        getCacheHealth()
    ]);

    const health = systemHealth.status === 'fulfilled' ? systemHealth.value : { health_score: 0 };
    const db = dbHealth.status === 'fulfilled' ? dbHealth.value : { status: 'error' };
    const cache = cacheHealth.status === 'fulfilled' ? cacheHealth.value : { status: 'error' };

    return {
        health_score: health.health_score,
        components: {
            database: db,
            cache: cache,
            system: health
        },
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        node_version: process.version
    };
}

async function getDetailedHealthData() {
    const healthData = await getSystemHealthData();

    // Add detailed metrics
    const [
        recentMetrics,
        activeUsers,
        systemLoad
    ] = await Promise.allSettled([
        supabase
            .from('performance_metrics')
            .select('*')
            .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString()),
        supabase
            .from('users')
            .select('id')
            .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        getSystemLoad()
    ]);

    healthData.detailed_metrics = {
        requests_last_hour: recentMetrics.status === 'fulfilled' ? recentMetrics.value.data?.length || 0 : 0,
        active_users_24h: activeUsers.status === 'fulfilled' ? activeUsers.value.data?.length || 0 : 0,
        system_load: systemLoad.status === 'fulfilled' ? systemLoad.value : {}
    };

    return healthData;
}

async function getLearningSystemHealth() {
    try {
        const [
            { data: preferences },
            { data: patterns },
            { data: conversations }
        ] = await Promise.all([
            supabase.from('user_preferences').select('confidence_score'),
            supabase.from('user_learning_patterns').select('confidence_score'),
            supabase.from('agent_conversations').select('count').limit(1)
        ]);

        const prefConfidence = preferences?.length > 0 ?
            preferences.reduce((sum, p) => sum + (p.confidence_score || 0), 0) / preferences.length : 0;

        const patternConfidence = patterns?.length > 0 ?
            patterns.reduce((sum, p) => sum + (p.confidence_score || 0), 0) / patterns.length : 0;

        const learningScore = ((prefConfidence + patternConfidence) / 2) * 100;

        return {
            learning_score: Math.round(learningScore),
            preferences_count: preferences?.length || 0,
            patterns_count: patterns?.length || 0,
            conversations_count: conversations?.length || 0,
            average_preference_confidence: prefConfidence,
            average_pattern_confidence: patternConfidence,
            cache_status: 'operational', // Could be enhanced with actual cache checks
            last_pattern_update: patterns?.length > 0 ?
                patterns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].created_at : null
        };

    } catch (error) {
        return {
            learning_score: 0,
            error: error.message
        };
    }
}

async function getUserHealthData(userId) {
    const [
        perfStats,
        preferences,
        recentActivity
    ] = await Promise.allSettled([
        performanceMonitor.getPerformanceStats(userId),
        preferenceLearner.getUserPreferences(userId),
        supabase
            .from('agent_conversations')
            .select('sentiment, response_time_ms')
            .eq('user_id', userId)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    ]);

    return {
        performance: perfStats.status === 'fulfilled' ? perfStats.value : {},
        preferences_count: Object.keys(preferences.status === 'fulfilled' ? preferences.value : {}).length,
        recent_activity: recentActivity.status === 'fulfilled' ? recentActivity.value.data?.length || 0 : 0,
        satisfaction_score: calculateUserSatisfactionScore(
            recentActivity.status === 'fulfilled' ? recentActivity.value.data : []
        )
    };
}

async function checkDatabaseHealth() {
    try {
        const startTime = Date.now();
        const { error } = await supabase
            .from('users')
            .select('count')
            .limit(1);
        const responseTime = Date.now() - startTime;

        if (error) {
            return {
                status: 'error',
                response_time: responseTime,
                error: error.message
            };
        }

        return {
            status: 'healthy',
            response_time: responseTime,
            connection_pool_size: process.env.DB_POOL_SIZE || 'unknown'
        };

    } catch (error) {
        return {
            status: 'error',
            error: error.message
        };
    }
}

async function getCacheHealth() {
    // This would be enhanced with actual cache system checks
    return {
        status: 'healthy',
        hit_rate: 0.85, // Mock data
        size: 'unknown',
        uptime: process.uptime()
    };
}

async function getSystemLoad() {
    return {
        cpu: process.cpuUsage(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        platform: process.platform,
        arch: process.arch
    };
}

function calculateUserSatisfactionScore(conversations) {
    if (!conversations || conversations.length === 0) return 0;

    const positiveCount = conversations.filter(c => c.sentiment === 'positive').length;
    const avgResponseTime = conversations
        .filter(c => c.response_time_ms)
        .reduce((sum, c) => sum + c.response_time_ms, 0) / conversations.length;

    let score = (positiveCount / conversations.length) * 100;

    // Penalize slow responses
    if (avgResponseTime > 3000) {
        score -= 20;
    } else if (avgResponseTime > 2000) {
        score -= 10;
    }

    return Math.max(0, Math.min(100, score));
}

function generateOptimizationRecommendations(healthData) {
    const recommendations = [];

    if (healthData.health_score < 70) {
        recommendations.push({
            priority: 'high',
            category: 'system_health',
            issue: 'Overall system health is degraded',
            solution: 'Review system logs and consider scaling resources',
            impact: 'high'
        });
    }

    if (healthData.components.database?.response_time > 1000) {
        recommendations.push({
            priority: 'high',
            category: 'database',
            issue: 'Database response time is slow',
            solution: 'Add database indexes or consider read replicas',
            impact: 'high'
        });
    }

    if (healthData.memory_usage?.heapUsed > 400 * 1024 * 1024) { // 400MB
        recommendations.push({
            priority: 'medium',
            category: 'memory',
            issue: 'High memory usage detected',
            solution: 'Implement memory optimization and garbage collection tuning',
            impact: 'medium'
        });
    }

    if (healthData.components.cache?.hit_rate < 0.8) {
        recommendations.push({
            priority: 'medium',
            category: 'cache',
            issue: 'Cache hit rate is low',
            solution: 'Review cache strategy and increase cache size if needed',
            impact: 'medium'
        });
    }

    return recommendations;
}

module.exports = router;
