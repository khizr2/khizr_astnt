const { supabase } = require('../database/connection');
const { logger } = require('../utils/logger');

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.cache = new Map();
        this.alertThresholds = {
            responseTime: 5000, // 5 seconds
            memoryUsage: 500, // MB
            errorRate: 0.05, // 5%
            cacheHitRate: 0.8 // 80%
        };
    }

    /**
     * Track performance metric
     * @param {string} userId - User identifier
     * @param {string} action - Action being performed
     * @param {number} startTime - Start timestamp
     * @param {Object} metadata - Additional metadata
     */
    async trackPerformance(userId, action, startTime, metadata = {}) {
        const duration = Date.now() - startTime;
        const timestamp = new Date().toISOString();

        try {
            // Store in database for historical analysis
            await supabase.from('performance_metrics').insert({
                user_id: userId,
                action,
                duration_ms: duration,
                timestamp,
                metadata: JSON.stringify(metadata)
            });

            // Store in memory for real-time analysis
            const key = `${userId}:${action}`;
            if (!this.metrics.has(key)) {
                this.metrics.set(key, []);
            }
            const metrics = this.metrics.get(key);
            metrics.push({ duration, timestamp });

            // Keep only last 100 metrics per action
            if (metrics.length > 100) {
                metrics.shift();
            }

            // Check for performance degradation
            await this.checkPerformanceAlerts(userId, action, duration);

            logger.info(`Performance tracked: ${action} took ${duration}ms`, {
                userId,
                action,
                duration,
                metadata
            });

        } catch (error) {
            logger.error('Error tracking performance:', error);
        }
    }

    /**
     * Check for performance alerts
     * @param {string} userId - User identifier
     * @param {string} action - Action being performed
     * @param {number} duration - Response duration
     */
    async checkPerformanceAlerts(userId, action, duration) {
        const alerts = [];

        // Response time alert
        if (duration > this.alertThresholds.responseTime) {
            alerts.push({
                type: 'slow_response',
                message: `${action} took ${duration}ms (threshold: ${this.alertThresholds.responseTime}ms)`,
                severity: 'warning',
                userId,
                action,
                duration
            });
        }

        // Calculate recent average for trend analysis
        const key = `${userId}:${action}`;
        const metrics = this.metrics.get(key) || [];
        const recentMetrics = metrics.slice(-10); // Last 10 measurements

        if (recentMetrics.length >= 5) {
            const avgDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
            const degradation = ((avgDuration - duration) / avgDuration) * 100;

            if (Math.abs(degradation) > 20) { // 20% change
                alerts.push({
                    type: 'performance_trend',
                    message: `${action} performance ${degradation > 0 ? 'improved' : 'degraded'} by ${Math.abs(degradation).toFixed(1)}%`,
                    severity: degradation > 0 ? 'info' : 'warning',
                    userId,
                    action,
                    change: degradation
                });
            }
        }

        // Log alerts
        for (const alert of alerts) {
            await this.logAlert(alert);
        }

        return alerts;
    }

    /**
     * Log performance alert
     * @param {Object} alert - Alert object
     */
    async logAlert(alert) {
        try {
            await supabase.from('performance_alerts').insert({
                user_id: alert.userId,
                alert_type: alert.type,
                message: alert.message,
                severity: alert.severity,
                metadata: JSON.stringify(alert),
                timestamp: new Date().toISOString()
            });

            const logLevel = alert.severity === 'warning' ? 'warn' : 'info';
            logger[logLevel](`Performance Alert: ${alert.message}`, alert);

        } catch (error) {
            logger.error('Error logging performance alert:', error);
        }
    }

    /**
     * Get performance statistics for user
     * @param {string} userId - User identifier
     * @param {string} action - Specific action (optional)
     * @returns {Object} - Performance statistics
     */
    async getPerformanceStats(userId, action = null) {
        try {
            let query = supabase
                .from('performance_metrics')
                .select('*')
                .eq('user_id', userId)
                .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
                .order('timestamp', { ascending: false });

            if (action) {
                query = query.eq('action', action);
            }

            const { data: metrics, error } = await query;

            if (error) {
                logger.error('Error fetching performance stats:', error);
                return {};
            }

            if (!metrics || metrics.length === 0) {
                return {
                    totalRequests: 0,
                    averageResponseTime: 0,
                    minResponseTime: 0,
                    maxResponseTime: 0,
                    p95ResponseTime: 0,
                    errorRate: 0
                };
            }

            const durations = metrics.map(m => m.duration_ms);
            const sortedDurations = [...durations].sort((a, b) => a - b);

            return {
                totalRequests: metrics.length,
                averageResponseTime: durations.reduce((a, b) => a + b, 0) / durations.length,
                minResponseTime: Math.min(...durations),
                maxResponseTime: Math.max(...durations),
                p95ResponseTime: sortedDurations[Math.floor(sortedDurations.length * 0.95)],
                errorRate: metrics.filter(m => m.metadata && JSON.parse(m.metadata).error).length / metrics.length,
                timeRange: '7d'
            };

        } catch (error) {
            logger.error('Error getting performance stats:', error);
            return {};
        }
    }

    /**
     * Monitor memory usage
     */
    async trackMemoryUsage() {
        const memUsage = process.memoryUsage();
        const usageMB = memUsage.heapUsed / 1024 / 1024;

        try {
            await supabase.from('system_metrics').insert({
                metric_type: 'memory_usage',
                metric_value: usageMB,
                unit: 'MB',
                timestamp: new Date().toISOString(),
                metadata: JSON.stringify(memUsage)
            });

            // Alert if memory usage is high
            if (usageMB > this.alertThresholds.memoryUsage) {
                await this.logAlert({
                    type: 'high_memory_usage',
                    message: `Memory usage is high: ${usageMB.toFixed(2)}MB`,
                    severity: 'warning',
                    usage: usageMB
                });
            }

        } catch (error) {
            logger.error('Error tracking memory usage:', error);
        }
    }

    /**
     * Monitor cache performance
     * @param {string} cacheType - Type of cache
     * @param {boolean} hit - Whether it was a cache hit
     */
    async trackCachePerformance(cacheType, hit) {
        const key = `cache:${cacheType}`;
        if (!this.cache.has(key)) {
            this.cache.set(key, { hits: 0, misses: 0 });
        }

        const stats = this.cache.get(key);
        if (hit) {
            stats.hits++;
        } else {
            stats.misses++;
        }

        const total = stats.hits + stats.misses;
        const hitRate = stats.hits / total;

        // Log cache performance periodically
        if (total % 100 === 0) {
            try {
                await supabase.from('cache_metrics').insert({
                    cache_type: cacheType,
                    hit_rate: hitRate,
                    total_requests: total,
                    timestamp: new Date().toISOString()
                });

                // Alert if cache hit rate is low
                if (hitRate < this.alertThresholds.cacheHitRate) {
                    await this.logAlert({
                        type: 'low_cache_hit_rate',
                        message: `${cacheType} cache hit rate is low: ${(hitRate * 100).toFixed(1)}%`,
                        severity: 'info',
                        cacheType,
                        hitRate
                    });
                }

            } catch (error) {
                logger.error('Error tracking cache performance:', error);
            }
        }
    }

    /**
     * Get system health metrics
     * @returns {Object} - System health data
     */
    async getSystemHealth() {
        try {
            const [
                { data: recentMetrics },
                { data: recentAlerts },
                { data: cacheMetrics },
                { data: systemMetrics }
            ] = await Promise.all([
                supabase
                    .from('performance_metrics')
                    .select('*')
                    .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString()), // Last hour
                supabase
                    .from('performance_alerts')
                    .select('*')
                    .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
                    .eq('severity', 'warning'),
                supabase
                    .from('cache_metrics')
                    .select('*')
                    .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString()),
                supabase
                    .from('system_metrics')
                    .select('*')
                    .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString())
            ]);

            // Calculate health scores
            const responseTimes = recentMetrics?.map(m => m.duration_ms) || [];
            const avgResponseTime = responseTimes.length > 0 ?
                responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

            const cacheHitRates = cacheMetrics?.map(m => m.hit_rate) || [];
            const avgCacheHitRate = cacheHitRates.length > 0 ?
                cacheHitRates.reduce((a, b) => a + b, 0) / cacheHitRates.length : 0;

            const memoryUsage = systemMetrics?.filter(m => m.metric_type === 'memory_usage')
                .map(m => m.metric_value) || [];
            const avgMemoryUsage = memoryUsage.length > 0 ?
                memoryUsage.reduce((a, b) => a + b, 0) / memoryUsage.length : 0;

            // Calculate health score (0-100)
            let healthScore = 100;

            // Response time impact (40 points)
            if (avgResponseTime > 2000) {
                healthScore -= 20;
            } else if (avgResponseTime > 1000) {
                healthScore -= 10;
            }

            // Cache performance impact (20 points)
            if (avgCacheHitRate < 0.8) {
                healthScore -= 15;
            } else if (avgCacheHitRate < 0.9) {
                healthScore -= 5;
            }

            // Memory usage impact (20 points)
            if (avgMemoryUsage > 400) {
                healthScore -= 15;
            } else if (avgMemoryUsage > 300) {
                healthScore -= 10;
            }

            // Error rate impact (20 points)
            const errorCount = recentAlerts?.length || 0;
            if (errorCount > 10) {
                healthScore -= 15;
            } else if (errorCount > 5) {
                healthScore -= 10;
            }

            return {
                health_score: Math.max(0, healthScore),
                metrics: {
                    average_response_time: avgResponseTime,
                    cache_hit_rate: avgCacheHitRate,
                    memory_usage: avgMemoryUsage,
                    recent_alerts: errorCount,
                    total_requests_last_hour: recentMetrics?.length || 0
                },
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Error getting system health:', error);
            return {
                health_score: 0,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Start automated monitoring
     */
    startAutomatedMonitoring() {
        // Track memory usage every 5 minutes
        setInterval(() => {
            this.trackMemoryUsage();
        }, 5 * 60 * 1000);

        // Log system health every 10 minutes
        setInterval(async () => {
            const health = await this.getSystemHealth();
            logger.info('System Health Check', health);
        }, 10 * 60 * 1000);

        logger.info('Automated performance monitoring started');
    }

    /**
     * Create performance report
     * @param {string} userId - User identifier (optional)
     * @returns {Object} - Performance report
     */
    async generatePerformanceReport(userId = null) {
        try {
            const timeRanges = {
                '1h': 60 * 60 * 1000,
                '24h': 24 * 60 * 60 * 1000,
                '7d': 7 * 24 * 60 * 60 * 1000
            };

            const report = {};

            for (const [range, ms] of Object.entries(timeRanges)) {
                const startTime = new Date(Date.now() - ms);

                let query = supabase
                    .from('performance_metrics')
                    .select('*')
                    .gte('timestamp', startTime.toISOString());

                if (userId) {
                    query = query.eq('user_id', userId);
                }

                const { data: metrics } = await query;

                if (metrics && metrics.length > 0) {
                    const durations = metrics.map(m => m.duration_ms);
                    const sortedDurations = [...durations].sort((a, b) => a - b);

                    report[range] = {
                        total_requests: metrics.length,
                        avg_response_time: durations.reduce((a, b) => a + b, 0) / durations.length,
                        p50_response_time: sortedDurations[Math.floor(sortedDurations.length * 0.5)],
                        p95_response_time: sortedDurations[Math.floor(sortedDurations.length * 0.95)],
                        p99_response_time: sortedDurations[Math.floor(sortedDurations.length * 0.99)],
                        min_response_time: Math.min(...durations),
                        max_response_time: Math.max(...durations),
                        error_rate: metrics.filter(m => m.metadata && JSON.parse(m.metadata).error).length / metrics.length
                    };
                }
            }

            return {
                user_id: userId,
                generated_at: new Date().toISOString(),
                report
            };

        } catch (error) {
            logger.error('Error generating performance report:', error);
            return { error: error.message };
        }
    }
}

module.exports = { PerformanceMonitor };
