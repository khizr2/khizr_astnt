const express = require('express');
const { supabase } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const WebSocket = require('ws');

const router = express.Router();
router.use(authenticateToken);

// ===========================================
// AI SERVICE INTEGRATION FOR AGENT DECISION MAKING
// ===========================================

// AI Service Manager with multiple model support and A/B testing
class AIServiceManager {
    constructor() {
        this.models = {
            'gpt-4': {
                name: 'GPT-4',
                provider: 'openai',
                capabilities: ['text_generation', 'sentiment_analysis', 'decision_making', 'task_suggestions'],
                max_tokens: 8192,
                cost_per_token: 0.00003
            },
            'gpt-3.5-turbo': {
                name: 'GPT-3.5 Turbo',
                provider: 'openai',
                capabilities: ['text_generation', 'sentiment_analysis', 'decision_making'],
                max_tokens: 4096,
                cost_per_token: 0.000002
            },
            'claude-3': {
                name: 'Claude 3',
                provider: 'anthropic',
                capabilities: ['text_generation', 'sentiment_analysis', 'decision_making', 'task_suggestions', 'code_generation'],
                max_tokens: 100000,
                cost_per_token: 0.000015
            },
            'llama-2-70b': {
                name: 'Llama 2 70B',
                provider: 'meta',
                capabilities: ['text_generation', 'sentiment_analysis', 'decision_making'],
                max_tokens: 4096,
                cost_per_token: 0.000001
            }
        };

        this.abTestingGroups = new Map();
        this.performanceMetrics = new Map();
    }

    // Select optimal AI model based on task requirements and A/B testing
    selectModel(agentConfig, taskType = 'general', userId = null) {
        const { model: preferredModel, ab_testing_enabled = false } = agentConfig;

        // Check if user is in A/B testing group
        if (ab_testing_enabled && userId) {
            const testGroup = this.getABTestGroup(userId, taskType);
            if (testGroup && testGroup.variant !== 'control') {
                return this.models[testGroup.variant] || this.models[preferredModel];
            }
        }

        // Return preferred model if available and capable
        if (this.models[preferredModel] && this.models[preferredModel].capabilities.includes(taskType)) {
            return this.models[preferredModel];
        }

        // Fallback to most capable model for the task
        const capableModels = Object.values(this.models).filter(model =>
            model.capabilities.includes(taskType)
        );

        return capableModels[0] || this.models['gpt-4'];
    }

    // Get A/B testing group for user
    getABTestGroup(userId, taskType) {
        const key = `${userId}_${taskType}`;
        if (this.abTestingGroups.has(key)) {
            return this.abTestingGroups.get(key);
        }

        // Simple A/B assignment based on user ID hash
        const hash = this.hashString(userId);
        const variants = ['control', 'gpt-4', 'claude-3', 'gpt-3.5-turbo'];
        const variant = variants[Math.abs(hash) % variants.length];

        const group = {
            variant,
            assigned_at: new Date(),
            task_type: taskType
        };

        this.abTestingGroups.set(key, group);
        return group;
    }

    // Simple string hashing for A/B assignment
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    }

    // Record performance metrics for A/B testing
    recordPerformance(model, taskType, userId, metrics) {
        const key = `${model}_${taskType}_${userId}`;
        if (!this.performanceMetrics.has(key)) {
            this.performanceMetrics.set(key, []);
        }

        this.performanceMetrics.get(key).push({
            timestamp: new Date(),
            ...metrics
        });
    }

    // Get performance analytics
    getPerformanceAnalytics(model, taskType, days = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const metrics = Array.from(this.performanceMetrics.entries())
            .filter(([key, values]) => key.startsWith(`${model}_${taskType}`))
            .flatMap(([key, values]) => values)
            .filter(metric => metric.timestamp > cutoffDate);

        if (metrics.length === 0) return null;

        const avgResponseTime = metrics.reduce((sum, m) => sum + (m.response_time || 0), 0) / metrics.length;
        const avgQualityScore = metrics.reduce((sum, m) => sum + (m.quality_score || 0), 0) / metrics.length;
        const successRate = metrics.filter(m => m.success).length / metrics.length;

        return {
            model,
            task_type: taskType,
            sample_size: metrics.length,
            avg_response_time: avgResponseTime,
            avg_quality_score: avgQualityScore,
            success_rate: successRate,
            period_days: days
        };
    }
}

// Initialize AI Service Manager
const aiServiceManager = new AIServiceManager();

// ===========================================
// DECISION MAKING ALGORITHMS FOR AGENT ACTIONS
// ===========================================

// Decision Engine for agent actions and responses
class AgentDecisionEngine {
    constructor() {
        this.decisionRules = {
            task_priority: this.calculateTaskPriority.bind(this),
            response_urgency: this.assessResponseUrgency.bind(this),
            action_risk: this.evaluateActionRisk.bind(this),
            resource_allocation: this.optimizeResourceAllocation.bind(this),
            escalation_needed: this.checkEscalationNeeded.bind(this)
        };

        this.learningData = new Map();
    }

    // Calculate optimal task priority based on multiple factors
    calculateTaskPriority(taskData, context = {}) {
        const {
            deadline,
            priority: userPriority = 3,
            dependencies = [],
            user_history = [],
            agent_workload = 0,
            business_impact = 1
        } = taskData;

        let score = 0;

        // Deadline proximity (closer = higher priority)
        if (deadline) {
            const hoursUntilDeadline = (new Date(deadline) - new Date()) / (1000 * 60 * 60);
            if (hoursUntilDeadline < 24) score += 20;
            else if (hoursUntilDeadline < 72) score += 10;
            else if (hoursUntilDeadline < 168) score += 5;
        }

        // User-specified priority
        score += (6 - userPriority) * 15; // Convert 1-5 scale to points

        // Dependencies (tasks with dependencies get higher priority)
        score += dependencies.length * 5;

        // User history patterns (frequent interactions = higher priority)
        const recentInteractions = user_history.filter(h =>
            new Date(h.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        ).length;
        score += Math.min(recentInteractions * 2, 10);

        // Agent workload balancing (avoid overloading)
        if (agent_workload > 80) score -= 10;
        else if (agent_workload < 30) score += 5;

        // Business impact multiplier
        score *= business_impact;

        // Normalize to 1-5 scale
        return Math.max(1, Math.min(5, Math.round(score / 10)));
    }

    // Assess response urgency based on message content and context
    assessResponseUrgency(message, context = {}) {
        const { content, sender_type, timestamp } = message;
        const lowerContent = content.toLowerCase();

        let urgency = 1; // Default: normal

        // Time-sensitive keywords
        const urgentKeywords = ['urgent', 'asap', 'emergency', 'critical', 'immediate', 'deadline', 'today', 'now'];
        const urgentCount = urgentKeywords.filter(keyword => lowerContent.includes(keyword)).length;
        urgency += urgentCount * 2;

        // Question detection (questions often need timely responses)
        const questionIndicators = ['?', 'how', 'what', 'when', 'where', 'why', 'can you', 'please'];
        const questionCount = questionIndicators.filter(indicator => lowerContent.includes(indicator)).length;
        urgency += questionCount;

        // Sender type priority
        if (sender_type === 'supervisor' || sender_type === 'executive') urgency += 3;
        else if (sender_type === 'client' || sender_type === 'customer') urgency += 2;

        // Time of day factors
        const hour = new Date(timestamp).getHours();
        if (hour >= 9 && hour <= 17) urgency += 1; // Business hours
        else if (hour >= 18 || hour <= 8) urgency -= 1; // After hours

        // Cap urgency at 5
        return Math.max(1, Math.min(5, urgency));
    }

    // Evaluate risk level of proposed actions
    evaluateActionRisk(action, context = {}) {
        const { action_type, action_data, agent_capabilities, user_permissions } = action;

        let riskScore = 1; // Default: low risk

        // Action type risk assessment
        const highRiskActions = ['delete_data', 'modify_system', 'send_email', 'transfer_funds'];
        const mediumRiskActions = ['create_task', 'update_permissions', 'generate_report'];

        if (highRiskActions.includes(action_type)) riskScore = 4;
        else if (mediumRiskActions.includes(action_type)) riskScore = 2;

        // Data sensitivity assessment
        if (action_data.includes_pii || action_data.sensitive_data) riskScore += 2;
        if (action_data.financial_data) riskScore += 3;

        // Agent capability verification
        const requiredCapability = this.getRequiredCapability(action_type);
        if (!agent_capabilities.includes(requiredCapability)) riskScore += 1;

        // User permission verification
        if (!this.hasRequiredPermissions(action_type, user_permissions)) riskScore += 2;

        // Context-based risk adjustment
        if (context.is_production) riskScore += 1;
        if (context.time_pressure) riskScore += 1;

        return Math.max(1, Math.min(5, riskScore));
    }

    // Optimize resource allocation for tasks
    optimizeResourceAllocation(tasks, agents, constraints = {}) {
        const { maxConcurrentTasks = 5, skillMatching = true, loadBalancing = true } = constraints;

        const assignments = [];
        const agentWorkloads = new Map(agents.map(agent => [agent.id, agent.current_tasks || 0]));

        // Sort tasks by priority and deadline
        const sortedTasks = tasks.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            if (a.deadline && b.deadline) {
                return new Date(a.deadline) - new Date(b.deadline);
            }
            return 0;
        });

        for (const task of sortedTasks) {
            let bestAgent = null;
            let bestScore = -1;

            for (const agent of agents) {
                const currentWorkload = agentWorkloads.get(agent.id) || 0;

                // Skip if agent is at capacity
                if (currentWorkload >= maxConcurrentTasks) continue;

                let score = 0;

                // Skill matching
                if (skillMatching && task.required_skills) {
                    const matchingSkills = task.required_skills.filter(skill =>
                        agent.capabilities.includes(skill)
                    ).length;
                    score += matchingSkills * 10;
                }

                // Load balancing
                if (loadBalancing) {
                    const workloadPenalty = currentWorkload * 5;
                    score -= workloadPenalty;
                }

                // Agent availability and performance
                if (agent.status === 'idle') score += 5;
                if (agent.performance_score) score += agent.performance_score;

                if (score > bestScore) {
                    bestScore = score;
                    bestAgent = agent;
                }
            }

            if (bestAgent) {
                assignments.push({
                    task_id: task.id,
                    agent_id: bestAgent.id,
                    confidence_score: bestScore / 20, // Normalize to 0-1
                    reasoning: skillMatching ? 'Skill-based assignment' : 'Load-balanced assignment'
                });

                agentWorkloads.set(bestAgent.id, (agentWorkloads.get(bestAgent.id) || 0) + 1);
            }
        }

        return assignments;
    }

    // Check if escalation is needed based on patterns
    checkEscalationNeeded(context, thresholds = {}) {
        const {
            response_time_threshold = 300000, // 5 minutes
            error_rate_threshold = 0.1,
            user_satisfaction_threshold = 0.7
        } = thresholds;

        const { agent_metrics, recent_errors, user_feedback } = context;

        // Check response time escalation
        if (agent_metrics.avg_response_time > response_time_threshold) {
            return {
                escalate: true,
                reason: 'High response time',
                priority: 2,
                suggested_action: 'Route to faster agent or human'
            };
        }

        // Check error rate escalation
        if (recent_errors.length / agent_metrics.total_interactions > error_rate_threshold) {
            return {
                escalate: true,
                reason: 'High error rate',
                priority: 3,
                suggested_action: 'Route to more experienced agent'
            };
        }

        // Check user satisfaction escalation
        if (user_feedback.avg_satisfaction < user_satisfaction_threshold) {
            return {
                escalate: true,
                reason: 'Low user satisfaction',
                priority: 2,
                suggested_action: 'Route to human agent for complex issues'
            };
        }

        return { escalate: false };
    }

    // Helper methods
    getRequiredCapability(actionType) {
        const capabilityMap = {
            'send_email': 'communication',
            'create_task': 'task_management',
            'generate_report': 'data_analysis',
            'modify_system': 'system_admin',
            'delete_data': 'data_management'
        };
        return capabilityMap[actionType] || 'general';
    }

    hasRequiredPermissions(actionType, userPermissions) {
        const permissionMap = {
            'send_email': ['communication'],
            'create_task': ['task_create'],
            'delete_data': ['data_delete'],
            'modify_system': ['system_modify']
        };

        const required = permissionMap[actionType] || [];
        return required.every(perm => userPermissions.includes(perm));
    }

    // Learn from decision outcomes for continuous improvement
    learnFromOutcome(decision, outcome, context) {
        const learningKey = `${decision.type}_${outcome.success ? 'success' : 'failure'}`;

        if (!this.learningData.has(learningKey)) {
            this.learningData.set(learningKey, []);
        }

        this.learningData.get(learningKey).push({
            timestamp: new Date(),
            context,
            outcome,
            decision
        });
    }
}

// Initialize Decision Engine
const decisionEngine = new AgentDecisionEngine();

// ===========================================
// NATURAL LANGUAGE PROCESSING CAPABILITIES
// ===========================================

// NLP Engine for conversation analysis and understanding
class NLPEngine {
    constructor() {
        this.intentPatterns = {
            task_creation: [
                /\b(create|make|add|new)\b.*\btask\b/i,
                /\b(assign|give)\b.*\b(work|job)\b/i,
                /\b(need|want)\b.*\b(help|assistance)\b/i,
                /\b(can you|please)\b.*\b(do|handle|take care of)\b/i
            ],
            question_asking: [
                /\b(what|how|when|where|why|who)\b.*\?/i,
                /\b(tell me|explain|describe)\b/i,
                /\b(do you know|are you aware)\b/i,
                /\b(help me understand)\b/i
            ],
            status_request: [
                /\b(status|progress|update)\b.*\b(on|of|about)\b/i,
                /\b(how is|what's happening)\b/i,
                /\b(are you|have you)\b.*\b(done|finished|completed)\b/i
            ],
            urgent_request: [
                /\b(urgent|emergency|asap|immediately|right now)\b/i,
                /\b(deadline|due|overdue)\b/i,
                /\b(critical|important|priority)\b/i
            ],
            feedback_providing: [
                /\b(good|great|excellent|awesome|perfect)\b/i,
                /\b(bad|terrible|awful|horrible|wrong)\b/i,
                /\b(thanks|thank you|appreciate)\b/i,
                /\b(not working|doesn't work|broken)\b/i
            ]
        };

        this.entityPatterns = {
            dates: [
                /\b(today|tomorrow|yesterday)\b/i,
                /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
                /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
                /\d{1,2}\/\d{1,2}\/\d{2,4}/,
                /\d{1,2}-\d{1,2}-\d{2,4}/
            ],
            times: [
                /\b(\d{1,2})(:\d{2})?\s*(am|pm)?\b/i,
                /\b(noon|midnight)\b/i
            ],
            priorities: [
                /\b(high|urgent|critical|important)\b.*\bpriority\b/i,
                /\b(low|normal|medium)\b.*\bpriority\b/i,
                /\b(priority|p\d+)\b/i
            ],
            people: [
                /\b(me|myself|my|i)\b/i,
                /\b(you|your|agent|assistant)\b/i
            ],
            actions: [
                /\b(send|email|write|create|make|update|delete|modify)\b/i,
                /\b(review|check|analyze|process|handle)\b/i
            ]
        };
    }

    // Analyze message intent using pattern matching
    analyzeIntent(message) {
        const content = message.toLowerCase();
        const intents = {};

        for (const [intentType, patterns] of Object.entries(this.intentPatterns)) {
            const matches = patterns.filter(pattern => pattern.test(content)).length;
            if (matches > 0) {
                intents[intentType] = {
                    confidence: Math.min(matches / patterns.length, 1),
                    matches: matches
                };
            }
        }

        // Return the intent with highest confidence
        const bestIntent = Object.entries(intents)
            .sort(([,a], [,b]) => b.confidence - a.confidence)[0];

        return bestIntent ? {
            intent: bestIntent[0],
            confidence: bestIntent[1].confidence,
            all_intents: intents
        } : {
            intent: 'unknown',
            confidence: 0,
            all_intents: intents
        };
    }

    // Extract entities from message content
    extractEntities(message) {
        const entities = {
            dates: [],
            times: [],
            priorities: [],
            people: [],
            actions: [],
            keywords: []
        };

        // Extract dates
        for (const pattern of this.entityPatterns.dates) {
            const matches = message.match(pattern);
            if (matches) {
                entities.dates.push(...matches);
            }
        }

        // Extract times
        for (const pattern of this.entityPatterns.times) {
            const matches = message.match(pattern);
            if (matches) {
                entities.times.push(...matches);
            }
        }

        // Extract priorities
        for (const pattern of this.entityPatterns.priorities) {
            const matches = message.match(pattern);
            if (matches) {
                entities.priorities.push(...matches);
            }
        }

        // Extract people references
        for (const pattern of this.entityPatterns.people) {
            const matches = message.match(pattern);
            if (matches) {
                entities.people.push(...matches);
            }
        }

        // Extract actions
        for (const pattern of this.entityPatterns.actions) {
            const matches = message.match(pattern);
            if (matches) {
                entities.actions.push(...matches);
            }
        }

        // Extract important keywords (nouns and verbs)
        const keywordPattern = /\b[a-z]{4,}\b/gi;
        const potentialKeywords = message.match(keywordPattern) || [];
        entities.keywords = potentialKeywords.filter(word =>
            !this.isStopWord(word.toLowerCase())
        );

        return entities;
    }

    // Enhanced sentiment analysis
    analyzeSentiment(message, context = {}) {
        const content = message.toLowerCase();
        let score = 0;
        let confidence = 0;

        // Positive indicators
        const positiveWords = [
            'good', 'great', 'excellent', 'awesome', 'perfect', 'amazing', 'fantastic',
            'wonderful', 'brilliant', 'outstanding', 'superb', 'thanks', 'thank you',
            'appreciate', 'helpful', 'useful', 'easy', 'simple', 'clear', 'understand'
        ];

        // Negative indicators
        const negativeWords = [
            'bad', 'terrible', 'awful', 'horrible', 'worst', 'disappointed', 'frustrated',
            'annoying', 'difficult', 'hard', 'complicated', 'confusing', 'wrong', 'error',
            'problem', 'issue', 'fail', 'failed', 'broken', 'stuck'
        ];

        // Intensifiers
        const intensifiers = ['very', 'really', 'so', 'extremely', 'incredibly', 'absolutely'];

        let positiveCount = 0;
        let negativeCount = 0;
        let intensifierCount = 0;

        // Count sentiment words
        for (const word of positiveWords) {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            const matches = content.match(regex);
            if (matches) positiveCount += matches.length;
        }

        for (const word of negativeWords) {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            const matches = content.match(regex);
            if (matches) negativeCount += matches.length;
        }

        for (const word of intensifiers) {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            const matches = content.match(regex);
            if (matches) intensifierCount += matches.length;
        }

        // Calculate sentiment score (-1 to 1)
        const totalSentimentWords = positiveCount + negativeCount;
        if (totalSentimentWords > 0) {
            score = (positiveCount - negativeCount) / totalSentimentWords;
            // Apply intensifier boost
            if (intensifierCount > 0 && Math.abs(score) > 0) {
                score *= (1 + intensifierCount * 0.2);
            }
            // Normalize to -1 to 1 range
            score = Math.max(-1, Math.min(1, score));
            confidence = Math.min(totalSentimentWords / 10, 1); // Confidence based on word count
        }

        // Context-based adjustments
        if (context.previous_sentiment && context.conversation_history) {
            // Consider conversation context
            const recentSentiments = context.conversation_history
                .slice(-3)
                .map(msg => msg.sentiment_score || 0);

            if (recentSentiments.length > 0) {
                const avgRecentSentiment = recentSentiments.reduce((a, b) => a + b, 0) / recentSentiments.length;
                // Blend current sentiment with recent context (70% current, 30% context)
                score = score * 0.7 + avgRecentSentiment * 0.3;
            }
        }

        // Determine sentiment category
        let category = 'neutral';
        if (score > 0.2) category = 'positive';
        else if (score < -0.2) category = 'negative';

        return {
            score: score,
            category: category,
            confidence: confidence,
            details: {
                positive_words: positiveCount,
                negative_words: negativeCount,
                intensifiers: intensifierCount,
                total_sentiment_words: totalSentimentWords
            }
        };
    }

    // Generate conversation context and understanding
    generateConversationContext(conversation, currentMessage) {
        const context = {
            topic: this.identifyTopic(conversation),
            urgency: this.detectUrgency(currentMessage),
            complexity: this.assessComplexity(currentMessage),
            user_patterns: this.extractUserPatterns(conversation),
            suggested_responses: this.generateResponseSuggestions(currentMessage, conversation),
            follow_up_needed: this.detectFollowUpNeeds(currentMessage, conversation)
        };

        return context;
    }

    // Identify main topic of conversation
    identifyTopic(conversation) {
        const allContent = conversation.map(msg => msg.content).join(' ');
        const entities = this.extractEntities(allContent);

        // Simple topic identification based on keywords
        const topicKeywords = {
            task: ['task', 'work', 'job', 'assignment', 'project', 'deadline'],
            email: ['email', 'message', 'send', 'mail', 'inbox', 'recipient'],
            question: ['what', 'how', 'why', 'when', 'where', 'who', 'question'],
            issue: ['problem', 'error', 'issue', 'bug', 'broken', 'fix', 'help'],
            feedback: ['good', 'bad', 'thanks', 'appreciate', 'feedback', 'review']
        };

        const topicScores = {};
        for (const [topic, keywords] of Object.entries(topicKeywords)) {
            let score = 0;
            for (const keyword of keywords) {
                const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                const matches = allContent.match(regex);
                if (matches) score += matches.length;
            }
            topicScores[topic] = score;
        }

        const bestTopic = Object.entries(topicScores)
            .sort(([,a], [,b]) => b - a)[0];

        return bestTopic ? {
            topic: bestTopic[0],
            confidence: bestTopic[1] / Math.max(...Object.values(topicScores)),
            keywords_found: bestTopic[1]
        } : {
            topic: 'general',
            confidence: 0,
            keywords_found: 0
        };
    }

    // Detect urgency level
    detectUrgency(message) {
        const content = message.toLowerCase();
        const urgentIndicators = [
            'urgent', 'asap', 'emergency', 'critical', 'immediately', 'deadline',
            'today', 'now', 'soon', 'quickly', 'fast', 'rush'
        ];

        let urgencyScore = 1; // Normal
        let matches = 0;

        for (const indicator of urgentIndicators) {
            const regex = new RegExp(`\\b${indicator}\\b`, 'gi');
            const found = content.match(regex);
            if (found) {
                matches += found.length;
                urgencyScore += 1;
            }
        }

        // Check for time-sensitive phrases
        if (content.includes('by tomorrow') || content.includes('by today')) urgencyScore += 2;
        if (content.includes('by next week') || content.includes('within a week')) urgencyScore += 1;

        return {
            level: Math.min(5, urgencyScore),
            indicators_found: matches,
            time_sensitive: content.includes('by ') || content.includes('within ') || content.includes('deadline')
        };
    }

    // Assess message complexity
    assessComplexity(message) {
        const content = message;
        let complexity = 1; // Simple

        // Length-based complexity
        if (content.length > 500) complexity += 2;
        else if (content.length > 200) complexity += 1;

        // Technical terms
        const technicalTerms = ['api', 'database', 'server', 'configuration', 'deployment', 'integration'];
        const technicalCount = technicalTerms.filter(term =>
            content.toLowerCase().includes(term)
        ).length;
        complexity += technicalCount;

        // Question complexity
        const questionWords = ['how', 'why', 'what', 'when', 'where', 'who', 'which'];
        const questionCount = questionWords.filter(word =>
            content.toLowerCase().includes(word)
        ).length;
        complexity += questionCount;

        return Math.min(5, complexity);
    }

    // Extract user communication patterns
    extractUserPatterns(conversation) {
        const patterns = {
            response_times: [],
            message_lengths: [],
            question_frequency: 0,
            command_frequency: 0,
            feedback_frequency: 0,
            preferred_times: []
        };

        for (const message of conversation) {
            if (message.message_type === 'user_message') {
                patterns.message_lengths.push(message.content.length);

                const content = message.content.toLowerCase();
                if (content.includes('?')) patterns.question_frequency++;
                if (content.match(/\b(do|create|send|make|update|delete)\b/)) patterns.command_frequency++;
                if (content.match(/\b(good|bad|thanks|appreciate|helpful)\b/)) patterns.feedback_frequency++;

                if (message.created_at) {
                    const hour = new Date(message.created_at).getHours();
                    patterns.preferred_times.push(hour);
                }
            }
        }

        return {
            avg_message_length: patterns.message_lengths.reduce((a, b) => a + b, 0) / patterns.message_lengths.length,
            question_ratio: patterns.question_frequency / conversation.length,
            command_ratio: patterns.command_frequency / conversation.length,
            feedback_ratio: patterns.feedback_frequency / conversation.length,
            preferred_hours: this.getPreferredHours(patterns.preferred_times)
        };
    }

    // Generate response suggestions based on context
    generateResponseSuggestions(currentMessage, conversation) {
        const intent = this.analyzeIntent(currentMessage);
        const entities = this.extractEntities(currentMessage);
        const sentiment = this.analyzeSentiment(currentMessage);

        const suggestions = [];

        // Intent-based suggestions
        switch (intent.intent) {
            case 'task_creation':
                suggestions.push({
                    type: 'action',
                    content: 'I can help you create a new task. What would you like the task to be?',
                    confidence: intent.confidence
                });
                break;

            case 'question_asking':
                suggestions.push({
                    type: 'clarification',
                    content: 'I\'d be happy to help answer your question. Could you provide more details?',
                    confidence: intent.confidence
                });
                break;

            case 'status_request':
                suggestions.push({
                    type: 'status_check',
                    content: 'Let me check the current status for you. What specifically would you like to know about?',
                    confidence: intent.confidence
                });
                break;

            case 'urgent_request':
                suggestions.push({
                    type: 'urgent_handling',
                    content: 'I understand this is urgent. I\'ll prioritize this and get back to you as soon as possible.',
                    confidence: intent.confidence
                });
                break;
        }

        // Entity-based suggestions
        if (entities.dates.length > 0) {
            suggestions.push({
                type: 'scheduling',
                content: `I see you mentioned dates: ${entities.dates.join(', ')}. Should I schedule something for these dates?`,
                confidence: 0.8
            });
        }

        if (entities.times.length > 0) {
            suggestions.push({
                type: 'timing',
                content: `You mentioned times: ${entities.times.join(', ')}. Should I set reminders or schedule tasks for these times?`,
                confidence: 0.7
            });
        }

        return suggestions;
    }

    // Detect if follow-up is needed
    detectFollowUpNeeds(currentMessage, conversation) {
        const content = currentMessage.toLowerCase();

        // Check for follow-up indicators
        const followUpIndicators = [
            'follow up', 'check back', 'remind me', 'later', 'tomorrow',
            'next week', 'update me', 'let me know', 'keep me posted'
        ];

        const needsFollowUp = followUpIndicators.some(indicator => content.includes(indicator));

        // Check conversation context for unresolved issues
        const recentMessages = conversation.slice(-5);
        const unresolvedIndicators = recentMessages.some(msg =>
            msg.content.toLowerCase().match(/\b(pending|waiting|stuck|issue|problem|help)\b/)
        );

        return {
            follow_up_needed: needsFollowUp || unresolvedIndicators,
            follow_up_type: needsFollowUp ? 'explicit' : unresolvedIndicators ? 'inferred' : 'none',
            suggested_follow_up: needsFollowUp ? 'Schedule reminder for follow-up' : 'Monitor for resolution'
        };
    }

    // Helper methods
    isStopWord(word) {
        const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'an', 'a'];
        return stopWords.includes(word);
    }

    getPreferredHours(hours) {
        if (hours.length === 0) return [];

        const hourCounts = {};
        hours.forEach(hour => {
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });

        return Object.entries(hourCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([hour]) => parseInt(hour));
    }
}

// Initialize NLP Engine
const nlpEngine = new NLPEngine();

// ===========================================
// WEBSOCKET SUPPORT FOR BIDIRECTIONAL COMMUNICATION
// ===========================================

// Store WebSocket connections
const wsConnections = new Map();
const wsSubscribers = new Map();

// Initialize WebSocket server (this would typically be done in server.js)
let wss = null;

function initializeWebSocketServer(server) {
    wss = new WebSocket.Server({
        server,
        path: '/api/agents/ws',
        perMessageDeflate: false
    });

    wss.on('connection', (ws, req) => {
        try {
            // Extract user ID from query parameters (would need authentication middleware)
            const url = new URL(req.url, 'http://localhost');
            const userId = url.searchParams.get('user_id');
            const agentIds = url.searchParams.get('agent_ids')?.split(',') || null;

            if (!userId) {
                ws.close(4001, 'User ID required');
                return;
            }

            const connectionId = `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            wsConnections.set(connectionId, {
                ws,
                userId,
                agentIds,
                lastActivity: new Date(),
                subscribedAgents: new Set()
            });

            // Send connection confirmation
            ws.send(JSON.stringify({
                type: 'connection_established',
                connection_id: connectionId,
                user_id: userId,
                timestamp: new Date().toISOString(),
                supported_events: [
                    'status_update',
                    'heartbeat_update',
                    'notification',
                    'subscribe_agents',
                    'unsubscribe_agents',
                    'ping',
                    'pong'
                ]
            }));

            // Handle incoming messages
            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    await handleWebSocketMessage(connectionId, message);
                } catch (error) {
                    logger.error('WebSocket message parsing error:', error);
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: 'Invalid message format',
                        timestamp: new Date().toISOString()
                    }));
                }
            });

            // Handle connection close
            ws.on('close', () => {
                handleWebSocketDisconnect(connectionId);
            });

            // Handle errors
            ws.on('error', (error) => {
                logger.error('WebSocket connection error:', error);
                handleWebSocketDisconnect(connectionId);
            });

            // Set up ping/pong for connection health
            const pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
                } else {
                    clearInterval(pingInterval);
                    handleWebSocketDisconnect(connectionId);
                }
            }, 30000); // Ping every 30 seconds

            logger.info(`WebSocket connection established for user ${userId}, connection ${connectionId}`);

        } catch (error) {
            logger.error('WebSocket connection setup error:', error);
            ws.close(4000, 'Connection setup failed');
        }
    });

    // Clean up inactive connections
    setInterval(() => {
        const now = new Date();
        const timeoutMs = 5 * 60 * 1000; // 5 minutes

        for (const [connectionId, connection] of wsConnections) {
            if (now - connection.lastActivity > timeoutMs) {
                try {
                    connection.ws.close(4002, 'Connection timeout');
                } catch (error) {
                    // Connection already closed
                }
                handleWebSocketDisconnect(connectionId);
            }
        }
    }, 60 * 1000); // Check every minute

    logger.info('WebSocket server initialized for agent status updates');
}

// Handle WebSocket messages
async function handleWebSocketMessage(connectionId, message) {
    const connection = wsConnections.get(connectionId);
    if (!connection) return;

    connection.lastActivity = new Date();

    try {
        switch (message.type) {
            case 'subscribe_agents':
                await handleSubscribeAgents(connectionId, message.agent_ids);
                break;

            case 'unsubscribe_agents':
                await handleUnsubscribeAgents(connectionId, message.agent_ids);
                break;

            case 'ping':
                connection.ws.send(JSON.stringify({
                    type: 'pong',
                    timestamp: new Date().toISOString()
                }));
                break;

            case 'get_status':
                await handleGetStatus(connectionId, message.agent_ids);
                break;

            case 'update_status':
                await handleUpdateStatus(connectionId, message);
                break;

            default:
                connection.ws.send(JSON.stringify({
                    type: 'error',
                    error: `Unknown message type: ${message.type}`,
                    timestamp: new Date().toISOString()
                }));
        }
    } catch (error) {
        logger.error('WebSocket message handling error:', error);
        connection.ws.send(JSON.stringify({
            type: 'error',
            error: 'Message handling failed',
            timestamp: new Date().toISOString()
        }));
    }
}

// Handle agent subscription
async function handleSubscribeAgents(connectionId, agentIds) {
    const connection = wsConnections.get(connectionId);
    if (!connection) return;

    if (!agentIds || !Array.isArray(agentIds)) {
        connection.ws.send(JSON.stringify({
            type: 'error',
            error: 'agent_ids array required for subscription',
            timestamp: new Date().toISOString()
        }));
        return;
    }

    // Verify agents belong to user
    const { data: agents } = await supabase
        .from('agents')
        .select('id, name')
        .eq('user_id', connection.userId)
        .in('id', agentIds);

    if (!agents || agents.length !== agentIds.length) {
        connection.ws.send(JSON.stringify({
            type: 'error',
            error: 'Access denied to one or more agents',
            timestamp: new Date().toISOString()
        }));
        return;
    }

    // Subscribe to agents
    agentIds.forEach(agentId => {
        if (!wsSubscribers.has(agentId)) {
            wsSubscribers.set(agentId, new Set());
        }
        wsSubscribers.get(agentId).add(connectionId);
        connection.subscribedAgents.add(agentId);
    });

    connection.ws.send(JSON.stringify({
        type: 'subscription_success',
        subscribed_agents: agentIds,
        timestamp: new Date().toISOString()
    }));

    logger.info(`WebSocket connection ${connectionId} subscribed to agents: ${agentIds.join(', ')}`);
}

// Handle agent unsubscription
async function handleUnsubscribeAgents(connectionId, agentIds) {
    const connection = wsConnections.get(connectionId);
    if (!connection) return;

    if (!agentIds || !Array.isArray(agentIds)) {
        agentIds = Array.from(connection.subscribedAgents);
    }

    agentIds.forEach(agentId => {
        if (wsSubscribers.has(agentId)) {
            wsSubscribers.get(agentId).delete(connectionId);
            if (wsSubscribers.get(agentId).size === 0) {
                wsSubscribers.delete(agentId);
            }
        }
        connection.subscribedAgents.delete(agentId);
    });

    connection.ws.send(JSON.stringify({
        type: 'unsubscription_success',
        unsubscribed_agents: agentIds,
        timestamp: new Date().toISOString()
    }));

    logger.info(`WebSocket connection ${connectionId} unsubscribed from agents: ${agentIds.join(', ')}`);
}

// Handle status request
async function handleGetStatus(connectionId, agentIds) {
    const connection = wsConnections.get(connectionId);
    if (!connection) return;

    let query = supabase
        .from('agent_status')
        .select(`
            *,
            agents!inner (
                id,
                name,
                type,
                is_active
            )
        `);

    // Filter by user agents
    const { data: userAgents } = await supabase
        .from('agents')
        .select('id')
        .eq('user_id', connection.userId);

    if (userAgents && userAgents.length > 0) {
        const agentIdList = userAgents.map(agent => agent.id);
        query = query.in('agent_id', agentIdList);
    }

    // Filter by specific agent IDs if provided
    if (agentIds && Array.isArray(agentIds)) {
        query = query.in('agent_id', agentIds);
    }

    const { data: statuses, error } = await query;

    if (error) {
        connection.ws.send(JSON.stringify({
            type: 'error',
            error: 'Failed to fetch status data',
            timestamp: new Date().toISOString()
        }));
        return;
    }

    connection.ws.send(JSON.stringify({
        type: 'status_data',
        statuses: statuses || [],
        timestamp: new Date().toISOString()
    }));
}

// Handle status update via WebSocket
async function handleUpdateStatus(connectionId, message) {
    const connection = wsConnections.get(connectionId);
    if (!connection) return;

    const { agent_id, status, status_message, current_task_id, health_score, cpu_usage, memory_usage } = message;

    if (!agent_id || !status) {
        connection.ws.send(JSON.stringify({
            type: 'error',
            error: 'agent_id and status are required',
            timestamp: new Date().toISOString()
        }));
        return;
    }

    // Verify agent belongs to user
    const { data: agent } = await supabase
        .from('agents')
        .select('id, name')
        .eq('id', agent_id)
        .eq('user_id', connection.userId)
        .single();

    if (!agent) {
        connection.ws.send(JSON.stringify({
            type: 'error',
            error: 'Agent not found or access denied',
            timestamp: new Date().toISOString()
        }));
        return;
    }

    try {
        const updateData = {
            status,
            last_activity: new Date().toISOString()
        };

        if (status_message !== undefined) updateData.status_message = status_message;
        if (current_task_id !== undefined) updateData.current_task_id = current_task_id;
        if (health_score !== undefined) updateData.health_score = health_score;
        if (cpu_usage !== undefined) updateData.cpu_usage = cpu_usage;
        if (memory_usage !== undefined) updateData.memory_usage = memory_usage;

        const { data: updatedStatus, error } = await supabase
            .from('agent_status')
            .update(updateData)
            .eq('agent_id', agent_id)
            .select()
            .single();

        if (error) {
            throw error;
        }

        // Log status change
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: agent_id,
                user_id: connection.userId,
                action: 'status_changed',
                details: {
                    old_status: 'websocket_update',
                    new_status: status,
                    status_message,
                    current_task_id,
                    health_score,
                    cpu_usage,
                    memory_usage,
                    transition_timestamp: new Date().toISOString(),
                    source: 'websocket'
                }
            }]);

        // Broadcast to all subscribers
        await broadcastWebSocketUpdate(agent_id, updatedStatus);

        connection.ws.send(JSON.stringify({
            type: 'status_update_success',
            agent_id,
            status: updatedStatus,
            timestamp: new Date().toISOString()
        }));

    } catch (error) {
        logger.error('WebSocket status update error:', error);
        connection.ws.send(JSON.stringify({
            type: 'error',
            error: 'Failed to update status',
            timestamp: new Date().toISOString()
        }));
    }
}

// Broadcast status update to WebSocket subscribers
async function broadcastWebSocketUpdate(agentId, statusData) {
    try {
        const subscribers = wsSubscribers.get(agentId);
        if (!subscribers || subscribers.size === 0) {
            return;
        }

        const eventData = {
            type: 'status_update',
            agent_id: agentId,
            status: statusData,
            timestamp: new Date().toISOString()
        };

        const dataString = JSON.stringify(eventData);

        for (const connectionId of subscribers) {
            const connection = wsConnections.get(connectionId);
            if (connection && connection.ws.readyState === WebSocket.OPEN) {
                try {
                    connection.ws.send(dataString);
                    connection.lastActivity = new Date();
                } catch (error) {
                    logger.error(`WebSocket send error for connection ${connectionId}:`, error);
                    handleWebSocketDisconnect(connectionId);
                }
            }
        }

        // Also broadcast to connections that want all updates
        for (const [connectionId, connection] of wsConnections) {
            if (connection.agentIds === null && connection.ws.readyState === WebSocket.OPEN) {
                try {
                    connection.ws.send(dataString);
                    connection.lastActivity = new Date();
                } catch (error) {
                    handleWebSocketDisconnect(connectionId);
                }
            }
        }

        logger.debug(`WebSocket broadcasted status update for agent ${agentId} to ${subscribers.size} subscribers`);

    } catch (error) {
        logger.error('WebSocket broadcast error:', error);
    }
}

// Handle WebSocket disconnection
function handleWebSocketDisconnect(connectionId) {
    const connection = wsConnections.get(connectionId);
    if (!connection) return;

    // Remove from subscribers
    for (const agentId of connection.subscribedAgents) {
        if (wsSubscribers.has(agentId)) {
            wsSubscribers.get(agentId).delete(connectionId);
            if (wsSubscribers.get(agentId).size === 0) {
                wsSubscribers.delete(agentId);
            }
        }
    }

    wsConnections.delete(connectionId);

    logger.info(`WebSocket connection ${connectionId} disconnected`);
}

// Export WebSocket initialization function
module.exports.initializeWebSocketServer = initializeWebSocketServer;

// ===========================================
// REAL-TIME STATUS MANAGEMENT
// ===========================================

// Store active SSE connections
const activeConnections = new Map();

// Store agent status subscribers
const statusSubscribers = new Map();

// Store heartbeat timestamps
const agentHeartbeats = new Map();

// SSE endpoint for real-time agent status updates
router.get('/status/stream', (req, res) => {
    try {
        const userId = req.user.id;
        const { agent_ids } = req.query;

        // Set SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control',
        });

        // Send initial connection confirmation
        res.write(`data: ${JSON.stringify({
            type: 'connection_established',
            user_id: userId,
            timestamp: new Date().toISOString()
        })}\n\n`);

        // Store connection for broadcasting
        const connectionId = `${userId}_${Date.now()}`;
        activeConnections.set(connectionId, {
            res,
            userId,
            agentIds: agent_ids ? agent_ids.split(',') : null,
            lastActivity: new Date()
        });

        // Initialize subscribers for requested agents
        if (agent_ids) {
            const agentIdArray = agent_ids.split(',');
            agentIdArray.forEach(agentId => {
                if (!statusSubscribers.has(agentId)) {
                    statusSubscribers.set(agentId, new Set());
                }
                statusSubscribers.get(agentId).add(connectionId);
            });
        }

        // Handle client disconnect
        req.on('close', () => {
            activeConnections.delete(connectionId);

            // Remove from subscribers
            if (agent_ids) {
                const agentIdArray = agent_ids.split(',');
                agentIdArray.forEach(agentId => {
                    if (statusSubscribers.has(agentId)) {
                        statusSubscribers.get(agentId).delete(connectionId);
                        if (statusSubscribers.get(agentId).size === 0) {
                            statusSubscribers.delete(agentId);
                        }
                    }
                });
            }

            logger.info(`SSE connection closed for user ${userId}, connection ${connectionId}`);
        });

        // Send heartbeat every 30 seconds to keep connection alive
        const heartbeatInterval = setInterval(() => {
            try {
                res.write(`data: ${JSON.stringify({
                    type: 'heartbeat',
                    timestamp: new Date().toISOString()
                })}\n\n`);
            } catch (error) {
                clearInterval(heartbeatInterval);
                activeConnections.delete(connectionId);
            }
        }, 30000);

        // Clean up interval on disconnect
        req.on('close', () => {
            clearInterval(heartbeatInterval);
        });

        logger.info(`SSE connection established for user ${userId}, connection ${connectionId}`);

    } catch (error) {
        logger.error('SSE connection error:', error);
        res.status(500).end();
    }
});

// Broadcast status update to subscribers
async function broadcastStatusUpdate(agentId, statusData, userId = null) {
    try {
        const subscribers = statusSubscribers.get(agentId);
        if (!subscribers || subscribers.size === 0) {
            return; // No subscribers for this agent
        }

        const eventData = {
            type: 'status_update',
            agent_id: agentId,
            status: statusData,
            timestamp: new Date().toISOString(),
            user_id: userId
        };

        const dataString = `data: ${JSON.stringify(eventData)}\n\n`;

        // Send to specific subscribers
        for (const connectionId of subscribers) {
            const connection = activeConnections.get(connectionId);
            if (connection && connection.res) {
                try {
                    connection.res.write(dataString);
                    connection.lastActivity = new Date();
                } catch (error) {
                    // Connection is dead, remove it
                    activeConnections.delete(connectionId);
                    subscribers.delete(connectionId);
                    if (subscribers.size === 0) {
                        statusSubscribers.delete(agentId);
                    }
                }
            }
        }

        // Also broadcast to connections that want all status updates (no specific agent_ids)
        for (const [connectionId, connection] of activeConnections) {
            if (connection.agentIds === null && connection.res) {
                try {
                    connection.res.write(dataString);
                    connection.lastActivity = new Date();
                } catch (error) {
                    activeConnections.delete(connectionId);
                }
            }
        }

        logger.debug(`Broadcasted status update for agent ${agentId} to ${subscribers.size} subscribers`);

    } catch (error) {
        logger.error('Broadcast status update error:', error);
    }
}

// Clean up inactive connections every 5 minutes
setInterval(() => {
    const now = new Date();
    const timeoutMs = 5 * 60 * 1000; // 5 minutes

    for (const [connectionId, connection] of activeConnections) {
        if (now - connection.lastActivity > timeoutMs) {
            try {
                connection.res.end();
            } catch (error) {
                // Connection already closed
            }
            activeConnections.delete(connectionId);

            // Remove from subscribers
            for (const [agentId, subscribers] of statusSubscribers) {
                if (subscribers.has(connectionId)) {
                    subscribers.delete(connectionId);
                    if (subscribers.size === 0) {
                        statusSubscribers.delete(agentId);
                    }
                }
            }
        }
    }

    logger.debug(`Cleaned up ${activeConnections.size} active connections`);
}, 5 * 60 * 1000);

// ===========================================
// APPROVAL TEMPLATES AND RISK ASSESSMENT
// ===========================================

// Approval templates for different action types
const APPROVAL_TEMPLATES = {
    'task_creation': {
        risk_level: 'low',
        priority: 4,
        expiration_hours: 24,
        requires_approval_threshold: 'medium',
        reason: 'New task creation requires user approval',
        auto_approve_rules: {
            priority_threshold: 5, // Auto-approve if priority >= 5
            agent_trust_score: 0.8 // Auto-approve if agent trust score >= 0.8
        }
    },
    'email_send': {
        risk_level: 'medium',
        priority: 3,
        expiration_hours: 12,
        requires_approval_threshold: 'medium',
        reason: 'Email sending requires user approval to prevent spam',
        auto_approve_rules: {
            recipient_whitelist: true,
            agent_trust_score: 0.9
        }
    },
    'project_modification': {
        risk_level: 'high',
        priority: 2,
        expiration_hours: 8,
        requires_approval_threshold: 'low',
        reason: 'Project modifications can have significant impact',
        auto_approve_rules: {
            agent_trust_score: 0.95
        }
    },
    'system_configuration': {
        risk_level: 'critical',
        priority: 1,
        expiration_hours: 4,
        requires_approval_threshold: 'low',
        reason: 'System configuration changes require explicit approval',
        auto_approve_rules: {} // Never auto-approve
    },
    'data_deletion': {
        risk_level: 'critical',
        priority: 1,
        expiration_hours: 2,
        requires_approval_threshold: 'low',
        reason: 'Data deletion is irreversible and requires approval',
        auto_approve_rules: {} // Never auto-approve
    },
    'agent_deployment': {
        risk_level: 'high',
        priority: 2,
        expiration_hours: 6,
        requires_approval_threshold: 'medium',
        reason: 'Agent deployment changes system behavior',
        auto_approve_rules: {
            agent_trust_score: 0.9
        }
    }
};

// Risk assessment function
function assessActionRisk(actionType, actionData, agentData) {
    const template = APPROVAL_TEMPLATES[actionType];
    if (!template) {
        return {
            requires_approval: true,
            risk_level: 'medium',
            priority: 3,
            reason: `Unknown action type: ${actionType}`
        };
    }

    let risk_level = template.risk_level;
    let priority = template.priority;
    let requires_approval = true;
    let reason = template.reason;

    // Adjust risk based on action data
    if (actionData) {
        // High priority tasks might need higher approval
        if (actionData.priority <= 2) {
            priority = Math.min(priority, actionData.priority);
            risk_level = risk_level === 'low' ? 'medium' : risk_level;
        }

        // Large data operations increase risk
        if (actionData.bulk_operation || actionData.affects_multiple_records) {
            risk_level = risk_level === 'low' ? 'medium' : risk_level === 'medium' ? 'high' : risk_level;
            priority = Math.max(1, priority - 1);
        }

        // Sensitive data increases risk
        if (actionData.contains_sensitive_data || actionData.privacy_impact) {
            risk_level = risk_level === 'low' ? 'medium' : risk_level === 'medium' ? 'high' : 'critical';
            priority = Math.max(1, priority - 1);
        }
    }

    // Check agent trust score for auto-approval
    if (agentData && agentData.trust_score) {
        const trustScore = agentData.trust_score;
        if (template.auto_approve_rules.agent_trust_score &&
            trustScore >= template.auto_approve_rules.agent_trust_score) {
            requires_approval = false;
            reason = `Auto-approved based on high agent trust score (${trustScore})`;
        }
    }

    return {
        requires_approval,
        risk_level,
        priority,
        reason,
        template: actionType,
        expiration_hours: template.expiration_hours
    };
}

// Create approval queue entry
async function createApprovalQueue(agentId, userId, actionType, actionData, riskAssessment) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + riskAssessment.expiration_hours);

    const approvalData = {
        agent_id: agentId,
        user_id: userId,
        action_type: actionType,
        action_data: JSON.stringify(actionData),
        reason: riskAssessment.reason,
        risk_level: riskAssessment.risk_level,
        priority: riskAssessment.priority,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('approvals_queue')
        .insert([approvalData])
        .select()
        .single();

    if (error) {
        logger.error('Create approval queue error:', error);
        throw new Error('Failed to create approval queue entry');
    }

    // Create notification for the approval
    try {
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name, type')
            .eq('id', agentId)
            .single();

        if (agent) {
            await createApprovalNotification(data, agent);
        }
    } catch (notificationError) {
        logger.error('Failed to create approval notification:', notificationError);
        // Don't fail the approval creation if notification fails
    }

    return data;
}

// Check for expired approvals and process them
async function processExpiredApprovals() {
    try {
        const now = new Date().toISOString();

        // Get expired pending approvals
        const { data: expiredApprovals, error: fetchError } = await supabase
            .from('approvals_queue')
            .select('*')
            .eq('status', 'pending')
            .lt('expires_at', now);

        if (fetchError) {
            logger.error('Fetch expired approvals error:', fetchError);
            return;
        }

        if (!expiredApprovals || expiredApprovals.length === 0) {
            return;
        }

        // Update expired approvals to 'expired' status
        const expiredIds = expiredApprovals.map(approval => approval.id);

        const { error: updateError } = await supabase
            .from('approvals_queue')
            .update({
                status: 'expired',
                updated_at: now
            })
            .in('id', expiredIds);

        if (updateError) {
            logger.error('Update expired approvals error:', updateError);
            return;
        }

        // Create history records for expired approvals
        const historyRecords = expiredApprovals.map(approval => ({
            approval_id: approval.id,
            agent_id: approval.agent_id,
            user_id: approval.user_id,
            action_taken: 'expired',
            action_data: approval.action_data,
            decision_reason: 'Approval expired due to timeout',
            processing_time_ms: null,
            risk_assessment: JSON.stringify({
                risk_level: approval.risk_level,
                priority: approval.priority
            })
        }));

        const { error: historyError } = await supabase
            .from('approval_history')
            .insert(historyRecords);

        if (historyError) {
            logger.error('Create expired approval history error:', historyError);
        }

        // Log expired approvals
        for (const approval of expiredApprovals) {
            await supabase
                .from('agent_logs')
                .insert([{
                    agent_id: approval.agent_id,
                    user_id: approval.user_id,
                    action: 'approval_expired',
                    resource_type: 'approval',
                    resource_id: approval.id,
                    details: {
                        action_type: approval.action_type,
                        risk_level: approval.risk_level,
                        expired_at: approval.expires_at
                    },
                    severity: 'warning'
                }]);
        }

        logger.info(`Processed ${expiredApprovals.length} expired approvals`);

    } catch (error) {
        logger.error('Process expired approvals error:', error);
    }
}

// Background task to process expired approvals every 5 minutes
setInterval(processExpiredApprovals, 5 * 60 * 1000);

// ===========================================
// APPROVAL NOTIFICATIONS AND ESCALATION
// ===========================================

// Create notification for approval
async function createApprovalNotification(approval, agent) {
    try {
        const notificationData = {
            user_id: approval.user_id,
            type: 'approval_required',
            title: `Approval Required: ${approval.action_type}`,
            message: `Agent "${agent.name}" requires approval for: ${approval.reason}`,
            priority: approval.priority,
            action_required: true,
            data: JSON.stringify({
                approval_id: approval.id,
                agent_id: approval.agent_id,
                agent_name: agent.name,
                action_type: approval.action_type,
                risk_level: approval.risk_level,
                expires_at: approval.expires_at
            })
        };

        const { data, error } = await supabase
            .from('notifications')
            .insert([notificationData])
            .select()
            .single();

        if (error) {
            logger.error('Create approval notification error:', error);
        }

        return data;

    } catch (error) {
        logger.error('Create approval notification error:', error);
    }
}

// Create escalation notification
async function createEscalationNotification(approval, agent, escalationLevel) {
    try {
        const escalationMessages = {
            1: 'First escalation: Approval is still pending',
            2: 'Second escalation: Approval requires immediate attention',
            3: 'Final escalation: Critical approval pending - immediate action required'
        };

        const notificationData = {
            user_id: approval.user_id,
            type: 'approval_escalation',
            title: `ESCALATION: ${approval.action_type} Approval`,
            message: `${escalationMessages[escalationLevel]} - Agent "${agent.name}": ${approval.reason}`,
            priority: Math.max(1, approval.priority - escalationLevel), // Increase priority with escalation
            action_required: true,
            data: JSON.stringify({
                approval_id: approval.id,
                agent_id: approval.agent_id,
                agent_name: agent.name,
                action_type: approval.action_type,
                risk_level: approval.risk_level,
                escalation_level: escalationLevel,
                expires_at: approval.expires_at
            })
        };

        const { data, error } = await supabase
            .from('notifications')
            .insert([notificationData])
            .select()
            .single();

        if (error) {
            logger.error('Create escalation notification error:', error);
        }

        return data;

    } catch (error) {
        logger.error('Create escalation notification error:', error);
    }
}

// Process approval escalations
async function processApprovalEscalations() {
    try {
        const now = new Date();

        // Check for approvals that need escalation
        // Level 1: After 1 hour
        // Level 2: After 4 hours
        // Level 3: After 8 hours

        const escalationThresholds = [
            { hours: 1, level: 1 },
            { hours: 4, level: 2 },
            { hours: 8, level: 3 }
        ];

        for (const threshold of escalationThresholds) {
            const thresholdTime = new Date(now.getTime() - (threshold.hours * 60 * 60 * 1000));

            const { data: pendingApprovals, error } = await supabase
                .from('approvals_queue')
                .select(`
                    *,
                    agents!inner (
                        id,
                        name,
                        type
                    )
                `)
                .eq('status', 'pending')
                .lt('created_at', thresholdTime.toISOString())
                .gt('expires_at', now.toISOString()); // Not yet expired

            if (error) {
                logger.error(`Fetch approvals for escalation level ${threshold.level} error:`, error);
                continue;
            }

            if (!pendingApprovals || pendingApprovals.length === 0) {
                continue;
            }

            for (const approval of pendingApprovals) {
                // Check if escalation already sent for this level
                const { data: existingEscalation } = await supabase
                    .from('notifications')
                    .select('id')
                    .eq('user_id', approval.user_id)
                    .eq('type', 'approval_escalation')
                    .like('data', `%"escalation_level":${threshold.level}%`)
                    .like('data', `%"approval_id":"${approval.id}"%`)
                    .single();

                if (existingEscalation) {
                    continue; // Escalation already sent
                }

                // Create escalation notification
                await createEscalationNotification(approval, approval.agents, threshold.level);

                // Log escalation
                await supabase
                    .from('agent_logs')
                    .insert([{
                        agent_id: approval.agent_id,
                        user_id: approval.user_id,
                        action: 'approval_escalated',
                        resource_type: 'approval',
                        resource_id: approval.id,
                        details: {
                            escalation_level: threshold.level,
                            hours_pending: threshold.hours,
                            action_type: approval.action_type,
                            risk_level: approval.risk_level
                        },
                        severity: threshold.level >= 3 ? 'critical' : 'warning'
                    }]);

                logger.info(`Escalation level ${threshold.level} sent for approval ${approval.id}`);
            }
        }

    } catch (error) {
        logger.error('Process approval escalations error:', error);
    }
}

// Execute approved action
async function executeApprovedAction(approval) {
    try {
        const actionData = JSON.parse(approval.action_data);

        switch (approval.action_type) {
            case 'task_creation':
                await executeTaskCreation(approval, actionData);
                break;

            case 'email_send':
                await executeEmailSend(approval, actionData);
                break;

            case 'project_modification':
                await executeProjectModification(approval, actionData);
                break;

            case 'system_configuration':
                await executeSystemConfiguration(approval, actionData);
                break;

            case 'data_deletion':
                await executeDataDeletion(approval, actionData);
                break;

            case 'agent_deployment':
                await executeAgentDeployment(approval, actionData);
                break;

            default:
                logger.warn(`Unknown action type for execution: ${approval.action_type}`);
                throw new Error(`Unsupported action type: ${approval.action_type}`);
        }

        // Log successful execution
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: approval.agent_id,
                user_id: approval.user_id,
                action: 'action_executed',
                resource_type: 'approval',
                resource_id: approval.id,
                details: {
                    action_type: approval.action_type,
                    execution_status: 'success'
                }
            }]);

    } catch (error) {
        logger.error(`Execute approved action error for ${approval.action_type}:`, error);

        // Log execution failure
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: approval.agent_id,
                user_id: approval.user_id,
                action: 'action_execution_failed',
                resource_type: 'approval',
                resource_id: approval.id,
                details: {
                    action_type: approval.action_type,
                    error: error.message,
                    execution_status: 'failed'
                },
                severity: 'error'
            }]);

        throw error;
    }
}

// Execute task creation action
async function executeTaskCreation(approval, actionData) {
    // Update the task status from 'pending_approval' to 'pending'
    const { error } = await supabase
        .from('agent_tasks')
        .update({
            status: 'pending',
            updated_at: new Date().toISOString()
        })
        .eq('approval_id', approval.id);

    if (error) {
        throw new Error(`Failed to activate approved task: ${error.message}`);
    }

    // Update agent status to busy
    await supabase
        .from('agent_status')
        .update({
            status: 'busy',
            current_task_id: null, // Will be set when task starts
            last_activity: new Date().toISOString()
        })
        .eq('agent_id', approval.agent_id);
}

// Execute email send action
async function executeEmailSend(approval, actionData) {
    // Implementation would depend on your email service
    // For now, just log that the email would be sent
    logger.info(`Approved email send action for agent ${approval.agent_id}`, actionData);

    // You would integrate with your email service here
    // Example: await emailService.send(actionData);
}

// Execute project modification action
async function executeProjectModification(approval, actionData) {
    // Implementation would depend on your project management system
    logger.info(`Approved project modification action for agent ${approval.agent_id}`, actionData);

    // You would implement the actual project modification logic here
}

// Execute system configuration action
async function executeSystemConfiguration(approval, actionData) {
    // This is a high-risk operation - be very careful
    logger.info(`Approved system configuration action for agent ${approval.agent_id}`, actionData);

    // You would implement the actual system configuration logic here
    // This should have additional safeguards
}

// Execute data deletion action
async function executeDataDeletion(approval, actionData) {
    // This is a critical operation - extra caution required
    logger.warn(`Approved data deletion action for agent ${approval.agent_id}`, actionData);

    // You would implement the actual data deletion logic here
    // This should have extensive logging and backup verification
}

// Execute agent deployment action
async function executeAgentDeployment(approval, actionData) {
    // Update agent status to indicate deployment approved
    const { error } = await supabase
        .from('agents')
        .update({
            is_active: true,
            updated_at: new Date().toISOString()
        })
        .eq('id', approval.agent_id);

    if (error) {
        throw new Error(`Failed to deploy agent: ${error.message}`);
    }

    logger.info(`Agent ${approval.agent_id} deployment approved and activated`);
}

// Background task to process escalations every 15 minutes
setInterval(processApprovalEscalations, 15 * 60 * 1000);

// ===========================================
// AGENT CRUD OPERATIONS
// ===========================================

// Get all agents for the user
router.get('/', async (req, res) => {
    try {
        const { type, is_active, limit = 50, offset = 0 } = req.query;

        // Start with simple query first
        let query = supabase
            .from('agents')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (type) {
            query = query.eq('type', type);
        }

        if (is_active !== undefined) {
            query = query.eq('is_active', is_active === 'true');
        }

        const { data: agents, error } = await query;

        if (error) {
            logger.error('Get agents error:', error);
            return res.status(500).json({ error: 'Failed to fetch agents', details: error.message });
        }

        // If we have agents, try to get their profiles and status
        let agentsWithDetails = agents || [];

        if (agentsWithDetails.length > 0) {
            try {
                const agentIds = agentsWithDetails.map(a => a.id);

                // Get profiles
                const { data: profiles } = await supabase
                    .from('agent_profiles')
                    .select('*')
                    .in('agent_id', agentIds);

                // Get status
                const { data: statuses } = await supabase
                    .from('agent_status')
                    .select('*')
                    .in('agent_id', agentIds);

                // Merge data
                agentsWithDetails = agentsWithDetails.map(agent => ({
                    ...agent,
                    agent_profiles: profiles?.filter(p => p.agent_id === agent.id) || [],
                    agent_status: statuses?.filter(s => s.agent_id === agent.id) || []
                }));
            } catch (joinError) {
                logger.warn('Failed to fetch agent details:', joinError);
                // Continue without details - basic agent data is still useful
            }
        }

        res.json({
            success: true,
            agents: agentsWithDetails,
            count: agentsWithDetails.length
        });

    } catch (error) {
        logger.error('Get agents error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Get agent by ID with full details and AI configuration
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            include_ai_config = 'true',
            include_performance_metrics = 'false',
            include_model_recommendations = 'false',
            include_ab_testing_status = 'false'
        } = req.query;

        const { data: agent, error } = await supabase
            .from('agents')
            .select(`
                *,
                agent_profiles (*),
                agent_status (*),
                agent_tasks (
                    *,
                    agent_task:task_id (*)
                ),
                agent_permissions (
                    *,
                    tool:agent_tools (*)
                ),
                agent_analytics (
                    *,
                    date
                )
            `)
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Agent not found' });
            }
            logger.error('Get agent by ID error:', error);
            return res.status(500).json({ error: 'Failed to fetch agent' });
        }

        let enhancedAgent = { ...agent };

        // ===========================================
        // AI CONFIGURATION MANAGEMENT
        // ===========================================

        if (include_ai_config === 'true') {
            // Add AI service configuration
            enhancedAgent.ai_configuration = {
                available_models: Object.keys(aiServiceManager.models).map(key => ({
                    id: key,
                    ...aiServiceManager.models[key]
                })),
                current_model: agent.model || 'gpt-4',
                selected_model_details: aiServiceManager.models[agent.model] || aiServiceManager.models['gpt-4'],
                ab_testing_enabled: agent.configuration?.ab_testing_enabled || false,
                performance_tracking: agent.configuration?.performance_tracking !== false,
                auto_model_switching: agent.configuration?.auto_model_switching || false,
                model_preferences: agent.configuration?.model_preferences || {}
            };

            // Add AI capabilities status
            enhancedAgent.ai_capabilities = {
                text_generation: aiServiceManager.models[agent.model]?.capabilities.includes('text_generation') || false,
                sentiment_analysis: aiServiceManager.models[agent.model]?.capabilities.includes('sentiment_analysis') || false,
                decision_making: aiServiceManager.models[agent.model]?.capabilities.includes('decision_making') || false,
                task_suggestions: aiServiceManager.models[agent.model]?.capabilities.includes('task_suggestions') || false,
                code_generation: aiServiceManager.models[agent.model]?.capabilities.includes('code_generation') || false
            };

            // Add configuration recommendations
            enhancedAgent.ai_recommendations = await generateAIConfigurationRecommendations(agent, req.user.id);
        }

        // Add performance metrics
        if (include_performance_metrics === 'true') {
            enhancedAgent.ai_performance = await getAIPerformanceMetrics(agent.id, req.user.id);
        }

        // Add model recommendations
        if (include_model_recommendations === 'true') {
            enhancedAgent.model_recommendations = await generateModelRecommendations(agent, req.user.id);
        }

        // Add A/B testing status
        if (include_ab_testing_status === 'true') {
            enhancedAgent.ab_testing_status = await getABTestingStatus(agent, req.user.id);
        }

        // ===========================================
        // AI CONFIGURATION FUNCTIONS
        // ===========================================

        // Generate AI configuration recommendations
        async function generateAIConfigurationRecommendations(agent, userId) {
            const recommendations = [];

            // Model optimization recommendations
            const currentModel = aiServiceManager.models[agent.model] || aiServiceManager.models['gpt-4'];

            // Recommendation 1: Model capability assessment
            const requiredCapabilities = getAgentRequiredCapabilities(agent.type);
            const missingCapabilities = requiredCapabilities.filter(cap =>
                !currentModel.capabilities.includes(cap)
            );

            if (missingCapabilities.length > 0) {
                const betterModels = Object.values(aiServiceManager.models).filter(model =>
                    missingCapabilities.every(cap => model.capabilities.includes(cap))
                );

                if (betterModels.length > 0) {
                    recommendations.push({
                        type: 'model_upgrade',
                        priority: 'high',
                        title: 'Consider Model Upgrade',
                        description: `Your current model lacks capabilities needed for ${agent.type} tasks.`,
                        missing_capabilities: missingCapabilities,
                        suggested_models: betterModels.map(m => ({ id: m.name, cost_savings: currentModel.cost_per_token - m.cost_per_token })),
                        impact: 'high'
                    });
                }
            }

            // Recommendation 2: Cost optimization
            if (currentModel.cost_per_token > 0.001) {
                const cheaperModels = Object.values(aiServiceManager.models)
                    .filter(model => model.cost_per_token < currentModel.cost_per_token)
                    .sort((a, b) => a.cost_per_token - b.cost_per_token);

                if (cheaperModels.length > 0) {
                    recommendations.push({
                        type: 'cost_optimization',
                        priority: 'medium',
                        title: 'Cost Optimization Opportunity',
                        description: 'Consider using a more cost-effective model for routine tasks.',
                        potential_savings: currentModel.cost_per_token - cheaperModels[0].cost_per_token,
                        alternative_models: cheaperModels.slice(0, 2).map(m => m.name),
                        impact: 'medium'
                    });
                }
            }

            // Recommendation 3: A/B testing suggestion
            if (!agent.configuration?.ab_testing_enabled) {
                recommendations.push({
                    type: 'ab_testing',
                    priority: 'low',
                    title: 'Enable A/B Testing',
                    description: 'Consider enabling A/B testing to optimize model performance.',
                    benefits: [
                        'Compare model performance automatically',
                        'Optimize for your specific use cases',
                        'Identify best models for different task types'
                    ],
                    impact: 'low'
                });
            }

            // Recommendation 4: Performance tracking
            if (agent.configuration?.performance_tracking === false) {
                recommendations.push({
                    type: 'performance_tracking',
                    priority: 'medium',
                    title: 'Enable Performance Tracking',
                    description: 'Enable performance tracking to optimize AI usage.',
                    benefits: [
                        'Monitor response quality and speed',
                        'Identify performance patterns',
                        'Optimize model selection automatically'
                    ],
                    impact: 'medium'
                });
            }

            return {
                recommendations: recommendations.sort((a, b) => {
                    const priorityOrder = { high: 3, medium: 2, low: 1 };
                    return priorityOrder[b.priority] - priorityOrder[a.priority];
                }),
                total_recommendations: recommendations.length,
                generated_at: new Date().toISOString()
            };
        }

        // Get AI performance metrics
        async function getAIPerformanceMetrics(agentId, userId) {
            try {
                const metrics = {};

                // Get recent conversation metrics
                const { data: conversations } = await supabase
                    .from('agent_conversations')
                    .select('response_time_ms, tokens_used, confidence_score, sentiment, created_at')
                    .eq('agent_id', agentId)
                    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

                if (conversations && conversations.length > 0) {
                    metrics.conversation_metrics = {
                        total_conversations: conversations.length,
                        avg_response_time: conversations
                            .filter(c => c.response_time_ms)
                            .reduce((sum, c, _, arr) => sum + (c.response_time_ms / arr.length), 0),
                        avg_tokens_used: conversations
                            .filter(c => c.tokens_used)
                            .reduce((sum, c, _, arr) => sum + (c.tokens_used / arr.length), 0),
                        avg_confidence: conversations
                            .filter(c => c.confidence_score)
                            .reduce((sum, c, _, arr) => sum + (c.confidence_score / arr.length), 0),
                        sentiment_distribution: {
                            positive: conversations.filter(c => c.sentiment === 'positive').length,
                            negative: conversations.filter(c => c.sentiment === 'negative').length,
                            neutral: conversations.filter(c => c.sentiment === 'neutral').length
                        }
                    };
                }

                // Get A/B testing performance
                if (agent.configuration?.ab_testing_enabled) {
                    metrics.ab_testing_performance = aiServiceManager.getPerformanceAnalytics(agent.model, 'text_generation', 30);
                }

                // Get cost metrics
                const { data: logs } = await supabase
                    .from('agent_logs')
                    .select('details')
                    .eq('agent_id', agentId)
                    .eq('action', 'ai_response_generated')
                    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

                if (logs && logs.length > 0) {
                    const totalTokens = logs.reduce((sum, log) => {
                        const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                        return sum + (details.tokens_used || 0);
                    }, 0);

                    const currentModel = aiServiceManager.models[agent.model] || aiServiceManager.models['gpt-4'];
                    metrics.cost_metrics = {
                        total_tokens_used: totalTokens,
                        estimated_cost: totalTokens * currentModel.cost_per_token,
                        cost_per_conversation: totalTokens > 0 ? (totalTokens * currentModel.cost_per_token) / logs.length : 0,
                        period_days: 30
                    };
                }

                return metrics;

            } catch (error) {
                logger.error('Get AI performance metrics error:', error);
                return { error: 'Failed to retrieve performance metrics' };
            }
        }

        // Generate model recommendations
        async function generateModelRecommendations(agent, userId) {
            const recommendations = [];
            const currentModel = aiServiceManager.models[agent.model] || aiServiceManager.models['gpt-4'];

            // Get performance data for comparison
            const performanceData = await getAIPerformanceMetrics(agent.id, userId);

            // Analyze performance and suggest alternatives
            for (const [modelId, modelData] of Object.entries(aiServiceManager.models)) {
                if (modelId === agent.model) continue;

                let recommendation = {
                    model_id: modelId,
                    model_name: modelData.name,
                    reasoning: [],
                    expected_benefits: [],
                    trade_offs: []
                };

                // Capability analysis
                const additionalCapabilities = modelData.capabilities.filter(cap =>
                    !currentModel.capabilities.includes(cap)
                );

                const missingCapabilities = currentModel.capabilities.filter(cap =>
                    !modelData.capabilities.includes(cap)
                );

                if (additionalCapabilities.length > 0) {
                    recommendation.reasoning.push(`Adds capabilities: ${additionalCapabilities.join(', ')}`);
                    recommendation.expected_benefits.push(`Enhanced functionality for ${agent.type} tasks`);
                }

                if (missingCapabilities.length > 0) {
                    recommendation.trade_offs.push(`Loses capabilities: ${missingCapabilities.join(', ')}`);
                }

                // Cost analysis
                const costDifference = modelData.cost_per_token - currentModel.cost_per_token;
                if (costDifference < 0) {
                    recommendation.expected_benefits.push(`Cost savings: ${Math.abs(costDifference * 1000000).toFixed(1)} per 1M tokens`);
                } else if (costDifference > 0) {
                    recommendation.trade_offs.push(`Higher cost: +${(costDifference * 1000000).toFixed(1)} per 1M tokens`);
                }

                // Performance analysis
                if (performanceData.conversation_metrics) {
                    if (modelData.max_tokens > currentModel.max_tokens) {
                        recommendation.expected_benefits.push('Higher token limit for complex tasks');
                    }
                }

                // Only include recommendations with clear benefits or significant differences
                if (recommendation.expected_benefits.length > 0 || recommendation.trade_offs.length > 0) {
                    recommendations.push(recommendation);
                }
            }

            return {
                current_model: {
                    id: agent.model,
                    name: currentModel.name,
                    cost_per_token: currentModel.cost_per_token,
                    capabilities: currentModel.capabilities
                },
                alternative_models: recommendations,
                analysis_timestamp: new Date().toISOString()
            };
        }

        // Get A/B testing status
        async function getABTestingStatus(agent, userId) {
            if (!agent.configuration?.ab_testing_enabled) {
                return {
                    enabled: false,
                    message: 'A/B testing is not enabled for this agent'
                };
            }

            const status = {
                enabled: true,
                active_tests: [],
                performance_comparison: {}
            };

            // Check for active A/B tests
            const testGroups = Array.from(aiServiceManager.abTestingGroups.entries())
                .filter(([key, group]) => key.includes(userId))
                .map(([key, group]) => group);

            status.active_tests = testGroups;

            // Get performance comparison if available
            if (testGroups.length > 0) {
                for (const testGroup of testGroups) {
                    const performance = aiServiceManager.getPerformanceAnalytics(testGroup.variant, testGroup.task_type, 7);
                    if (performance) {
                        status.performance_comparison[testGroup.variant] = performance;
                    }
                }
            }

            return status;
        }

        // Helper function to get required capabilities for agent type
        function getAgentRequiredCapabilities(agentType) {
            const capabilityMap = {
                'task_manager': ['text_generation', 'decision_making', 'task_suggestions'],
                'email_assistant': ['text_generation', 'sentiment_analysis', 'decision_making'],
                'project_coordinator': ['text_generation', 'decision_making', 'task_suggestions'],
                'researcher_agent': ['text_generation', 'sentiment_analysis', 'decision_making', 'task_suggestions'],
                'general': ['text_generation', 'sentiment_analysis']
            };

            return capabilityMap[agentType] || capabilityMap.general;
        }

        // ===========================================
        // END AI CONFIGURATION FUNCTIONS
        // ===========================================

        res.json({
            success: true,
            agent: enhancedAgent,
            ai_features_enabled: {
                configuration: include_ai_config === 'true',
                performance_metrics: include_performance_metrics === 'true',
                model_recommendations: include_model_recommendations === 'true',
                ab_testing_status: include_ab_testing_status === 'true'
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Get agent by ID error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===========================================
// AI MODEL MANAGEMENT AND A/B TESTING ROUTES
// ===========================================

// Update agent AI model configuration
router.patch('/:id/ai-config', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            model,
            ab_testing_enabled,
            performance_tracking,
            auto_model_switching,
            model_preferences
        } = req.body;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name, model, configuration')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Validate model if provided
        if (model && !aiServiceManager.models[model]) {
            return res.status(400).json({
                error: 'Invalid model',
                available_models: Object.keys(aiServiceManager.models)
            });
        }

        // Update agent configuration
        const currentConfig = agent.configuration || {};
        const updatedConfig = {
            ...currentConfig,
            ab_testing_enabled: ab_testing_enabled !== undefined ? ab_testing_enabled : currentConfig.ab_testing_enabled,
            performance_tracking: performance_tracking !== undefined ? performance_tracking : currentConfig.performance_tracking,
            auto_model_switching: auto_model_switching !== undefined ? auto_model_switching : currentConfig.auto_model_switching,
            model_preferences: model_preferences || currentConfig.model_preferences || {}
        };

        // Update agent model if provided
        const updateData = { configuration: JSON.stringify(updatedConfig) };
        if (model) {
            updateData.model = model;
        }

        const { data: updatedAgent, error: updateError } = await supabase
            .from('agents')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (updateError) {
            logger.error('Update agent AI config error:', updateError);
            return res.status(500).json({ error: 'Failed to update AI configuration' });
        }

        // Log configuration change
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: id,
                user_id: req.user.id,
                action: 'ai_config_updated',
                resource_type: 'agent',
                resource_id: id,
                details: {
                    old_model: agent.model,
                    new_model: model || agent.model,
                    config_changes: {
                        ab_testing_enabled: updatedConfig.ab_testing_enabled !== currentConfig.ab_testing_enabled,
                        performance_tracking: updatedConfig.performance_tracking !== currentConfig.performance_tracking,
                        auto_model_switching: updatedConfig.auto_model_switching !== currentConfig.auto_model_switching
                    }
                },
                severity: 'info'
            }]);

        res.json({
            success: true,
            agent: updatedAgent,
            changes_applied: {
                model_changed: model && model !== agent.model,
                ab_testing_changed: updatedConfig.ab_testing_enabled !== currentConfig.ab_testing_enabled,
                performance_tracking_changed: updatedConfig.performance_tracking !== currentConfig.performance_tracking,
                auto_switching_changed: updatedConfig.auto_model_switching !== currentConfig.auto_model_switching
            }
        });

    } catch (error) {
        logger.error('Update agent AI config error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get A/B testing results for agent
router.get('/:id/ab-testing/results', async (req, res) => {
    try {
        const { id } = req.params;
        const { days = 30, task_type = 'all' } = req.query;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name, configuration')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        if (!agent.configuration?.ab_testing_enabled) {
            return res.status(400).json({
                error: 'A/B testing is not enabled for this agent',
                message: 'Enable A/B testing in agent configuration first'
            });
        }

        // Get A/B testing results
        const results = await getABTestingResults(id, req.user.id, parseInt(days), task_type);

        res.json({
            success: true,
            agent_id: id,
            ab_testing_enabled: true,
            results,
            analysis_period_days: parseInt(days),
            task_type_filter: task_type
        });

    } catch (error) {
        logger.error('Get A/B testing results error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Manually switch agent model for A/B testing
router.post('/:id/model-switch', async (req, res) => {
    try {
        const { id } = req.params;
        const { target_model, reason, test_duration_hours = 24 } = req.body;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name, model, configuration')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Validate target model
        if (!aiServiceManager.models[target_model]) {
            return res.status(400).json({
                error: 'Invalid target model',
                available_models: Object.keys(aiServiceManager.models)
            });
        }

        // Create temporary model switch record
        const switchRecord = {
            agent_id: id,
            user_id: req.user.id,
            original_model: agent.model,
            target_model,
            reason: reason || 'Manual model switch for testing',
            test_duration_hours,
            started_at: new Date(),
            expires_at: new Date(Date.now() + (test_duration_hours * 60 * 60 * 1000)),
            status: 'active'
        };

        // Store switch record (you might want to create a table for this)
        // For now, we'll use agent_logs to track the switch
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: id,
                user_id: req.user.id,
                action: 'model_switch_initiated',
                resource_type: 'agent',
                resource_id: id,
                details: switchRecord,
                severity: 'info'
            }]);

        // Temporarily update agent model
        const { data: updatedAgent, error: updateError } = await supabase
            .from('agents')
            .update({ model: target_model })
            .eq('id', id)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (updateError) {
            logger.error('Model switch update error:', updateError);
            return res.status(500).json({ error: 'Failed to switch model' });
        }

        // Schedule automatic reversion
        setTimeout(async () => {
            try {
                await supabase
                    .from('agents')
                    .update({ model: agent.model })
                    .eq('id', id)
                    .eq('user_id', req.user.id);

                await supabase
                    .from('agent_logs')
                    .insert([{
                        agent_id: id,
                        user_id: req.user.id,
                        action: 'model_switch_reverted',
                        resource_type: 'agent',
                        resource_id: id,
                        details: {
                            original_model: agent.model,
                            target_model,
                            reason: 'Automatic reversion after test period'
                        },
                        severity: 'info'
                    }]);

                logger.info(`Model switch reverted for agent ${id} after ${test_duration_hours} hours`);
            } catch (error) {
                logger.error('Model switch reversion error:', error);
            }
        }, test_duration_hours * 60 * 60 * 1000);

        res.json({
            success: true,
            message: `Agent model switched to ${target_model} for ${test_duration_hours} hours`,
            switch_details: {
                agent_id: id,
                original_model: agent.model,
                new_model: target_model,
                test_duration_hours,
                expires_at: switchRecord.expires_at,
                reason: switchRecord.reason
            },
            auto_revert_scheduled: true
        });

    } catch (error) {
        logger.error('Model switch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get AI model performance comparison
router.get('/:id/model-comparison', async (req, res) => {
    try {
        const { id } = req.params;
        const { models, days = 30, task_type = 'text_generation' } = req.query;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name, model')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        const modelsToCompare = models ? models.split(',') : Object.keys(aiServiceManager.models);
        const comparison = {};

        for (const modelId of modelsToCompare) {
            if (aiServiceManager.models[modelId]) {
                comparison[modelId] = {
                    model_info: aiServiceManager.models[modelId],
                    performance: aiServiceManager.getPerformanceAnalytics(modelId, task_type, parseInt(days)) || {
                        sample_size: 0,
                        message: 'No performance data available'
                    }
                };
            }
        }

        res.json({
            success: true,
            agent_id: id,
            current_model: agent.model,
            comparison,
            analysis_period_days: parseInt(days),
            task_type
        });

    } catch (error) {
        logger.error('Model comparison error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===========================================
// AI MODEL MANAGEMENT FUNCTIONS
// ===========================================

// Get comprehensive A/B testing results
async function getABTestingResults(agentId, userId, days, taskType) {
    const results = {
        summary: {},
        variants: {},
        recommendations: []
    };

    // Get all performance data for the agent
    const allModels = Object.keys(aiServiceManager.models);

    for (const modelId of allModels) {
        const performance = aiServiceManager.getPerformanceAnalytics(modelId, taskType, days);

        if (performance && performance.sample_size > 0) {
            results.variants[modelId] = {
                model_info: aiServiceManager.models[modelId],
                performance,
                is_current_model: modelId === (await getCurrentModel(agentId))
            };
        }
    }

    // Generate summary and recommendations
    if (Object.keys(results.variants).length > 1) {
        const variants = Object.values(results.variants);
        const bestVariant = variants.reduce((best, current) =>
            (current.performance.avg_quality_score || 0) > (best.performance.avg_quality_score || 0) ? current : best
        );

        results.summary = {
            total_variants_tested: variants.length,
            best_performing_variant: bestVariant.model_info.name,
            best_performance_score: bestVariant.performance.avg_quality_score,
            improvement_potential: bestVariant.performance.avg_quality_score - (results.variants[await getCurrentModel(agentId)]?.performance?.avg_quality_score || 0),
            confidence_level: calculateConfidenceLevel(variants)
        };

        // Generate recommendations
        if (bestVariant.performance.avg_quality_score > (results.variants[await getCurrentModel(agentId)]?.performance?.avg_quality_score || 0) * 1.1) {
            results.recommendations.push({
                type: 'model_switch',
                priority: 'high',
                title: 'Switch to Better Performing Model',
                description: `${bestVariant.model_info.name} shows ${((bestVariant.performance.avg_quality_score / (results.variants[await getCurrentModel(agentId)]?.performance?.avg_quality_score || 1) - 1) * 100).toFixed(1)}% better performance`,
                recommended_action: `Switch to ${bestVariant.model_info.name}`,
                expected_benefit: 'Improved response quality and user satisfaction'
            });
        }
    }

    return results;
}

// Helper function to get current agent model
async function getCurrentModel(agentId) {
    const { data: agent } = await supabase
        .from('agents')
        .select('model')
        .eq('id', agentId)
        .single();

    return agent?.model || 'gpt-4';
}

// Calculate confidence level for A/B test results
function calculateConfidenceLevel(variants) {
    if (variants.length < 2) return 'low';

    const sampleSizes = variants.map(v => v.performance.sample_size);
    const avgSampleSize = sampleSizes.reduce((a, b) => a + b, 0) / sampleSizes.length;

    if (avgSampleSize > 100) return 'high';
    if (avgSampleSize > 50) return 'medium';
    return 'low';
}

// ===========================================
// END AI MODEL MANAGEMENT FUNCTIONS
// ===========================================

// Create new agent
router.post('/', async (req, res) => {
    try {
        const {
            name,
            type,
            model = 'gpt-4',
            description,
            capabilities = [],
            configuration = {},
            profile = {}
        } = req.body;

        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }

        // Create agent
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .insert([{
                user_id: req.user.id,
                name,
                type,
                model,
                description,
                capabilities: JSON.stringify(capabilities),
                configuration: JSON.stringify(configuration)
            }])
            .select()
            .single();

        if (agentError) {
            logger.error('Create agent error:', agentError);
            return res.status(500).json({ error: 'Failed to create agent' });
        }

        // Create agent profile if provided
        if (Object.keys(profile).length > 0) {
            const { error: profileError } = await supabase
                .from('agent_profiles')
                .insert([{
                    agent_id: agent.id,
                    ...profile
                }]);

            if (profileError) {
                logger.warn('Failed to create agent profile:', profileError);
            }
        }

        // Create initial agent status
        const { error: statusError } = await supabase
            .from('agent_status')
            .insert([{
                agent_id: agent.id,
                status: 'idle'
            }]);

        if (statusError) {
            logger.warn('Failed to create agent status:', statusError);
        }

        // Log agent creation
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: agent.id,
                user_id: req.user.id,
                action: 'agent_created',
                details: { agent_name: name, agent_type: type }
            }]);

        res.status(201).json({
            success: true,
            agent: {
                ...agent,
                capabilities: capabilities,
                configuration: configuration
            }
        });

    } catch (error) {
        logger.error('Create agent error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update agent
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const allowedUpdates = [
            'name', 'type', 'model', 'description', 'is_active',
            'capabilities', 'configuration'
        ];

        const updateData = {};
        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                if (key === 'capabilities' || key === 'configuration') {
                    updateData[key] = JSON.stringify(updates[key]);
                } else {
                    updateData[key] = updates[key];
                }
            }
        });

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        updateData.updated_at = new Date().toISOString();

        const { data: agent, error } = await supabase
            .from('agents')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Agent not found' });
            }
            logger.error('Update agent error:', error);
            return res.status(500).json({ error: 'Failed to update agent' });
        }

        // Log agent update
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: id,
                user_id: req.user.id,
                action: 'agent_updated',
                details: { updated_fields: Object.keys(updateData) }
            }]);

        res.json({
            success: true,
            agent: {
                ...agent,
                capabilities: agent.capabilities ? JSON.parse(agent.capabilities) : [],
                configuration: agent.configuration ? JSON.parse(agent.configuration) : {}
            }
        });

    } catch (error) {
        logger.error('Update agent error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete agent
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if agent exists and belongs to user
        const { data: agent, error: checkError } = await supabase
            .from('agents')
            .select('id, name')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (checkError || !agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Delete agent (cascading will handle related records)
        const { error } = await supabase
            .from('agents')
            .delete()
            .eq('id', id)
            .eq('user_id', req.user.id);

        if (error) {
            logger.error('Delete agent error:', error);
            return res.status(500).json({ error: 'Failed to delete agent' });
        }

        // Log agent deletion
        await supabase
            .from('agent_logs')
            .insert([{
                user_id: req.user.id,
                action: 'agent_deleted',
                resource_type: 'agent',
                resource_id: id,
                details: { agent_name: agent.name }
            }]);

        res.json({
            success: true,
            message: 'Agent deleted successfully'
        });

    } catch (error) {
        logger.error('Delete agent error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===========================================
// DADDY AGENT ENDPOINTS
// ===========================================

// Get daddy agent status and configuration
router.get('/daddy/status', async (req, res) => {
    try {
        const userId = req.user.id;
        const daddyAgent = await getDaddyAgent(userId);

        res.json({
            success: true,
            status: {
                active: true,
                monitoring_level: daddyAgent.monitoringLevel,
                escalation_threshold: daddyAgent.escalationThreshold,
                proactive_suggestions: daddyAgent.proactiveSuggestions,
                personalized_reminders: daddyAgent.personalizedReminders,
                task_breakdown: daddyAgent.taskBreakdown,
                communication_style: daddyAgent.communicationStyle,
                metrics: daddyAgent.getMetrics()
            }
        });

    } catch (error) {
        logger.error('Error getting daddy agent status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get daddy agent status',
            message: error.message
        });
    }
});

// Start daddy agent monitoring for a task
router.post('/daddy/monitor/task/:taskId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const { custom_config } = req.body;

        // Verify task belongs to user
        const { data: task } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .eq('user_id', userId)
            .single();

        if (!task) {
            return res.status(404).json({
                success: false,
                error: 'Task not found or access denied'
            });
        }

        const daddyAgent = await getDaddyAgent(userId);

        // Apply custom configuration if provided
        if (custom_config) {
            Object.assign(daddyAgent, custom_config);
        }

        await daddyAgent.startTaskMonitoring(taskId, task);

        res.json({
            success: true,
            message: 'Daddy agent monitoring started',
            task_id: taskId,
            monitoring_config: {
                level: daddyAgent.monitoringLevel,
                escalation_threshold: daddyAgent.escalationThreshold,
                proactive_suggestions: daddyAgent.proactiveSuggestions
            }
        });

    } catch (error) {
        logger.error('Error starting task monitoring:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start task monitoring',
            message: error.message
        });
    }
});

// Stop daddy agent monitoring for a task
router.delete('/daddy/monitor/task/:taskId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;

        const daddyAgent = await getDaddyAgent(userId);
        daddyAgent.stopTaskMonitoring(taskId);

        res.json({
            success: true,
            message: 'Daddy agent monitoring stopped',
            task_id: taskId
        });

    } catch (error) {
        logger.error('Error stopping task monitoring:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop task monitoring',
            message: error.message
        });
    }
});

// Get daddy agent suggestions for user
router.get('/daddy/suggestions', async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 10, category } = req.query;

        const daddyAgent = await getDaddyAgent(userId);
        const patterns = await preferenceLearner.analyzePatterns(userId);
        const suggestions = await preferenceLearner.generateProactiveSuggestions(userId, patterns);

        // Filter by category if specified
        let filteredSuggestions = suggestions;
        if (category) {
            filteredSuggestions = suggestions.filter(s => s.category === category);
        }

        // Limit results
        filteredSuggestions = filteredSuggestions.slice(0, parseInt(limit));

        res.json({
            success: true,
            suggestions: filteredSuggestions,
            total_available: suggestions.length,
            filtered_count: filteredSuggestions.length,
            categories: [...new Set(suggestions.map(s => s.category))]
        });

    } catch (error) {
        logger.error('Error getting daddy agent suggestions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get suggestions',
            message: error.message
        });
    }
});

// Process feedback on daddy agent suggestions
router.post('/daddy/feedback', async (req, res) => {
    try {
        const userId = req.user.id;
        const { suggestion_id, feedback } = req.body;

        if (!suggestion_id || !feedback) {
            return res.status(400).json({
                success: false,
                error: 'suggestion_id and feedback are required'
            });
        }

        const daddyAgent = await getDaddyAgent(userId);
        await daddyAgent.processFeedback(suggestion_id, feedback);

        res.json({
            success: true,
            message: 'Feedback recorded successfully'
        });

    } catch (error) {
        logger.error('Error processing daddy agent feedback:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process feedback',
            message: error.message
        });
    }
});

// Get daddy agent analytics and effectiveness metrics
router.get('/daddy/analytics', async (req, res) => {
    try {
        const userId = req.user.id;
        const { days = 30 } = req.query;

        const daddyAgent = await getDaddyAgent(userId);
        const metrics = daddyAgent.getMetrics();

        // Get historical data from database
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

        // Get logs for real agents only (skip daddy agent since it's not stored in DB)
        const { data: agents } = await supabase
            .from('agents')
            .select('id')
            .eq('user_id', userId);

        let logs = [];
        if (agents && agents.length > 0) {
            const agentIds = agents.map(a => a.id);
            const { data: agentLogs, error } = await supabase
                .from('agent_logs')
                .select('*')
                .eq('user_id', userId)
                .in('agent_id', agentIds)
                .gte('created_at', cutoffDate.toISOString())
                .order('created_at', { ascending: false });

            if (error) throw error;
            logs = agentLogs || [];
        }

        // Analyze effectiveness
        const escalations = logs.filter(log => log.action === 'task_escalation_triggered');
        const suggestions = logs.filter(log => log.action.includes('suggestion'));

        const effectiveness = {
            escalation_rate: logs.length > 0 ? escalations.length / logs.length : 0,
            suggestion_rate: logs.length > 0 ? suggestions.length / logs.length : 0,
            avg_response_time: logs
                .filter(log => log.duration_ms)
                .reduce((sum, log) => sum + log.duration_ms, 0) / logs.length || 0,
            total_actions: logs.length,
            period_days: parseInt(days)
        };

        res.json({
            success: true,
            current_metrics: metrics,
            historical_effectiveness: effectiveness,
            recent_activity: logs.slice(0, 20) // Last 20 activities
        });

    } catch (error) {
        logger.error('Error getting daddy agent analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get analytics',
            message: error.message
        });
    }
});

// Update daddy agent configuration
router.put('/daddy/config', async (req, res) => {
    try {
        const userId = req.user.id;
        const updates = req.body;

        const daddyAgent = await getDaddyAgent(userId);

        // Validate configuration updates
        const validKeys = [
            'monitoringLevel', 'escalationThreshold', 'proactiveSuggestions',
            'personalizedReminders', 'taskBreakdown', 'communicationStyle'
        ];

        const validUpdates = {};
        Object.keys(updates).forEach(key => {
            if (validKeys.includes(key)) {
                validUpdates[key] = updates[key];
            }
        });

        // Apply updates
        Object.assign(daddyAgent, validUpdates);

        // Log configuration change (skip database logging for daddy agent since it's not a real agent)
        logger.info(`Daddy agent configuration updated for user ${userId}:`, validUpdates);

        res.json({
            success: true,
            message: 'Daddy agent configuration updated',
            new_config: {
                monitoring_level: daddyAgent.monitoringLevel,
                escalation_threshold: daddyAgent.escalationThreshold,
                proactive_suggestions: daddyAgent.proactiveSuggestions,
                personalized_reminders: daddyAgent.personalizedReminders,
                task_breakdown: daddyAgent.taskBreakdown,
                communication_style: daddyAgent.communicationStyle
            }
        });

    } catch (error) {
        logger.error('Error updating daddy agent configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update configuration',
            message: error.message
        });
    }
});

// ===========================================
// AGENT STATUS ROUTES
// ===========================================

// Get agent status
router.get('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: status, error } = await supabase
            .from('agent_status')
            .select('*')
            .eq('agent_id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Agent status not found' });
            }
            logger.error('Get agent status error:', error);
            return res.status(500).json({ error: 'Failed to fetch agent status' });
        }

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        res.json({
            success: true,
            status
        });

    } catch (error) {
        logger.error('Get agent status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update agent status
router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, status_message, current_task_id } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        const updateData = {
            status,
            last_activity: new Date().toISOString()
        };

        if (status_message !== undefined) {
            updateData.status_message = status_message;
        }

        if (current_task_id !== undefined) {
            updateData.current_task_id = current_task_id;
        }

        const { data: updatedStatus, error } = await supabase
            .from('agent_status')
            .update(updateData)
            .eq('agent_id', id)
            .select()
            .single();

        if (error) {
            logger.error('Update agent status error:', error);
            return res.status(500).json({ error: 'Failed to update agent status' });
        }

        // Get old status for history tracking
        const { data: oldStatus } = await supabase
            .from('agent_status')
            .select('*')
            .eq('agent_id', id)
            .single();

        // Log status change with comprehensive details
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: id,
                user_id: req.user.id,
                action: 'status_changed',
                details: {
                    old_status: oldStatus?.status || 'unknown',
                    new_status: status,
                    status_message,
                    current_task_id,
                    transition_timestamp: new Date().toISOString(),
                    source: 'api_update'
                }
            }]);

        // Broadcast status update to real-time subscribers
        await broadcastStatusUpdate(id, updatedStatus, req.user.id);

        // Create status history record
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: id,
                user_id: req.user.id,
                action: 'status_history',
                resource_type: 'agent_status',
                resource_id: updatedStatus.id,
                details: {
                    status: status,
                    status_message,
                    current_task_id,
                    health_score: updatedStatus.health_score,
                    cpu_usage: updatedStatus.cpu_usage,
                    memory_usage: updatedStatus.memory_usage,
                    uptime_seconds: updatedStatus.uptime_seconds,
                    transition_type: 'manual_update',
                    previous_status: oldStatus?.status || 'unknown'
                },
                severity: 'info'
            }]);

        res.json({
            success: true,
            status: updatedStatus,
            broadcasted: true
        });

    } catch (error) {
        logger.error('Update agent status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Polling endpoint for status updates (fallback for clients without SSE/WebSocket support)
router.get('/status/poll', async (req, res) => {
    try {
        const userId = req.user.id;
        const { agent_ids, since, include_history = 'false' } = req.query;

        let query = supabase
            .from('agent_status')
            .select(`
                *,
                agents!inner (
                    id,
                    name,
                    type,
                    is_active
                )
            `);

        // Filter by user agents
        const { data: userAgents } = await supabase
            .from('agents')
            .select('id')
            .eq('user_id', userId);

        if (userAgents && userAgents.length > 0) {
            const agentIds = userAgents.map(agent => agent.id);
            query = query.in('agent_id', agentIds);
        } else {
            return res.json({
                success: true,
                statuses: [],
                count: 0,
                message: 'No agents found for user'
            });
        }

        // Filter by specific agent IDs if provided
        if (agent_ids) {
            const requestedAgentIds = agent_ids.split(',');
            query = query.in('agent_id', requestedAgentIds);
        }

        // Filter by timestamp if provided
        if (since) {
            query = query.gte('updated_at', since);
        }

        const { data: statuses, error } = await query;

        if (error) {
            logger.error('Poll agent status error:', error);
            return res.status(500).json({ error: 'Failed to poll agent statuses' });
        }

        // Get recent status history if requested
        let statusHistory = [];
        if (include_history === 'true' && since) {
            const { data: history } = await supabase
                .from('agent_logs')
                .select('*')
                .eq('action', 'status_changed')
                .in('agent_id', statuses.map(s => s.agent_id))
                .gte('created_at', since)
                .order('created_at', { ascending: false });

            statusHistory = history || [];
        }

        res.json({
            success: true,
            statuses: statuses || [],
            count: statuses?.length || 0,
            history: statusHistory,
            timestamp: new Date().toISOString(),
            polling_interval_suggested: 30 // Suggest polling every 30 seconds
        });

    } catch (error) {
        logger.error('Poll agent status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Bulk status update endpoint
router.put('/status/bulk', async (req, res) => {
    try {
        const userId = req.user.id;
        const { updates } = req.body; // Array of { agent_id, status, status_message, current_task_id }

        if (!updates || !Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ error: 'Updates array is required' });
        }

        // Verify all agents belong to user
        const agentIds = updates.map(update => update.agent_id);
        const { data: userAgents } = await supabase
            .from('agents')
            .select('id')
            .eq('user_id', userId)
            .in('id', agentIds);

        if (!userAgents || userAgents.length !== agentIds.length) {
            return res.status(403).json({ error: 'Access denied to one or more agents' });
        }

        const results = [];
        const errors = [];

        // Process each update
        for (const update of updates) {
            try {
                const { agent_id, status, status_message, current_task_id } = update;

                const updateData = {
                    status,
                    last_activity: new Date().toISOString()
                };

                if (status_message !== undefined) {
                    updateData.status_message = status_message;
                }

                if (current_task_id !== undefined) {
                    updateData.current_task_id = current_task_id;
                }

                const { data: updatedStatus, error } = await supabase
                    .from('agent_status')
                    .update(updateData)
                    .eq('agent_id', agent_id)
                    .select()
                    .single();

                if (error) {
                    errors.push({ agent_id, error: error.message });
                    continue;
                }

                // Broadcast status update
                await broadcastStatusUpdate(agent_id, updatedStatus, userId);

                // Log status change
                await supabase
                    .from('agent_logs')
                    .insert([{
                        agent_id: agent_id,
                        user_id: userId,
                        action: 'status_changed',
                        details: {
                            old_status: 'bulk_update',
                            new_status: status,
                            status_message,
                            current_task_id,
                            transition_timestamp: new Date().toISOString(),
                            source: 'bulk_update'
                        }
                    }]);

                results.push(updatedStatus);

            } catch (error) {
                errors.push({ agent_id: update.agent_id, error: error.message });
            }
        }

        res.json({
            success: true,
            results,
            errors,
            total_processed: updates.length,
            successful_updates: results.length,
            failed_updates: errors.length
        });

    } catch (error) {
        logger.error('Bulk status update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===========================================
// AGENT HEARTBEAT MONITORING
// ===========================================

// Agent heartbeat endpoint
router.post('/:id/heartbeat', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            status = 'active',
            health_score = 1.0,
            cpu_usage,
            memory_usage,
            uptime_seconds,
            metadata = {}
        } = req.body;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        const heartbeatTimestamp = new Date().toISOString();

        // Update agent heartbeat timestamp
        agentHeartbeats.set(id, {
            timestamp: heartbeatTimestamp,
            status,
            health_score,
            metadata
        });

        // Update agent status with heartbeat data
        const updateData = {
            status,
            last_activity: heartbeatTimestamp,
            health_score,
            uptime_seconds: uptime_seconds || 0
        };

        if (cpu_usage !== undefined) updateData.cpu_usage = cpu_usage;
        if (memory_usage !== undefined) updateData.memory_usage = memory_usage;

        const { data: updatedStatus, error: statusError } = await supabase
            .from('agent_status')
            .update(updateData)
            .eq('agent_id', id)
            .select()
            .single();

        if (statusError) {
            logger.error('Update agent status from heartbeat error:', statusError);
            // Don't fail the heartbeat if status update fails
        }

        // Log heartbeat
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: id,
                user_id: req.user.id,
                action: 'heartbeat',
                details: {
                    status,
                    health_score,
                    cpu_usage,
                    memory_usage,
                    uptime_seconds,
                    metadata,
                    heartbeat_timestamp: heartbeatTimestamp
                },
                severity: 'debug'
            }]);

        // Broadcast heartbeat update if status changed significantly
        if (updatedStatus && (status !== 'active' || health_score < 0.8)) {
            await broadcastStatusUpdate(id, updatedStatus, req.user.id);
        }

        res.json({
            success: true,
            heartbeat_received: true,
            timestamp: heartbeatTimestamp,
            next_heartbeat_expected: new Date(Date.now() + 60000).toISOString() // Expect heartbeat in 1 minute
        });

    } catch (error) {
        logger.error('Agent heartbeat error:', error);
        res.status(500).json({ error: 'Failed to process heartbeat' });
    }
});

// Get agent heartbeat status
router.get('/:id/heartbeat', async (req, res) => {
    try {
        const { id } = req.params;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        const heartbeat = agentHeartbeats.get(id);
        const currentTime = new Date();
        let status = 'unknown';

        if (heartbeat) {
            const timeSinceHeartbeat = currentTime - new Date(heartbeat.timestamp);
            const heartbeatInterval = 60 * 1000; // 1 minute
            const timeoutThreshold = 5 * 60 * 1000; // 5 minutes

            if (timeSinceHeartbeat < heartbeatInterval) {
                status = 'active';
            } else if (timeSinceHeartbeat < timeoutThreshold) {
                status = 'stale';
            } else {
                status = 'offline';
            }
        }

        // Get recent heartbeat logs
        const { data: recentLogs } = await supabase
            .from('agent_logs')
            .select('*')
            .eq('agent_id', id)
            .eq('action', 'heartbeat')
            .order('created_at', { ascending: false })
            .limit(10);

        res.json({
            success: true,
            agent_id: id,
            agent_name: agent.name,
            heartbeat_status: status,
            last_heartbeat: heartbeat?.timestamp || null,
            health_score: heartbeat?.health_score || null,
            recent_heartbeats: recentLogs || [],
            current_time: currentTime.toISOString()
        });

    } catch (error) {
        logger.error('Get heartbeat status error:', error);
        res.status(500).json({ error: 'Failed to get heartbeat status' });
    }
});

// Get all agent heartbeat statuses
router.get('/heartbeat/status', async (req, res) => {
    try {
        const userId = req.user.id;
        const { include_offline = 'true' } = req.query;

        // Get user's agents
        const { data: agents } = await supabase
            .from('agents')
            .select('id, name, type, is_active')
            .eq('user_id', userId);

        if (!agents) {
            return res.json({
                success: true,
                heartbeats: [],
                summary: { total: 0, active: 0, stale: 0, offline: 0 }
            });
        }

        const currentTime = new Date();
        const heartbeatStatuses = [];
        let summary = { total: 0, active: 0, stale: 0, offline: 0 };

        for (const agent of agents) {
            summary.total++;

            const heartbeat = agentHeartbeats.get(agent.id);
            let status = 'unknown';

            if (heartbeat) {
                const timeSinceHeartbeat = currentTime - new Date(heartbeat.timestamp);
                const heartbeatInterval = 60 * 1000; // 1 minute
                const timeoutThreshold = 5 * 60 * 1000; // 5 minutes

                if (timeSinceHeartbeat < heartbeatInterval) {
                    status = 'active';
                    summary.active++;
                } else if (timeSinceHeartbeat < timeoutThreshold) {
                    status = 'stale';
                    summary.stale++;
                } else {
                    status = 'offline';
                    summary.offline++;
                }
            } else {
                status = 'offline';
                summary.offline++;
            }

            if (include_offline === 'true' || status !== 'offline') {
                heartbeatStatuses.push({
                    agent_id: agent.id,
                    agent_name: agent.name,
                    agent_type: agent.type,
                    is_active: agent.is_active,
                    heartbeat_status: status,
                    last_heartbeat: heartbeat?.timestamp || null,
                    health_score: heartbeat?.health_score || null,
                    time_since_heartbeat: heartbeat ? (currentTime - new Date(heartbeat.timestamp)) / 1000 : null
                });
            }
        }

        res.json({
            success: true,
            heartbeats: heartbeatStatuses,
            summary,
            current_time: currentTime.toISOString()
        });

    } catch (error) {
        logger.error('Get all heartbeat statuses error:', error);
        res.status(500).json({ error: 'Failed to get heartbeat statuses' });
    }
});

// Clean up stale heartbeats every 10 minutes
setInterval(() => {
    const currentTime = new Date();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes

    for (const [agentId, heartbeat] of agentHeartbeats) {
        const timeSinceHeartbeat = currentTime - new Date(heartbeat.timestamp);
        if (timeSinceHeartbeat > staleThreshold) {
            agentHeartbeats.delete(agentId);
            logger.debug(`Cleaned up stale heartbeat for agent ${agentId}`);
        }
    }

    logger.debug(`Heartbeat cleanup: ${agentHeartbeats.size} active heartbeats remaining`);
}, 10 * 60 * 1000);

// ===========================================
// STATUS HISTORY TRACKING
// ===========================================

// Get agent status history
router.get('/:id/status/history', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            limit = 100,
            offset = 0,
            since,
            until,
            status_type,
            include_metadata = 'true'
        } = req.query;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        let query = supabase
            .from('agent_logs')
            .select('*')
            .eq('agent_id', id)
            .in('action', ['status_changed', 'status_history', 'heartbeat'])
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (since) {
            query = query.gte('created_at', since);
        }

        if (until) {
            query = query.lte('created_at', until);
        }

        if (status_type) {
            if (status_type === 'manual') {
                query = query.eq('action', 'status_changed');
            } else if (status_type === 'automatic') {
                query = query.in('action', ['status_history', 'heartbeat']);
            }
        }

        const { data: history, error } = await query;

        if (error) {
            logger.error('Get agent status history error:', error);
            return res.status(500).json({ error: 'Failed to fetch status history' });
        }

        // Process and format history entries
        const formattedHistory = history.map(entry => {
            const details = entry.details || {};

            return {
                id: entry.id,
                timestamp: entry.created_at,
                action: entry.action,
                status: details.status || details.new_status,
                previous_status: details.old_status || details.previous_status,
                status_message: details.status_message,
                current_task_id: details.current_task_id,
                source: details.source || 'unknown',
                transition_type: details.transition_type,
                health_score: details.health_score,
                cpu_usage: details.cpu_usage,
                memory_usage: details.memory_usage,
                uptime_seconds: details.uptime_seconds,
                metadata: include_metadata === 'true' ? details.metadata : undefined,
                severity: entry.severity,
                user_id: entry.user_id
            };
        });

        // Get status transition statistics
        const transitions = {};
        formattedHistory.forEach(entry => {
            if (entry.status && entry.previous_status) {
                const transition = `${entry.previous_status}->${entry.status}`;
                transitions[transition] = (transitions[transition] || 0) + 1;
            }
        });

        res.json({
            success: true,
            agent_id: id,
            agent_name: agent.name,
            history: formattedHistory,
            count: formattedHistory.length,
            transitions,
            has_more: formattedHistory.length === parseInt(limit),
            period: {
                since,
                until,
                total_records: formattedHistory.length
            }
        });

    } catch (error) {
        logger.error('Get agent status history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get status history for all user agents
router.get('/status/history', async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            limit = 200,
            offset = 0,
            since,
            until,
            agent_ids,
            status_type,
            group_by_agent = 'false'
        } = req.query;

        // Get user's agents
        let agentQuery = supabase
            .from('agents')
            .select('id, name')
            .eq('user_id', userId);

        if (agent_ids) {
            const requestedIds = agent_ids.split(',');
            agentQuery = agentQuery.in('id', requestedIds);
        }

        const { data: userAgents, error: agentError } = await agentQuery;

        if (agentError || !userAgents || userAgents.length === 0) {
            return res.json({
                success: true,
                history: [],
                agents: [],
                summary: { total_entries: 0, agents_with_history: 0 }
            });
        }

        const agentIds = userAgents.map(agent => agent.id);

        let query = supabase
            .from('agent_logs')
            .select(`
                *,
                agents!inner (
                    id,
                    name,
                    type
                )
            `)
            .in('agent_id', agentIds)
            .in('action', ['status_changed', 'status_history', 'heartbeat'])
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (since) {
            query = query.gte('created_at', since);
        }

        if (until) {
            query = query.lte('created_at', until);
        }

        if (status_type) {
            if (status_type === 'manual') {
                query = query.eq('action', 'status_changed');
            } else if (status_type === 'automatic') {
                query = query.in('action', ['status_history', 'heartbeat']);
            }
        }

        const { data: history, error } = await query;

        if (error) {
            logger.error('Get all agents status history error:', error);
            return res.status(500).json({ error: 'Failed to fetch status history' });
        }

        let result = history || [];

        // Group by agent if requested
        if (group_by_agent === 'true') {
            const grouped = {};
            result.forEach(entry => {
                const agentId = entry.agent_id;
                if (!grouped[agentId]) {
                    grouped[agentId] = {
                        agent_id: agentId,
                        agent_name: entry.agents.name,
                        agent_type: entry.agents.type,
                        history: []
                    };
                }
                grouped[agentId].history.push(entry);
            });
            result = Object.values(grouped);
        }

        // Calculate summary statistics
        const summary = {
            total_entries: history?.length || 0,
            agents_with_history: new Set(history?.map(h => h.agent_id) || []).size,
            date_range: {
                earliest: history?.length > 0 ? history[history.length - 1]?.created_at : null,
                latest: history?.length > 0 ? history[0]?.created_at : null
            },
            action_breakdown: {}
        };

        // Count actions
        history?.forEach(entry => {
            summary.action_breakdown[entry.action] = (summary.action_breakdown[entry.action] || 0) + 1;
        });

        res.json({
            success: true,
            history: result,
            agents: userAgents,
            summary,
            has_more: (history?.length || 0) === parseInt(limit),
            filters: {
                agent_ids: agent_ids?.split(','),
                status_type,
                group_by_agent: group_by_agent === 'true',
                date_range: { since, until }
            }
        });

    } catch (error) {
        logger.error('Get all agents status history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get status transition analytics
router.get('/:id/status/analytics', async (req, res) => {
    try {
        const { id } = req.params;
        const { days = 30 } = req.query;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // Get status history for analytics
        const { data: history, error } = await supabase
            .from('agent_logs')
            .select('*')
            .eq('agent_id', id)
            .in('action', ['status_changed', 'status_history'])
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });

        if (error) {
            logger.error('Get status analytics error:', error);
            return res.status(500).json({ error: 'Failed to fetch status analytics' });
        }

        // Analyze status transitions
        const analytics = {
            agent_id: id,
            agent_name: agent.name,
            period_days: parseInt(days),
            total_transitions: 0,
            status_distribution: {},
            transition_matrix: {},
            uptime_percentage: 0,
            average_status_duration: {},
            most_frequent_transitions: []
        };

        let currentStatus = null;
        let statusStartTime = null;
        const statusDurations = {};
        const transitionCounts = {};

        for (const entry of history || []) {
            const details = entry.details || {};
            const newStatus = details.status || details.new_status;

            if (newStatus) {
                // Count status occurrences
                analytics.status_distribution[newStatus] = (analytics.status_distribution[newStatus] || 0) + 1;

                // Track transitions
                if (currentStatus && currentStatus !== newStatus) {
                    const transition = `${currentStatus}->${newStatus}`;
                    transitionCounts[transition] = (transitionCounts[transition] || 0) + 1;
                    analytics.total_transitions++;

                    // Calculate duration of previous status
                    if (statusStartTime) {
                        const duration = new Date(entry.created_at) - new Date(statusStartTime);
                        if (!statusDurations[currentStatus]) {
                            statusDurations[currentStatus] = [];
                        }
                        statusDurations[currentStatus].push(duration);
                    }
                }

                currentStatus = newStatus;
                statusStartTime = entry.created_at;
            }
        }

        // Calculate average durations
        Object.keys(statusDurations).forEach(status => {
            const durations = statusDurations[status];
            const totalDuration = durations.reduce((sum, d) => sum + d, 0);
            analytics.average_status_duration[status] = totalDuration / durations.length;
        });

        // Build transition matrix
        Object.keys(transitionCounts).forEach(transition => {
            const [from, to] = transition.split('->');
            if (!analytics.transition_matrix[from]) {
                analytics.transition_matrix[from] = {};
            }
            analytics.transition_matrix[from][to] = transitionCounts[transition];
        });

        // Find most frequent transitions
        const sortedTransitions = Object.entries(transitionCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        analytics.most_frequent_transitions = sortedTransitions.map(([transition, count]) => ({
            transition,
            count,
            percentage: (count / analytics.total_transitions) * 100
        }));

        // Calculate uptime (time spent in 'active' or 'idle' status)
        const activeTime = (analytics.average_status_duration.active || 0) +
                          (analytics.average_status_duration.idle || 0);
        const totalTime = Object.values(analytics.average_status_duration)
            .reduce((sum, duration) => sum + duration, 0);

        analytics.uptime_percentage = totalTime > 0 ? (activeTime / totalTime) * 100 : 0;

        res.json({
            success: true,
            analytics
        });

    } catch (error) {
        logger.error('Get status analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===========================================
// STATUS CHANGE NOTIFICATIONS
// ===========================================

// Create status change notification
async function createStatusNotification(agentId, userId, statusData, notificationType = 'status_change') {
    try {
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name, type')
            .eq('id', agentId)
            .single();

        if (!agent) {
            return null;
        }

        let title, message, priority;

        switch (notificationType) {
            case 'status_change':
                title = `Agent Status Changed: ${agent.name}`;
                message = `Agent "${agent.name}" changed status to ${statusData.status}`;
                priority = statusData.status === 'error' ? 4 : statusData.status === 'offline' ? 3 : 2;
                break;

            case 'heartbeat_failed':
                title = `Agent Offline: ${agent.name}`;
                message = `Agent "${agent.name}" has stopped sending heartbeats and may be offline`;
                priority = 4;
                break;

            case 'high_cpu_usage':
                title = `High CPU Usage: ${agent.name}`;
                message = `Agent "${agent.name}" is experiencing high CPU usage (${statusData.cpu_usage}%)`;
                priority = 3;
                break;

            case 'low_health_score':
                title = `Agent Health Warning: ${agent.name}`;
                message = `Agent "${agent.name}" health score is low (${statusData.health_score})`;
                priority = 3;
                break;

            default:
                title = `Agent Notification: ${agent.name}`;
                message = `Agent "${agent.name}" status update`;
                priority = 2;
        }

        const notificationData = {
            user_id: userId,
            type: `agent_${notificationType}`,
            title,
            message,
            priority,
            action_required: ['error', 'offline', 'heartbeat_failed'].includes(notificationType),
            data: JSON.stringify({
                agent_id: agentId,
                agent_name: agent.name,
                agent_type: agent.type,
                status_data: statusData,
                notification_type: notificationType,
                timestamp: new Date().toISOString()
            })
        };

        const { data, error } = await supabase
            .from('notifications')
            .insert([notificationData])
            .select()
            .single();

        if (error) {
            logger.error('Create status notification error:', error);
        }

        return data;

    } catch (error) {
        logger.error('Create status notification error:', error);
        return null;
    }
}

// Check for status alerts and create notifications
async function checkStatusAlerts(agentId, userId, statusData, previousStatus = null) {
    try {
        const alerts = [];

        // Check for error status
        if (statusData.status === 'error' && previousStatus?.status !== 'error') {
            alerts.push('status_change');
        }

        // Check for offline status
        if (statusData.status === 'offline' && previousStatus?.status !== 'offline') {
            alerts.push('status_change');
        }

        // Check for high CPU usage
        if (statusData.cpu_usage && statusData.cpu_usage > 80) {
            alerts.push('high_cpu_usage');
        }

        // Check for low health score
        if (statusData.health_score && statusData.health_score < 0.5) {
            alerts.push('low_health_score');
        }

        // Create notifications for alerts
        for (const alertType of alerts) {
            await createStatusNotification(agentId, userId, statusData, alertType);
        }

        // Check heartbeat status
        if (agentHeartbeats.has(agentId)) {
            const heartbeat = agentHeartbeats.get(agentId);
            const timeSinceHeartbeat = new Date() - new Date(heartbeat.timestamp);
            const timeoutThreshold = 5 * 60 * 1000; // 5 minutes

            if (timeSinceHeartbeat > timeoutThreshold) {
                // Only create heartbeat failed notification if we haven't recently
                const { data: recentNotifications } = await supabase
                    .from('notifications')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('type', 'agent_heartbeat_failed')
                    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // Last 10 minutes
                    .limit(1);

                if (!recentNotifications || recentNotifications.length === 0) {
                    await createStatusNotification(agentId, userId, {
                        ...statusData,
                        last_heartbeat: heartbeat.timestamp,
                        time_since_heartbeat: Math.floor(timeSinceHeartbeat / 1000)
                    }, 'heartbeat_failed');
                }
            }
        }

    } catch (error) {
        logger.error('Check status alerts error:', error);
    }
}

// Enhanced status update function with notifications
async function updateAgentStatusWithNotifications(agentId, userId, statusData, source = 'api') {
    try {
        // Get current status for comparison
        const { data: currentStatus } = await supabase
            .from('agent_status')
            .select('*')
            .eq('agent_id', agentId)
            .single();

        const updateData = {
            status: statusData.status,
            last_activity: new Date().toISOString()
        };

        if (statusData.status_message !== undefined) updateData.status_message = statusData.status_message;
        if (statusData.current_task_id !== undefined) updateData.current_task_id = statusData.current_task_id;
        if (statusData.health_score !== undefined) updateData.health_score = statusData.health_score;
        if (statusData.cpu_usage !== undefined) updateData.cpu_usage = statusData.cpu_usage;
        if (statusData.memory_usage !== undefined) updateData.memory_usage = statusData.memory_usage;
        if (statusData.uptime_seconds !== undefined) updateData.uptime_seconds = statusData.uptime_seconds;

        const { data: updatedStatus, error } = await supabase
            .from('agent_status')
            .update(updateData)
            .eq('agent_id', agentId)
            .select()
            .single();

        if (error) {
            logger.error('Update agent status error:', error);
            return null;
        }

        // Check for alerts and create notifications
        await checkStatusAlerts(agentId, userId, updatedStatus, currentStatus);

        // Broadcast status update
        await broadcastStatusUpdate(agentId, updatedStatus, userId);

        // Log status change with comprehensive details
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: agentId,
                user_id: userId,
                action: 'status_changed',
                details: {
                    old_status: currentStatus?.status || 'unknown',
                    new_status: statusData.status,
                    status_message: statusData.status_message,
                    current_task_id: statusData.current_task_id,
                    health_score: statusData.health_score,
                    cpu_usage: statusData.cpu_usage,
                    memory_usage: statusData.memory_usage,
                    uptime_seconds: statusData.uptime_seconds,
                    transition_timestamp: new Date().toISOString(),
                    source,
                    notification_sent: true
                }
            }]);

        return updatedStatus;

    } catch (error) {
        logger.error('Update agent status with notifications error:', error);
        return null;
    }
}

// Get status notifications for user
router.get('/notifications/status', async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            limit = 50,
            offset = 0,
            agent_ids,
            notification_types,
            since,
            include_resolved = 'false'
        } = req.query;

        let query = supabase
            .from('notifications')
            .select(`
                *,
                agent_data:agent_id (
                    id,
                    name,
                    type
                )
            `)
            .eq('user_id', userId)
            .like('type', 'agent_%')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (include_resolved !== 'true') {
            query = query.neq('status', 'resolved');
        }

        if (since) {
            query = query.gte('created_at', since);
        }

        if (notification_types) {
            const types = notification_types.split(',');
            query = query.in('type', types);
        }

        const { data: notifications, error } = await query;

        if (error) {
            logger.error('Get status notifications error:', error);
            return res.status(500).json({ error: 'Failed to fetch status notifications' });
        }

        // Filter by agent_ids if provided
        let filteredNotifications = notifications || [];
        if (agent_ids) {
            const requestedIds = agent_ids.split(',');
            filteredNotifications = filteredNotifications.filter(notification => {
                const data = JSON.parse(notification.data || '{}');
                return requestedIds.includes(data.agent_id);
            });
        }

        // Enrich notifications with additional data
        const enrichedNotifications = filteredNotifications.map(notification => {
            const data = JSON.parse(notification.data || '{}');
            return {
                ...notification,
                agent_name: data.agent_name,
                agent_type: data.agent_type,
                status_data: data.status_data,
                notification_type: data.notification_type,
                alert_timestamp: data.timestamp
            };
        });

        res.json({
            success: true,
            notifications: enrichedNotifications,
            count: enrichedNotifications.length,
            has_more: enrichedNotifications.length === parseInt(limit),
            filters: {
                agent_ids: agent_ids?.split(','),
                notification_types: notification_types?.split(','),
                include_resolved: include_resolved === 'true',
                since
            }
        });

    } catch (error) {
        logger.error('Get status notifications error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Mark status notifications as resolved
router.patch('/notifications/status/:notificationId/resolve', async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.id;
        const { resolution_notes } = req.body;

        const { data: notification, error: fetchError } = await supabase
            .from('notifications')
            .select('*')
            .eq('id', notificationId)
            .eq('user_id', userId)
            .single();

        if (fetchError || !notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        // Update notification status
        const updateData = {
            status: 'resolved',
            updated_at: new Date().toISOString()
        };

        if (resolution_notes) {
            const currentData = JSON.parse(notification.data || '{}');
            currentData.resolution_notes = resolution_notes;
            currentData.resolved_at = new Date().toISOString();
            updateData.data = JSON.stringify(currentData);
        }

        const { data: updatedNotification, error: updateError } = await supabase
            .from('notifications')
            .update(updateData)
            .eq('id', notificationId)
            .select()
            .single();

        if (updateError) {
            logger.error('Resolve status notification error:', updateError);
            return res.status(500).json({ error: 'Failed to resolve notification' });
        }

        // Log resolution
        const notificationData = JSON.parse(notification.data || '{}');
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: notificationData.agent_id,
                user_id: userId,
                action: 'notification_resolved',
                resource_type: 'notification',
                resource_id: notificationId,
                details: {
                    notification_type: notification.type,
                    resolution_notes,
                    resolved_at: new Date().toISOString()
                }
            }]);

        res.json({
            success: true,
            notification: updatedNotification,
            message: 'Notification resolved successfully'
        });

    } catch (error) {
        logger.error('Resolve status notification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===========================================
// FRONTEND INTEGRATION HOOKS
// ===========================================

// Get real-time status subscription info
router.get('/status/subscription', async (req, res) => {
    try {
        const userId = req.user.id;
        const { agent_ids } = req.query;

        // Get user's active agents
        let agentQuery = supabase
            .from('agents')
            .select('id, name, type')
            .eq('user_id', userId)
            .eq('is_active', true);

        if (agent_ids) {
            const requestedIds = agent_ids.split(',');
            agentQuery = agentQuery.in('id', requestedIds);
        }

        const { data: agents, error } = await agentQuery;

        if (error) {
            logger.error('Get subscription info error:', error);
            return res.status(500).json({ error: 'Failed to get subscription info' });
        }

        const subscriptionInfo = {
            user_id: userId,
            available_agents: agents || [],
            sse_endpoint: '/api/agents/status/stream',
            polling_endpoint: '/api/agents/status/poll',
            heartbeat_endpoint: '/api/agents/heartbeat/status',
            supported_events: [
                'status_update',
                'heartbeat',
                'connection_established'
            ],
            recommended_settings: {
                sse_reconnect_interval: 5000, // 5 seconds
                polling_interval: 30000, // 30 seconds
                heartbeat_check_interval: 60000 // 1 minute
            }
        };

        // Add agent-specific subscription URLs
        if (agents && agents.length > 0) {
            subscriptionInfo.agent_subscriptions = agents.map(agent => ({
                agent_id: agent.id,
                agent_name: agent.name,
                sse_url: `/api/agents/status/stream?agent_ids=${agent.id}`,
                polling_url: `/api/agents/status/poll?agent_ids=${agent.id}`,
                heartbeat_url: `/api/agents/${agent.id}/heartbeat`,
                history_url: `/api/agents/${agent.id}/status/history`,
                analytics_url: `/api/agents/${agent.id}/status/analytics`
            }));
        }

        res.json({
            success: true,
            subscription: subscriptionInfo
        });

    } catch (error) {
        logger.error('Get subscription info error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===========================================
// STATUS VALIDATION AND METADATA TRACKING
// ===========================================

// Valid status transitions
const VALID_STATUS_TRANSITIONS = {
    'idle': ['busy', 'offline', 'error', 'maintenance'],
    'busy': ['idle', 'completed', 'error', 'offline', 'maintenance'],
    'completed': ['idle', 'busy', 'offline', 'maintenance'],
    'error': ['idle', 'offline', 'maintenance'],
    'offline': ['idle', 'busy', 'maintenance'],
    'maintenance': ['idle', 'busy', 'offline']
};

// Status metadata validation rules
const STATUS_METADATA_RULES = {
    health_score: {
        type: 'number',
        min: 0.0,
        max: 1.0,
        required_for: ['active', 'busy', 'completed']
    },
    cpu_usage: {
        type: 'number',
        min: 0.0,
        max: 100.0,
        required_for: []
    },
    memory_usage: {
        type: 'number',
        min: 0.0,
        max: 100.0,
        required_for: []
    },
    uptime_seconds: {
        type: 'number',
        min: 0,
        required_for: ['active', 'busy', 'completed']
    },
    status_message: {
        type: 'string',
        max_length: 500,
        required_for: ['error', 'maintenance']
    },
    current_task_id: {
        type: 'uuid',
        required_for: ['busy']
    }
};

// Validate status transition
function validateStatusTransition(currentStatus, newStatus, metadata = {}) {
    const validationResult = {
        isValid: true,
        errors: [],
        warnings: []
    };

    // Check if transition is allowed
    if (currentStatus && VALID_STATUS_TRANSITIONS[currentStatus]) {
        if (!VALID_STATUS_TRANSITIONS[currentStatus].includes(newStatus)) {
            validationResult.isValid = false;
            validationResult.errors.push(
                `Invalid status transition: ${currentStatus} -> ${newStatus}. Allowed transitions: ${VALID_STATUS_TRANSITIONS[currentStatus].join(', ')}`
            );
        }
    }

    // Validate metadata based on new status
    const rules = STATUS_METADATA_RULES;

    for (const [field, rule] of Object.entries(rules)) {
        const value = metadata[field];

        // Check required fields
        if (rule.required_for && rule.required_for.includes(newStatus)) {
            if (value === undefined || value === null) {
                validationResult.isValid = false;
                validationResult.errors.push(
                    `Field '${field}' is required for status '${newStatus}'`
                );
            }
        }

        // Validate field types and ranges
        if (value !== undefined && value !== null) {
            switch (rule.type) {
                case 'number':
                    if (typeof value !== 'number' || isNaN(value)) {
                        validationResult.isValid = false;
                        validationResult.errors.push(
                            `Field '${field}' must be a number`
                        );
                    } else {
                        if (rule.min !== undefined && value < rule.min) {
                            validationResult.isValid = false;
                            validationResult.errors.push(
                                `Field '${field}' must be >= ${rule.min}`
                            );
                        }
                        if (rule.max !== undefined && value > rule.max) {
                            validationResult.isValid = false;
                            validationResult.errors.push(
                                `Field '${field}' must be <= ${rule.max}`
                            );
                        }
                    }
                    break;

                case 'string':
                    if (typeof value !== 'string') {
                        validationResult.isValid = false;
                        validationResult.errors.push(
                            `Field '${field}' must be a string`
                        );
                    } else if (rule.max_length && value.length > rule.max_length) {
                        validationResult.isValid = false;
                        validationResult.errors.push(
                            `Field '${field}' must be <= ${rule.max_length} characters`
                        );
                    }
                    break;

                case 'uuid':
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                    if (typeof value !== 'string' || !uuidRegex.test(value)) {
                        validationResult.isValid = false;
                        validationResult.errors.push(
                            `Field '${field}' must be a valid UUID`
                        );
                    }
                    break;
            }
        }
    }

    // Add warnings for unusual transitions
    if (currentStatus === 'error' && newStatus === 'busy') {
        validationResult.warnings.push(
            'Transitioning from error to busy status. Ensure the error has been resolved.'
        );
    }

    if (currentStatus === 'maintenance' && newStatus === 'busy') {
        validationResult.warnings.push(
            'Transitioning from maintenance to busy status. Ensure maintenance is complete.'
        );
    }

    return validationResult;
}

// Enhanced status update with validation and metadata tracking
router.put('/:id/status/validated', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            status,
            status_message,
            current_task_id,
            health_score,
            cpu_usage,
            memory_usage,
            uptime_seconds,
            metadata = {},
            skip_validation = false
        } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Get current status for validation
        const { data: currentStatus } = await supabase
            .from('agent_status')
            .select('*')
            .eq('agent_id', id)
            .single();

        // Prepare metadata for validation
        const statusMetadata = {
            status_message,
            current_task_id,
            health_score,
            cpu_usage,
            memory_usage,
            uptime_seconds,
            ...metadata
        };

        // Validate status transition and metadata
        let validationResult = { isValid: true, errors: [], warnings: [] };
        if (!skip_validation) {
            validationResult = validateStatusTransition(
                currentStatus?.status,
                status,
                statusMetadata
            );
        }

        // If validation fails, return errors
        if (!validationResult.isValid) {
            return res.status(400).json({
                error: 'Status update validation failed',
                validation_errors: validationResult.errors,
                validation_warnings: validationResult.warnings
            });
        }

        // Proceed with status update
        const updateData = {
            status,
            last_activity: new Date().toISOString()
        };

        if (status_message !== undefined) updateData.status_message = status_message;
        if (current_task_id !== undefined) updateData.current_task_id = current_task_id;
        if (health_score !== undefined) updateData.health_score = health_score;
        if (cpu_usage !== undefined) updateData.cpu_usage = cpu_usage;
        if (memory_usage !== undefined) updateData.memory_usage = memory_usage;
        if (uptime_seconds !== undefined) updateData.uptime_seconds = uptime_seconds;

        const { data: updatedStatus, error } = await supabase
            .from('agent_status')
            .update(updateData)
            .eq('agent_id', id)
            .select()
            .single();

        if (error) {
            logger.error('Update agent status error:', error);
            return res.status(500).json({ error: 'Failed to update agent status' });
        }

        // Track metadata changes
        const metadataChanges = {};
        if (currentStatus) {
            Object.keys(STATUS_METADATA_RULES).forEach(field => {
                const oldValue = currentStatus[field];
                const newValue = updateData[field];
                if (oldValue !== newValue && (oldValue !== undefined || newValue !== undefined)) {
                    metadataChanges[field] = {
                        old_value: oldValue,
                        new_value: newValue,
                        changed_at: new Date().toISOString()
                    };
                }
            });
        }

        // Log comprehensive status change with validation info
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: id,
                user_id: req.user.id,
                action: 'status_changed_validated',
                details: {
                    old_status: currentStatus?.status || 'unknown',
                    new_status: status,
                    status_message,
                    current_task_id,
                    health_score,
                    cpu_usage,
                    memory_usage,
                    uptime_seconds,
                    metadata,
                    metadata_changes: metadataChanges,
                    validation_performed: !skip_validation,
                    validation_warnings: validationResult.warnings,
                    transition_timestamp: new Date().toISOString(),
                    source: 'validated_api'
                }
            }]);

        // Broadcast status update
        await broadcastStatusUpdate(id, updatedStatus, req.user.id);

        // Check for alerts and create notifications
        await checkStatusAlerts(id, req.user.id, updatedStatus, currentStatus);

        res.json({
            success: true,
            status: updatedStatus,
            validation: {
                performed: !skip_validation,
                warnings: validationResult.warnings
            },
            metadata_changes: Object.keys(metadataChanges).length > 0 ? metadataChanges : null,
            broadcasted: true
        });

    } catch (error) {
        logger.error('Update validated agent status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get status validation rules
router.get('/status/validation/rules', async (req, res) => {
    try {
        res.json({
            success: true,
            validation_rules: {
                valid_transitions: VALID_STATUS_TRANSITIONS,
                metadata_rules: STATUS_METADATA_RULES,
                valid_statuses: Object.keys(VALID_STATUS_TRANSITIONS)
            }
        });

    } catch (error) {
        logger.error('Get validation rules error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Validate a potential status transition without applying it
router.post('/:id/status/validate', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            status,
            status_message,
            current_task_id,
            health_score,
            cpu_usage,
            memory_usage,
            uptime_seconds,
            metadata = {}
        } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required for validation' });
        }

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Get current status
        const { data: currentStatus } = await supabase
            .from('agent_status')
            .select('*')
            .eq('agent_id', id)
            .single();

        // Prepare metadata for validation
        const statusMetadata = {
            status_message,
            current_task_id,
            health_score,
            cpu_usage,
            memory_usage,
            uptime_seconds,
            ...metadata
        };

        // Perform validation
        const validationResult = validateStatusTransition(
            currentStatus?.status,
            status,
            statusMetadata
        );

        // Additional validation checks
        const enhancedValidation = {
            ...validationResult,
            current_status: currentStatus?.status || 'unknown',
            requested_status: status,
            agent_name: agent.name,
            timestamp: new Date().toISOString()
        };

        // Add suggestions for fixing validation errors
        if (!validationResult.isValid) {
            enhancedValidation.suggestions = [];

            validationResult.errors.forEach(error => {
                if (error.includes('required for status')) {
                    enhancedValidation.suggestions.push(
                        'Provide the missing required field(s) for the new status'
                    );
                } else if (error.includes('Invalid status transition')) {
                    enhancedValidation.suggestions.push(
                        'Choose a valid status transition or use skip_validation=true if necessary'
                    );
                } else if (error.includes('must be')) {
                    enhancedValidation.suggestions.push(
                        'Correct the field value to meet the validation requirements'
                    );
                }
            });
        }

        res.json({
            success: true,
            validation: enhancedValidation,
            agent: {
                id: agent.id,
                name: agent.name
            }
        });

    } catch (error) {
        logger.error('Validate status transition error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get status metadata tracking for an agent
router.get('/:id/status/metadata', async (req, res) => {
    try {
        const { id } = req.params;
        const { days = 7 } = req.query;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // Get metadata tracking from logs
        const { data: metadataLogs, error } = await supabase
            .from('agent_logs')
            .select('*')
            .eq('agent_id', id)
            .eq('action', 'status_changed_validated')
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('Get metadata tracking error:', error);
            return res.status(500).json({ error: 'Failed to fetch metadata tracking' });
        }

        // Process metadata changes
        const metadataTracking = {
            agent_id: id,
            agent_name: agent.name,
            period_days: parseInt(days),
            field_changes: {},
            recent_values: {},
            change_frequency: {}
        };

        // Track field changes over time
        Object.keys(STATUS_METADATA_RULES).forEach(field => {
            metadataTracking.field_changes[field] = [];
            metadataTracking.change_frequency[field] = 0;
        });

        // Process each log entry
        (metadataLogs || []).forEach(log => {
            const details = log.details || {};
            const metadataChanges = details.metadata_changes || {};

            Object.entries(metadataChanges).forEach(([field, change]) => {
                metadataTracking.field_changes[field].push({
                    timestamp: log.created_at,
                    old_value: change.old_value,
                    new_value: change.new_value,
                    status_at_change: details.new_status
                });
                metadataTracking.change_frequency[field]++;
            });

            // Track most recent values
            Object.keys(STATUS_METADATA_RULES).forEach(field => {
                if (details[field] !== undefined && !metadataTracking.recent_values[field]) {
                    metadataTracking.recent_values[field] = {
                        value: details[field],
                        timestamp: log.created_at,
                        status: details.new_status
                    };
                }
            });
        });

        // Calculate change rates
        const totalHours = parseInt(days) * 24;
        Object.keys(metadataTracking.change_frequency).forEach(field => {
            metadataTracking.change_frequency[field] = {
                total_changes: metadataTracking.change_frequency[field],
                changes_per_hour: metadataTracking.change_frequency[field] / totalHours,
                changes_per_day: metadataTracking.change_frequency[field] / parseInt(days)
            };
        });

        res.json({
            success: true,
            metadata_tracking: metadataTracking
        });

    } catch (error) {
        logger.error('Get status metadata tracking error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===========================================
// INTELLIGENT TASK ASSIGNMENT ALGORITHMS
// ===========================================

// Calculate agent workload score (lower is better)
async function calculateAgentWorkload(agentId) {
    try {
        // Get current active tasks count
        const { data: activeTasks, error: tasksError } = await supabase
            .from('agent_tasks')
            .select('id, priority, status, estimated_duration')
            .eq('agent_id', agentId)
            .in('status', ['pending', 'in_progress']);

        if (tasksError) throw tasksError;

        // Get agent status for health score
        const { data: status, error: statusError } = await supabase
            .from('agent_status')
            .select('health_score, status')
            .eq('agent_id', agentId)
            .single();

        if (statusError) throw statusError;

        // Calculate workload score
        let workloadScore = 0;

        // Base score from task count and priority
        if (activeTasks) {
            activeTasks.forEach(task => {
                const priorityWeight = 6 - task.priority; // Higher priority = higher weight
                const statusWeight = task.status === 'in_progress' ? 2 : 1;
                workloadScore += priorityWeight * statusWeight;
            });
        }

        // Adjust for agent health (unhealthy agents get higher score)
        const healthAdjustment = status ? (1 - status.health_score) * 10 : 5;
        workloadScore += healthAdjustment;

        // Adjust for agent status (offline/maintenance agents get very high score)
        if (status && ['offline', 'maintenance', 'error'].includes(status.status)) {
            workloadScore += 100;
        }

        return workloadScore;
    } catch (error) {
        logger.error('Error calculating agent workload:', error);
        return 50; // Default medium workload
    }
}

// Find best agent for task assignment
async function findBestAgentForTask(userId, taskType, taskPriority, requiredCapabilities = []) {
    try {
        // Get all active agents for user
        const { data: agents, error } = await supabase
            .from('agents')
            .select(`
                id,
                name,
                type,
                capabilities,
                agent_profiles (
                    expertise_areas,
                    working_hours,
                    timezone
                )
            `)
            .eq('user_id', userId)
            .eq('is_active', true);

        if (error) throw error;

        if (!agents || agents.length === 0) {
            return null;
        }

        let bestAgent = null;
        let bestScore = Infinity;

        for (const agent of agents) {
            // Check if agent has required capabilities
            const agentCapabilities = agent.capabilities || [];
            const hasRequiredCapabilities = requiredCapabilities.every(cap =>
                agentCapabilities.includes(cap)
            );

            if (!hasRequiredCapabilities) {
                continue;
            }

            // Check if agent type matches task type
            const isTypeMatch = agent.type === taskType ||
                               agent.type === 'general' ||
                               taskType === 'general';

            // Calculate workload
            const workloadScore = await calculateAgentWorkload(agent.id);

            // Calculate compatibility score
            let compatibilityScore = workloadScore;

            // Bonus for type matching
            if (isTypeMatch) {
                compatibilityScore -= 20;
            }

            // Bonus for expertise matching
            if (agent.agent_profiles && agent.agent_profiles[0]) {
                const expertise = agent.agent_profiles[0].expertise_areas || [];
                if (expertise.includes(taskType)) {
                    compatibilityScore -= 15;
                }
            }

            // Penalty for high priority tasks on busy agents
            if (taskPriority <= 2 && workloadScore > 30) {
                compatibilityScore += 10;
            }

            // Update best agent if this one has better score
            if (compatibilityScore < bestScore) {
                bestScore = compatibilityScore;
                bestAgent = agent;
            }
        }

        return bestAgent;
    } catch (error) {
        logger.error('Error finding best agent for task:', error);
        return null;
    }
}

// Check task dependencies and prerequisites
async function checkTaskDependencies(taskId, agentId) {
    try {
        // Get task dependencies (this would need a task_dependencies table in production)
        // For now, we'll check if there are any pending tasks that should be completed first
        const { data: agentTasks, error } = await supabase
            .from('agent_tasks')
            .select('id, status, type, priority')
            .eq('agent_id', agentId)
            .in('status', ['pending', 'in_progress'])
            .neq('id', taskId)
            .order('priority', { ascending: true });

        if (error) throw error;

        // Simple dependency logic: high priority tasks should be completed first
        const highPriorityTasks = agentTasks?.filter(task => task.priority <= 2) || [];

        return {
            canProceed: highPriorityTasks.length === 0,
            blockingTasks: highPriorityTasks,
            recommendation: highPriorityTasks.length > 0 ?
                'Complete high priority tasks first' : null
        };
    } catch (error) {
        logger.error('Error checking task dependencies:', error);
        return { canProceed: true, blockingTasks: [], recommendation: null };
    }
}

// Task templates for automation
const TASK_TEMPLATES = {
    email_processing: {
        title: 'Process Email Queue',
        description: 'Automatically process and categorize incoming emails',
        priority: 3,
        estimated_duration: 30,
        parameters: {
            batch_size: 10,
            priority_filter: 'high',
            auto_respond: false
        }
    },
    task_creation: {
        title: 'Generate Daily Tasks',
        description: 'Create tasks based on project deadlines and priorities',
        priority: 4,
        estimated_duration: 15,
        parameters: {
            projects_only: true,
            days_ahead: 7,
            min_priority: 3
        }
    },
    project_coordination: {
        title: 'Project Status Update',
        description: 'Update project progress and coordinate team activities',
        priority: 2,
        estimated_duration: 45,
        parameters: {
            include_metrics: true,
            notify_stakeholders: false,
            generate_report: true
        }
    }
};

// Apply task template
function applyTaskTemplate(templateKey, customParameters = {}) {
    const template = TASK_TEMPLATES[templateKey];
    if (!template) {
        throw new Error(`Task template '${templateKey}' not found`);
    }

    return {
        ...template,
        type: templateKey,
        parameters: {
            ...template.parameters,
            ...customParameters
        }
    };
}

// Priority-based task scheduling
async function scheduleTaskPriority(agentId, taskPriority, deadline) {
    try {
        // Get existing tasks for priority ordering
        const { data: existingTasks, error } = await supabase
            .from('agent_tasks')
            .select('id, priority, deadline, status')
            .eq('agent_id', agentId)
            .in('status', ['pending', 'in_progress'])
            .order('priority', { ascending: true });

        if (error) throw error;

        // Calculate suggested start time based on priority and existing workload
        let suggestedStartTime = new Date();

        if (taskPriority <= 2) {
            // High priority - schedule immediately if possible
            suggestedStartTime = new Date();
        } else if (taskPriority === 3) {
            // Medium priority - schedule after high priority tasks
            const highPriorityTasks = existingTasks?.filter(t => t.priority <= 2) || [];
            if (highPriorityTasks.length > 0) {
                suggestedStartTime.setMinutes(suggestedStartTime.getMinutes() + 30);
            }
        } else {
            // Low priority - schedule during off-peak hours
            const currentHour = suggestedStartTime.getHours();
            if (currentHour >= 9 && currentHour <= 17) {
                // Business hours - delay to evening
                suggestedStartTime.setHours(18, 0, 0, 0);
            }
        }

        // Adjust for deadline if provided
        if (deadline) {
            const deadlineTime = new Date(deadline);
            const timeUntilDeadline = deadlineTime - suggestedStartTime;

            if (timeUntilDeadline < 0) {
                // Overdue - schedule immediately
                suggestedStartTime = new Date();
            } else if (timeUntilDeadline < 3600000) { // Less than 1 hour
                // Urgent deadline - prioritize
                suggestedStartTime = new Date();
            }
        }

        return {
            suggested_start_time: suggestedStartTime.toISOString(),
            priority_level: taskPriority,
            queue_position: existingTasks?.filter(t => t.priority < taskPriority).length || 0
        };
    } catch (error) {
        logger.error('Error scheduling task priority:', error);
        return {
            suggested_start_time: new Date().toISOString(),
            priority_level: taskPriority,
            queue_position: 0
        };
    }
}

// ===========================================
// AGENT TASK MANAGEMENT ROUTES
// ===========================================

// Get agent tasks with enhanced filtering and progress tracking
router.get('/:id/tasks', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            status,
            priority,
            type,
            limit = 50,
            offset = 0,
            sort_by = 'created_at',
            sort_order = 'desc',
            include_progress = true,
            include_dependencies = true,
            queue_info = true
        } = req.query;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name, type')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Build query with enhanced filtering
        let query = supabase
            .from('agent_tasks')
            .select(`
                *,
                task:tasks (*)
            `)
            .eq('agent_id', id);

        // Apply filters
        if (status) {
            if (Array.isArray(status)) {
                query = query.in('status', status);
            } else {
                query = query.eq('status', status);
            }
        }

        if (priority) {
            if (Array.isArray(priority)) {
                query = query.in('priority', priority.map(p => parseInt(p)));
            } else {
                query = query.eq('priority', parseInt(priority));
            }
        }

        if (type) {
            if (Array.isArray(type)) {
                query = query.in('type', type);
            } else {
                query = query.eq('type', type);
            }
        }

        // Enhanced sorting options
        const validSortFields = ['created_at', 'updated_at', 'priority', 'deadline', 'estimated_duration'];
        const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
        const order = sort_order === 'asc' ? { ascending: true } : { ascending: false };

        if (sortField === 'priority') {
            // For priority, we want high priority (low number) first by default
            query = query.order('priority', { ascending: true });
        } else {
            query = query.order(sortField, order);
        }

        query = query.range(offset, offset + limit - 1);

        const { data: tasks, error } = await query;

        if (error) {
            logger.error('Get agent tasks error:', error);
            return res.status(500).json({ error: 'Failed to fetch agent tasks' });
        }

        let enhancedTasks = tasks || [];

        // Add progress tracking information
        if (include_progress && enhancedTasks.length > 0) {
            for (let task of enhancedTasks) {
                // Calculate progress percentage based on status
                let progress = 0;
                switch (task.status) {
                    case 'completed':
                        progress = 100;
                        break;
                    case 'in_progress':
                        progress = 50;
                        break;
                    case 'pending':
                        progress = 0;
                        break;
                    case 'failed':
                        progress = 0;
                        break;
                    case 'cancelled':
                        progress = 0;
                        break;
                    default:
                        progress = 0;
                }

                // Add time tracking
                const now = new Date();
                const created = new Date(task.created_at);
                const timeElapsed = Math.floor((now - created) / (1000 * 60)); // minutes

                task.progress = {
                    percentage: progress,
                    time_elapsed_minutes: timeElapsed,
                    estimated_remaining: task.estimated_duration ?
                        Math.max(0, task.estimated_duration - timeElapsed) : null,
                    is_overdue: task.deadline ? new Date(task.deadline) < now : false
                };
            }
        }

        // Add dependency information
        if (include_dependencies && enhancedTasks.length > 0) {
            for (let task of enhancedTasks) {
                const dependencies = await checkTaskDependencies(task.id, id);
                task.dependencies = dependencies;
            }
        }

        // Add queue information
        let queueData = null;
        if (queue_info) {
            // Calculate agent's workload
            const workloadScore = await calculateAgentWorkload(id);

            // Get queue statistics
            const { data: queueStats, error: queueError } = await supabase
                .from('agent_tasks')
                .select('status, priority')
                .eq('agent_id', id);

            if (!queueError && queueStats) {
                const pendingTasks = queueStats.filter(t => t.status === 'pending').length;
                const inProgressTasks = queueStats.filter(t => t.status === 'in_progress').length;
                const highPriorityTasks = queueStats.filter(t => t.priority <= 2).length;

                queueData = {
                    workload_score: workloadScore,
                    pending_tasks: pendingTasks,
                    in_progress_tasks: inProgressTasks,
                    high_priority_tasks: highPriorityTasks,
                    total_active_tasks: pendingTasks + inProgressTasks
                };
            }
        }

        // Add task templates information
        const availableTemplates = Object.keys(TASK_TEMPLATES).map(key => ({
            key,
            ...TASK_TEMPLATES[key]
        }));

        // ===========================================
        // AI-POWERED TASK SUGGESTIONS
        // ===========================================

        // Generate AI-powered task suggestions based on current tasks and agent performance
        let aiSuggestions = null;
        if (req.query.include_ai_suggestions === 'true') {
            try {
                aiSuggestions = await generateTaskSuggestions(agent, enhancedTasks, queueData, req.user.id);
            } catch (error) {
                logger.error('AI task suggestions error:', error);
                aiSuggestions = { error: 'Failed to generate AI suggestions' };
            }
        }

        // Generate AI-powered task prioritization recommendations
        let prioritizationRecommendations = null;
        if (req.query.include_prioritization === 'true' && enhancedTasks.length > 0) {
            try {
                prioritizationRecommendations = await generateTaskPrioritization(agent, enhancedTasks, req.user.id);
            } catch (error) {
                logger.error('Task prioritization error:', error);
            }
        }

        // Generate workload optimization suggestions
        let workloadOptimization = null;
        if (req.query.include_workload_optimization === 'true' && queueData) {
            try {
                workloadOptimization = await generateWorkloadOptimization(agent, enhancedTasks, queueData);
            } catch (error) {
                logger.error('Workload optimization error:', error);
            }
        }

        // ===========================================
        // AI TASK SUGGESTIONS FUNCTIONS
        // ===========================================

        // Generate intelligent task suggestions based on agent performance and patterns
        async function generateTaskSuggestions(agent, currentTasks, queueData, userId) {
            const suggestions = [];

            // Analyze current task patterns
            const taskPatterns = analyzeTaskPatterns(currentTasks);

            // Get agent performance metrics
            const performanceMetrics = await getAgentPerformanceMetrics(agent.id, 30); // Last 30 days

            // Suggestion 1: Based on overdue tasks
            const overdueTasks = currentTasks.filter(task =>
                task.progress?.is_overdue && task.status !== 'completed'
            );

            if (overdueTasks.length > 0) {
                suggestions.push({
                    type: 'overdue_attention',
                    title: 'Address Overdue Tasks',
                    description: `You have ${overdueTasks.length} overdue task(s) that need immediate attention.`,
                    priority: 5,
                    suggested_actions: [
                        'Review overdue tasks and reassess deadlines',
                        'Consider breaking down large overdue tasks',
                        'Communicate with stakeholders about delays'
                    ],
                    affected_tasks: overdueTasks.map(t => t.id),
                    confidence: 0.95
                });
            }

            // Suggestion 2: Workload balancing
            if (queueData && queueData.workload_score > 80) {
                suggestions.push({
                    type: 'workload_balance',
                    title: 'High Workload Detected',
                    description: 'Your current workload is high. Consider delegating or reprioritizing tasks.',
                    priority: 4,
                    suggested_actions: [
                        'Review task priorities and focus on high-impact items',
                        'Consider delegating routine tasks to other agents',
                        'Schedule focused work blocks for complex tasks'
                    ],
                    workload_score: queueData.workload_score,
                    confidence: 0.90
                });
            }

            // Suggestion 3: Task completion patterns
            if (performanceMetrics && performanceMetrics.completion_rate < 0.7) {
                suggestions.push({
                    type: 'completion_improvement',
                    title: 'Improve Task Completion Rate',
                    description: 'Your task completion rate is below optimal. Consider task breakdown strategies.',
                    priority: 3,
                    suggested_actions: [
                        'Break complex tasks into smaller, manageable steps',
                        'Set specific time blocks for task completion',
                        'Track and analyze reasons for incomplete tasks'
                    ],
                    current_completion_rate: performanceMetrics.completion_rate,
                    confidence: 0.85
                });
            }

            // Suggestion 4: Proactive task suggestions based on agent type
            const proactiveSuggestions = await generateProactiveSuggestions(agent, taskPatterns, performanceMetrics);
            suggestions.push(...proactiveSuggestions);

            // Suggestion 5: Pattern-based recommendations
            if (taskPatterns.most_common_type) {
                suggestions.push({
                    type: 'pattern_optimization',
                    title: `Optimize ${taskPatterns.most_common_type} Tasks`,
                    description: `You frequently handle ${taskPatterns.most_common_type} tasks. Consider creating templates or automation.`,
                    priority: 2,
                    suggested_actions: [
                        `Create a template for ${taskPatterns.most_common_type} tasks`,
                        'Identify common steps that can be automated',
                        'Document best practices for this task type'
                    ],
                    task_type: taskPatterns.most_common_type,
                    frequency: taskPatterns.type_frequency[taskPatterns.most_common_type],
                    confidence: 0.80
                });
            }

            return {
                suggestions: suggestions.sort((a, b) => b.priority - a.priority),
                analysis_timestamp: new Date().toISOString(),
                total_suggestions: suggestions.length,
                patterns_analyzed: taskPatterns,
                performance_metrics: performanceMetrics
            };
        }

        // Generate proactive suggestions based on agent specialization
        async function generateProactiveSuggestions(agent, taskPatterns, performanceMetrics) {
            const suggestions = [];

            switch (agent.type) {
                case 'task_manager':
                    if (taskPatterns.avg_tasks_per_day < 3) {
                        suggestions.push({
                            type: 'productivity_boost',
                            title: 'Increase Daily Task Volume',
                            description: 'Consider taking on more tasks to optimize your productivity capacity.',
                            priority: 3,
                            suggested_actions: [
                                'Review your task acceptance criteria',
                                'Look for opportunities to parallelize tasks',
                                'Consider skill development to handle more complex tasks'
                            ],
                            confidence: 0.75
                        });
                    }
                    break;

                case 'email_assistant':
                    suggestions.push({
                        type: 'communication_optimization',
                        title: 'Optimize Email Response Patterns',
                        description: 'Analyze your email response patterns for efficiency improvements.',
                        priority: 2,
                        suggested_actions: [
                            'Create email templates for common responses',
                            'Set up email filtering rules',
                            'Schedule dedicated email processing times'
                        ],
                        confidence: 0.70
                    });
                    break;

                case 'project_coordinator':
                    if (!taskPatterns.has_dependencies) {
                        suggestions.push({
                            type: 'dependency_management',
                            title: 'Implement Dependency Tracking',
                            description: 'Add dependency tracking to better manage project workflows.',
                            priority: 4,
                            suggested_actions: [
                                'Map out task dependencies for complex projects',
                                'Use dependency tracking in task assignments',
                                'Regularly review and update dependency chains'
                            ],
                            confidence: 0.85
                        });
                    }
                    break;
            }

            return suggestions;
        }

        // Analyze patterns in current tasks
        function analyzeTaskPatterns(tasks) {
            if (!tasks || tasks.length === 0) {
                return {
                    total_tasks: 0,
                    avg_priority: 0,
                    most_common_type: null,
                    type_frequency: {},
                    avg_tasks_per_day: 0,
                    has_dependencies: false,
                    completion_trends: []
                };
            }

            const typeFrequency = {};
            let totalPriority = 0;
            let hasDependencies = false;
            const completionTrends = [];

            tasks.forEach(task => {
                // Count task types
                const taskType = task.type || 'general';
                typeFrequency[taskType] = (typeFrequency[taskType] || 0) + 1;

                // Sum priorities
                totalPriority += task.priority || 3;

                // Check for dependencies
                if (task.dependencies && task.dependencies.length > 0) {
                    hasDependencies = true;
                }

                // Track completion trends (simplified)
                if (task.status === 'completed') {
                    completionTrends.push({
                        date: task.updated_at,
                        type: taskType,
                        duration: task.actual_duration
                    });
                }
            });

            const mostCommonType = Object.entries(typeFrequency)
                .sort(([,a], [,b]) => b - a)[0]?.[0] || null;

            // Calculate average tasks per day (simplified)
            const dateRange = 30; // Assume 30-day window
            const avgTasksPerDay = tasks.length / dateRange;

            return {
                total_tasks: tasks.length,
                avg_priority: totalPriority / tasks.length,
                most_common_type: mostCommonType,
                type_frequency: typeFrequency,
                avg_tasks_per_day: avgTasksPerDay,
                has_dependencies: hasDependencies,
                completion_trends: completionTrends
            };
        }

        // Get agent performance metrics
        async function getAgentPerformanceMetrics(agentId, days) {
            try {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - days);

                const { data: tasks, error } = await supabase
                    .from('agent_tasks')
                    .select('status, created_at, updated_at, priority')
                    .eq('agent_id', agentId)
                    .gte('created_at', cutoffDate.toISOString());

                if (error || !tasks) return null;

                const completedTasks = tasks.filter(t => t.status === 'completed').length;
                const totalTasks = tasks.length;
                const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

                const avgCompletionTime = tasks
                    .filter(t => t.status === 'completed' && t.updated_at && t.created_at)
                    .reduce((sum, t, _, arr) => {
                        const completionTime = (new Date(t.updated_at) - new Date(t.created_at)) / (1000 * 60); // minutes
                        return sum + (completionTime / arr.length);
                    }, 0);

                return {
                    total_tasks: totalTasks,
                    completed_tasks: completedTasks,
                    completion_rate: completionRate,
                    avg_completion_time_minutes: avgCompletionTime,
                    period_days: days
                };
            } catch (error) {
                logger.error('Get agent performance metrics error:', error);
                return null;
            }
        }

        // Generate task prioritization recommendations
        async function generateTaskPrioritization(agent, tasks, userId) {
            const recommendations = [];

            for (const task of tasks) {
                const aiPriority = decisionEngine.calculateTaskPriority({
                    deadline: task.deadline,
                    priority: task.priority,
                    dependencies: task.dependencies || [],
                    agent_workload: await calculateAgentWorkload(agent.id),
                    business_impact: task.priority <= 2 ? 1.5 : 1.0
                });

                if (Math.abs(aiPriority - task.priority) >= 2) {
                    recommendations.push({
                        task_id: task.id,
                        current_priority: task.priority,
                        recommended_priority: aiPriority,
                        reason: aiPriority > task.priority ?
                            'Task needs higher priority due to deadline proximity or dependencies' :
                            'Task can be deprioritized based on current workload and deadlines',
                        confidence: 0.85,
                        factors: {
                            deadline_proximity: task.deadline ? (new Date(task.deadline) - new Date()) / (1000 * 60 * 60) : null,
                            has_dependencies: (task.dependencies || []).length > 0,
                            agent_workload: await calculateAgentWorkload(agent.id)
                        }
                    });
                }
            }

            return {
                recommendations: recommendations.sort((a, b) => b.recommended_priority - a.recommended_priority),
                total_tasks_analyzed: tasks.length,
                recommendations_count: recommendations.length,
                analysis_timestamp: new Date().toISOString()
            };
        }

        // Generate workload optimization suggestions
        async function generateWorkloadOptimization(agent, tasks, queueData) {
            const optimization = {
                current_workload: queueData.workload_score,
                recommendations: [],
                projected_improvements: {}
            };

            // Analyze task distribution
            const pendingHighPriority = tasks.filter(t => t.status === 'pending' && t.priority <= 2).length;
            const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;

            // Recommendation 1: Parallel processing
            if (pendingHighPriority > 3) {
                optimization.recommendations.push({
                    type: 'parallel_processing',
                    title: 'Consider Parallel Task Processing',
                    description: `You have ${pendingHighPriority} high-priority pending tasks. Consider working on multiple tasks simultaneously.`,
                    impact: 'high',
                    effort: 'medium',
                    suggested_actions: [
                        'Identify tasks that can be worked on in parallel',
                        'Set time limits for context switching',
                        'Use task batching for similar activities'
                    ]
                });
            }

            // Recommendation 2: Task delegation
            if (queueData.workload_score > 85) {
                optimization.recommendations.push({
                    type: 'delegation',
                    title: 'Task Delegation Opportunity',
                    description: 'Your workload is very high. Consider delegating routine tasks to other agents.',
                    impact: 'high',
                    effort: 'high',
                    suggested_actions: [
                        'Identify routine tasks that can be delegated',
                        'Document task handoff procedures',
                        'Set up monitoring for delegated tasks'
                    ]
                });
            }

            // Recommendation 3: Time blocking
            if (inProgressTasks > 2) {
                optimization.recommendations.push({
                    type: 'time_blocking',
                    title: 'Implement Time Blocking',
                    description: 'You have multiple tasks in progress. Consider dedicated time blocks for focused work.',
                    impact: 'medium',
                    effort: 'low',
                    suggested_actions: [
                        'Schedule 2-hour focused work blocks',
                        'Minimize context switching during blocks',
                        'Use the Pomodoro technique for complex tasks'
                    ]
                });
            }

            // Calculate projected improvements
            optimization.projected_improvements = {
                parallel_processing: pendingHighPriority > 3 ? 25 : 0, // 25% improvement
                delegation: queueData.workload_score > 85 ? 40 : 0, // 40% improvement
                time_blocking: inProgressTasks > 2 ? 15 : 0 // 15% improvement
            };

            return optimization;
        }

        // ===========================================
        // END AI TASK SUGGESTIONS FUNCTIONS
        // ===========================================

        res.json({
            success: true,
            tasks: enhancedTasks,
            count: enhancedTasks.length,
            agent: {
                id: agent.id,
                name: agent.name,
                type: agent.type
            },
            queue_info: queueData,
            available_templates: availableTemplates,
            filters_applied: {
                status,
                priority,
                type,
                sort_by: sortField,
                sort_order: sort_order === 'asc' ? 'ascending' : 'descending'
            },
            // Add AI-powered features
            ai_suggestions: aiSuggestions,
            prioritization_recommendations: prioritizationRecommendations,
            workload_optimization: workloadOptimization,
            ai_features_enabled: {
                suggestions: req.query.include_ai_suggestions === 'true',
                prioritization: req.query.include_prioritization === 'true',
                workload_optimization: req.query.include_workload_optimization === 'true'
            }
        });

    } catch (error) {
        logger.error('Get agent tasks error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create agent task with intelligent assignment and templates
router.post('/:id/tasks', async (req, res) => {
    try {
        const { id } = req.params;
        let {
            title,
            description,
            type,
            priority = 3,
            parameters = {},
            estimated_duration,
            deadline,
            task_id,
            requires_approval = null, // Allow manual override
            template_key, // New: template support
            auto_assign = false, // New: intelligent assignment
            required_capabilities = [], // New: capability requirements
            force_assignment = false // New: override assignment logic
        } = req.body;

        // Handle template application
        if (template_key) {
            try {
                const templateData = applyTaskTemplate(template_key, parameters);
                title = title || templateData.title;
                description = description || templateData.description;
                type = type || templateData.type;
                priority = priority !== undefined ? priority : templateData.priority;
                estimated_duration = estimated_duration || templateData.estimated_duration;
                parameters = { ...templateData.parameters, ...parameters };
            } catch (templateError) {
                return res.status(400).json({
                    error: 'Invalid task template',
                    message: templateError.message
                });
            }
        }

        if (!title || !type) {
            return res.status(400).json({ error: 'Title and type are required' });
        }

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name, type, capabilities')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Intelligent agent assignment
        let assignedAgentId = id; // Default to specified agent
        let assignmentReason = 'manual_assignment';

        if (auto_assign && !force_assignment) {
            const bestAgent = await findBestAgentForTask(
                req.user.id,
                type,
                priority,
                required_capabilities
            );

            if (bestAgent && bestAgent.id !== id) {
                assignedAgentId = bestAgent.id;
                assignmentReason = 'intelligent_assignment';

                // Log the intelligent assignment
                await supabase
                    .from('agent_logs')
                    .insert([{
                        agent_id: assignedAgentId,
                        user_id: req.user.id,
                        action: 'task_auto_assigned',
                        resource_type: 'agent_task',
                        resource_id: null, // Will be set after task creation
                        details: {
                            original_agent: id,
                            assignment_reason: 'workload_balancing',
                            task_type: type,
                            task_priority: priority
                        }
                    }]);
            }
        }

        // Verify the assigned agent belongs to user (if different from original)
        if (assignedAgentId !== id) {
            const { data: assignedAgent } = await supabase
                .from('agents')
                .select('id, name')
                .eq('id', assignedAgentId)
                .eq('user_id', req.user.id)
                .single();

            if (!assignedAgent) {
                return res.status(400).json({ error: 'Assigned agent not found or access denied' });
            }
        }

        // If linking to existing task, verify it belongs to user
        if (task_id) {
            const { data: task } = await supabase
                .from('tasks')
                .select('id, priority')
                .eq('id', task_id)
                .eq('user_id', req.user.id)
                .single();

            if (!task) {
                return res.status(400).json({ error: 'Task not found or access denied' });
            }
        }

        // Check task dependencies before creation
        const dependencyCheck = await checkTaskDependencies(null, assignedAgentId);
        if (!dependencyCheck.canProceed) {
            return res.status(400).json({
                error: 'Task dependencies not satisfied',
                blocking_tasks: dependencyCheck.blockingTasks,
                recommendation: dependencyCheck.recommendation
            });
        }

        // Schedule task priority and timing
        const schedulingInfo = await scheduleTaskPriority(assignedAgentId, priority, deadline);

        // Prepare action data for risk assessment
        const actionData = {
            title,
            description,
            type,
            priority,
            parameters,
            estimated_duration,
            deadline,
            contains_sensitive_data: parameters.contains_sensitive_data || false,
            bulk_operation: parameters.bulk_operation || false,
            affects_multiple_records: parameters.affects_multiple_records || false,
            privacy_impact: parameters.privacy_impact || false
        };

        // Get agent data for trust score assessment
        const { data: agentProfile } = await supabase
            .from('agent_profiles')
            .select('*')
            .eq('agent_id', assignedAgentId)
            .single();

        const agentData = {
            trust_score: agentProfile?.trust_score || 0.5, // Default trust score
            ...agent
        };

        // Assess risk and determine if approval is needed
        const riskAssessment = assessActionRisk('task_creation', actionData, agentData);
        const needsApproval = requires_approval !== null ? requires_approval : riskAssessment.requires_approval;

        let approvalId = null;

        // Create approval queue if needed
        if (needsApproval) {
            try {
                const approval = await createApprovalQueue(assignedAgentId, req.user.id, 'task_creation', actionData, riskAssessment);
                approvalId = approval.id;

                // Log approval creation
                await supabase
                    .from('agent_logs')
                    .insert([{
                        agent_id: assignedAgentId,
                        user_id: req.user.id,
                        action: 'approval_required',
                        resource_type: 'approval',
                        resource_id: approval.id,
                        details: {
                            task_title: title,
                            risk_level: riskAssessment.risk_level,
                            reason: riskAssessment.reason
                        },
                        severity: 'info'
                    }]);

            } catch (approvalError) {
                logger.error('Failed to create approval queue:', approvalError);
                // Continue with task creation even if approval creation fails
            }
        }

        // Create the agent task
        const { data: agentTask, error } = await supabase
            .from('agent_tasks')
            .insert([{
                agent_id: assignedAgentId,
                task_id: task_id || null,
                title,
                description,
                type,
                priority,
                parameters: JSON.stringify(parameters),
                estimated_duration,
                deadline,
                approval_id: approvalId,
                status: needsApproval ? 'pending_approval' : 'pending'
            }])
            .select()
            .single();

        if (error) {
            logger.error('Create agent task error:', error);
            return res.status(500).json({ error: 'Failed to create agent task' });
        }

        // Update agent status only if task doesn't need approval
        if (!needsApproval) {
            await supabase
                .from('agent_status')
                .update({
                    status: 'busy',
                    current_task_id: agentTask.id,
                    last_activity: new Date().toISOString()
                })
                .eq('agent_id', assignedAgentId);
        }

        // Update the auto-assignment log with the actual task ID
        if (assignmentReason === 'intelligent_assignment') {
            await supabase
                .from('agent_logs')
                .update({ resource_id: agentTask.id })
                .eq('agent_id', assignedAgentId)
                .eq('action', 'task_auto_assigned')
                .eq('resource_id', null)
                .eq('user_id', req.user.id);
        }

        // Log task creation
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: assignedAgentId,
                user_id: req.user.id,
                action: 'task_created',
                resource_type: 'agent_task',
                resource_id: agentTask.id,
                details: {
                    task_title: title,
                    task_type: type,
                    needs_approval: needsApproval,
                    approval_id: approvalId,
                    assignment_reason: assignmentReason,
                    template_used: template_key || null
                }
            }]);

        // Calculate workload after assignment
        const updatedWorkload = await calculateAgentWorkload(assignedAgentId);

        res.status(201).json({
            success: true,
            task: {
                ...agentTask,
                parameters: parameters,
                scheduling_info: schedulingInfo,
                dependencies: dependencyCheck
            },
            agent_assigned: {
                id: assignedAgentId,
                name: assignedAgentId === id ? agent.name : 'Auto-assigned agent',
                assignment_reason: assignmentReason
            },
            approval_required: needsApproval,
            approval_id: approvalId,
            risk_assessment: needsApproval ? riskAssessment : null,
            workload_info: {
                current_workload: updatedWorkload,
                queue_position: schedulingInfo.queue_position
            },
            template_applied: template_key || null
        });

    } catch (error) {
        logger.error('Create agent task error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update agent task with reassignment and progress tracking
router.put('/:agentId/tasks/:taskId', async (req, res) => {
    try {
        const { agentId, taskId } = req.params;
        const updates = req.body;

        // Special handling for task reassignment
        const {
            reassign_to_agent,
            reassign_reason,
            progress_update,
            force_reassignment = false
        } = updates;

        // Verify original agent belongs to user
        const { data: originalAgent } = await supabase
            .from('agents')
            .select('id, name')
            .eq('id', agentId)
            .eq('user_id', req.user.id)
            .single();

        if (!originalAgent) {
            return res.status(404).json({ error: 'Original agent not found' });
        }

        // Handle task reassignment
        let targetAgentId = agentId;
        let reassignmentPerformed = false;

        if (reassign_to_agent && reassign_to_agent !== agentId) {
            // Verify target agent belongs to user
            const { data: targetAgent } = await supabase
                .from('agents')
                .select('id, name, type')
                .eq('id', reassign_to_agent)
                .eq('user_id', req.user.id)
                .single();

            if (!targetAgent) {
                return res.status(400).json({ error: 'Target agent not found or access denied' });
            }

            // Check if reassignment is advisable (unless forced)
            if (!force_reassignment) {
                const originalWorkload = await calculateAgentWorkload(agentId);
                const targetWorkload = await calculateAgentWorkload(reassign_to_agent);

                // Only allow reassignment if target has lower workload
                if (targetWorkload >= originalWorkload) {
                    return res.status(400).json({
                        error: 'Reassignment not recommended',
                        reason: 'Target agent has higher or equal workload',
                        original_workload: originalWorkload,
                        target_workload: targetWorkload,
                        suggestion: 'Use force_reassignment=true to override this check'
                    });
                }
            }

            targetAgentId = reassign_to_agent;
            reassignmentPerformed = true;
        }

        const allowedUpdates = [
            'title', 'description', 'status', 'priority',
            'parameters', 'result', 'estimated_duration',
            'actual_duration', 'deadline', 'error_message',
            'retry_count'
        ];

        const updateData = {};
        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                if (key === 'parameters' || key === 'result') {
                    updateData[key] = JSON.stringify(updates[key]);
                } else {
                    updateData[key] = updates[key];
                }
            }
        });

        // Handle progress updates
        if (progress_update) {
            const { percentage, notes, milestone } = progress_update;
            updateData.parameters = JSON.stringify({
                ...(updateData.parameters ? JSON.parse(updateData.parameters) : {}),
                progress_history: [
                    ...(updateData.parameters ? JSON.parse(updateData.parameters).progress_history || [] : []),
                    {
                        percentage,
                        notes,
                        milestone,
                        timestamp: new Date().toISOString()
                    }
                ]
            });
        }

        if (Object.keys(updateData).length === 0 && !reassignmentPerformed) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        updateData.updated_at = new Date().toISOString();

        // Handle status-specific logic
        if (updates.status === 'completed') {
            updateData.completed_at = new Date().toISOString();
            // Calculate actual duration if not provided
            if (!updates.actual_duration) {
                const { data: taskData } = await supabase
                    .from('agent_tasks')
                    .select('created_at')
                    .eq('id', taskId)
                    .single();

                if (taskData) {
                    const startTime = new Date(taskData.created_at);
                    const endTime = new Date();
                    updateData.actual_duration = Math.floor((endTime - startTime) / (1000 * 60)); // minutes
                }
            }
        }

        if (updates.status === 'in_progress') {
            updateData.actual_duration = null; // Reset if restarting
        }

        // Perform the update
        let updateQuery = supabase
            .from('agent_tasks')
            .update(updateData)
            .eq('id', taskId);

        // If reassigning, update the agent_id
        if (reassignmentPerformed) {
            updateQuery = updateQuery.eq('agent_id', agentId); // Update from original agent
        } else {
            updateQuery = updateQuery.eq('agent_id', agentId); // Normal update
        }

        const { data: task, error } = await updateQuery.select().single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Agent task not found' });
            }
            logger.error('Update agent task error:', error);
            return res.status(500).json({ error: 'Failed to update agent task' });
        }

        // Handle agent status updates
        if (updates.status === 'completed') {
            await supabase
                .from('agent_status')
                .update({
                    status: 'idle',
                    current_task_id: null,
                    last_activity: new Date().toISOString()
                })
                .eq('agent_id', targetAgentId);
        } else if (updates.status === 'in_progress') {
            await supabase
                .from('agent_status')
                .update({
                    status: 'busy',
                    current_task_id: taskId,
                    last_activity: new Date().toISOString()
                })
                .eq('agent_id', targetAgentId);
        }

        // Handle reassignment logistics
        if (reassignmentPerformed) {
            // Update agent status for both agents
            await supabase
                .from('agent_status')
                .update({
                    status: 'idle',
                    current_task_id: null,
                    last_activity: new Date().toISOString()
                })
                .eq('agent_id', agentId); // Original agent becomes idle

            if (task.status === 'in_progress') {
                await supabase
                    .from('agent_status')
                    .update({
                        status: 'busy',
                        current_task_id: taskId,
                        last_activity: new Date().toISOString()
                    })
                    .eq('agent_id', targetAgentId); // New agent becomes busy
            }
        }

        // Log the update/reassignment
        const logDetails = {
            updates: Object.keys(updateData),
            reassignment_performed: reassignmentPerformed,
            original_agent: reassignmentPerformed ? agentId : null,
            new_agent: reassignmentPerformed ? targetAgentId : null,
            reassign_reason: reassign_reason || null,
            progress_update: progress_update || null
        };

        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: targetAgentId,
                user_id: req.user.id,
                action: reassignmentPerformed ? 'task_reassigned' : 'task_updated',
                resource_type: 'agent_task',
                resource_id: taskId,
                details: logDetails
            }]);

        // Calculate updated progress information
        let progressInfo = null;
        if (task.status && ['pending', 'in_progress', 'completed'].includes(task.status)) {
            const now = new Date();
            const created = new Date(task.created_at);
            const timeElapsed = Math.floor((now - created) / (1000 * 60));

            let progress = 0;
            if (task.status === 'completed') progress = 100;
            else if (task.status === 'in_progress') progress = 50;
            else progress = 0;

            progressInfo = {
                percentage: progress,
                time_elapsed_minutes: timeElapsed,
                estimated_remaining: task.estimated_duration ?
                    Math.max(0, task.estimated_duration - timeElapsed) : null,
                is_overdue: task.deadline ? new Date(task.deadline) < now : false
            };
        }

        const response = {
            success: true,
            task: {
                ...task,
                parameters: task.parameters ? JSON.parse(task.parameters) : {},
                result: task.result ? JSON.parse(task.result) : {},
                progress: progressInfo
            }
        };

        // Add reassignment info if performed
        if (reassignmentPerformed) {
            response.reassignment = {
                from_agent: {
                    id: agentId,
                    name: originalAgent.name
                },
                to_agent: {
                    id: targetAgentId,
                    name: targetAgent.name
                },
                reason: reassign_reason,
                timestamp: new Date().toISOString()
            };

            // Calculate workload changes
            const [originalWorkload, newWorkload] = await Promise.all([
                calculateAgentWorkload(agentId),
                calculateAgentWorkload(targetAgentId)
            ]);

            response.workload_change = {
                original_agent_workload: originalWorkload,
                new_agent_workload: newWorkload,
                workload_reduction: originalWorkload - newWorkload
            };
        }

        res.json(response);

    } catch (error) {
        logger.error('Update agent task error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get available task templates
router.get('/task-templates', async (req, res) => {
    try {
        const { category, type } = req.query;

        let templates = Object.keys(TASK_TEMPLATES).map(key => ({
            key,
            ...TASK_TEMPLATES[key]
        }));

        // Filter by category if specified
        if (category) {
            templates = templates.filter(template =>
                template.parameters?.category === category
            );
        }

        // Filter by type if specified
        if (type) {
            templates = templates.filter(template =>
                template.type === type
            );
        }

        res.json({
            success: true,
            templates,
            total: templates.length,
            filters_applied: { category, type }
        });

    } catch (error) {
        logger.error('Get task templates error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Apply task template to create a new task
router.post('/task-templates/:templateKey/apply', async (req, res) => {
    try {
        const { templateKey } = req.params;
        const { agent_id, custom_parameters = {}, auto_assign = false } = req.body;

        if (!agent_id) {
            return res.status(400).json({ error: 'Agent ID is required' });
        }

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name, type')
            .eq('id', agent_id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Get and apply template
        let taskData;
        try {
            taskData = applyTaskTemplate(templateKey, custom_parameters);
        } catch (templateError) {
            return res.status(400).json({
                error: 'Invalid task template',
                message: templateError.message
            });
        }

        // Override with custom parameters
        const finalTaskData = {
            ...taskData,
            ...custom_parameters,
            agent_id,
            template_used: templateKey,
            created_via_template: true
        };

        // Use the enhanced POST endpoint logic by calling it internally
        // For now, we'll duplicate the logic to avoid circular calls
        const {
            title,
            description,
            type,
            priority = 3,
            parameters = {},
            estimated_duration,
            deadline,
            requires_approval = null,
            required_capabilities = []
        } = finalTaskData;

        // Intelligent agent assignment
        let assignedAgentId = agent_id;
        let assignmentReason = 'template_application';

        if (auto_assign) {
            const bestAgent = await findBestAgentForTask(
                req.user.id,
                type,
                priority,
                required_capabilities
            );

            if (bestAgent && bestAgent.id !== agent_id) {
                assignedAgentId = bestAgent.id;
                assignmentReason = 'intelligent_template_assignment';
            }
        }

        // Check task dependencies
        const dependencyCheck = await checkTaskDependencies(null, assignedAgentId);
        if (!dependencyCheck.canProceed) {
            return res.status(400).json({
                error: 'Task dependencies not satisfied',
                blocking_tasks: dependencyCheck.blockingTasks,
                recommendation: dependencyCheck.recommendation
            });
        }

        // Schedule task priority
        const schedulingInfo = await scheduleTaskPriority(assignedAgentId, priority, deadline);

        // Create the task
        const { data: agentTask, error } = await supabase
            .from('agent_tasks')
            .insert([{
                agent_id: assignedAgentId,
                title,
                description,
                type,
                priority,
                parameters: JSON.stringify(parameters),
                estimated_duration,
                deadline,
                status: 'pending'
            }])
            .select()
            .single();

        if (error) {
            logger.error('Create template task error:', error);
            return res.status(500).json({ error: 'Failed to create template task' });
        }

        // Update agent status
        await supabase
            .from('agent_status')
            .update({
                status: 'busy',
                current_task_id: agentTask.id,
                last_activity: new Date().toISOString()
            })
            .eq('agent_id', assignedAgentId);

        // Log template application
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: assignedAgentId,
                user_id: req.user.id,
                action: 'template_task_created',
                resource_type: 'agent_task',
                resource_id: agentTask.id,
                details: {
                    template_key: templateKey,
                    assignment_reason: assignmentReason,
                    custom_parameters: custom_parameters
                }
            }]);

        // Calculate workload
        const updatedWorkload = await calculateAgentWorkload(assignedAgentId);

        res.status(201).json({
            success: true,
            task: {
                ...agentTask,
                parameters: parameters,
                scheduling_info: schedulingInfo,
                dependencies: dependencyCheck
            },
            template_applied: templateKey,
            agent_assigned: {
                id: assignedAgentId,
                name: assignedAgentId === agent_id ? agent.name : 'Auto-assigned agent',
                assignment_reason: assignmentReason
            },
            workload_info: {
                current_workload: updatedWorkload,
                queue_position: schedulingInfo.queue_position
            }
        });

    } catch (error) {
        logger.error('Apply task template error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get task progress report
router.get('/:id/tasks/progress-report', async (req, res) => {
    try {
        const { id } = req.params;
        const { timeframe = '7d', include_completed = true } = req.query;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Calculate date range
        const now = new Date();
        const startDate = new Date();

        switch (timeframe) {
            case '1d':
                startDate.setDate(now.getDate() - 1);
                break;
            case '7d':
                startDate.setDate(now.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(now.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(now.getDate() - 90);
                break;
            default:
                startDate.setDate(now.getDate() - 7);
        }

        // Get tasks for the timeframe
        let query = supabase
            .from('agent_tasks')
            .select('*')
            .eq('agent_id', id)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: false });

        if (!include_completed) {
            query = query.in('status', ['pending', 'in_progress']);
        }

        const { data: tasks, error } = await query;

        if (error) {
            logger.error('Get progress report error:', error);
            return res.status(500).json({ error: 'Failed to fetch progress report' });
        }

        // Calculate progress metrics
        const totalTasks = tasks?.length || 0;
        const completedTasks = tasks?.filter(t => t.status === 'completed').length || 0;
        const inProgressTasks = tasks?.filter(t => t.status === 'in_progress').length || 0;
        const pendingTasks = tasks?.filter(t => t.status === 'pending').length || 0;
        const failedTasks = tasks?.filter(t => t.status === 'failed').length || 0;

        // Calculate average completion time
        const completedTasksWithDuration = tasks?.filter(t =>
            t.status === 'completed' && t.actual_duration
        ) || [];

        const avgCompletionTime = completedTasksWithDuration.length > 0
            ? completedTasksWithDuration.reduce((sum, t) => sum + t.actual_duration, 0) / completedTasksWithDuration.length
            : 0;

        // Calculate on-time completion rate
        const onTimeTasks = tasks?.filter(t =>
            t.status === 'completed' &&
            t.deadline &&
            new Date(t.completed_at) <= new Date(t.deadline)
        ).length || 0;

        const onTimeRate = completedTasks > 0 ? (onTimeTasks / completedTasks) * 100 : 0;

        // Calculate priority distribution
        const priorityBreakdown = {
            1: tasks?.filter(t => t.priority === 1).length || 0,
            2: tasks?.filter(t => t.priority === 2).length || 0,
            3: tasks?.filter(t => t.priority === 3).length || 0,
            4: tasks?.filter(t => t.priority === 4).length || 0,
            5: tasks?.filter(t => t.priority === 5).length || 0
        };

        // Calculate overdue tasks
        const overdueTasks = tasks?.filter(t =>
            t.deadline && new Date(t.deadline) < now && t.status !== 'completed'
        ).length || 0;

        res.json({
            success: true,
            agent: {
                id: agent.id,
                name: agent.name
            },
            timeframe,
            summary: {
                total_tasks: totalTasks,
                completed_tasks: completedTasks,
                in_progress_tasks: inProgressTasks,
                pending_tasks: pendingTasks,
                failed_tasks: failedTasks,
                completion_rate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
            },
            performance: {
                average_completion_time_minutes: Math.round(avgCompletionTime),
                on_time_completion_rate: Math.round(onTimeRate * 100) / 100,
                overdue_tasks: overdueTasks
            },
            priority_breakdown: priorityBreakdown,
            recent_tasks: tasks?.slice(0, 10).map(task => ({
                id: task.id,
                title: task.title,
                status: task.status,
                priority: task.priority,
                created_at: task.created_at,
                completed_at: task.completed_at,
                actual_duration: task.actual_duration
            })) || []
        });

    } catch (error) {
        logger.error('Get progress report error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Bulk task operations
router.post('/:id/tasks/bulk', async (req, res) => {
    try {
        const { id } = req.params;
        const { operation, task_ids, updates } = req.body;

        if (!operation || !task_ids || !Array.isArray(task_ids)) {
            return res.status(400).json({
                error: 'Operation, task_ids array, and updates are required'
            });
        }

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Verify all tasks belong to the agent
        const { data: tasks, error: tasksError } = await supabase
            .from('agent_tasks')
            .select('id')
            .eq('agent_id', id)
            .in('id', task_ids);

        if (tasksError) {
            logger.error('Bulk operation tasks query error:', tasksError);
            return res.status(500).json({ error: 'Failed to verify tasks' });
        }

        if (!tasks || tasks.length !== task_ids.length) {
            return res.status(400).json({
                error: 'Some tasks not found or do not belong to this agent'
            });
        }

        let results = [];
        const errors = [];

        switch (operation) {
            case 'update_status':
                if (!updates.status) {
                    return res.status(400).json({ error: 'Status is required for update_status operation' });
                }

                for (const taskId of task_ids) {
                    try {
                        const { data: updatedTask, error } = await supabase
                            .from('agent_tasks')
                            .update({
                                status: updates.status,
                                updated_at: new Date().toISOString(),
                                ...(updates.status === 'completed' ? { completed_at: new Date().toISOString() } : {})
                            })
                            .eq('id', taskId)
                            .eq('agent_id', id)
                            .select()
                            .single();

                        if (error) throw error;
                        results.push(updatedTask);
                    } catch (taskError) {
                        errors.push({ task_id: taskId, error: taskError.message });
                    }
                }
                break;

            case 'update_priority':
                if (!updates.priority) {
                    return res.status(400).json({ error: 'Priority is required for update_priority operation' });
                }

                for (const taskId of task_ids) {
                    try {
                        const { data: updatedTask, error } = await supabase
                            .from('agent_tasks')
                            .update({
                                priority: updates.priority,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', taskId)
                            .eq('agent_id', id)
                            .select()
                            .single();

                        if (error) throw error;
                        results.push(updatedTask);
                    } catch (taskError) {
                        errors.push({ task_id: taskId, error: taskError.message });
                    }
                }
                break;

            case 'delete':
                for (const taskId of task_ids) {
                    try {
                        const { error } = await supabase
                            .from('agent_tasks')
                            .delete()
                            .eq('id', taskId)
                            .eq('agent_id', id);

                        if (error) throw error;
                        results.push({ id: taskId, deleted: true });
                    } catch (taskError) {
                        errors.push({ task_id: taskId, error: taskError.message });
                    }
                }
                break;

            default:
                return res.status(400).json({ error: 'Invalid operation' });
        }

        // Log bulk operation
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: id,
                user_id: req.user.id,
                action: 'bulk_task_operation',
                resource_type: 'agent_tasks',
                details: {
                    operation,
                    task_count: task_ids.length,
                    success_count: results.length,
                    error_count: errors.length,
                    updates: updates
                }
            }]);

        res.json({
            success: true,
            operation,
            results,
            errors,
            summary: {
                total_requested: task_ids.length,
                successful: results.length,
                failed: errors.length
            }
        });

    } catch (error) {
        logger.error('Bulk task operation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===========================================
// APPROVALS QUEUE ROUTES
// ===========================================

// Get pending approvals
router.get('/approvals/pending', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;

        const { data: approvals, error } = await supabase
            .from('approvals_queue')
            .select(`
                *,
                agents!inner (
                    id,
                    name,
                    type
                )
            `)
            .eq('user_id', req.user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            logger.error('Get pending approvals error:', error);
            return res.status(500).json({ error: 'Failed to fetch pending approvals' });
        }

        res.json({
            success: true,
            approvals: approvals || [],
            count: approvals?.length || 0
        });

    } catch (error) {
        logger.error('Get pending approvals error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Test endpoint to create a sample approval for UI testing
router.post('/approvals/test', async (req, res) => {
    try {
        const sampleApproval = {
            user_id: req.user.id,
            agent_id: null,
            action_type: 'test_notification',
            action_data: {
                message: 'This is a test notification to verify the bell icon and red dot work correctly.',
                test: true
            },
            reason: 'Testing notification UI system',
            risk_level: 'low',
            priority: 5,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
        };

        const { data, error } = await supabase
            .from('approvals_queue')
            .insert([sampleApproval])
            .select()
            .single();

        if (error) throw error;

        logger.info(`Created test approval for user ${req.user.id}`);
        res.json({
            success: true,
            message: 'Test approval created successfully',
            approval: data
        });

    } catch (error) {
        logger.error('Create test approval error:', error);
        res.status(500).json({ error: 'Failed to create test approval' });
    }
});

// Handle approval decision
router.patch('/approvals/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            status, // 'approved' or 'rejected'
            decision_reason = '',
            review_notes = '',
            escalate_to = null, // User ID to escalate to
            escalation_reason = ''
        } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be approved or rejected' });
        }

        // Get approval details with agent info
        const { data: approval, error: getError } = await supabase
            .from('approvals_queue')
            .select(`
                *,
                agents!inner (
                    id,
                    name,
                    type
                )
            `)
            .eq('id', id)
            .eq('user_id', req.user.id)
            .eq('status', 'pending')
            .single();

        if (getError || !approval) {
            return res.status(404).json({ error: 'Approval not found or already processed' });
        }

        const now = new Date().toISOString();
        const processingTime = new Date(now) - new Date(approval.created_at);

        // Handle escalation if requested
        if (escalate_to && escalate_to !== req.user.id) {
            // Create escalated approval for different user
            const escalationData = {
                agent_id: approval.agent_id,
                user_id: escalate_to,
                action_type: approval.action_type,
                action_data: approval.action_data,
                reason: `Escalated: ${approval.reason}. ${escalation_reason}`,
                risk_level: approval.risk_level,
                priority: Math.max(1, approval.priority - 1), // Increase priority for escalation
                status: 'pending',
                expires_at: new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString(), // 2 hours for escalated
                review_notes: `Escalated from ${req.user.email}: ${escalation_reason}`,
                created_at: now,
                updated_at: now
            };

            const { data: escalatedApproval, error: escalationError } = await supabase
                .from('approvals_queue')
                .insert([escalationData])
                .select()
                .single();

            if (escalationError) {
                logger.error('Create escalated approval error:', escalationError);
                return res.status(500).json({ error: 'Failed to escalate approval' });
            }

            // Mark original approval as escalated
            await supabase
                .from('approvals_queue')
                .update({
                    status: 'escalated',
                    approved_by: req.user.id,
                    approved_at: now,
                    review_notes: `Escalated to user ${escalate_to}: ${escalation_reason}`,
                    updated_at: now
                })
                .eq('id', id);

            // Create notification for escalated user
            await createEscalationNotification(escalatedApproval, approval.agent, 0);

            // Create history for escalation
            await supabase
                .from('approval_history')
                .insert([{
                    approval_id: id,
                    agent_id: approval.agent_id,
                    user_id: req.user.id,
                    action_taken: 'escalated',
                    action_data: approval.action_data,
                    decision_reason: escalation_reason,
                    processing_time_ms: processingTime,
                    risk_assessment: JSON.stringify({
                        risk_level: approval.risk_level,
                        priority: approval.priority,
                        escalated_to: escalate_to
                    })
                }]);

            return res.json({
                success: true,
                message: 'Approval escalated successfully',
                escalated_approval_id: escalatedApproval.id
            });
        }

        // Update approval status
        const updateData = {
            status,
            approved_by: req.user.id,
            approved_at: now,
            review_notes: review_notes || approval.review_notes,
            updated_at: now
        };

        const { data: updatedApproval, error: updateError } = await supabase
            .from('approvals_queue')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            logger.error('Update approval error:', updateError);
            return res.status(500).json({ error: 'Failed to update approval' });
        }

        // If approved, execute the approved action
        if (status === 'approved') {
            try {
                await executeApprovedAction(updatedApproval);
            } catch (executionError) {
                logger.error('Execute approved action error:', executionError);
                // Don't fail the approval if execution fails - log it instead
            }
        }

        // Create approval history record
        await supabase
            .from('approval_history')
            .insert([{
                approval_id: id,
                agent_id: approval.agent_id,
                user_id: req.user.id,
                action_taken: status,
                action_data: approval.action_data,
                decision_reason: decision_reason || `Manually ${status} by user`,
                processing_time_ms: processingTime,
                risk_assessment: JSON.stringify({
                    risk_level: approval.risk_level,
                    priority: approval.priority,
                    template: APPROVAL_TEMPLATES[approval.action_type] ? approval.action_type : 'unknown'
                })
            }]);

        // Update notifications to mark as resolved
        await supabase
            .from('notifications')
            .update({
                status: 'resolved',
                updated_at: now
            })
            .eq('user_id', req.user.id)
            .like('data', `%"approval_id":"${id}"%`);

        // Log approval decision
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: approval.agent_id,
                user_id: req.user.id,
                action: `approval_${status}`,
                resource_type: 'approval',
                resource_id: id,
                details: {
                    action_type: approval.action_type,
                    risk_level: approval.risk_level,
                    processing_time_ms: processingTime,
                    decision_reason: decision_reason
                }
            }]);

        res.json({
            success: true,
            approval: updatedApproval,
            processing_time_ms: processingTime,
            template_used: APPROVAL_TEMPLATES[approval.action_type] ? approval.action_type : 'unknown'
        });

    } catch (error) {
        logger.error('Handle approval error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get approval history
router.get('/approvals/history', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;

        const { data: history, error } = await supabase
            .from('approval_history')
            .select(`
                *,
                agents!inner (
                    id,
                    name,
                    type
                ),
                approval:approvals_queue (
                    action_type,
                    risk_level,
                    priority
                )
            `)
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            logger.error('Get approval history error:', error);
            return res.status(500).json({ error: 'Failed to fetch approval history' });
        }

        res.json({
            success: true,
            history: history || [],
            count: history?.length || 0
        });

    } catch (error) {
        logger.error('Get approval history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===========================================
// APPROVAL ANALYTICS AND REPORTING
// ===========================================

// Get approval statistics
router.get('/approvals/analytics/stats', async (req, res) => {
    try {
        const { date_from, date_to } = req.query;

        let query = supabase
            .from('approval_history')
            .select('*')
            .eq('user_id', req.user.id);

        if (date_from) {
            query = query.gte('created_at', date_from);
        }

        if (date_to) {
            query = query.lte('created_at', date_to);
        }

        const { data: history, error } = await query;

        if (error) {
            logger.error('Get approval analytics error:', error);
            return res.status(500).json({ error: 'Failed to fetch approval analytics' });
        }

        // Calculate statistics
        const stats = {
            total_approvals: history.length,
            approved_count: history.filter(h => h.action_taken === 'approved').length,
            rejected_count: history.filter(h => h.action_taken === 'rejected').length,
            expired_count: history.filter(h => h.action_taken === 'expired').length,
            escalated_count: history.filter(h => h.action_taken === 'escalated').length,
            approval_rate: 0,
            average_processing_time_ms: 0,
            risk_level_distribution: {},
            action_type_distribution: {}
        };

        // Calculate approval rate
        const completedApprovals = stats.approved_count + stats.rejected_count;
        stats.approval_rate = completedApprovals > 0 ? (stats.approved_count / completedApprovals) * 100 : 0;

        // Calculate average processing time
        const processingTimes = history
            .filter(h => h.processing_time_ms)
            .map(h => h.processing_time_ms);
        stats.average_processing_time_ms = processingTimes.length > 0
            ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
            : 0;

        // Risk level distribution
        history.forEach(h => {
            const riskAssessment = h.risk_assessment ? JSON.parse(h.risk_assessment) : {};
            const riskLevel = riskAssessment.risk_level || 'unknown';
            stats.risk_level_distribution[riskLevel] = (stats.risk_level_distribution[riskLevel] || 0) + 1;
        });

        // Action type distribution
        history.forEach(h => {
            const actionType = h.action_taken;
            stats.action_type_distribution[actionType] = (stats.action_type_distribution[actionType] || 0) + 1;
        });

        res.json({
            success: true,
            stats,
            period: {
                from: date_from,
                to: date_to
            }
        });

    } catch (error) {
        logger.error('Get approval stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get approval trends over time
router.get('/approvals/analytics/trends', async (req, res) => {
    try {
        const { period = 'daily', days = 30 } = req.query;
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

        const { data: history, error } = await supabase
            .from('approval_history')
            .select('created_at, action_taken, processing_time_ms')
            .eq('user_id', req.user.id)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .order('created_at', { ascending: true });

        if (error) {
            logger.error('Get approval trends error:', error);
            return res.status(500).json({ error: 'Failed to fetch approval trends' });
        }

        // Group by time period
        const trends = {};
        const dateFormat = period === 'daily' ? 'YYYY-MM-DD' : period === 'weekly' ? 'YYYY-WW' : 'YYYY-MM';

        history.forEach(record => {
            const date = new Date(record.created_at);
            let key;

            if (period === 'daily') {
                key = date.toISOString().split('T')[0];
            } else if (period === 'weekly') {
                const week = Math.ceil((date.getDate() - date.getDay() + 1) / 7);
                key = `${date.getFullYear()}-W${week.toString().padStart(2, '0')}`;
            } else {
                key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            }

            if (!trends[key]) {
                trends[key] = {
                    date: key,
                    total: 0,
                    approved: 0,
                    rejected: 0,
                    expired: 0,
                    escalated: 0,
                    avg_processing_time: 0,
                    processing_times: []
                };
            }

            trends[key].total++;
            trends[key][record.action_taken]++;

            if (record.processing_time_ms) {
                trends[key].processing_times.push(record.processing_time_ms);
            }
        });

        // Calculate averages
        Object.values(trends).forEach(trend => {
            if (trend.processing_times.length > 0) {
                trend.avg_processing_time = trend.processing_times.reduce((a, b) => a + b, 0) / trend.processing_times.length;
            }
            delete trend.processing_times;
        });

        res.json({
            success: true,
            trends: Object.values(trends),
            period,
            days: parseInt(days)
        });

    } catch (error) {
        logger.error('Get approval trends error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get agent approval performance
router.get('/approvals/analytics/agents', async (req, res) => {
    try {
        const { date_from, date_to } = req.query;

        let query = supabase
            .from('approval_history')
            .select(`
                *,
                agents!inner (
                    id,
                    name,
                    type
                )
            `)
            .eq('user_id', req.user.id);

        if (date_from) {
            query = query.gte('created_at', date_from);
        }

        if (date_to) {
            query = query.lte('created_at', date_to);
        }

        const { data: history, error } = await query;

        if (error) {
            logger.error('Get agent approval analytics error:', error);
            return res.status(500).json({ error: 'Failed to fetch agent approval analytics' });
        }

        // Group by agent
        const agentStats = {};

        history.forEach(record => {
            const agentId = record.agent_id;
            if (!agentStats[agentId]) {
                agentStats[agentId] = {
                    agent_id: agentId,
                    agent_name: record.agents.name,
                    agent_type: record.agents.type,
                    total_approvals: 0,
                    approved: 0,
                    rejected: 0,
                    expired: 0,
                    escalated: 0,
                    approval_rate: 0,
                    avg_processing_time: 0,
                    processing_times: []
                };
            }

            agentStats[agentId].total_approvals++;
            agentStats[agentId][record.action_taken]++;

            if (record.processing_time_ms) {
                agentStats[agentId].processing_times.push(record.processing_time_ms);
            }
        });

        // Calculate rates and averages
        Object.values(agentStats).forEach(stat => {
            const completed = stat.approved + stat.rejected;
            stat.approval_rate = completed > 0 ? (stat.approved / completed) * 100 : 0;

            if (stat.processing_times.length > 0) {
                stat.avg_processing_time = stat.processing_times.reduce((a, b) => a + b, 0) / stat.processing_times.length;
            }
            delete stat.processing_times;
        });

        res.json({
            success: true,
            agent_performance: Object.values(agentStats),
            period: {
                from: date_from,
                to: date_to
            }
        });

    } catch (error) {
        logger.error('Get agent approval analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get approval efficiency report
router.get('/approvals/analytics/efficiency', async (req, res) => {
    try {
        const { date_from, date_to } = req.query;

        // Get pending approvals
        let pendingQuery = supabase
            .from('approvals_queue')
            .select('created_at, priority, risk_level')
            .eq('user_id', req.user.id)
            .eq('status', 'pending');

        if (date_from) {
            pendingQuery = pendingQuery.gte('created_at', date_from);
        }

        if (date_to) {
            pendingQuery = pendingQuery.lte('created_at', date_to);
        }

        const { data: pendingApprovals, error: pendingError } = await pendingQuery;

        if (pendingError) {
            logger.error('Get pending approvals for efficiency error:', pendingError);
            return res.status(500).json({ error: 'Failed to fetch efficiency data' });
        }

        // Get approval history
        let historyQuery = supabase
            .from('approval_history')
            .select('created_at, processing_time_ms, risk_level')
            .eq('user_id', req.user.id);

        if (date_from) {
            historyQuery = historyQuery.gte('created_at', date_from);
        }

        if (date_to) {
            historyQuery = historyQuery.lte('created_at', date_to);
        }

        const { data: history, error: historyError } = await historyQuery;

        if (historyError) {
            logger.error('Get approval history for efficiency error:', historyError);
            return res.status(500).json({ error: 'Failed to fetch efficiency data' });
        }

        // Calculate efficiency metrics
        const efficiency = {
            pending_approvals: pendingApprovals.length,
            completed_approvals: history.length,
            average_processing_time_ms: 0,
            pending_by_priority: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            pending_by_risk: { low: 0, medium: 0, high: 0, critical: 0 },
            bottlenecks: []
        };

        // Calculate average processing time
        const processingTimes = history
            .filter(h => h.processing_time_ms)
            .map(h => h.processing_time_ms);

        efficiency.average_processing_time_ms = processingTimes.length > 0
            ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
            : 0;

        // Group pending by priority
        pendingApprovals.forEach(approval => {
            efficiency.pending_by_priority[approval.priority] =
                (efficiency.pending_by_priority[approval.priority] || 0) + 1;
        });

        // Group pending by risk level
        pendingApprovals.forEach(approval => {
            efficiency.pending_by_risk[approval.risk_level] =
                (efficiency.pending_by_risk[approval.risk_level] || 0) + 1;
        });

        // Identify bottlenecks (approvals pending > 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const bottlenecks = pendingApprovals.filter(approval =>
            new Date(approval.created_at) < oneDayAgo
        );

        efficiency.bottlenecks = bottlenecks.map(approval => ({
            id: approval.id,
            age_hours: Math.floor((Date.now() - new Date(approval.created_at)) / (60 * 60 * 1000)),
            priority: approval.priority,
            risk_level: approval.risk_level
        }));

        res.json({
            success: true,
            efficiency,
            period: {
                from: date_from,
                to: date_to
            }
        });

    } catch (error) {
        logger.error('Get approval efficiency error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===========================================
// AGENT ANALYTICS ROUTES
// ===========================================

// Get agent analytics
router.get('/:id/analytics', async (req, res) => {
    try {
        const { id } = req.params;
        const { date_from, date_to, metric_type } = req.query;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        let query = supabase
            .from('agent_analytics')
            .select('*')
            .eq('agent_id', id)
            .order('date', { ascending: false });

        if (date_from) {
            query = query.gte('date', date_from);
        }

        if (date_to) {
            query = query.lte('date', date_to);
        }

        if (metric_type) {
            query = query.eq('metric_type', metric_type);
        }

        const { data: analytics, error } = await query;

        if (error) {
            logger.error('Get agent analytics error:', error);
            return res.status(500).json({ error: 'Failed to fetch agent analytics' });
        }

        res.json({
            success: true,
            analytics: analytics || [],
            count: analytics?.length || 0
        });

    } catch (error) {
        logger.error('Get agent analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get agent metrics
router.get('/:id/metrics', async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 100, offset = 0 } = req.query;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        const { data: metrics, error } = await supabase
            .from('agent_metrics')
            .select('*')
            .eq('agent_id', id)
            .order('timestamp', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            logger.error('Get agent metrics error:', error);
            return res.status(500).json({ error: 'Failed to fetch agent metrics' });
        }

        res.json({
            success: true,
            metrics: metrics || [],
            count: metrics?.length || 0
        });

    } catch (error) {
        logger.error('Get agent metrics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===========================================
// AGENT CONVERSATIONS ROUTES
// ===========================================

// ===========================================
// ENHANCED CONVERSATION MANAGEMENT FUNCTIONS
// ===========================================

// Generate conversation summary using AI
async function generateConversationSummary(conversations, agentId) {
    try {
        // Get agent details for context
        const { data: agent } = await supabase
            .from('agents')
            .select('name, type, description')
            .eq('id', agentId)
            .single();

        if (!agent) return null;

        // Prepare conversation data for summarization
        const conversationText = conversations
            .slice(0, 20) // Use last 20 messages for summary
            .map(conv => `${conv.message_type}: ${conv.content}`)
            .join('\n');

        // Simple summarization logic (can be enhanced with AI service)
        const summary = {
            total_messages: conversations.length,
            user_messages: conversations.filter(c => c.message_type === 'user_message').length,
            agent_responses: conversations.filter(c => c.message_type === 'agent_response').length,
            avg_response_time: conversations
                .filter(c => c.response_time_ms)
                .reduce((sum, c, _, arr) => sum + (c.response_time_ms / arr.length), 0),
            sentiment_distribution: {
                positive: conversations.filter(c => c.sentiment === 'positive').length,
                negative: conversations.filter(c => c.sentiment === 'negative').length,
                neutral: conversations.filter(c => c.sentiment === 'neutral').length
            },
            topics: extractTopics(conversationText),
            last_activity: conversations[0]?.created_at,
            confidence_avg: conversations
                .filter(c => c.confidence_score)
                .reduce((sum, c, _, arr) => sum + (c.confidence_score / arr.length), 0)
        };

        return summary;
    } catch (error) {
        logger.error('Conversation summary generation error:', error);
        return null;
    }
}

// Extract topics from conversation text (simple keyword extraction)
function extractTopics(text) {
    const keywords = [
        'task', 'project', 'email', 'schedule', 'meeting', 'deadline', 'priority',
        'urgent', 'help', 'question', 'information', 'status', 'update', 'create',
        'delete', 'modify', 'search', 'analyze', 'process', 'complete'
    ];

    const textLower = text.toLowerCase();
    return keywords.filter(keyword => textLower.includes(keyword)).slice(0, 5);
}

// Create conversation thread grouping
function groupConversationsByThread(conversations) {
    const threads = new Map();

    conversations.forEach(conv => {
        const threadKey = conv.session_id || `thread_${Math.floor(new Date(conv.created_at).getTime() / (1000 * 60 * 5))}`; // 5-minute windows

        if (!threads.has(threadKey)) {
            threads.set(threadKey, {
                thread_id: threadKey,
                session_id: conv.session_id,
                messages: [],
                start_time: conv.created_at,
                end_time: conv.created_at,
                message_count: 0,
                participants: new Set([conv.user_id])
            });
        }

        const thread = threads.get(threadKey);
        thread.messages.push(conv);
        thread.end_time = conv.created_at;
        thread.message_count++;
        thread.participants.add(conv.user_id);
    });

    return Array.from(threads.values()).map(thread => ({
        ...thread,
        participants: Array.from(thread.participants),
        duration_ms: new Date(thread.end_time) - new Date(thread.start_time)
    }));
}

// Generate conversation analytics
function generateConversationAnalytics(conversations, timeRange = 'all') {
    const analytics = {
        total_conversations: conversations.length,
        message_types: {},
        response_times: [],
        sentiment_trends: {},
        peak_hours: {},
        tokens_used: 0,
        avg_confidence: 0,
        conversation_lengths: []
    };

    conversations.forEach(conv => {
        // Message types
        analytics.message_types[conv.message_type] = (analytics.message_types[conv.message_type] || 0) + 1;

        // Response times
        if (conv.response_time_ms) {
            analytics.response_times.push(conv.response_time_ms);
        }

        // Sentiment trends
        if (conv.sentiment) {
            analytics.sentiment_trends[conv.sentiment] = (analytics.sentiment_trends[conv.sentiment] || 0) + 1;
        }

        // Peak hours
        const hour = new Date(conv.created_at).getHours();
        analytics.peak_hours[hour] = (analytics.peak_hours[hour] || 0) + 1;

        // Tokens and confidence
        if (conv.tokens_used) {
            analytics.tokens_used += conv.tokens_used;
        }

        if (conv.confidence_score) {
            analytics.avg_confidence += conv.confidence_score;
        }
    });

    // Calculate averages
    if (analytics.response_times.length > 0) {
        analytics.avg_response_time = analytics.response_times.reduce((a, b) => a + b, 0) / analytics.response_times.length;
    }

    if (conversations.length > 0) {
        analytics.avg_confidence /= conversations.length;
    }

    return analytics;
}

// Handle conversation export in different formats
async function handleConversationExport(res, conversations, format, agent) {
    try {
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `agent_${agent.name}_conversations_${timestamp}`;

        switch (format.toLowerCase()) {
            case 'json':
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
                res.json({
                    export_info: {
                        agent_name: agent.name,
                        agent_type: agent.type,
                        export_date: new Date().toISOString(),
                        total_conversations: conversations.length
                    },
                    conversations: conversations
                });
                break;

            case 'csv':
                const csvHeaders = [
                    'ID',
                    'Session ID',
                    'Message Type',
                    'Content',
                    'Sentiment',
                    'Confidence Score',
                    'Tokens Used',
                    'Response Time (ms)',
                    'Created At'
                ];

                const csvRows = conversations.map(conv => [
                    conv.id,
                    conv.session_id || '',
                    conv.message_type,
                    `"${conv.content.replace(/"/g, '""')}"`, // Escape quotes
                    conv.sentiment || '',
                    conv.confidence_score || '',
                    conv.tokens_used || '',
                    conv.response_time_ms || '',
                    conv.created_at
                ]);

                const csvContent = [csvHeaders, ...csvRows]
                    .map(row => row.join(','))
                    .join('\n');

                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
                res.send(csvContent);
                break;

            case 'txt':
                const txtContent = conversations
                    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                    .map(conv => {
                        const time = new Date(conv.created_at).toLocaleString();
                        return `[${time}] ${conv.message_type.toUpperCase()}: ${conv.content}`;
                    })
                    .join('\n\n');

                const txtHeader = `Agent: ${agent.name}\nType: ${agent.type}\nExported: ${new Date().toISOString()}\nTotal Messages: ${conversations.length}\n\n`;

                res.setHeader('Content-Type', 'text/plain');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
                res.send(txtHeader + txtContent);
                break;

            default:
                res.status(400).json({ error: 'Unsupported export format. Use: json, csv, or txt' });
        }
    } catch (error) {
        logger.error('Conversation export error:', error);
        res.status(500).json({ error: 'Failed to export conversations' });
    }
}

// Enhanced context management for conversation messages
async function enhanceConversationContext(agentId, userId, messageContent, sessionId = null) {
    try {
        // Get recent conversation history for context
        const { data: recentConversations } = await supabase
            .from('agent_conversations')
            .select('*')
            .eq('agent_id', agentId)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);

        // Get agent profile for personality context
        const { data: agentProfile } = await supabase
            .from('agent_profiles')
            .select('*')
            .eq('agent_id', agentId)
            .single();

        // Generate enhanced metadata
        const enhancedMetadata = {
            context_window: recentConversations?.length || 0,
            conversation_streak: calculateConversationStreak(recentConversations),
            user_patterns: extractUserPatterns(recentConversations),
            agent_personality: agentProfile?.personality || 'professional',
            timezone: agentProfile?.timezone || 'UTC',
            expertise_areas: agentProfile?.expertise_areas || [],
            working_hours: agentProfile?.working_hours || {},
            session_context: sessionId ? await getSessionContext(sessionId) : null,
            message_complexity: analyzeMessageComplexity(messageContent),
            topic_classification: classifyMessageTopic(messageContent),
            urgency_level: detectUrgencyLevel(messageContent),
            follow_up_required: detectFollowUpNeeds(messageContent, recentConversations)
        };

        return enhancedMetadata;
    } catch (error) {
        logger.error('Context enhancement error:', error);
        return {};
    }
}

// Helper functions for context enhancement
function calculateConversationStreak(conversations) {
    if (!conversations || conversations.length === 0) return 0;

    let streak = 0;
    const now = new Date();

    for (const conv of conversations) {
        const convDate = new Date(conv.created_at);
        const daysDiff = Math.floor((now - convDate) / (1000 * 60 * 60 * 24));

        if (daysDiff <= streak) {
            streak++;
        } else {
            break;
        }
    }

    return streak;
}

function extractUserPatterns(conversations) {
    if (!conversations || conversations.length === 0) return {};

    const patterns = {
        preferred_times: {},
        common_topics: {},
        interaction_frequency: conversations.length,
        avg_message_length: 0
    };

    conversations.forEach(conv => {
        // Preferred times
        const hour = new Date(conv.created_at).getHours();
        patterns.preferred_times[hour] = (patterns.preferred_times[hour] || 0) + 1;

        // Message length
        patterns.avg_message_length += conv.content.length;

        // Common topics (simple keyword extraction)
        const keywords = conv.content.toLowerCase().match(/\b\w{4,}\b/g) || [];
        keywords.forEach(keyword => {
            patterns.common_topics[keyword] = (patterns.common_topics[keyword] || 0) + 1;
        });
    });

    patterns.avg_message_length /= conversations.length;

    return patterns;
}

async function getSessionContext(sessionId) {
    if (!sessionId) return null;

    try {
        const { data: sessionConversations } = await supabase
            .from('agent_conversations')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (!sessionConversations || sessionConversations.length === 0) return null;

        return {
            total_messages: sessionConversations.length,
            duration_ms: new Date(sessionConversations[sessionConversations.length - 1].created_at) - new Date(sessionConversations[0].created_at),
            topics_discussed: extractTopics(sessionConversations.map(c => c.content).join(' ')),
            resolution_status: detectResolutionStatus(sessionConversations)
        };
    } catch (error) {
        logger.error('Session context error:', error);
        return null;
    }
}

function analyzeMessageComplexity(content) {
    const words = content.split(/\s+/).length;
    const sentences = content.split(/[.!?]+/).length;
    const avgWordLength = content.replace(/\s+/g, '').length / words;

    if (words < 10) return 'simple';
    if (words < 25) return 'moderate';
    if (words < 50) return 'complex';
    return 'very_complex';
}

function classifyMessageTopic(content) {
    const contentLower = content.toLowerCase();

    const topics = {
        task_management: /\b(task|todo|complete|done|schedule|deadline)\b/i,
        email_processing: /\b(email|mail|gmail|inbox|message|send)\b/i,
        information_request: /\b(what|how|when|where|why|who|find|search|lookup)\b/i,
        project_planning: /\b(project|plan|goal|objective|milestone)\b/i,
        technical_help: /\b(error|bug|fix|problem|issue|help|support)\b/i,
        administrative: /\b(update|change|modify|create|delete|settings)\b/i
    };

    for (const [topic, regex] of Object.entries(topics)) {
        if (regex.test(contentLower)) {
            return topic;
        }
    }

    return 'general';
}

function detectUrgencyLevel(content) {
    const urgentKeywords = /\b(urgent|emergency|asap|immediately|critical|rush)\b/i;
    const highPriorityKeywords = /\b(important|priority|soon|quick|fast)\b/i;

    if (urgentKeywords.test(content)) return 'urgent';
    if (highPriorityKeywords.test(content)) return 'high';
    return 'normal';
}

function detectFollowUpNeeds(currentMessage, recentConversations) {
    const contentLower = currentMessage.toLowerCase();

    // Check for questions that might need follow-up
    const questionWords = /\b(how|what|when|where|why|who|can you|will you|do you)\b/i;
    const followUpIndicators = /\b(remind|follow up|check|update|later|tomorrow)\b/i;

    if (questionWords.test(contentLower) || followUpIndicators.test(contentLower)) {
        return true;
    }

    // Check if this continues a previous conversation thread
    if (recentConversations && recentConversations.length > 0) {
        const lastMessage = recentConversations[0];
        const timeDiff = new Date() - new Date(lastMessage.created_at);
        const hoursSinceLastMessage = timeDiff / (1000 * 60 * 60);

        if (hoursSinceLastMessage < 24) {
            return true; // Recent conversation, likely needs follow-up
        }
    }

    return false;
}

function detectResolutionStatus(conversations) {
    if (!conversations || conversations.length === 0) return 'unknown';

    const lastMessage = conversations[conversations.length - 1];
    const contentLower = lastMessage.content.toLowerCase();

    const resolvedIndicators = /\b(done|completed|solved|finished|resolved|success|thank you|thanks)\b/i;
    const unresolvedIndicators = /\b(pending|waiting|stuck|problem|issue|help|need)\b/i;

    if (resolvedIndicators.test(contentLower)) return 'resolved';
    if (unresolvedIndicators.test(contentLower)) return 'unresolved';
    return 'in_progress';
}

// Get agent conversations with enhanced features
router.get('/:id/conversations', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            limit = 50,
            offset = 0,
            session_id,
            search,
            message_type,
            sentiment,
            date_from,
            date_to,
            include_summary = false,
            include_analytics = false,
            include_threads = false,
            export_format,
            sort_by = 'created_at',
            sort_order = 'desc'
        } = req.query;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id, name, type')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Build base query
        let query = supabase
            .from('agent_conversations')
            .select('*')
            .eq('agent_id', id);

        // Apply filters
        if (session_id) {
            query = query.eq('session_id', session_id);
        }

        if (message_type) {
            query = query.eq('message_type', message_type);
        }

        if (sentiment) {
            query = query.eq('sentiment', sentiment);
        }

        if (date_from) {
            query = query.gte('created_at', date_from);
        }

        if (date_to) {
            query = query.lte('created_at', date_to);
        }

        // Apply search filter (full-text search on content)
        if (search) {
            query = query.ilike('content', `%${search}%`);
        }

        // Apply sorting
        const orderDirection = sort_order === 'asc';
        query = query.order(sort_by, { ascending: orderDirection });

        // Apply pagination
        query = query.range(offset, offset + parseInt(limit) - 1);

        const { data: conversations, error } = await query;

        if (error) {
            logger.error('Get agent conversations error:', error);
            return res.status(500).json({ error: 'Failed to fetch agent conversations' });
        }

        let result = {
            success: true,
            conversations: conversations || [],
            count: conversations?.length || 0,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                has_more: conversations && conversations.length === parseInt(limit)
            }
        };

        // Add summary if requested
        if (include_summary === 'true' && conversations?.length > 0) {
            result.summary = await generateConversationSummary(conversations, id);
        }

        // Add analytics if requested
        if (include_analytics === 'true' && conversations?.length > 0) {
            result.analytics = generateConversationAnalytics(conversations);
        }

        // Add thread grouping if requested
        if (include_threads === 'true' && conversations?.length > 0) {
            result.threads = groupConversationsByThread(conversations);
        }

        // Handle export formats
        if (export_format && conversations?.length > 0) {
            return handleConversationExport(res, conversations, export_format, agent);
        }

        res.json(result);

    } catch (error) {
        logger.error('Get agent conversations error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add conversation message with AI-powered response generation
router.post('/:id/conversations', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            message_type,
            content,
            session_id,
            metadata = {},
            tokens_used,
            response_time_ms,
            sentiment,
            confidence_score,
            enhance_context = true,
            auto_session = true,
            generate_ai_response = false,
            ai_model_override,
            sentiment_analysis = true,
            intent_detection = true,
            context_enhancement = true,
            response_optimization = true
        } = req.body;

        if (!message_type || !content) {
            return res.status(400).json({ error: 'Message type and content are required' });
        }

        // Verify agent belongs to user and get full agent details
        const { data: agent } = await supabase
            .from('agents')
            .select(`
                *,
                agent_profiles (*),
                agent_status (*)
            `)
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Start timing for response generation
        const startTime = Date.now();

        // Generate session ID if auto_session is enabled and no session_id provided
        let finalSessionId = session_id;
        if (auto_session && !finalSessionId) {
            finalSessionId = generateSessionId(agent.id, req.user.id);
        }

        // AI Analysis and Enhancement Pipeline
        let aiAnalysis = {};
        let aiResponse = null;
        let enhancedContent = content;

        // Step 1: Intent Detection using NLP Engine
        if (intent_detection && message_type === 'user_message') {
            aiAnalysis.intent = nlpEngine.analyzeIntent(content);
            logger.info(`Intent detected: ${aiAnalysis.intent.intent} (confidence: ${aiAnalysis.intent.confidence})`);
        }

        // Step 2: Sentiment Analysis
        if (sentiment_analysis) {
            // Get recent conversation history for context
            const { data: recentConversations } = await supabase
                .from('agent_conversations')
                .select('content, sentiment, created_at')
                .eq('agent_id', id)
                .eq('user_id', req.user.id)
                .eq('session_id', finalSessionId)
                .order('created_at', { ascending: false })
                .limit(10);

            const contextHistory = recentConversations || [];
            aiAnalysis.sentiment = nlpEngine.analyzeSentiment(content, { conversation_history: contextHistory });
            logger.info(`Sentiment analyzed: ${aiAnalysis.sentiment.category} (score: ${aiAnalysis.sentiment.score})`);
        }

        // Step 3: Entity Extraction
        if (context_enhancement) {
            aiAnalysis.entities = nlpEngine.extractEntities(content);
            aiAnalysis.urgency = nlpEngine.detectUrgency(content);
            aiAnalysis.complexity = nlpEngine.assessComplexity(content);
        }

        // Step 4: AI Response Generation
        if (generate_ai_response && message_type === 'user_message') {
            try {
                // Select optimal AI model
                const selectedModel = aiServiceManager.selectModel(agent, 'text_generation', req.user.id);
                logger.info(`Selected AI model: ${selectedModel.name} for task generation`);

                // Get conversation context for better responses
                const { data: conversationHistory } = await supabase
                    .from('agent_conversations')
                    .select('content, message_type, created_at')
                    .eq('agent_id', id)
                    .eq('session_id', finalSessionId)
                    .order('created_at', { ascending: false })
                    .limit(20);

                const context = conversationHistory ? conversationHistory.reverse() : [];

                // Generate AI response based on intent and context
                aiResponse = await generateAIResponse(content, {
                    agent,
                    intent: aiAnalysis.intent,
                    sentiment: aiAnalysis.sentiment,
                    entities: aiAnalysis.entities,
                    conversation_context: context,
                    user_id: req.user.id,
                    session_id: finalSessionId
                });

                // Record performance metrics
                const responseTime = Date.now() - startTime;
                aiServiceManager.recordPerformance(selectedModel.name, 'text_generation', req.user.id, {
                    response_time: responseTime,
                    success: true,
                    quality_score: aiResponse ? aiResponse.confidence_score : 0,
                    tokens_used: aiResponse ? aiResponse.tokens_used : 0
                });

                logger.info(`AI response generated in ${responseTime}ms`);

            } catch (error) {
                logger.error('AI response generation error:', error);
                aiResponse = {
                    error: 'AI response generation failed',
                    fallback_response: 'I apologize, but I\'m unable to generate a response at this time. Please try again.',
                    confidence_score: 0
                };
            }
        }

        // Step 5: Response Optimization
        if (response_optimization && aiResponse && aiResponse.content) {
            aiResponse = await optimizeResponse(aiResponse, {
                user_sentiment: aiAnalysis.sentiment,
                conversation_context: context,
                agent_personality: agent.agent_profiles?.personality || 'professional'
            });
        }

        // ===========================================
        // AI RESPONSE GENERATION FUNCTIONS
        // ===========================================

        // Generate AI-powered response based on user input and context
        async function generateAIResponse(userMessage, context) {
            const { agent, intent, sentiment, entities, conversation_context, user_id, session_id } = context;

            // Build comprehensive prompt for AI model
            const prompt = buildResponsePrompt(userMessage, {
                agent,
                intent,
                sentiment,
                entities,
                conversation_context,
                current_time: new Date().toISOString()
            });

            // Mock AI response generation (in real implementation, this would call actual AI APIs)
            const response = await generateMockAIResponse(prompt, agent);

            return {
                content: response.content,
                confidence_score: response.confidence,
                tokens_used: response.tokens_used,
                model_used: response.model,
                generation_time_ms: response.generation_time,
                metadata: {
                    intent_detected: intent?.intent,
                    sentiment_analyzed: sentiment?.category,
                    entities_extracted: entities,
                    prompt_used: prompt.substring(0, 200) + '...'
                }
            };
        }

        // Build intelligent prompt for AI response generation
        function buildResponsePrompt(userMessage, context) {
            const { agent, intent, sentiment, entities, conversation_context } = context;

            let prompt = `You are ${agent.name}, an AI assistant specialized in ${agent.type}.

User Message: "${userMessage}"

Context Analysis:
- Detected Intent: ${intent?.intent || 'unknown'} (confidence: ${intent?.confidence || 0})
- Sentiment: ${sentiment?.category || 'neutral'} (score: ${sentiment?.score || 0})
- Urgency Level: ${entities?.urgency?.level || 1}/5
- Message Complexity: ${entities?.complexity || 1}/5

`;

            // Add conversation history for context
            if (conversation_context && conversation_context.length > 0) {
                prompt += '\nRecent Conversation History:\n';
                conversation_context.slice(-5).forEach((msg, idx) => {
                    prompt += `${idx + 1}. ${msg.message_type}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}\n`;
                });
            }

            // Add entity-specific guidance
            if (entities?.dates?.length > 0) {
                prompt += `\nMentioned dates: ${entities.dates.join(', ')}\n`;
            }
            if (entities?.times?.length > 0) {
                prompt += `\nMentioned times: ${entities.times.join(', ')}\n`;
            }
            if (entities?.actions?.length > 0) {
                prompt += `\nRequested actions: ${entities.actions.join(', ')}\n`;
            }

            prompt += `

Instructions:
- Respond as ${agent.name} with a ${agent.agent_profiles?.personality || 'professional'} tone
- Address the user's intent: ${intent?.intent || 'general inquiry'}
- Consider sentiment: ${sentiment?.category || 'neutral'}
- Be helpful, accurate, and contextually appropriate
- Keep responses concise but informative
- If appropriate, suggest next steps or ask clarifying questions

Response:`;

            return prompt;
        }

        // Mock AI response generation (replace with actual AI API calls)
        async function generateMockAIResponse(prompt, agent) {
            // Simulate API call delay
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

            const responses = {
                task_creation: [
                    "I understand you'd like me to help with a task. Let me create that for you and assign it to the most appropriate agent.",
                    "Great! I'll set up that task and make sure it gets handled efficiently.",
                    "Task creation acknowledged. I'll process this and assign it to the right team member."
                ],
                question_asking: [
                    "I'd be happy to help answer your question. Let me look into that for you.",
                    "That's a good question. I'll gather the relevant information and get back to you.",
                    "Let me research that and provide you with a comprehensive answer."
                ],
                status_request: [
                    "I'll check the current status and provide you with an update right away.",
                    "Let me pull up the latest information on that for you.",
                    "Status check initiated. I'll have that information for you shortly."
                ],
                urgent_request: [
                    "I understand this is urgent. I'm prioritizing this and will get back to you as soon as possible.",
                    "Urgent request noted. This will be handled with high priority.",
                    "Emergency situation acknowledged. I'm escalating this and will respond immediately."
                ]
            };

            // Select response based on intent
            const intent = prompt.includes('task_creation') ? 'task_creation' :
                          prompt.includes('question_asking') ? 'question_asking' :
                          prompt.includes('status_request') ? 'status_request' :
                          prompt.includes('urgent_request') ? 'urgent_request' : 'general';

            const possibleResponses = responses[intent] || responses.general || ["I understand. Let me help you with that."];
            const selectedResponse = possibleResponses[Math.floor(Math.random() * possibleResponses.length)];

            return {
                content: selectedResponse,
                confidence: 0.85 + Math.random() * 0.1, // 0.85-0.95
                tokens_used: Math.floor(prompt.length / 4) + Math.floor(selectedResponse.length / 4),
                model: agent.model || 'gpt-4',
                generation_time: 500 + Math.random() * 1000
            };
        }

        // Optimize response based on context and user sentiment
        async function optimizeResponse(aiResponse, context) {
            const { user_sentiment, conversation_context, agent_personality } = context;

            let optimizedContent = aiResponse.content;

            // Adjust tone based on user sentiment
            if (user_sentiment?.category === 'negative' && user_sentiment?.score < -0.3) {
                // User seems frustrated - be more empathetic
                if (!optimizedContent.includes('sorry') && !optimizedContent.includes('apologize')) {
                    optimizedContent = "I'm sorry to hear you're experiencing issues. " + optimizedContent;
                }
            } else if (user_sentiment?.category === 'positive') {
                // User is positive - maintain enthusiasm
                if (optimizedContent.includes('help') && !optimizedContent.includes('glad')) {
                    optimizedContent = optimizedContent.replace('help', 'glad to help');
                }
            }

            // Adjust based on agent personality
            switch (agent_personality) {
                case 'casual':
                    optimizedContent = optimizedContent.replace(/I will/g, "I'll").replace(/I am/g, "I'm");
                    break;
                case 'formal':
                    optimizedContent = optimizedContent.replace(/I'll/g, "I will").replace(/I'm/g, "I am");
                    break;
            }

            // Add contextual follow-up if appropriate
            if (conversation_context && conversation_context.length > 3) {
                const lastUserMessage = conversation_context
                    .filter(msg => msg.message_type === 'user_message')
                    .slice(-1)[0];

                if (lastUserMessage && lastUserMessage.content.includes('?')) {
                    // User asked a question - ensure response is comprehensive
                    if (!optimizedContent.includes('?') && optimizedContent.length < 100) {
                        optimizedContent += " Is there anything else you'd like me to clarify?";
                    }
                }
            }

            return {
                ...aiResponse,
                content: optimizedContent,
                optimization_applied: {
                    sentiment_adjustment: user_sentiment?.category === 'negative',
                    personality_adjustment: agent_personality !== 'professional',
                    context_followup: conversation_context?.length > 3
                }
            };
        }

        // ===========================================
        // END AI RESPONSE GENERATION FUNCTIONS
        // ===========================================

        // Enhance context if requested
        let enhancedMetadata = { ...metadata };
        if (enhance_context) {
            const contextData = await enhanceConversationContext(id, req.user.id, content, finalSessionId);
            enhancedMetadata = {
                ...enhancedMetadata,
                ...contextData,
                enhanced_at: new Date().toISOString(),
                context_version: '2.0'
            };
        }

        // Add conversation entry to database
        const conversationData = {
                agent_id: id,
                user_id: req.user.id,
            session_id: finalSessionId,
                message_type,
                content,
            metadata: JSON.stringify(enhancedMetadata),
                tokens_used,
                response_time_ms,
                sentiment,
                confidence_score
        };

        const { data: conversation, error } = await supabase
            .from('agent_conversations')
            .insert([conversationData])
            .select(`
                *,
                agents!inner(name, type),
                user:users(name, email)
            `)
            .single();

        if (error) {
            logger.error('Add conversation message error:', error);
            return res.status(500).json({ error: 'Failed to add conversation message' });
        }

        // Log conversation activity
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: id,
                user_id: req.user.id,
                action: 'conversation_message_added',
                resource_type: 'conversation',
                resource_id: conversation.id,
                details: {
                    message_type,
                    session_id: finalSessionId,
                    content_length: content.length,
                    has_enhanced_context: enhance_context,
                    sentiment,
                    confidence_score
                },
                severity: 'info'
            }]);

        // Check for follow-up needs and create notifications if necessary
        if (enhancedMetadata.follow_up_required) {
            await createFollowUpNotification(id, req.user.id, conversation.id, enhancedMetadata);
        }

        // Update agent status if this is a significant interaction
        if (enhancedMetadata.urgency_level === 'urgent') {
            await updateAgentStatusForUrgentMessage(id);
        }

        // Auto-generate AI response if requested and this is a user message
        let aiGeneratedResponse = null;
        if (generate_ai_response && message_type === 'user_message' && aiResponse) {
            try {
                // Save the AI response as a new conversation message
                const aiConversationData = {
                    agent_id: id,
                    user_id: req.user.id,
                    session_id: finalSessionId,
                    message_type: 'agent_response',
                    content: aiResponse.content,
                    metadata: JSON.stringify({
                        ai_generated: true,
                        model_used: aiResponse.model_used,
                        confidence_score: aiResponse.confidence_score,
                        tokens_used: aiResponse.tokens_used,
                        generation_time_ms: aiResponse.generation_time_ms,
                        intent_detected: aiAnalysis.intent?.intent,
                        sentiment_analyzed: aiAnalysis.sentiment?.category,
                        optimization_applied: aiResponse.optimization_applied,
                        created_from_message: conversation.id
                    }),
                    tokens_used: aiResponse.tokens_used,
                    response_time_ms: aiResponse.generation_time_ms,
                    sentiment: 'neutral', // AI responses are typically neutral
                    confidence_score: aiResponse.confidence_score
                };

                const { data: aiConversation, error: aiError } = await supabase
                    .from('agent_conversations')
                    .insert([aiConversationData])
                    .select(`
                        *,
                        agents!inner(name, type),
                        user:users(name, email)
                    `)
                    .single();

                if (!aiError && aiConversation) {
                    aiGeneratedResponse = {
                        ...aiConversation,
                        metadata: JSON.parse(aiConversation.metadata || '{}'),
                        ai_metadata: aiResponse.metadata
                    };

                    // Log AI response generation
                    await supabase
                        .from('agent_logs')
                        .insert([{
                            agent_id: id,
                            user_id: req.user.id,
                            action: 'ai_response_generated',
                            resource_type: 'conversation',
                            resource_id: aiConversation.id,
                            details: {
                                model_used: aiResponse.model_used,
                                confidence_score: aiResponse.confidence_score,
                                tokens_used: aiResponse.tokens_used,
                                generation_time_ms: aiResponse.generation_time_ms,
                                intent_processed: aiAnalysis.intent?.intent,
                                sentiment_processed: aiAnalysis.sentiment?.category
                            },
                            severity: 'info'
                        }]);

                    logger.info(`AI response generated and saved for user ${req.user.id}, agent ${id}`);
                }
            } catch (error) {
                logger.error('AI response generation failed:', error);
            }
        }

        const result = {
            success: true,
            conversation: {
                ...conversation,
                metadata: enhancedMetadata,
                session_id: finalSessionId
            },
            context_enhanced: enhance_context,
            follow_up_recommended: enhancedMetadata.follow_up_required,
            urgency_level: enhancedMetadata.urgency_level,
            // Add AI analysis results
            ai_analysis: sentiment_analysis || intent_detection ? {
                intent: aiAnalysis.intent,
                sentiment: aiAnalysis.sentiment,
                entities: aiAnalysis.entities,
                urgency: aiAnalysis.urgency,
                complexity: aiAnalysis.complexity,
                analysis_timestamp: new Date().toISOString()
            } : null,
            // Add AI-generated response if available
            ai_response: aiGeneratedResponse ? {
                conversation: aiGeneratedResponse,
                metadata: {
                    model_used: aiResponse.model_used,
                    confidence_score: aiResponse.confidence_score,
                    tokens_used: aiResponse.tokens_used,
                    generation_time_ms: aiResponse.generation_time_ms,
                    optimization_applied: aiResponse.optimization_applied
                }
            } : null,
            // Add performance metrics
            performance_metrics: {
                total_processing_time_ms: Date.now() - startTime,
                ai_features_used: {
                    sentiment_analysis,
                    intent_detection,
                    context_enhancement,
                    response_optimization,
                    ai_response_generation: generate_ai_response
                }
            }
        };

        // Add conversation insights if this is part of a session
        if (finalSessionId) {
            result.session_insights = await generateSessionInsights(finalSessionId, id);
        }

        res.status(201).json(result);

    } catch (error) {
        logger.error('Add conversation message error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Generate a unique session ID for conversations
function generateSessionId(agentId, userId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `session_${agentId}_${userId}_${timestamp}_${random}`;
}

// Create follow-up notifications for important conversations
async function createFollowUpNotification(agentId, userId, conversationId, metadata) {
    try {
        await supabase
            .from('notifications')
            .insert([{
                user_id: userId,
                type: 'conversation_follow_up',
                title: 'Conversation Follow-up Needed',
                message: `A conversation with your agent requires follow-up attention.`,
                priority: metadata.urgency_level === 'urgent' ? 1 : 2,
                action_required: true,
                created_at: new Date().toISOString()
            }]);
    } catch (error) {
        logger.error('Follow-up notification creation error:', error);
    }
}

// Update agent status for urgent messages
async function updateAgentStatusForUrgentMessage(agentId) {
    try {
        await supabase
            .from('agent_status')
            .upsert({
                agent_id: agentId,
                status: 'busy',
                status_message: 'Handling urgent conversation',
                last_activity: new Date().toISOString()
            });
    } catch (error) {
        logger.error('Agent status update error:', error);
    }
}

// Generate insights for conversation sessions
async function generateSessionInsights(sessionId, agentId) {
    try {
        const { data: sessionConversations } = await supabase
            .from('agent_conversations')
            .select('*')
            .eq('session_id', sessionId)
            .eq('agent_id', agentId)
            .order('created_at', { ascending: true });

        if (!sessionConversations || sessionConversations.length === 0) return null;

        const insights = {
            session_duration_ms: new Date(sessionConversations[sessionConversations.length - 1].created_at) - new Date(sessionConversations[0].created_at),
            message_count: sessionConversations.length,
            user_messages: sessionConversations.filter(c => c.message_type === 'user_message').length,
            agent_responses: sessionConversations.filter(c => c.message_type === 'agent_response').length,
            avg_response_time: calculateAverageResponseTime(sessionConversations),
            topics_covered: extractTopics(sessionConversations.map(c => c.content).join(' ')),
            sentiment_trend: analyzeSentimentTrend(sessionConversations),
            completion_status: detectResolutionStatus(sessionConversations)
        };

        return insights;
    } catch (error) {
        logger.error('Session insights generation error:', error);
        return null;
    }
}

// Calculate average response time for a session
function calculateAverageResponseTime(conversations) {
    const responseTimes = conversations
        .filter(c => c.response_time_ms && c.response_time_ms > 0)
        .map(c => c.response_time_ms);

    if (responseTimes.length === 0) return 0;

    return responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
}

// Analyze sentiment trend over a conversation session
function analyzeSentimentTrend(conversations) {
    const sentiments = conversations
        .filter(c => c.sentiment)
        .map(c => c.sentiment);

    if (sentiments.length === 0) return 'neutral';

    const sentimentCounts = {
        positive: sentiments.filter(s => s === 'positive').length,
        negative: sentiments.filter(s => s === 'negative').length,
        neutral: sentiments.filter(s => s === 'neutral').length
    };

    // Return the most common sentiment
    const maxSentiment = Object.entries(sentimentCounts)
        .reduce((a, b) => sentimentCounts[a[0]] > sentimentCounts[b[0]] ? a : b)[0];

    return maxSentiment;
}

// ===========================================
// ADDITIONAL CONVERSATION MANAGEMENT ENDPOINTS
// ===========================================

// Search conversations with advanced filtering
router.get('/:id/conversations/search', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            q, // search query
            message_type,
            sentiment,
            date_from,
            date_to,
            limit = 20,
            offset = 0,
            sort_by = 'created_at',
            sort_order = 'desc'
        } = req.query;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        let query = supabase
            .from('agent_conversations')
            .select('*')
            .eq('agent_id', id);

        // Apply search query (full-text search across content and metadata)
        if (q) {
            query = query.or(`content.ilike.%${q}%,metadata->>'topic_classification'.ilike.%${q}%`);
        }

        // Apply filters
        if (message_type) {
            query = query.eq('message_type', message_type);
        }

        if (sentiment) {
            query = query.eq('sentiment', sentiment);
        }

        if (date_from) {
            query = query.gte('created_at', date_from);
        }

        if (date_to) {
            query = query.lte('created_at', date_to);
        }

        // Apply sorting
        const orderDirection = sort_order === 'asc';
        query = query.order(sort_by, { ascending: orderDirection });

        // Apply pagination
        query = query.range(offset, offset + parseInt(limit) - 1);

        const { data: conversations, error } = await query;

        if (error) {
            logger.error('Search conversations error:', error);
            return res.status(500).json({ error: 'Failed to search conversations' });
        }

        // Add search highlights
        const highlightedConversations = conversations?.map(conv => ({
            ...conv,
            search_highlights: q ? generateSearchHighlights(conv.content, q) : []
        }));

        res.json({
            success: true,
            query: q,
            conversations: highlightedConversations || [],
            count: conversations?.length || 0,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                has_more: conversations && conversations.length === parseInt(limit)
            }
        });

    } catch (error) {
        logger.error('Search conversations error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get conversation analytics and insights
router.get('/:id/conversations/analytics', async (req, res) => {
    try {
        const { id } = req.params;
        const { period = '7d', include_trends = true } = req.query;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Calculate date range based on period
        const endDate = new Date();
        const startDate = new Date();

        switch (period) {
            case '1d':
                startDate.setDate(endDate.getDate() - 1);
                break;
            case '7d':
                startDate.setDate(endDate.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(endDate.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(endDate.getDate() - 90);
                break;
            default:
                startDate.setDate(endDate.getDate() - 7);
        }

        // Get conversations for the period
        const { data: conversations, error } = await supabase
            .from('agent_conversations')
            .select('*')
            .eq('agent_id', id)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .order('created_at', { ascending: true });

        if (error) {
            logger.error('Get conversation analytics error:', error);
            return res.status(500).json({ error: 'Failed to fetch analytics' });
        }

        const analytics = generateConversationAnalytics(conversations || []);

        // Add trend analysis if requested
        if (include_trends === 'true') {
            analytics.trends = await generateTrendAnalysis(conversations || [], period);
        }

        // Add conversation quality metrics
        analytics.quality_metrics = {
            avg_confidence_score: conversations?.filter(c => c.confidence_score).reduce((sum, c, _, arr) => sum + (c.confidence_score / arr.length), 0) || 0,
            response_time_distribution: calculateResponseTimeDistribution(conversations || []),
            topic_distribution: analyzeTopicDistribution(conversations || []),
            user_satisfaction_estimate: estimateUserSatisfaction(conversations || [])
        };

        res.json({
            success: true,
            analytics,
            period,
            date_range: {
                start: startDate.toISOString(),
                end: endDate.toISOString()
            }
        });

    } catch (error) {
        logger.error('Get conversation analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get conversation threads and sessions
router.get('/:id/conversations/threads', async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 10, include_messages = false } = req.query;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Get all conversations to group into threads
        const { data: conversations, error } = await supabase
            .from('agent_conversations')
            .select('*')
            .eq('agent_id', id)
            .order('created_at', { ascending: false })
            .limit(1000); // Get enough for thread analysis

        if (error) {
            logger.error('Get conversation threads error:', error);
            return res.status(500).json({ error: 'Failed to fetch threads' });
        }

        const threads = groupConversationsByThread(conversations || [])
            .slice(0, parseInt(limit));

        // Add detailed messages if requested
        if (include_messages === 'true') {
            for (const thread of threads) {
                const { data: threadMessages } = await supabase
                    .from('agent_conversations')
                    .select('*')
                    .eq('session_id', thread.thread_id)
                    .order('created_at', { ascending: true });

                thread.messages = threadMessages || [];
            }
        }

        res.json({
            success: true,
            threads,
            total_threads: threads.length
        });

    } catch (error) {
        logger.error('Get conversation threads error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get conversation summary for a specific session
router.get('/:id/conversations/sessions/:sessionId', async (req, res) => {
    try {
        const { id, sessionId } = req.params;

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Get all messages in the session
        const { data: sessionMessages, error } = await supabase
            .from('agent_conversations')
            .select('*')
            .eq('agent_id', id)
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (error) {
            logger.error('Get session conversations error:', error);
            return res.status(500).json({ error: 'Failed to fetch session' });
        }

        if (!sessionMessages || sessionMessages.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const sessionSummary = {
            session_id: sessionId,
            message_count: sessionMessages.length,
            duration_ms: new Date(sessionMessages[sessionMessages.length - 1].created_at) - new Date(sessionMessages[0].created_at),
            start_time: sessionMessages[0].created_at,
            end_time: sessionMessages[sessionMessages.length - 1].created_at,
            messages: sessionMessages,
            insights: await generateSessionInsights(sessionId, id)
        };

        res.json({
            success: true,
            session: sessionSummary
        });

    } catch (error) {
        logger.error('Get session conversations error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Bulk operations on conversations
router.post('/:id/conversations/bulk', async (req, res) => {
    try {
        const { id } = req.params;
        const { operation, conversation_ids, data } = req.body;

        if (!operation || !conversation_ids || !Array.isArray(conversation_ids)) {
            return res.status(400).json({ error: 'Operation and conversation_ids array are required' });
        }

        // Verify agent belongs to user
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        let result = { success: true, affected_count: 0 };

        switch (operation) {
            case 'delete':
                const { data: deletedConversations, error: deleteError } = await supabase
                    .from('agent_conversations')
                    .delete()
                    .eq('agent_id', id)
                    .in('id', conversation_ids)
                    .select();

                if (deleteError) throw deleteError;

                result.affected_count = deletedConversations?.length || 0;
                break;

            case 'update_sentiment':
                if (!data.sentiment) {
                    return res.status(400).json({ error: 'Sentiment is required for update operation' });
                }

                const { data: updatedConversations, error: updateError } = await supabase
                    .from('agent_conversations')
                    .update({ sentiment: data.sentiment })
                    .eq('agent_id', id)
                    .in('id', conversation_ids)
                    .select();

                if (updateError) throw updateError;

                result.affected_count = updatedConversations?.length || 0;
                break;

            case 'archive':
                const { data: archivedConversations, error: archiveError } = await supabase
                    .from('agent_conversations')
                    .update({ message_type: 'archived' })
                    .eq('agent_id', id)
                    .in('id', conversation_ids)
                    .select();

                if (archiveError) throw archiveError;

                result.affected_count = archivedConversations?.length || 0;
                break;

            default:
                return res.status(400).json({ error: 'Unsupported operation' });
        }

        // Log bulk operation
        await supabase
            .from('agent_logs')
            .insert([{
                agent_id: id,
                user_id: req.user.id,
                action: `conversation_bulk_${operation}`,
                resource_type: 'conversation',
                details: {
                    operation,
                    affected_count: result.affected_count,
                    conversation_ids
                },
                severity: 'info'
            }]);

        res.json(result);

    } catch (error) {
        logger.error('Bulk conversation operation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===========================================
// HELPER FUNCTIONS FOR ENHANCED FEATURES
// ===========================================

// Generate search highlights for content
function generateSearchHighlights(content, query) {
    const highlights = [];
    const contentLower = content.toLowerCase();
    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/);

    words.forEach(word => {
        let index = contentLower.indexOf(word);
        while (index !== -1) {
            highlights.push({
                word,
                position: index,
                length: word.length
            });
            index = contentLower.indexOf(word, index + 1);
        }
    });

    return highlights.slice(0, 10); // Limit highlights
}

// Generate trend analysis for conversations
async function generateTrendAnalysis(conversations, period) {
    const trends = {
        message_volume: [],
        sentiment_trends: [],
        response_time_trends: [],
        topic_trends: []
    };

    if (!conversations || conversations.length === 0) return trends;

    // Group conversations by time periods
    const timeGroups = groupByTimePeriod(conversations, period);

    Object.entries(timeGroups).forEach(([period, messages]) => {
        trends.message_volume.push({
            period,
            count: messages.length
        });

        // Sentiment trends
        const sentiments = messages.filter(m => m.sentiment);
        if (sentiments.length > 0) {
            const sentimentCounts = {
                positive: sentiments.filter(m => m.sentiment === 'positive').length,
                negative: sentiments.filter(m => m.sentiment === 'negative').length,
                neutral: sentiments.filter(m => m.sentiment === 'neutral').length
            };

            trends.sentiment_trends.push({
                period,
                ...sentimentCounts
            });
        }

        // Response time trends
        const avgResponseTime = calculateAverageResponseTime(messages);
        trends.response_time_trends.push({
            period,
            avg_response_time: avgResponseTime
        });
    });

    return trends;
}

// Group conversations by time period
function groupByTimePeriod(conversations, period) {
    const groups = {};

    conversations.forEach(conv => {
        const date = new Date(conv.created_at);
        let key;

        switch (period) {
            case '1d':
                key = date.toISOString().split('T')[0]; // YYYY-MM-DD
                break;
            case '7d':
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay());
                key = weekStart.toISOString().split('T')[0];
                break;
            case '30d':
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                break;
            default:
                key = date.toISOString().split('T')[0];
        }

        if (!groups[key]) groups[key] = [];
        groups[key].push(conv);
    });

    return groups;
}

// Calculate response time distribution
function calculateResponseTimeDistribution(conversations) {
    const responseTimes = conversations
        .filter(c => c.response_time_ms && c.response_time_ms > 0)
        .map(c => c.response_time_ms)
        .sort((a, b) => a - b);

    if (responseTimes.length === 0) return null;

    return {
        min: Math.min(...responseTimes),
        max: Math.max(...responseTimes),
        median: responseTimes[Math.floor(responseTimes.length / 2)],
        p95: responseTimes[Math.floor(responseTimes.length * 0.95)],
        count: responseTimes.length
    };
}

// Analyze topic distribution
function analyzeTopicDistribution(conversations) {
    const topics = {};

    conversations.forEach(conv => {
        const topic = classifyMessageTopic(conv.content);
        topics[topic] = (topics[topic] || 0) + 1;
    });

    return Object.entries(topics)
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count);
}

// Estimate user satisfaction based on conversation patterns
function estimateUserSatisfaction(conversations) {
    if (!conversations || conversations.length === 0) return 0;

    let satisfactionScore = 0.5; // Base score

    // Factors that increase satisfaction
    const positiveFactors = {
        quick_responses: conversations.filter(c => c.response_time_ms && c.response_time_ms < 5000).length / conversations.length,
        positive_sentiment: conversations.filter(c => c.sentiment === 'positive').length / conversations.length,
        resolved_conversations: conversations.filter(c => detectResolutionStatus([c]) === 'resolved').length / conversations.length,
        high_confidence: conversations.filter(c => c.confidence_score && c.confidence_score > 0.8).length / conversations.length
    };

    // Factors that decrease satisfaction
    const negativeFactors = {
        slow_responses: conversations.filter(c => c.response_time_ms && c.response_time_ms > 30000).length / conversations.length,
        negative_sentiment: conversations.filter(c => c.sentiment === 'negative').length / conversations.length,
        low_confidence: conversations.filter(c => c.confidence_score && c.confidence_score < 0.3).length / conversations.length
    };

    // Calculate weighted score
    satisfactionScore +=
        positiveFactors.quick_responses * 0.2 +
        positiveFactors.positive_sentiment * 0.25 +
        positiveFactors.resolved_conversations * 0.3 +
        positiveFactors.high_confidence * 0.15;

    satisfactionScore -=
        negativeFactors.slow_responses * 0.15 +
        negativeFactors.negative_sentiment * 0.2 +
        negativeFactors.low_confidence * 0.1;

    return Math.max(0, Math.min(1, satisfactionScore));
}

// ===========================================
// PATTERN RECOGNITION AND DADDY AGENT INTEGRATION
// ===========================================

const { GlobalPreferenceLearner } = require('../services/PreferenceLearner');
const { DaddyAgent } = require('../services/DaddyAgent');

// Initialize preference learner and daddy agents
const preferenceLearner = new GlobalPreferenceLearner();
const activeDaddyAgents = new Map(); // userId -> DaddyAgent instance

// Get or create daddy agent for user
async function getDaddyAgent(userId) {
    if (!activeDaddyAgents.has(userId)) {
        const preferences = await preferenceLearner.getUserPreferences(userId);
        const patterns = await preferenceLearner.analyzePatterns(userId);
        const recommendations = await preferenceLearner.getDaddyAgentRecommendations(userId);

        const daddyAgent = new DaddyAgent({
            userId,
            preferences,
            patterns,
            ...recommendations
        });

        await daddyAgent.initialize();
        activeDaddyAgents.set(userId, daddyAgent);
    }
    return activeDaddyAgents.get(userId);
}

// ===========================================
// PATTERN RECOGNITION ENDPOINTS
// ===========================================

// Analyze user patterns and generate insights
router.get('/patterns/analyze', async (req, res) => {
    try {
        const userId = req.user.id;

        const patterns = await preferenceLearner.analyzePatterns(userId);
        const suggestions = await preferenceLearner.generateProactiveSuggestions(userId, patterns);

        res.json({
            success: true,
            patterns,
            suggestions,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error analyzing patterns:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to analyze patterns',
            message: error.message
        });
    }
});

// Get user learning patterns
router.get('/patterns/learning', async (req, res) => {
    try {
        const userId = req.user.id;
        const { pattern_type } = req.query;

        let query = supabase
            .from('user_learning_patterns')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

        if (pattern_type) {
            query = query.eq('pattern_type', pattern_type);
        }

        const { data: patterns, error } = await query;

        if (error) throw error;

        res.json({
            success: true,
            patterns: patterns || [],
            count: patterns?.length || 0
        });

    } catch (error) {
        logger.error('Error fetching learning patterns:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch learning patterns',
            message: error.message
        });
    }
});

// Update pattern confidence based on user feedback
router.post('/patterns/feedback', async (req, res) => {
    try {
        const userId = req.user.id;
        const { pattern_type, pattern_data, feedback } = req.body;

        if (!pattern_type || !feedback) {
            return res.status(400).json({
                success: false,
                error: 'pattern_type and feedback are required'
            });
        }

        // Update pattern confidence based on feedback
        let confidenceAdjustment = 0;
        if (feedback.helpful) {
            confidenceAdjustment = 0.1;
        } else if (feedback.not_helpful) {
            confidenceAdjustment = -0.05;
        }

        if (confidenceAdjustment !== 0) {
            // First get current values
            const { data: currentPattern, error: fetchError } = await supabase
                .from('user_learning_patterns')
                .select('confidence_score, successful_applications')
                .eq('user_id', userId)
                .eq('pattern_type', pattern_type)
                .single();

            if (fetchError) throw fetchError;

            // Calculate new values
            const newConfidenceScore = Math.max(0.1, Math.min(0.95, currentPattern.confidence_score + confidenceAdjustment));
            const newSuccessfulApplications = currentPattern.successful_applications + 1;

            // Update with calculated values
            const { error } = await supabase
                .from('user_learning_patterns')
                .update({
                    confidence_score: newConfidenceScore,
                    successful_applications: newSuccessfulApplications,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)
                .eq('pattern_type', pattern_type);

            if (error) throw error;
        }

        res.json({
            success: true,
            message: 'Pattern feedback recorded',
            adjustment: confidenceAdjustment
        });

    } catch (error) {
        logger.error('Error recording pattern feedback:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to record feedback',
            message: error.message
        });
    }
});

// Create agentic task
router.post('/agentic-task', async (req, res) => {
    try {
        const {
            endGoal,
            stepsIdentified,
            stepsDescription,
            timeConstraint,
            moneyConstraint,
            agentsRequested,
            pmAgentRequested
        } = req.body;

        if (!endGoal) {
            return res.status(400).json({ error: 'End goal is required' });
        }

        // Create the agentic task record
        const { data: task, error: taskError } = await supabase
            .from('agentic_tasks')
            .insert([{
                user_id: req.user.id,
                end_goal: endGoal,
                steps_identified: stepsIdentified,
                steps_description: stepsDescription,
                time_constraint: timeConstraint,
                money_constraint: moneyConstraint,
                agents_requested: agentsRequested || 1,
                pm_agent_requested: pmAgentRequested || false,
                status: 'pending'
            }])
            .select()
            .single();

        if (taskError) {
            logger.error('Error creating agentic task:', taskError);
            throw taskError;
        }

        // Here you would typically trigger agent creation and task assignment
        // For now, we'll just acknowledge the creation

        logger.info(`Agentic task created for user ${req.user.id}: ${endGoal.substring(0, 100)}...`);

        res.status(201).json({
            success: true,
            message: 'Agentic task created successfully',
            task_id: task.id,
            agents_will_be_created: agentsRequested || 1
        });

    } catch (error) {
        logger.error('Create agentic task error:', error);
        res.status(500).json({ error: 'Failed to create agentic task' });
    }
});

module.exports = router;
