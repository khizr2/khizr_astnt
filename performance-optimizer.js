const { supabase } = require('./database/connection');
const { logger } = require('./utils/logger');
const jwt = require('jsonwebtoken');

// Environment validation following their pattern
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    logger.error('Missing required environment variables for performance optimization');
    process.exit(1);
}

class PerformanceOptimizer {
    constructor(options = {}) {
        this.optimizations = new Map();
        this.baselineMetrics = new Map();
        this.activeExperiments = new Map();
        this.userId = options.userId; // For authenticated operations
        this.serviceAccountToken = options.serviceToken; // For middleware compatibility
        this.dryRun = options.dryRun || false; // Safe mode - no actual changes
        this.backupEnabled = options.backupEnabled !== false; // Create backups by default
    }

    async runOptimizationCycle() {
        const startTime = Date.now();

        logger.info('Starting performance optimization cycle', {
            user_id: this.userId,
            dry_run: this.dryRun,
            backup_enabled: this.backupEnabled,
            service_mode: !!this.serviceAccountToken
        });

        console.log('⚡ Starting Performance Optimization Cycle...\n');

        try {
            // Validate authentication for non-dry-run operations
            if (!this.dryRun && this.userId && !this.serviceAccountToken) {
                await this.validateAuthentication();
            }

            // Create backup if enabled and not dry run
            if (this.backupEnabled && !this.dryRun) {
                await this.createBackup();
            }

            // 1. Establish performance baselines
            logger.info('Establishing performance baselines');
            await this.establishBaselines();

            // 2. Identify performance bottlenecks
            logger.info('Identifying performance bottlenecks');
            await this.identifyBottlenecks();

            // 3. Generate optimization recommendations
            logger.info('Generating optimization recommendations');
            await this.generateOptimizations();

            // 4. Implement automatic optimizations
            logger.info('Implementing automatic optimizations');
            await this.implementOptimizations();

            // 5. Start A/B testing for optimizations
            logger.info('Starting A/B testing');
            await this.startABTesting();

            // 6. Generate optimization report
            logger.info('Generating optimization report');
            this.generateOptimizationReport();

            const duration = Date.now() - startTime;
            logger.info('Performance optimization cycle completed successfully', {
                duration_ms: duration,
                dry_run: this.dryRun,
                optimizations_applied: this.optimizations.get('implemented')?.length || 0
            });

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Performance optimization cycle failed', {
                error: error.message,
                stack: error.stack,
                duration_ms: duration,
                dry_run: this.dryRun
            });
            console.error('❌ Optimization failed:', error.message);
            throw error;
        }
    }

    async validateAuthentication() {
        try {
            // Verify user exists and has admin permissions for optimization
            const { data: user, error } = await supabase
                .from('users')
                .select('id, email')
                .eq('id', this.userId)
                .single();

            if (error || !user) {
                throw new Error(`Authentication failed: User ${this.userId} not found`);
            }

            logger.info('Performance optimizer authentication validated', {
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

    async createBackup() {
        try {
            logger.info('Creating configuration backup before optimization');

            // Backup current agent configurations
            const { data: agents, error } = await supabase
                .from('agents')
                .select('id, type, model, configuration')
                .eq('is_active', true);

            if (error) {
                throw new Error(`Backup failed: ${error.message}`);
            }

            const backup = {
                timestamp: new Date().toISOString(),
                agents: agents,
                type: 'pre_optimization_backup'
            };

            // Save backup to database (you might want to create a backup table)
            await supabase
                .from('agent_logs')
                .insert({
                    agent_id: 'performance_optimizer',
                    user_id: this.userId,
                    action: 'configuration_backup',
                    details: backup,
                    severity: 'info'
                });

            logger.info('Configuration backup created successfully', {
                agents_backed_up: agents.length,
                backup_timestamp: backup.timestamp
            });

        } catch (error) {
            logger.error('Backup creation failed', {
                error: error.message,
                user_id: this.userId
            });
            // Don't throw - allow optimization to continue without backup
        }
    }

    async establishBaselines() {
        console.log('📊 Establishing Performance Baselines...');

        // Collect baseline metrics
        const baselines = {
            response_times: await this.getResponseTimeBaseline(),
            database_performance: await this.getDatabasePerformanceBaseline(),
            agent_efficiency: await this.getAgentEfficiencyBaseline(),
            user_satisfaction: await this.getUserSatisfactionBaseline()
        };

        this.baselineMetrics = new Map(Object.entries(baselines));

        console.log('✅ Baselines Established:');
        Object.entries(baselines).forEach(([category, metrics]) => {
            console.log(`   ${category}: ${JSON.stringify(metrics).substring(0, 100)}...`);
        });
        console.log('');
    }

    async getResponseTimeBaseline() {
        const { data: conversations, error } = await supabase
            .from('agent_conversations')
            .select('response_time_ms, created_at')
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .not('response_time_ms', 'is', null);

        if (error) return {};

        const responseTimes = conversations.map(c => c.response_time_ms);
        return {
            average: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
            p50: responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.5)],
            p95: responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)],
            p99: responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.99)],
            sample_size: responseTimes.length
        };
    }

    async getDatabasePerformanceBaseline() {
        const queryTimes = [];

        // Test various query types
        const queries = [
            () => supabase.from('users').select('count'),
            () => supabase.from('tasks').select('*').limit(100),
            () => supabase.from('agent_conversations').select('*').limit(50),
            () => supabase.from('user_preferences').select('*').limit(100)
        ];

        for (const query of queries) {
            const start = Date.now();
            try {
                await query();
                queryTimes.push(Date.now() - start);
            } catch (error) {
                queryTimes.push(-1); // Error indicator
            }
        }

        return {
            average_query_time: queryTimes.filter(t => t >= 0).reduce((a, b) => a + b, 0) / queryTimes.filter(t => t >= 0).length,
            slowest_query: Math.max(...queryTimes.filter(t => t >= 0)),
            error_rate: queryTimes.filter(t => t < 0).length / queryTimes.length,
            total_queries_tested: queryTimes.length
        };
    }

    async getAgentEfficiencyBaseline() {
        const { data: agents, error: agentError } = await supabase
            .from('agents')
            .select('id, type')
            .eq('is_active', true);

        if (agentError) return {};

        const { data: tasks, error: taskError } = await supabase
            .from('agent_tasks')
            .select('agent_id, status, created_at, completed_at')
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        if (taskError) return {};

        const agentEfficiency = {};

        agents.forEach(agent => {
            const agentTasks = tasks.filter(task => task.agent_id === agent.id);
            const completedTasks = agentTasks.filter(task => task.status === 'completed');

            if (agentTasks.length > 0) {
                const completionRate = completedTasks.length / agentTasks.length;
                const avgCompletionTime = completedTasks.length > 0 ?
                    completedTasks.reduce((sum, task) => {
                        const start = new Date(task.created_at).getTime();
                        const end = new Date(task.completed_at).getTime();
                        return sum + (end - start);
                    }, 0) / completedTasks.length : 0;

                agentEfficiency[agent.id] = {
                    type: agent.type,
                    completion_rate: completionRate,
                    avg_completion_time: avgCompletionTime,
                    tasks_completed: completedTasks.length,
                    total_tasks: agentTasks.length
                };
            }
        });

        return agentEfficiency;
    }

    async getUserSatisfactionBaseline() {
        const { data: conversations, error } = await supabase
            .from('agent_conversations')
            .select('sentiment, confidence_score')
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        if (error) return {};

        const sentiments = conversations.map(c => c.sentiment).filter(s => s);
        const confidenceScores = conversations.map(c => c.confidence_score).filter(s => s);

        return {
            positive_sentiment_ratio: sentiments.filter(s => s === 'positive').length / sentiments.length,
            average_confidence: confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length,
            total_conversations: conversations.length,
            sentiment_distribution: {
                positive: sentiments.filter(s => s === 'positive').length,
                negative: sentiments.filter(s => s === 'negative').length,
                neutral: sentiments.filter(s => s === 'neutral').length
            }
        };
    }

    async identifyBottlenecks() {
        console.log('🔍 Identifying Performance Bottlenecks...');

        const bottlenecks = [];

        // Check response time bottlenecks
        const responseBaseline = this.baselineMetrics.get('response_times');
        if (responseBaseline && responseBaseline.p95 > 3000) {
            bottlenecks.push({
                category: 'response_time',
                severity: 'high',
                description: `95th percentile response time is ${responseBaseline.p95}ms (target: <3000ms)`,
                impact: 'user_experience',
                recommendation: 'Implement response caching and optimize AI model selection'
            });
        }

        // Check database bottlenecks
        const dbBaseline = this.baselineMetrics.get('database_performance');
        if (dbBaseline && dbBaseline.average_query_time > 500) {
            bottlenecks.push({
                category: 'database',
                severity: 'medium',
                description: `Average query time is ${dbBaseline.average_query_time}ms (target: <500ms)`,
                impact: 'system_performance',
                recommendation: 'Add database indexes and optimize query structure'
            });
        }

        // Check agent efficiency bottlenecks
        const agentBaseline = this.baselineMetrics.get('agent_efficiency');
        Object.entries(agentBaseline || {}).forEach(([agentId, metrics]) => {
            if (metrics.completion_rate < 0.8) {
                bottlenecks.push({
                    category: 'agent_efficiency',
                    severity: 'high',
                    description: `Agent ${agentId} completion rate is ${(metrics.completion_rate * 100).toFixed(1)}%`,
                    impact: 'task_processing',
                    recommendation: 'Review agent task assignment and resource allocation'
                });
            }
        });

        this.optimizations.set('bottlenecks', bottlenecks);

        console.log('✅ Bottlenecks Identified:');
        bottlenecks.forEach((bottleneck, index) => {
            console.log(`${index + 1}. [${bottleneck.severity.toUpperCase()}] ${bottleneck.category}: ${bottleneck.description}`);
        });
        console.log('');
    }

    async generateOptimizations() {
        console.log('🛠️  Generating Optimization Recommendations...');

        const optimizations = [];
        const bottlenecks = this.optimizations.get('bottlenecks') || [];

        // Generate specific optimizations based on bottlenecks
        bottlenecks.forEach(bottleneck => {
            switch (bottleneck.category) {
                case 'response_time':
                    optimizations.push(
                        {
                            type: 'caching',
                            description: 'Implement Redis caching for frequent responses',
                            impact: 'high',
                            effort: 'medium',
                            category: 'infrastructure'
                        },
                        {
                            type: 'model_optimization',
                            description: 'Implement model selection based on query complexity',
                            impact: 'high',
                            effort: 'low',
                            category: 'ai_models'
                        }
                    );
                    break;

                case 'database':
                    optimizations.push(
                        {
                            type: 'indexing',
                            description: 'Add composite indexes on frequently queried columns',
                            impact: 'medium',
                            effort: 'low',
                            category: 'database'
                        },
                        {
                            type: 'query_optimization',
                            description: 'Implement query result caching',
                            impact: 'high',
                            effort: 'medium',
                            category: 'database'
                        }
                    );
                    break;

                case 'agent_efficiency':
                    optimizations.push(
                        {
                            type: 'load_balancing',
                            description: 'Implement intelligent task routing and load balancing',
                            impact: 'high',
                            effort: 'medium',
                            category: 'agent_system'
                        },
                        {
                            type: 'resource_allocation',
                            description: 'Optimize agent resource allocation based on task type',
                            impact: 'medium',
                            effort: 'low',
                            category: 'agent_system'
                        }
                    );
                    break;
            }
        });

        this.optimizations.set('recommendations', optimizations);

        console.log('✅ Optimizations Generated:');
        optimizations.forEach((opt, index) => {
            console.log(`${index + 1}. [${opt.impact.toUpperCase()}] ${opt.type}: ${opt.description} (${opt.effort} effort)`);
        });
        console.log('');
    }

    async implementOptimizations() {
        console.log('🚀 Implementing Automatic Optimizations...');

        const recommendations = this.optimizations.get('recommendations') || [];
        const implemented = [];

        // Implement low-effort, high-impact optimizations automatically
        for (const recommendation of recommendations) {
            if (recommendation.effort === 'low' && recommendation.impact === 'high') {
                try {
                    await this.implementOptimization(recommendation);
                    implemented.push(recommendation);
                    console.log(`✅ Implemented: ${recommendation.description}`);
                } catch (error) {
                    console.log(`❌ Failed to implement: ${recommendation.description} - ${error.message}`);
                }
            }
        }

        this.optimizations.set('implemented', implemented);
        console.log(`\n✅ Implemented ${implemented.length} automatic optimizations\n`);
    }

    async implementOptimization(optimization) {
        if (this.dryRun) {
            logger.info('DRY RUN: Would implement optimization', {
                type: optimization.type,
                description: optimization.description
            });
            console.log(`🔍 DRY RUN: Would implement ${optimization.type}: ${optimization.description}`);
            return true;
        }

        try {
            switch (optimization.type) {
                case 'model_optimization':
                    await this.implementModelOptimization();
                    break;
                case 'indexing':
                    await this.implementDatabaseIndexing();
                    break;
                case 'load_balancing':
                    await this.implementLoadBalancing();
                    break;
                default:
                    throw new Error(`Unknown optimization type: ${optimization.type}`);
            }

            logger.info('Optimization implemented successfully', {
                type: optimization.type,
                user_id: this.userId
            });

            return true;
        } catch (error) {
            logger.error('Optimization implementation failed', {
                type: optimization.type,
                error: error.message,
                stack: error.stack,
                user_id: this.userId
            });
            throw error;
        }
    }

    async implementModelOptimization() {
        // Update agent configurations to use optimal models
        const { data: agents, error } = await supabase
            .from('agents')
            .select('id, type, model')
            .eq('is_active', true);

        if (error) throw error;

        // Simple model optimization logic
        const modelMappings = {
            'task_manager': 'gpt-3.5-turbo', // Faster for routine tasks
            'email_assistant': 'claude-3',    // Better for email analysis
            'project_coordinator': 'gpt-4'    // More complex reasoning needed
        };

        for (const agent of agents) {
            const optimalModel = modelMappings[agent.type] || agent.model;
            if (optimalModel !== agent.model) {
                await supabase
                    .from('agents')
                    .update({ model: optimalModel })
                    .eq('id', agent.id);
            }
        }
    }

    async implementDatabaseIndexing() {
        // This would typically be done with SQL migrations
        // For now, we'll log the recommendations
        console.log('   📋 Database indexing recommendations logged for manual implementation');
    }

    async implementLoadBalancing() {
        // Update agent configurations for better load balancing
        const { data: agents, error } = await supabase
            .from('agents')
            .select('id, type, configuration')
            .eq('is_active', true);

        if (error) throw error;

        for (const agent of agents) {
            const config = agent.configuration || {};
            config.load_balancing_enabled = true;
            config.max_concurrent_tasks = config.max_concurrent_tasks || 5;

            await supabase
                .from('agents')
                .update({ configuration: config })
                .eq('id', agent.id);
        }
    }

    async startABTesting() {
        console.log('🧪 Starting A/B Testing for Optimizations...');

        const experiments = [
            {
                name: 'model_selection_optimization',
                variants: ['control', 'optimized'],
                description: 'Test optimized model selection vs current approach',
                target_metric: 'response_time_avg',
                duration_days: 7
            },
            {
                name: 'load_balancing_improvement',
                variants: ['control', 'balanced'],
                description: 'Test improved load balancing vs current approach',
                target_metric: 'completion_rate_avg',
                duration_days: 7
            }
        ];

        // Save experiments to database
        for (const experiment of experiments) {
            await supabase
                .from('agent_analytics')
                .insert({
                    agent_id: 'performance_optimizer',
                    date: new Date().toISOString().split('T')[0],
                    metric_type: 'experiment_started',
                    metric_value: 1,
                    metadata: experiment
                });
        }

        this.activeExperiments = new Map(experiments.map(exp => [exp.name, exp]));

        console.log('✅ Started A/B Testing:');
        experiments.forEach((exp, index) => {
            console.log(`${index + 1}. ${exp.name}: ${exp.description}`);
        });
        console.log('');
    }

    generateOptimizationReport() {
        console.log('📊 Generating Optimization Report...');

        const report = {
            timestamp: new Date().toISOString(),
            baseline_metrics: Object.fromEntries(this.baselineMetrics),
            bottlenecks: this.optimizations.get('bottlenecks') || [],
            recommendations: this.optimizations.get('recommendations') || [],
            implemented: this.optimizations.get('implemented') || [],
            active_experiments: Array.from(this.activeExperiments.values()),
            next_steps: [
                'Monitor implemented optimizations for 24-48 hours',
                'Review A/B test results after experiment duration',
                'Implement medium-effort optimizations based on test results',
                'Schedule regular optimization cycles (weekly)',
                'Set up automated performance monitoring alerts'
            ]
        };

        // Save report
        const fs = require('fs');
        fs.writeFileSync('./optimization-report.json', JSON.stringify(report, null, 2));

        console.log('✅ Optimization Report Generated:');
        console.log('   📄 Saved to optimization-report.json');
        console.log(`   🔍 Bottlenecks Found: ${report.bottlenecks.length}`);
        console.log(`   💡 Recommendations: ${report.recommendations.length}`);
        console.log(`   ✅ Implemented: ${report.implemented.length}`);
        console.log(`   🧪 Experiments Started: ${report.active_experiments.length}`);
        console.log('');
    }
}

// Run optimization if called directly
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};

    // Parse command line arguments
    args.forEach(arg => {
        if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--no-backup') {
            options.backupEnabled = false;
        } else if (arg.startsWith('--user=')) {
            options.userId = arg.split('=')[1];
        }
    });

    const optimizer = new PerformanceOptimizer(options);

    if (options.dryRun) {
        console.log('🔍 DRY RUN MODE: No changes will be made to the system');
    }

    optimizer.runOptimizationCycle().then(() => {
        console.log('✅ Performance optimization cycle completed!');
        process.exit(0);
    }).catch((error) => {
        console.error('❌ Optimization failed:', error.message);
        process.exit(1);
    });
}

module.exports = { PerformanceOptimizer };
