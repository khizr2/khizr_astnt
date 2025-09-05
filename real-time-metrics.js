const { supabase } = require('./database/connection');
const { logger } = require('./utils/logger');

// Environment validation following their pattern
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    logger.error('Missing required environment variables for metrics tracking');
    process.exit(1);
}

class RealTimeMetricsTracker {
    constructor(options = {}) {
        this.metrics = new Map();
        this.alerts = [];
        this.baselines = new Map();
        this.isRunning = false;
        this.userId = options.userId; // For authenticated tracking
        this.serviceAccountToken = options.serviceToken; // For middleware compatibility
        this.collectionInterval = options.interval || 30000;
        this.maxMetricsHistory = options.maxHistory || 1000; // Prevent memory leaks
    }

    async startTracking(intervalMs = null) {
        if (this.isRunning) {
            console.log('📊 Metrics tracking already running');
            return;
        }

        const actualInterval = intervalMs || this.collectionInterval;

        logger.info('Starting real-time metrics tracking', {
            interval_ms: actualInterval,
            user_id: this.userId,
            service_mode: !!this.serviceAccountToken
        });

        console.log('🚀 Starting Real-time Metrics Tracking...');
        this.isRunning = true;

        try {
            // Validate authentication if user context provided
            if (this.userId && !this.serviceAccountToken) {
                await this.validateAuthentication();
            }

            // Load baselines
            await this.loadBaselines();

            // Start tracking loop
            this.trackingInterval = setInterval(async () => {
                try {
                    await this.collectMetrics();
                    await this.checkAlerts();
                    await this.saveMetrics();

                    // Clean up old metrics to prevent memory leaks
                    this.cleanupOldMetrics();

                } catch (error) {
                    logger.error('Metrics collection error', {
                        error: error.message,
                        stack: error.stack,
                        user_id: this.userId
                    });
                }
            }, actualInterval);

            console.log(`✅ Metrics tracking started (interval: ${actualInterval}ms)`);

        } catch (error) {
            this.isRunning = false;
            logger.error('Failed to start metrics tracking', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async validateAuthentication() {
        try {
            // Verify user exists and is active
            const { data: user, error } = await supabase
                .from('users')
                .select('id, email')
                .eq('id', this.userId)
                .single();

            if (error || !user) {
                throw new Error(`Authentication failed: User ${this.userId} not found`);
            }

            logger.info('Metrics tracker authentication validated', {
                user_id: this.userId,
                user_email: user.email
            });

        } catch (error) {
            logger.error('Authentication validation failed', {
                error: error.message,
                user_id: this.userId
            });
            throw error;
        }
    }

    cleanupOldMetrics() {
        // Keep only recent metrics to prevent memory leaks
        if (this.metrics.size > this.maxMetricsHistory) {
            const entries = Array.from(this.metrics.entries());
            const toRemove = entries.slice(0, entries.length - this.maxMetricsHistory);

            toRemove.forEach(([timestamp]) => {
                this.metrics.delete(timestamp);
            });

            logger.debug('Cleaned up old metrics', {
                removed_count: toRemove.length,
                remaining_count: this.metrics.size
            });
        }

        // Clean up old alerts (keep last 100)
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }
    }

    stopTracking() {
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.isRunning = false;
            console.log('⏹️  Metrics tracking stopped');
        }
    }

    async loadBaselines() {
        console.log('📈 Loading Performance Baselines...');

        try {
            // Load historical metrics for baseline calculation
            const { data: historicalMetrics, error } = await supabase
                .from('agent_metrics')
                .select('metric_type, metric_value, timestamp')
                .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
                .order('timestamp', { ascending: true });

            if (error) {
                console.error('❌ Baseline loading failed:', error.message);
                return;
            }

            // Calculate baselines for each metric type
            const baselines = {};
            const metricsByType = {};

            historicalMetrics.forEach(metric => {
                if (!metricsByType[metric.metric_type]) {
                    metricsByType[metric.metric_type] = [];
                }
                metricsByType[metric.metric_type].push(metric.metric_value);
            });

            Object.entries(metricsByType).forEach(([type, values]) => {
                const sorted = values.sort((a, b) => a - b);
                baselines[type] = {
                    average: values.reduce((a, b) => a + b, 0) / values.length,
                    median: sorted[Math.floor(sorted.length * 0.5)],
                    p95: sorted[Math.floor(sorted.length * 0.95)],
                    p99: sorted[Math.floor(sorted.length * 0.99)],
                    min: Math.min(...values),
                    max: Math.max(...values)
                };
            });

            this.baselines = new Map(Object.entries(baselines));
            console.log(`✅ Loaded baselines for ${Object.keys(baselines).length} metric types`);

        } catch (error) {
            logger.error('Error loading baselines:', error);
        }
    }

    async collectMetrics() {
        const timestamp = new Date();
        const metrics = {};

        try {
            // 1. Agent Performance Metrics
            metrics.agent_performance = await this.collectAgentPerformanceMetrics();

            // 2. System Resource Metrics
            metrics.system_resources = await this.collectSystemResourceMetrics();

            // 3. User Experience Metrics
            metrics.user_experience = await this.collectUserExperienceMetrics();

            // 4. Learning System Metrics
            metrics.learning_system = await this.collectLearningSystemMetrics();

            // 5. Database Performance Metrics
            metrics.database_performance = await this.collectDatabasePerformanceMetrics();

            this.metrics.set(timestamp.toISOString(), metrics);

        } catch (error) {
            logger.error('Metrics collection failed:', error);
        }
    }

    async collectAgentPerformanceMetrics() {
        // Get active agents and their current status
        const { data: agents, error: agentError } = await supabase
            .from('agents')
            .select('id, type')
            .eq('is_active', true);

        if (agentError) return {};

        // Get recent task completions
        const { data: tasks, error: taskError } = await supabase
            .from('agent_tasks')
            .select('agent_id, status, created_at')
            .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour

        if (taskError) return {};

        const performance = {};

        agents.forEach(agent => {
            const agentTasks = tasks.filter(task => task.agent_id === agent.id);
            const completedTasks = agentTasks.filter(task => task.status === 'completed').length;
            const totalTasks = agentTasks.length;

            performance[agent.id] = {
                type: agent.type,
                tasks_completed_last_hour: completedTasks,
                total_tasks_last_hour: totalTasks,
                completion_rate: totalTasks > 0 ? completedTasks / totalTasks : 0
            };
        });

        return performance;
    }

    async collectSystemResourceMetrics() {
        // Get agent status for resource metrics
        const { data: status, error } = await supabase
            .from('agent_status')
            .select('cpu_usage, memory_usage, uptime_seconds, health_score')
            .order('last_activity', { ascending: false })
            .limit(10);

        if (error) return {};

        const avgCpu = status.reduce((sum, s) => sum + (s.cpu_usage || 0), 0) / status.length;
        const avgMemory = status.reduce((sum, s) => sum + (s.memory_usage || 0), 0) / status.length;
        const avgHealth = status.reduce((sum, s) => sum + (s.health_score || 0), 0) / status.length;

        return {
            average_cpu_usage: avgCpu,
            average_memory_usage: avgMemory,
            average_health_score: avgHealth,
            active_agents: status.length
        };
    }

    async collectUserExperienceMetrics() {
        // Get recent conversations
        const { data: conversations, error } = await supabase
            .from('agent_conversations')
            .select('response_time_ms, sentiment, confidence_score')
            .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour

        if (error) return {};

        const responseTimes = conversations.map(c => c.response_time_ms).filter(t => t);
        const sentiments = conversations.map(c => c.sentiment).filter(s => s);

        return {
            average_response_time: responseTimes.length > 0 ?
                responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
            positive_sentiment_ratio: sentiments.length > 0 ?
                sentiments.filter(s => s === 'positive').length / sentiments.length : 0,
            average_confidence: conversations.length > 0 ?
                conversations.reduce((sum, c) => sum + (c.confidence_score || 0), 0) / conversations.length : 0,
            conversations_last_hour: conversations.length
        };
    }

    async collectLearningSystemMetrics() {
        // Get recent preference updates
        const { data: preferences, error: prefError } = await supabase
            .from('user_preferences')
            .select('confidence_score')
            .gte('last_updated', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

        if (prefError) return {};

        // Get recent pattern analyses
        const { data: patterns, error: patternError } = await supabase
            .from('user_learning_patterns')
            .select('confidence_score, successful_applications')
            .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

        if (patternError) return {};

        return {
            average_preference_confidence: preferences.length > 0 ?
                preferences.reduce((sum, p) => sum + p.confidence_score, 0) / preferences.length : 0,
            average_pattern_confidence: patterns.length > 0 ?
                patterns.reduce((sum, p) => sum + p.confidence_score, 0) / patterns.length : 0,
            total_pattern_applications: patterns.reduce((sum, p) => sum + p.successful_applications, 0),
            preferences_updated_today: preferences.length,
            patterns_analyzed_today: patterns.length
        };
    }

    async collectDatabasePerformanceMetrics() {
        const startTime = Date.now();

        // Test key queries
        const queries = [
            { name: 'user_count', query: () => supabase.from('users').select('count') },
            { name: 'recent_tasks', query: () => supabase.from('tasks').select('*').limit(100) },
            { name: 'agent_logs', query: () => supabase.from('agent_logs').select('*').limit(100) }
        ];

        const performance = {};

        for (const { name, query } of queries) {
            try {
                const queryStart = Date.now();
                await query();
                performance[name] = Date.now() - queryStart;
            } catch (error) {
                performance[name] = -1; // Error indicator
            }
        }

        performance.total_query_time = Date.now() - startTime;

        return performance;
    }

    async checkAlerts() {
        const latestMetrics = Array.from(this.metrics.values()).pop();
        if (!latestMetrics) return;

        const alerts = [];

        // Check agent performance alerts
        const agentPerf = latestMetrics.agent_performance || {};
        Object.entries(agentPerf).forEach(([agentId, metrics]) => {
            if (metrics.completion_rate < 0.8) {
                alerts.push({
                    type: 'agent_performance',
                    severity: 'warning',
                    message: `Agent ${agentId} completion rate is low: ${(metrics.completion_rate * 100).toFixed(1)}%`,
                    agent_id: agentId,
                    value: metrics.completion_rate
                });
            }
        });

        // Check system resource alerts
        const sysResources = latestMetrics.system_resources || {};
        if (sysResources.average_cpu_usage > 80) {
            alerts.push({
                type: 'system_resources',
                severity: 'critical',
                message: `High CPU usage: ${sysResources.average_cpu_usage.toFixed(1)}%`,
                value: sysResources.average_cpu_usage
            });
        }

        // Check user experience alerts
        const userExp = latestMetrics.user_experience || {};
        if (userExp.average_response_time > 3000) {
            alerts.push({
                type: 'user_experience',
                severity: 'warning',
                message: `Slow response time: ${userExp.average_response_time.toFixed(0)}ms`,
                value: userExp.average_response_time
            });
        }

        // Check database performance alerts
        const dbPerf = latestMetrics.database_performance || {};
        if (dbPerf.total_query_time > 2000) {
            alerts.push({
                type: 'database_performance',
                severity: 'warning',
                message: `Slow database queries: ${dbPerf.total_query_time}ms total`,
                value: dbPerf.total_query_time
            });
        }

        if (alerts.length > 0) {
            console.log('🚨 Alerts Detected:');
            alerts.forEach((alert, index) => {
                console.log(`   ${index + 1}. [${alert.severity.toUpperCase()}] ${alert.message}`);
            });
            console.log('');
        }

        this.alerts.push(...alerts);
    }

    async saveMetrics() {
        const latestMetrics = Array.from(this.metrics.values()).pop();
        if (!latestMetrics) return;

        try {
            // Save key metrics to database
            const metricsToSave = [
                {
                    agent_id: 'system_monitor',
                    task_id: null,
                    metric_type: 'response_time_avg',
                    metric_value: latestMetrics.user_experience?.average_response_time || 0,
                    metric_unit: 'milliseconds',
                    timestamp: new Date(),
                    context: { source: 'real_time_tracker' }
                },
                {
                    agent_id: 'system_monitor',
                    task_id: null,
                    metric_type: 'cpu_usage_avg',
                    metric_value: latestMetrics.system_resources?.average_cpu_usage || 0,
                    metric_unit: 'percentage',
                    timestamp: new Date(),
                    context: { source: 'real_time_tracker' }
                },
                {
                    agent_id: 'system_monitor',
                    task_id: null,
                    metric_type: 'completion_rate_avg',
                    metric_value: Object.values(latestMetrics.agent_performance || {})
                        .reduce((sum, agent) => sum + (agent.completion_rate || 0), 0) /
                        Math.max(1, Object.keys(latestMetrics.agent_performance || {}).length),
                    metric_unit: 'ratio',
                    timestamp: new Date(),
                    context: { source: 'real_time_tracker' }
                }
            ];

            for (const metric of metricsToSave) {
                await supabase
                    .from('agent_metrics')
                    .insert(metric);
            }

        } catch (error) {
            logger.error('Failed to save metrics:', error);
        }
    }

    getLatestMetrics() {
        const latest = Array.from(this.metrics.values()).pop();
        return latest || {};
    }

    getAlerts(since = null) {
        if (!since) return this.alerts;
        return this.alerts.filter(alert => new Date(alert.timestamp) > since);
    }

    getMetricsSummary() {
        const allMetrics = Array.from(this.metrics.values());
        if (allMetrics.length === 0) return {};

        const summary = {
            total_collections: allMetrics.length,
            time_range: {
                start: Array.from(this.metrics.keys())[0],
                end: Array.from(this.metrics.keys()).pop()
            },
            averages: {},
            alerts_count: this.alerts.length
        };

        // Calculate averages for key metrics
        const metricKeys = ['agent_performance', 'system_resources', 'user_experience', 'learning_system', 'database_performance'];

        metricKeys.forEach(key => {
            const values = allMetrics.map(m => m[key]).filter(v => v);
            if (values.length > 0) {
                summary.averages[key] = {};
                const allKeys = new Set();
                values.forEach(v => Object.keys(v).forEach(k => allKeys.add(k)));

                allKeys.forEach(metricKey => {
                    const metricValues = values.map(v => v[metricKey]).filter(v => typeof v === 'number');
                    if (metricValues.length > 0) {
                        summary.averages[key][metricKey] = metricValues.reduce((a, b) => a + b, 0) / metricValues.length;
                    }
                });
            }
        });

        return summary;
    }
}

// Export for use in other modules
module.exports = { RealTimeMetricsTracker };

// CLI usage
if (require.main === module) {
    const tracker = new RealTimeMetricsTracker();

    // Handle command line arguments
    const args = process.argv.slice(2);

    if (args.includes('--start')) {
        const interval = args.includes('--interval') ?
            parseInt(args[args.indexOf('--interval') + 1]) * 1000 : 30000;
        tracker.startTracking(interval);
    } else if (args.includes('--summary')) {
        const summary = tracker.getMetricsSummary();
        console.log('📊 Metrics Summary:', JSON.stringify(summary, null, 2));
    } else {
        console.log('Usage:');
        console.log('  --start [--interval <seconds>]  Start real-time tracking');
        console.log('  --summary                        Show metrics summary');
        process.exit(1);
    }
}
