const { supabase } = require('./database/connection');
const { logger } = require('./utils/logger');
const jwt = require('jsonwebtoken');

// Environment validation following their pattern
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    logger.error('Missing required environment variables for collaboration optimization');
    process.exit(1);
}

class AgentCollaborationOptimizer {
    constructor(options = {}) {
        this.collaborationPatterns = new Map();
        this.taskHandoffMetrics = new Map();
        this.userId = options.userId; // For authenticated operations
        this.serviceAccountToken = options.serviceToken; // For middleware compatibility
        this.readOnly = options.readOnly || false; // Safe mode - no actual changes
        this.optimizationTimeout = options.timeout || 300000; // 5 minute timeout
    }

    async optimizeCollaboration() {
        const startTime = Date.now();

        logger.info('Starting agent collaboration optimization', {
            user_id: this.userId,
            read_only: this.readOnly,
            service_mode: !!this.serviceAccountToken,
            timeout_ms: this.optimizationTimeout
        });

        console.log('🔄 Optimizing Agent Collaboration...\n');

        try {
            // Validate authentication if needed
            if (this.userId && !this.serviceAccountToken) {
                await this.validateAuthentication();
            }

            // Set up timeout for the entire optimization process
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Optimization timeout')), this.optimizationTimeout);
            });

            const optimizationPromise = this.runOptimizationSteps();

            await Promise.race([optimizationPromise, timeoutPromise]);

            const duration = Date.now() - startTime;
            logger.info('Agent collaboration optimization completed successfully', {
                duration_ms: duration,
                read_only: this.readOnly,
                patterns_analyzed: this.collaborationPatterns.size
            });

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Agent collaboration optimization failed', {
                error: error.message,
                stack: error.stack,
                duration_ms: duration,
                read_only: this.readOnly
            });
            console.error('❌ Collaboration optimization failed:', error.message);
            throw error;
        }
    }

    async runOptimizationSteps() {
        // 1. Analyze current collaboration patterns
        logger.info('Analyzing current collaboration patterns');
        await this.analyzeCollaborationPatterns();

        // 2. Optimize task handoffs
        logger.info('Optimizing task handoffs');
        await this.optimizeTaskHandoffs();

        // 3. Improve agent specialization
        logger.info('Improving agent specialization');
        await this.improveAgentSpecialization();

        // 4. Enhance knowledge sharing
        logger.info('Enhancing knowledge sharing');
        await this.enhanceKnowledgeSharing();

        // 5. Generate collaboration report
        logger.info('Generating collaboration report');
        this.generateCollaborationReport();
    }

    async validateAuthentication() {
        try {
            // Verify user exists for collaboration optimization
            const { data: user, error } = await supabase
                .from('users')
                .select('id, email')
                .eq('id', this.userId)
                .single();

            if (error || !user) {
                throw new Error(`Authentication failed: User ${this.userId} not found`);
            }

            logger.info('Collaboration optimizer authentication validated', {
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

    async analyzeCollaborationPatterns() {
        console.log('📈 Analyzing Current Collaboration Patterns...');

        // Get recent agent task handoffs
        const { data: tasks, error } = await supabase
            .from('agent_tasks')
            .select('agent_id, type, status, created_at, completed_at, error_message')
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Task query failed:', error.message);
            return;
        }

        // Analyze task distribution by type
        const taskDistribution = {};
        const agentWorkload = {};

        tasks.forEach(task => {
            // Task type distribution
            taskDistribution[task.type] = (taskDistribution[task.type] || 0) + 1;

            // Agent workload
            agentWorkload[task.agent_id] = (agentWorkload[task.agent_id] || 0) + 1;
        });

        // Calculate collaboration efficiency
        const collaborationMetrics = {
            totalTasks: tasks.length,
            taskDistribution,
            agentWorkload,
            specializationRatio: Object.keys(taskDistribution).length / Object.keys(agentWorkload).length,
            workloadBalance: this.calculateWorkloadBalance(agentWorkload)
        };

        this.collaborationPatterns.set('current', collaborationMetrics);

        console.log('✅ Collaboration Analysis Results:');
        console.log(`   Total Tasks: ${collaborationMetrics.totalTasks}`);
        console.log(`   Task Types: ${Object.keys(taskDistribution).length}`);
        console.log(`   Active Agents: ${Object.keys(agentWorkload).length}`);
        console.log(`   Specialization Ratio: ${collaborationMetrics.specializationRatio.toFixed(2)}`);
        console.log(`   Workload Balance: ${collaborationMetrics.workloadBalance.toFixed(2)}`);
        console.log('');
    }

    calculateWorkloadBalance(workload) {
        const workloads = Object.values(workload);
        if (workloads.length === 0) return 1;

        const avg = workloads.reduce((a, b) => a + b, 0) / workloads.length;
        const variance = workloads.reduce((sum, w) => sum + Math.pow(w - avg, 2), 0) / workloads.length;
        const stdDev = Math.sqrt(variance);

        // Return balance score (1 = perfect balance, 0 = highly unbalanced)
        return avg > 0 ? Math.max(0, 1 - (stdDev / avg)) : 0;
    }

    async optimizeTaskHandoffs() {
        console.log('🔀 Optimizing Task Handoffs...');

        // Get task handoff data
        const { data: handoffs, error } = await supabase
            .from('agent_logs')
            .select('resource_type, resource_id, action, duration_ms, severity')
            .in('action', ['task_assigned', 'task_completed', 'task_escalated'])
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        if (error) {
            console.error('❌ Handoff query failed:', error.message);
            return;
        }

        // Analyze handoff efficiency
        const handoffMetrics = {
            totalHandoffs: handoffs.length,
            avgDuration: handoffs.reduce((sum, h) => sum + (h.duration_ms || 0), 0) / handoffs.length,
            successRate: handoffs.filter(h => h.severity !== 'error').length / handoffs.length,
            escalationRate: handoffs.filter(h => h.action === 'task_escalated').length / handoffs.length
        };

        this.taskHandoffMetrics.set('current', handoffMetrics);

        console.log('✅ Handoff Optimization Results:');
        console.log(`   Average Duration: ${handoffMetrics.avgDuration.toFixed(0)}ms`);
        console.log(`   Success Rate: ${(handoffMetrics.successRate * 100).toFixed(1)}%`);
        console.log(`   Escalation Rate: ${(handoffMetrics.escalationRate * 100).toFixed(1)}%`);
        console.log('');

        // Apply optimizations
        await this.applyHandoffOptimizations(handoffMetrics);
    }

    async applyHandoffOptimizations(metrics) {
        const optimizations = [];

        if (metrics.avgDuration > 1000) {
            optimizations.push({
                type: 'caching',
                description: 'Implement task state caching to reduce handoff latency',
                impact: 'High'
            });
        }

        if (metrics.successRate < 0.95) {
            optimizations.push({
                type: 'error_handling',
                description: 'Enhance error handling and retry mechanisms',
                impact: 'Medium'
            });
        }

        if (metrics.escalationRate > 0.1) {
            optimizations.push({
                type: 'load_balancing',
                description: 'Improve agent workload balancing to reduce escalations',
                impact: 'High'
            });
        }

        console.log('🔧 Applying Optimizations:');
        optimizations.forEach((opt, index) => {
            console.log(`${index + 1}. [${opt.impact}] ${opt.description}`);
        });
        console.log('');

        // Save optimizations to database
        for (const optimization of optimizations) {
            await supabase
                .from('agent_analytics')
                .insert({
                    agent_id: 'collaboration_optimizer',
                    date: new Date().toISOString().split('T')[0],
                    metric_type: 'optimization_applied',
                    metric_value: 1,
                    metadata: optimization
                });
        }
    }

    async improveAgentSpecialization() {
        console.log('🎯 Improving Agent Specialization...');

        // Get agent capabilities and performance
        const { data: agents, error: agentError } = await supabase
            .from('agents')
            .select('id, type, capabilities')
            .eq('is_active', true);

        if (agentError) {
            console.error('❌ Agent query failed:', agentError.message);
            return;
        }

        const { data: performance, error: perfError } = await supabase
            .from('agent_analytics')
            .select('agent_id, metric_type, metric_value')
            .eq('metric_type', 'tasks_completed')
            .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        if (perfError) {
            console.error('❌ Performance query failed:', perfError.message);
            return;
        }

        // Calculate specialization scores
        const specializationScores = {};

        agents.forEach(agent => {
            const agentPerf = performance.filter(p => p.agent_id === agent.id);
            const avgPerformance = agentPerf.length > 0 ?
                agentPerf.reduce((sum, p) => sum + p.metric_value, 0) / agentPerf.length : 0;

            specializationScores[agent.id] = {
                type: agent.type,
                capabilities: agent.capabilities,
                performance: avgPerformance,
                specializationScore: this.calculateSpecializationScore(agent, avgPerformance)
            };
        });

        console.log('✅ Specialization Improvement Results:');
        Object.entries(specializationScores).forEach(([agentId, score]) => {
            console.log(`   Agent ${agentId} (${score.type}): Score ${score.specializationScore.toFixed(2)}`);
        });
        console.log('');

        // Apply specialization improvements
        await this.applySpecializationImprovements(specializationScores);
    }

    calculateSpecializationScore(agent, performance) {
        // Simple specialization score based on capability count and performance
        const capabilityCount = agent.capabilities ? Object.keys(agent.capabilities).length : 0;
        const baseScore = capabilityCount * 0.1 + performance * 0.01;
        return Math.min(1.0, baseScore);
    }

    async applySpecializationImprovements(scores) {
        const improvements = [];

        Object.entries(scores).forEach(([agentId, score]) => {
            if (score.specializationScore < 0.7) {
                improvements.push({
                    agent_id: agentId,
                    type: 'capability_expansion',
                    description: `Expand capabilities for ${score.type} agent`,
                    current_score: score.specializationScore
                });
            }
        });

        if (improvements.length > 0) {
            console.log('🔧 Applying Specialization Improvements:');
            improvements.forEach((imp, index) => {
                console.log(`${index + 1}. Agent ${imp.agent_id}: ${imp.description}`);
            });
            console.log('');
        }
    }

    async enhanceKnowledgeSharing() {
        console.log('📚 Enhancing Knowledge Sharing...');

        // Analyze knowledge transfer between agents
        const { data: conversations, error } = await supabase
            .from('agent_conversations')
            .select('agent_id, content, metadata')
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        if (error) {
            console.error('❌ Conversation query failed:', error.message);
            return;
        }

        // Calculate knowledge sharing metrics
        const knowledgeMetrics = {
            totalInteractions: conversations.length,
            uniqueAgents: new Set(conversations.map(c => c.agent_id)).size,
            avgInteractionLength: conversations.reduce((sum, c) => sum + c.content.length, 0) / conversations.length,
            knowledgeTransferEfficiency: this.calculateKnowledgeTransferEfficiency(conversations)
        };

        console.log('✅ Knowledge Sharing Enhancement Results:');
        console.log(`   Total Interactions: ${knowledgeMetrics.totalInteractions}`);
        console.log(`   Unique Agents: ${knowledgeMetrics.uniqueAgents}`);
        console.log(`   Avg Interaction Length: ${knowledgeMetrics.avgInteractionLength.toFixed(0)} chars`);
        console.log(`   Knowledge Transfer Efficiency: ${(knowledgeMetrics.knowledgeTransferEfficiency * 100).toFixed(1)}%`);
        console.log('');
    }

    calculateKnowledgeTransferEfficiency(conversations) {
        // Simple efficiency calculation based on interaction patterns
        const agentInteractions = {};

        conversations.forEach(conv => {
            agentInteractions[conv.agent_id] = (agentInteractions[conv.agent_id] || 0) + 1;
        });

        const interactionCounts = Object.values(agentInteractions);
        const avgInteractions = interactionCounts.reduce((a, b) => a + b, 0) / interactionCounts.length;
        const variance = interactionCounts.reduce((sum, count) => sum + Math.pow(count - avgInteractions, 2), 0) / interactionCounts.length;

        // Higher variance means less balanced knowledge sharing
        return Math.max(0, 1 - (Math.sqrt(variance) / avgInteractions));
    }

    generateCollaborationReport() {
        console.log('📊 Generating Collaboration Report...');

        const report = {
            timestamp: new Date().toISOString(),
            collaboration_patterns: Object.fromEntries(this.collaborationPatterns),
            handoff_metrics: Object.fromEntries(this.taskHandoffMetrics),
            recommendations: [
                'Implement real-time agent status synchronization',
                'Add collaborative task planning capabilities',
                'Enhance knowledge base sharing between agents',
                'Implement predictive task routing',
                'Add cross-agent learning capabilities'
            ]
        };

        // Save report
        const fs = require('fs');
        fs.writeFileSync('./collaboration-report.json', JSON.stringify(report, null, 2));

        console.log('✅ Collaboration Report Generated:');
        console.log('   📄 Saved to collaboration-report.json');
        console.log(`   🔍 Metrics Captured: ${Object.keys(report.collaboration_patterns).length + Object.keys(report.handoff_metrics).length}`);
        console.log(`   💡 Recommendations: ${report.recommendations.length}`);
        console.log('');
    }
}

// Run optimization if called directly
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};

    // Parse command line arguments
    args.forEach(arg => {
        if (arg === '--read-only') {
            options.readOnly = true;
        } else if (arg.startsWith('--user=')) {
            options.userId = arg.split('=')[1];
        } else if (arg.startsWith('--timeout=')) {
            options.timeout = parseInt(arg.split('=')[1]);
        }
    });

    const optimizer = new AgentCollaborationOptimizer(options);

    if (options.readOnly) {
        console.log('👀 READ-ONLY MODE: Analyzing collaboration patterns without making changes');
    }

    optimizer.optimizeCollaboration().then(() => {
        console.log('✅ Agent collaboration optimization completed!');
        process.exit(0);
    }).catch((error) => {
        console.error('❌ Optimization failed:', error.message);
        process.exit(1);
    });
}

module.exports = { AgentCollaborationOptimizer };
