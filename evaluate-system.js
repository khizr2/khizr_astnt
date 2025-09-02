const { supabase } = require('./database/connection');
const { logger } = require('./utils/logger');
const fs = require('fs').promises;

// Environment validation following their pattern
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    logger.error('Missing required environment variables for system evaluation');
    process.exit(1);
}

class SystemEvaluator {
    constructor() {
        this.metrics = {};
        this.startTime = Date.now();
        this.queryTimeout = 30000; // 30 second timeout for queries
    }

    async runFullEvaluation() {
        logger.info('Starting Khizr Agentic System Evaluation', {
            timestamp: new Date().toISOString(),
            service: 'system_evaluator'
        });

        console.log('🚀 Starting Khizr Agentic System Evaluation...\n');

        try {
            // Test database connection first
            await this.validateConnection();

            // 1. Agent Performance Analysis
            logger.info('Starting agent performance evaluation');
            await this.evaluateAgentPerformance();

            // 2. Database Performance Check
            logger.info('Starting database performance evaluation');
            await this.evaluateDatabasePerformance();

            // 3. User Satisfaction Analysis
            logger.info('Starting user satisfaction evaluation');
            await this.evaluateUserSatisfaction();

            // 4. Learning Accuracy Assessment
            logger.info('Starting learning accuracy evaluation');
            await this.evaluateLearningAccuracy();

            // 5. System Health Score
            logger.info('Calculating system health score');
            this.calculateSystemHealthScore();

            // 6. Generate Recommendations
            logger.info('Generating recommendations');
            this.generateRecommendations();

            const duration = Date.now() - this.startTime;
            logger.info('System evaluation completed successfully', {
                duration_ms: duration,
                metrics_collected: Object.keys(this.metrics).length
            });

        } catch (error) {
            const duration = Date.now() - this.startTime;
            logger.error('System evaluation failed', {
                error: error.message,
                stack: error.stack,
                duration_ms: duration
            });
            console.error('❌ Evaluation failed:', error.message);
            throw error;
        }
    }

    async validateConnection() {
        try {
            const { error } = await supabase
                .from('users')
                .select('count')
                .limit(1);

            if (error) {
                throw new Error(`Database connection validation failed: ${error.message}`);
            }

            logger.info('Database connection validated successfully');
        } catch (error) {
            logger.error('Database connection validation failed', { error: error.message });
            throw error;
        }
    }

    async evaluateAgentPerformance() {
        console.log('📊 Evaluating Agent Performance...');

        try {
            // Use Promise.all for parallel queries to improve performance
            const [agentsResult, tasksResult] = await Promise.allSettled([
                supabase
                    .from('agents')
                    .select('id, type, is_active')
                    .eq('is_active', true),
                supabase
                    .from('agent_tasks')
                    .select('agent_id, status, created_at')
                    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            ]);

            if (agentsResult.status === 'rejected' || tasksResult.status === 'rejected') {
                const error = agentsResult.reason || tasksResult.reason;
                logger.error('Agent performance evaluation failed', {
                    error: error.message,
                    agents_error: agentsResult.reason?.message,
                    tasks_error: tasksResult.reason?.message
                });
                console.error('❌ Agent performance evaluation failed:', error.message);
                return;
            }

            const { data: agents, error: agentError } = agentsResult.value;
            const { data: tasks, error: taskError } = tasksResult.value;

            if (agentError) {
                logger.error('Agent query failed', { error: agentError.message });
                console.error('❌ Agent query failed:', agentError.message);
                return;
            }

            if (taskError) {
                logger.error('Task query failed', { error: taskError.message });
                console.error('❌ Task query failed:', taskError.message);
                return;
            }

            // Calculate completion rates by agent type using Map for better performance
            const agentStats = new Map();
            const agentTypeCount = new Map();

            // Count agents by type
            agents.forEach(agent => {
                agentTypeCount.set(agent.type, (agentTypeCount.get(agent.type) || 0) + 1);
            });

            // Calculate task completion rates
            const taskStats = new Map();
            tasks.forEach(task => {
                if (!taskStats.has(task.agent_id)) {
                    taskStats.set(task.agent_id, { total: 0, completed: 0 });
                }
                const stats = taskStats.get(task.agent_id);
                stats.total++;
                if (task.status === 'completed') {
                    stats.completed++;
                }
            });

            // Combine agent and task data
            agents.forEach(agent => {
                const taskData = taskStats.get(agent.id) || { total: 0, completed: 0 };
                const completionRate = taskData.total > 0 ? (taskData.completed / taskData.total * 100) : 0;

                agentStats.set(agent.type, {
                    count: agentTypeCount.get(agent.type),
                    completionRate: parseFloat(completionRate.toFixed(1)),
                    totalTasks: taskData.total,
                    completedTasks: taskData.completed
                });
            });

            this.metrics.agentPerformance = Object.fromEntries(agentStats);

            logger.info('Agent performance evaluation completed', {
                agent_types: agentStats.size,
                total_agents: agents.length,
                total_tasks: tasks.length
            });

            console.log('✅ Agent Performance Results:');
            agentStats.forEach((stats, type) => {
                console.log(`   ${type}: ${stats.completionRate}% completion (${stats.completedTasks}/${stats.totalTasks} tasks)`);
            });
            console.log('');

        } catch (error) {
            logger.error('Agent performance evaluation error', {
                error: error.message,
                stack: error.stack
            });
            console.error('❌ Agent performance evaluation error:', error.message);
        }
    }

    async evaluateDatabasePerformance() {
        console.log('🗄️  Evaluating Database Performance...');

        try {
            // Test query performance with Promise.allSettled for parallel execution
            const queryConfigs = [
                { name: 'User Count', query: () => supabase.from('users').select('count').limit(1) },
                { name: 'Recent Tasks', query: () => supabase.from('tasks').select('*').limit(100) },
                { name: 'Agent Logs', query: () => supabase.from('agent_logs').select('*').limit(100) },
                { name: 'User Preferences', query: () => supabase.from('user_preferences').select('*').limit(100) }
            ];

            const results = await Promise.allSettled(
                queryConfigs.map(async ({ name, query }) => {
                    const queryStart = Date.now();
                    try {
                        const result = await Promise.race([
                            query(),
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error('Query timeout')), this.queryTimeout)
                            )
                        ]);
                        const queryTime = Date.now() - queryStart;
                        return { name, time: queryTime, success: !result.error, error: result.error?.message };
                    } catch (error) {
                        const queryTime = Date.now() - queryStart;
                        return { name, time: queryTime, success: false, error: error.message };
                    }
                })
            );

            const performance = {};

            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    performance[result.value.name] = {
                        time: result.value.time,
                        success: result.value.success,
                        error: result.value.error
                    };
                } else {
                    performance[result.reason.name || 'Unknown'] = {
                        time: 0,
                        success: false,
                        error: result.reason.message
                    };
                }
            });

            // Calculate overall performance metrics
            const successfulQueries = Object.values(performance).filter(p => p.success).length;
            const totalQueries = Object.keys(performance).length;
            const avgQueryTime = Object.values(performance)
                .filter(p => p.success)
                .reduce((sum, p) => sum + p.time, 0) / successfulQueries;

            performance.summary = {
                successRate: (successfulQueries / totalQueries * 100).toFixed(1),
                averageQueryTime: avgQueryTime.toFixed(0),
                totalQueries: totalQueries,
                successfulQueries: successfulQueries
            };

            this.metrics.databasePerformance = performance;

            logger.info('Database performance evaluation completed', {
                success_rate: performance.summary.successRate,
                avg_query_time: performance.summary.averageQueryTime,
                total_queries: totalQueries
            });

            console.log('✅ Database Performance Results:');
            Object.entries(performance).forEach(([name, stats]) => {
                if (name !== 'summary') {
                    const status = stats.success ? '✅' : '❌';
                    console.log(`   ${name}: ${stats.time}ms ${status}`);
                }
            });
            console.log(`   Summary: ${performance.summary.successRate}% success rate, ${performance.summary.averageQueryTime}ms avg`);
            console.log('');

        } catch (error) {
            logger.error('Database performance evaluation error', {
                error: error.message,
                stack: error.stack
            });
            console.error('❌ Database performance evaluation error:', error.message);
        }
    }

    async evaluateUserSatisfaction() {
        console.log('😊 Evaluating User Satisfaction...');

        try {
            const { data: conversations, error } = await supabase
                .from('agent_conversations')
                .select('sentiment, confidence_score, response_time_ms')
                .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

            if (error) {
                logger.error('User satisfaction query failed', { error: error.message });
                console.error('❌ Conversation query failed:', error.message);
                return;
            }

            // Use Map for better performance when counting
            const sentimentStats = new Map([
                ['positive', 0],
                ['negative', 0],
                ['neutral', 0]
            ]);

            const responseTimes = [];
            let totalConfidence = 0;
            let confidenceCount = 0;

            conversations.forEach(conv => {
                if (conv.sentiment && sentimentStats.has(conv.sentiment)) {
                    sentimentStats.set(conv.sentiment, sentimentStats.get(conv.sentiment) + 1);
                }
                if (conv.response_time_ms) {
                    responseTimes.push(conv.response_time_ms);
                }
                if (conv.confidence_score) {
                    totalConfidence += conv.confidence_score;
                    confidenceCount++;
                }
            });

            const avgResponseTime = responseTimes.length > 0 ?
                responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
            const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

            // Calculate percentiles more efficiently
            responseTimes.sort((a, b) => a - b);
            const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)] || 0;
            const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
            const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;

            this.metrics.userSatisfaction = {
                sentimentStats: Object.fromEntries(sentimentStats),
                total: conversations.length,
                avgResponseTime: Math.round(avgResponseTime),
                avgConfidence: parseFloat(avgConfidence.toFixed(3)),
                responseTimeStats: {
                    p50,
                    p95,
                    p99,
                    min: responseTimes[0] || 0,
                    max: responseTimes[responseTimes.length - 1] || 0
                }
            };

            logger.info('User satisfaction evaluation completed', {
                total_conversations: conversations.length,
                avg_response_time: avgResponseTime,
                avg_confidence: avgConfidence
            });

            console.log('✅ User Satisfaction Results:');
            console.log(`   Sentiment Distribution: ${sentimentStats.get('positive')} positive, ${sentimentStats.get('negative')} negative, ${sentimentStats.get('neutral')} neutral`);
            console.log(`   Average Response Time: ${avgResponseTime.toFixed(0)}ms (P95: ${p95}ms)`);
            console.log(`   Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
            console.log('');

        } catch (error) {
            logger.error('User satisfaction evaluation error', {
                error: error.message,
                stack: error.stack
            });
            console.error('❌ User satisfaction evaluation error:', error.message);
        }
    }

    async evaluateLearningAccuracy() {
        console.log('🧠 Evaluating Learning Accuracy...');

        try {
            // Parallel queries for better performance
            const [prefResult, patternResult] = await Promise.allSettled([
                supabase
                    .from('user_preferences')
                    .select('confidence_score, usage_count, last_updated'),
                supabase
                    .from('user_learning_patterns')
                    .select('confidence_score, successful_applications')
            ]);

            if (prefResult.status === 'rejected' || patternResult.status === 'rejected') {
                const error = prefResult.reason || patternResult.reason;
                logger.error('Learning accuracy evaluation failed', {
                    error: error.message,
                    pref_error: prefResult.reason?.message,
                    pattern_error: patternResult.reason?.message
                });
                console.error('❌ Learning accuracy evaluation failed:', error.message);
                return;
            }

            const { data: preferences, error: prefError } = prefResult.value;
            const { data: patterns, error: patternError } = patternResult.value;

            if (prefError) {
                logger.error('Preferences query failed', { error: prefError.message });
                console.error('❌ Preferences query failed:', prefError.message);
                return;
            }

            if (patternError) {
                logger.error('Patterns query failed', { error: patternError.message });
                console.error('❌ Patterns query failed:', patternError.message);
                return;
            }

            // Calculate preference statistics efficiently
            const prefStats = {
                total: preferences.length,
                highConfidence: 0,
                avgConfidence: 0,
                avgUsage: 0,
                recentUpdates: 0
            };

            if (preferences.length > 0) {
                let totalConfidence = 0;
                let totalUsage = 0;
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

                preferences.forEach(pref => {
                    totalConfidence += pref.confidence_score || 0;
                    totalUsage += pref.usage_count || 0;

                    if ((pref.confidence_score || 0) > 0.8) {
                        prefStats.highConfidence++;
                    }

                    if (pref.last_updated && new Date(pref.last_updated) > sevenDaysAgo) {
                        prefStats.recentUpdates++;
                    }
                });

                prefStats.avgConfidence = totalConfidence / preferences.length;
                prefStats.avgUsage = totalUsage / preferences.length;
            }

            // Calculate pattern statistics efficiently
            const patternStats = {
                total: patterns.length,
                highConfidence: 0,
                avgConfidence: 0,
                totalApplications: 0
            };

            if (patterns.length > 0) {
                let totalConfidence = 0;

                patterns.forEach(pattern => {
                    totalConfidence += pattern.confidence_score || 0;
                    patternStats.totalApplications += pattern.successful_applications || 0;

                    if ((pattern.confidence_score || 0) > 0.8) {
                        patternStats.highConfidence++;
                    }
                });

                patternStats.avgConfidence = totalConfidence / patterns.length;
            }

            this.metrics.learningAccuracy = { prefStats, patternStats };

            logger.info('Learning accuracy evaluation completed', {
                preferences_total: prefStats.total,
                patterns_total: patternStats.total,
                pref_avg_confidence: prefStats.avgConfidence,
                pattern_avg_confidence: patternStats.avgConfidence
            });

            console.log('✅ Learning Accuracy Results:');
            console.log(`   Preferences: ${prefStats.highConfidence}/${prefStats.total} high confidence (${(prefStats.avgConfidence * 100).toFixed(1)}% avg)`);
            console.log(`   Patterns: ${patternStats.highConfidence}/${patternStats.total} high confidence (${(patternStats.avgConfidence * 100).toFixed(1)}% avg)`);
            console.log(`   Recent Updates: ${prefStats.recentUpdates} preferences updated in last 7 days`);
            console.log('');

        } catch (error) {
            logger.error('Learning accuracy evaluation error', {
                error: error.message,
                stack: error.stack
            });
            console.error('❌ Learning accuracy evaluation error:', error.message);
        }
    }

    calculateSystemHealthScore() {
        console.log('🏥 Calculating System Health Score...');

        let score = 0;
        let maxScore = 0;

        // Agent performance (40 points)
        if (this.metrics.agentPerformance) {
            maxScore += 40;
            const avgCompletion = Object.values(this.metrics.agentPerformance)
                .reduce((sum, agent) => sum + parseFloat(agent.completionRate), 0) /
                Object.keys(this.metrics.agentPerformance).length;
            score += (avgCompletion / 100) * 40;
        }

        // Database performance (20 points)
        if (this.metrics.databasePerformance) {
            maxScore += 20;
            const successfulQueries = Object.values(this.metrics.databasePerformance)
                .filter(q => q.success).length;
            const totalQueries = Object.keys(this.metrics.databasePerformance).length;
            score += (successfulQueries / totalQueries) * 20;
        }

        // User satisfaction (25 points)
        if (this.metrics.userSatisfaction) {
            maxScore += 25;
            const positiveRatio = this.metrics.userSatisfaction.sentimentStats.positive /
                this.metrics.userSatisfaction.sentimentStats.total;
            score += positiveRatio * 25;
        }

        // Learning accuracy (15 points)
        if (this.metrics.learningAccuracy) {
            maxScore += 15;
            const avgConfidence = (this.metrics.learningAccuracy.prefStats.avgConfidence +
                this.metrics.learningAccuracy.patternStats.avgConfidence) / 2;
            score += avgConfidence * 15;
        }

        const healthScore = maxScore > 0 ? (score / maxScore * 100).toFixed(1) : 0;

        this.metrics.systemHealth = {
            score: healthScore,
            breakdown: {
                agentPerformance: this.metrics.agentPerformance ? ((Object.values(this.metrics.agentPerformance)
                    .reduce((sum, agent) => sum + parseFloat(agent.completionRate), 0) /
                    Object.keys(this.metrics.agentPerformance).length) / 100 * 40).toFixed(1) : 0,
                databasePerformance: this.metrics.databasePerformance ? ((Object.values(this.metrics.databasePerformance)
                    .filter(q => q.success).length / Object.keys(this.metrics.databasePerformance).length) * 20).toFixed(1) : 0,
                userSatisfaction: this.metrics.userSatisfaction ? ((this.metrics.userSatisfaction.sentimentStats.positive /
                    this.metrics.userSatisfaction.sentimentStats.total) * 25).toFixed(1) : 0,
                learningAccuracy: this.metrics.learningAccuracy ? (((this.metrics.learningAccuracy.prefStats.avgConfidence +
                    this.metrics.learningAccuracy.patternStats.avgConfidence) / 2) * 15).toFixed(1) : 0
            }
        };

        console.log(`✅ System Health Score: ${healthScore}/100`);
        console.log('   Breakdown:');
        Object.entries(this.metrics.systemHealth.breakdown).forEach(([category, points]) => {
            console.log(`   - ${category}: ${points} points`);
        });
        console.log('');
    }

    generateRecommendations() {
        console.log('💡 Generating Recommendations...\n');

        const recommendations = [];

        // Agent performance recommendations
        if (this.metrics.agentPerformance) {
            Object.entries(this.metrics.agentPerformance).forEach(([type, stats]) => {
                if (parseFloat(stats.completionRate) < 80) {
                    recommendations.push({
                        category: 'Agent Performance',
                        priority: 'High',
                        issue: `${type} completion rate is low (${stats.completionRate}%)`,
                        solution: 'Review agent task assignment logic and resource allocation'
                    });
                }
            });
        }

        // Database performance recommendations
        if (this.metrics.databasePerformance) {
            Object.entries(this.metrics.databasePerformance).forEach(([query, stats]) => {
                if (stats.time > 1000) {
                    recommendations.push({
                        category: 'Database Performance',
                        priority: 'Medium',
                        issue: `${query} query is slow (${stats.time}ms)`,
                        solution: 'Add database indexes or optimize query structure'
                    });
                }
            });
        }

        // User satisfaction recommendations
        if (this.metrics.userSatisfaction) {
            if (this.metrics.userSatisfaction.avgResponseTime > 2000) {
                recommendations.push({
                    category: 'User Experience',
                    priority: 'High',
                    issue: `Average response time is high (${this.metrics.userSatisfaction.avgResponseTime}ms)`,
                    solution: 'Implement response caching and optimize AI model selection'
                });
            }
        }

        // Learning accuracy recommendations
        if (this.metrics.learningAccuracy) {
            if (this.metrics.learningAccuracy.prefStats.avgConfidence < 0.7) {
                recommendations.push({
                    category: 'Learning System',
                    priority: 'Medium',
                    issue: 'User preference confidence is low',
                    solution: 'Increase preference learning sample size and improve pattern recognition'
                });
            }
        }

        if (recommendations.length === 0) {
            console.log('🎉 No critical issues found! System is performing well.');
        } else {
            console.log('📋 Priority Recommendations:');
            recommendations.forEach((rec, index) => {
                console.log(`${index + 1}. [${rec.priority}] ${rec.category}: ${rec.issue}`);
                console.log(`   Solution: ${rec.solution}\n`);
            });
        }

        // Save evaluation results
        this.saveEvaluationResults();
    }

    async saveEvaluationResults() {
        try {
            const evaluationData = {
                timestamp: new Date().toISOString(),
                duration_ms: Date.now() - this.startTime,
                metrics: this.metrics,
                system_info: {
                    node_version: process.version,
                    platform: process.platform,
                    memory_usage: process.memoryUsage()
                }
            };

            const filename = `evaluation-results-${new Date().toISOString().split('T')[0]}.json`;
            await fs.writeFile(filename, JSON.stringify(evaluationData, null, 2));

            logger.info('Evaluation results saved successfully', {
                filename,
                file_size_kb: (JSON.stringify(evaluationData).length / 1024).toFixed(2)
            });

            console.log(`💾 Evaluation results saved to ${filename}`);
        } catch (error) {
            logger.error('Failed to save evaluation results', {
                error: error.message,
                stack: error.stack
            });
            console.error('❌ Failed to save evaluation results:', error.message);
        }
    }
}

// Run evaluation if called directly
if (require.main === module) {
    const evaluator = new SystemEvaluator();
    evaluator.runFullEvaluation().then(() => {
        console.log('✅ System evaluation completed!');
        process.exit(0);
    }).catch((error) => {
        console.error('❌ Evaluation failed:', error);
        process.exit(1);
    });
}

module.exports = { SystemEvaluator };
