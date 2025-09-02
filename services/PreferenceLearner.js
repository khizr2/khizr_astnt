const { supabase } = require('../database/connection');
const { logger } = require('../utils/logger');

class GlobalPreferenceLearner {
    constructor() {
        this.cache = new Map(); // userId -> preferences cache
        this.patterns = new Map(); // userId -> learning patterns
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    }

    /**
     * Learn from user interaction and update preferences
     * @param {string} userId - User identifier
     * @param {Object} interaction - Interaction data
     */
    async learnFromInteraction(userId, interaction) {
        try {
            const { message, response, timestamp } = interaction;

            // Analyze message for preference patterns
            const preferences = this._analyzeMessage(message);

            // Update preferences in database and cache
            for (const preference of preferences) {
                await this._updateOrCreatePreference(userId, preference);
            }

            // Clear cache to force refresh on next access
            this.cache.delete(userId);

            logger.info(`Learned preferences for user ${userId}:`, preferences);

        } catch (error) {
            logger.error('Error learning from interaction:', error);
            // Don't throw - learning should fail gracefully
        }
    }

    /**
     * Apply global preferences to AI context
     * @param {string} userId - User identifier
     * @param {Object} context - Current AI context
     * @returns {Object} - Enhanced context with preferences
     */
    async applyGlobalPreferences(userId, context = {}) {
        try {
            let preferences = this.cache.get(userId);

            // Check if cache is expired or missing
            if (!preferences || this._isCacheExpired(preferences.timestamp)) {
                preferences = await this._loadPreferencesFromDatabase(userId);
                this.cache.set(userId, {
                    data: preferences,
                    timestamp: Date.now()
                });
            }

            return this._applyPreferencesToContext(preferences.data, context);

        } catch (error) {
            logger.error('Error applying global preferences:', error);
            return context; // Return original context on error
        }
    }

    /**
     * Update or create a preference
     * @param {string} userId - User identifier
     * @param {Object} preference - Preference object { type, key, value, confidence }
     */
    async updatePreference(userId, preference) {
        try {
            const { type, key, value, confidence = 0.5 } = preference;

            // Upsert preference in database
            const { data, error } = await supabase
                .from('user_preferences')
                .upsert({
                    user_id: userId,
                    preference_type: type,
                    preference_key: key,
                    preference_value: value,
                    confidence_score: confidence,
                    last_updated: new Date().toISOString()
                }, {
                    onConflict: 'user_id,preference_type,preference_key'
                })
                .select()
                .single();

            if (error) {
                logger.error('Database error updating preference:', error);
                return false;
            }

            // Update usage count if preference already existed
            if (data && data.usage_count) {
                await supabase
                    .from('user_preferences')
                    .update({
                        usage_count: data.usage_count + 1,
                        last_updated: new Date().toISOString()
                    })
                    .eq('id', data.id);
            }

            // Clear cache
            this.cache.delete(userId);

            logger.info(`Updated preference for user ${userId}: ${type}.${key}`);
            return true;

        } catch (error) {
            logger.error('Error updating preference:', error);
            return false;
        }
    }

    /**
     * Get all preferences for a user
     * @param {string} userId - User identifier
     * @returns {Object} - Organized preferences object
     */
    async getUserPreferences(userId) {
        try {
            let preferences = this.cache.get(userId);

            if (!preferences || this._isCacheExpired(preferences.timestamp)) {
                preferences = await this._loadPreferencesFromDatabase(userId);
                this.cache.set(userId, {
                    data: preferences,
                    timestamp: Date.now()
                });
            }

            return preferences.data;

        } catch (error) {
            logger.error('Error getting user preferences:', error);
            return {};
        }
    }

    // Private helper methods

    /**
     * Analyze message for preference patterns
     * @param {string} message - User message
     * @returns {Array} - Array of detected preferences
     */
    _analyzeMessage(message) {
        const preferences = [];
        const lowerMessage = message.toLowerCase().trim();

        // Skip analysis for empty or very short messages
        if (!lowerMessage || lowerMessage.length < 2) {
            return preferences;
        }

        // Format preferences
        if (lowerMessage.includes('word tree') || lowerMessage.includes('tree format')) {
            preferences.push({
                type: 'format',
                key: 'response_format',
                value: 'word_tree',
                confidence: 0.8
            });
        }

        // Communication style - brief responses (only for meaningful short messages)
        if (message.length < 50 && message.length > 5 && !lowerMessage.includes('?') && lowerMessage.length > 2) {
            preferences.push({
                type: 'style',
                key: 'communication_style',
                value: 'brief',
                confidence: 0.6
            });
        }

        // Communication style - detailed responses
        if (message.length > 200) {
            preferences.push({
                type: 'style',
                key: 'communication_style',
                value: 'detailed',
                confidence: 0.4
            });
        }

        // Task emphasis - completion focus
        if (lowerMessage.includes('important') || lowerMessage.includes('critical') ||
            lowerMessage.includes('must') || lowerMessage.includes('urgent') ||
            lowerMessage.includes('priority')) {
            preferences.push({
                type: 'priority',
                key: 'task_emphasis',
                value: 'completion_focus',
                confidence: 0.7
            });
        }

        // Efficiency preferences
        if (lowerMessage.includes('quick') || lowerMessage.includes('fast') ||
            lowerMessage.includes('efficient')) {
            preferences.push({
                type: 'style',
                key: 'response_speed',
                value: 'efficient',
                confidence: 0.6
            });
        }

        return preferences;
    }

    /**
     * Apply preferences to AI context
     * @param {Object} preferences - User preferences
     * @param {Object} context - AI context
     * @returns {Object} - Enhanced context
     */
    _applyPreferencesToContext(preferences, context) {
        // Handle null/undefined context
        const baseContext = context || {};
        const enhancedContext = { ...baseContext };

        let hasPreferences = false;

        // Apply format preferences
        if (preferences.format?.response_format?.value === 'word_tree') {
            enhancedContext.response_format = 'word_tree';
            if (!enhancedContext.system_prompt_addition) {
                enhancedContext.system_prompt_addition = '';
            }
            enhancedContext.system_prompt_addition +=
                '\nPlease structure responses using word tree format when appropriate.';
            hasPreferences = true;
        }

        // Apply communication style
        if (preferences.style?.communication_style?.value === 'brief') {
            enhancedContext.temperature = Math.max(0.3, (enhancedContext.temperature || 0.7) - 0.2);
            enhancedContext.max_tokens = Math.min(800, enhancedContext.max_tokens || 1000);
            if (!enhancedContext.system_prompt_addition) {
                enhancedContext.system_prompt_addition = '';
            }
            enhancedContext.system_prompt_addition +=
                '\nPlease keep responses concise and to the point.';
            hasPreferences = true;
        } else if (preferences.style?.communication_style?.value === 'detailed') {
            enhancedContext.temperature = Math.min(0.9, (enhancedContext.temperature || 0.7) + 0.1);
            enhancedContext.max_tokens = Math.max(1200, enhancedContext.max_tokens || 1000);
            if (!enhancedContext.system_prompt_addition) {
                enhancedContext.system_prompt_addition = '';
            }
            enhancedContext.system_prompt_addition +=
                '\nPlease provide detailed and comprehensive responses.';
            hasPreferences = true;
        }

        // Apply task emphasis
        if (preferences.priority?.task_emphasis?.value === 'completion_focus') {
            if (!enhancedContext.system_prompt_addition) {
                enhancedContext.system_prompt_addition = '';
            }
            enhancedContext.system_prompt_addition +=
                '\nEmphasize task completion and progress tracking in responses.';
            hasPreferences = true;
        }

        // Apply efficiency preferences
        if (preferences.style?.response_speed?.value === 'efficient') {
            enhancedContext.temperature = Math.max(0.3, (enhancedContext.temperature || 0.7) - 0.3);
            if (!enhancedContext.system_prompt_addition) {
                enhancedContext.system_prompt_addition = '';
            }
            enhancedContext.system_prompt_addition +=
                '\nPrioritize efficiency and speed in responses.';
            hasPreferences = true;
        }

        return enhancedContext;
    }

    /**
     * Load preferences from database
     * @param {string} userId - User identifier
     * @returns {Object} - Preferences data with timestamp
     */
    async _loadPreferencesFromDatabase(userId) {
        try {
            const { data, error } = await supabase
                .from('user_preferences')
                .select('preference_type, preference_key, preference_value, confidence_score, usage_count')
                .eq('user_id', userId)
                .order('last_updated', { ascending: false });

            if (error) {
                logger.error('Database error loading preferences:', error);
                return { data: {} };
            }

            // Organize preferences by type
            const organizedPreferences = {};
            data.forEach(pref => {
                if (!organizedPreferences[pref.preference_type]) {
                    organizedPreferences[pref.preference_type] = {};
                }
                organizedPreferences[pref.preference_type][pref.preference_key] = {
                    value: pref.preference_value,
                    confidence: pref.confidence_score,
                    usage_count: pref.usage_count
                };
            });

            return {
                data: organizedPreferences,
                timestamp: Date.now()
            };

        } catch (error) {
            logger.error('Error loading preferences from database:', error);
            return { data: {} };
        }
    }

    /**
     * Update or create preference in database
     * @param {string} userId - User identifier
     * @param {Object} preference - Preference object
     */
    async _updateOrCreatePreference(userId, preference) {
        try {
            const { type, key, value, confidence } = preference;

            // Check if preference already exists
            const { data: existingPref } = await supabase
                .from('user_preferences')
                .select('id, usage_count, confidence_score')
                .eq('user_id', userId)
                .eq('preference_type', type)
                .eq('preference_key', key)
                .single();

            if (existingPref) {
                // Update existing preference with higher confidence if repeated
                const newConfidence = Math.min(0.95, existingPref.confidence_score + 0.1);
                const newUsageCount = existingPref.usage_count + 1;

                await supabase
                    .from('user_preferences')
                    .update({
                        preference_value: value,
                        confidence_score: newConfidence,
                        usage_count: newUsageCount,
                        last_updated: new Date().toISOString()
                    })
                    .eq('id', existingPref.id);
            } else {
                // Create new preference
                await supabase
                    .from('user_preferences')
                    .insert({
                        user_id: userId,
                        preference_type: type,
                        preference_key: key,
                        preference_value: value,
                        confidence_score: confidence,
                        usage_count: 1,
                        created_at: new Date().toISOString(),
                        last_updated: new Date().toISOString()
                    });
            }

        } catch (error) {
            logger.error('Error updating preference:', error);
        }
    }

    /**
     * Analyze conversation history for behavioral patterns
     * @param {string} userId - User identifier
     * @returns {Object} - Analyzed patterns
     */
    async analyzePatterns(userId) {
        try {
            const conversations = await this._getUserConversations(userId);

            const patterns = {
                taskCompletion: this._analyzeTaskCompletionPatterns(conversations),
                communicationStyle: this._analyzeCommunicationPatterns(conversations),
                urgencyPatterns: this._analyzeUrgencyPatterns(conversations),
                preferredTimes: this._analyzeTimePatterns(conversations),
                escalationTriggers: this._analyzeEscalationTriggers(conversations)
            };

            // Store patterns in database
            await this._storePatterns(userId, patterns);

            return patterns;
        } catch (error) {
            logger.error('Error analyzing patterns:', error);
            return {};
        }
    }

    /**
     * Generate proactive suggestions based on learned patterns
     * @param {string} userId - User identifier
     * @param {Object} patterns - Analyzed patterns
     * @returns {Array} - Array of suggestions
     */
    async generateProactiveSuggestions(userId, patterns) {
        try {
            const suggestions = [];

            // Task completion pattern suggestions
            if (patterns.taskCompletion?.highCompletionRate) {
                suggestions.push({
                    type: 'task_optimization',
                    message: 'Based on your completion patterns, consider breaking large tasks into smaller steps',
                    confidence: patterns.taskCompletion.confidence,
                    category: 'productivity'
                });
            }

            // Communication style suggestions
            if (patterns.communicationStyle?.prefersDetailed) {
                suggestions.push({
                    type: 'communication_enhancement',
                    message: 'Consider providing more context in task descriptions for better outcomes',
                    confidence: patterns.communicationStyle.confidence,
                    category: 'communication'
                });
            }

            // Urgency pattern suggestions
            if (patterns.urgencyPatterns?.frequentUrgentTasks) {
                suggestions.push({
                    type: 'time_management',
                    message: 'Consider planning ahead to reduce urgent task frequency',
                    confidence: patterns.urgencyPatterns.confidence,
                    category: 'time_management'
                });
            }

            // Preferred time suggestions
            if (patterns.preferredTimes?.peakHours) {
                suggestions.push({
                    type: 'scheduling_optimization',
                    message: `Schedule important tasks during your peak hours: ${patterns.preferredTimes.peakHours.join(', ')}`,
                    confidence: patterns.preferredTimes.confidence,
                    category: 'scheduling'
                });
            }

            // Store suggestions for tracking
            await this._storeSuggestions(userId, suggestions);

            return suggestions;
        } catch (error) {
            logger.error('Error generating proactive suggestions:', error);
            return [];
        }
    }

    /**
     * Get pattern-based recommendations for daddy agent behavior
     * @param {string} userId - User identifier
     * @returns {Object} - Daddy agent configuration recommendations
     */
    async getDaddyAgentRecommendations(userId) {
        try {
            const patterns = await this.analyzePatterns(userId);

            const recommendations = {
                monitoringLevel: 'medium',
                escalationThreshold: 'medium',
                proactiveSuggestions: true,
                personalizedReminders: true,
                taskBreakdown: false,
                communicationStyle: 'balanced'
            };

            // Adjust monitoring level based on completion focus
            if (patterns.taskCompletion?.completionFocus) {
                recommendations.monitoringLevel = 'high';
            }

            // Adjust escalation threshold based on urgency patterns
            if (patterns.urgencyPatterns?.frequentUrgentTasks) {
                recommendations.escalationThreshold = 'low';
            }

            // Enable task breakdown for users who struggle with large tasks
            if (patterns.taskCompletion?.prefersSmallTasks) {
                recommendations.taskBreakdown = true;
            }

            // Set communication style based on preferences
            if (patterns.communicationStyle?.prefersBrief) {
                recommendations.communicationStyle = 'brief';
            } else if (patterns.communicationStyle?.prefersDetailed) {
                recommendations.communicationStyle = 'detailed';
            }

            return recommendations;
        } catch (error) {
            logger.error('Error getting daddy agent recommendations:', error);
            return {
                monitoringLevel: 'medium',
                escalationThreshold: 'medium',
                proactiveSuggestions: true,
                personalizedReminders: true,
                taskBreakdown: false,
                communicationStyle: 'balanced'
            };
        }
    }

    // Private pattern analysis methods

    /**
     * Analyze task completion patterns
     * @param {Array} conversations - User conversations
     * @returns {Object} - Task completion pattern analysis
     */
    _analyzeTaskCompletionPatterns(conversations) {
        const taskMessages = conversations.filter(msg =>
            msg.content.toLowerCase().includes('task') ||
            msg.content.toLowerCase().includes('complete') ||
            msg.content.toLowerCase().includes('done') ||
            msg.content.toLowerCase().includes('finish')
        );

        const completionIndicators = taskMessages.filter(msg =>
            msg.content.toLowerCase().includes('completed') ||
            msg.content.toLowerCase().includes('finished') ||
            msg.content.toLowerCase().includes('done')
        );

        const completionRate = taskMessages.length > 0 ?
            completionIndicators.length / taskMessages.length : 0;

        return {
            highCompletionRate: completionRate > 0.7,
            completionFocus: taskMessages.some(msg =>
                msg.content.toLowerCase().includes('important') ||
                msg.content.toLowerCase().includes('critical') ||
                msg.content.toLowerCase().includes('priority')
            ),
            prefersSmallTasks: taskMessages.some(msg =>
                msg.content.toLowerCase().includes('break down') ||
                msg.content.toLowerCase().includes('smaller') ||
                msg.content.toLowerCase().includes('step by step')
            ),
            confidence: Math.min(completionRate + 0.3, 1.0),
            sampleSize: taskMessages.length
        };
    }

    /**
     * Analyze communication patterns
     * @param {Array} conversations - User conversations
     * @returns {Object} - Communication pattern analysis
     */
    _analyzeCommunicationPatterns(conversations) {
        const userMessages = conversations.filter(msg => msg.message_type === 'user_message');

        const avgLength = userMessages.reduce((sum, msg) => sum + msg.content.length, 0) / userMessages.length;
        const questionCount = userMessages.filter(msg => msg.content.includes('?')).length;
        const questionRatio = userMessages.length > 0 ? questionCount / userMessages.length : 0;

        return {
            prefersBrief: avgLength < 100,
            prefersDetailed: avgLength > 300,
            asksManyQuestions: questionRatio > 0.3,
            directCommunication: userMessages.some(msg =>
                msg.content.toLowerCase().includes('please') ||
                msg.content.toLowerCase().includes('could you') ||
                msg.content.toLowerCase().includes('can you')
            ),
            confidence: 0.7,
            sampleSize: userMessages.length
        };
    }

    /**
     * Analyze urgency patterns
     * @param {Array} conversations - User conversations
     * @returns {Object} - Urgency pattern analysis
     */
    _analyzeUrgencyPatterns(conversations) {
        const urgentKeywords = ['urgent', 'asap', 'emergency', 'critical', 'immediately', 'deadline', 'now'];
        const urgentMessages = conversations.filter(msg =>
            urgentKeywords.some(keyword => msg.content.toLowerCase().includes(keyword))
        );

        const urgentRatio = conversations.length > 0 ? urgentMessages.length / conversations.length : 0;

        return {
            frequentUrgentTasks: urgentRatio > 0.1,
            timeSensitive: conversations.some(msg =>
                msg.content.toLowerCase().includes('by tomorrow') ||
                msg.content.toLowerCase().includes('today') ||
                msg.content.toLowerCase().includes('deadline')
            ),
            confidence: Math.min(urgentRatio + 0.4, 1.0),
            sampleSize: conversations.length
        };
    }

    /**
     * Analyze time patterns for preferred communication times
     * @param {Array} conversations - User conversations
     * @returns {Object} - Time pattern analysis
     */
    _analyzeTimePatterns(conversations) {
        const timeDistribution = {};

        conversations.forEach(msg => {
            if (msg.created_at) {
                const hour = new Date(msg.created_at).getHours();
                timeDistribution[hour] = (timeDistribution[hour] || 0) + 1;
            }
        });

        const peakHours = Object.entries(timeDistribution)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([hour]) => parseInt(hour));

        const totalMessages = Object.values(timeDistribution).reduce((a, b) => a + b, 0);
        const maxFrequency = Math.max(...Object.values(timeDistribution));

        return {
            peakHours: peakHours,
            timePreference: peakHours.length > 0 ? 'consistent' : 'flexible',
            confidence: totalMessages > 10 ? maxFrequency / totalMessages : 0.5,
            sampleSize: totalMessages
        };
    }

    /**
     * Analyze escalation triggers
     * @param {Array} conversations - User conversations
     * @returns {Object} - Escalation trigger analysis
     */
    _analyzeEscalationTriggers(conversations) {
        const escalationIndicators = ['help', 'stuck', 'problem', 'issue', 'error', 'urgent', 'critical'];
        const escalationMessages = conversations.filter(msg =>
            escalationIndicators.some(indicator => msg.content.toLowerCase().includes(indicator))
        );

        const escalationRatio = conversations.length > 0 ? escalationMessages.length / conversations.length : 0;

        return {
            frequentEscalations: escalationRatio > 0.15,
            commonTriggers: escalationIndicators.filter(indicator =>
                conversations.some(msg => msg.content.toLowerCase().includes(indicator))
            ),
            confidence: Math.min(escalationRatio + 0.3, 1.0),
            sampleSize: conversations.length
        };
    }

    /**
     * Get user conversations from database
     * @param {string} userId - User identifier
     * @returns {Array} - User conversations
     */
    async _getUserConversations(userId) {
        try {
            const { data, error } = await supabase
                .from('agent_conversations')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(100); // Analyze last 100 conversations

            if (error) {
                logger.error('Error fetching conversations:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            logger.error('Error getting user conversations:', error);
            return [];
        }
    }

    /**
     * Store analyzed patterns in database
     * @param {string} userId - User identifier
     * @param {Object} patterns - Analyzed patterns
     */
    async _storePatterns(userId, patterns) {
        try {
            for (const [patternType, patternData] of Object.entries(patterns)) {
                await supabase
                    .from('user_learning_patterns')
                    .upsert({
                        user_id: userId,
                        pattern_type: patternType,
                        pattern_data: patternData,
                        trigger_keywords: this._extractTriggerKeywords(patternData),
                        confidence_score: patternData.confidence || 0.5,
                        successful_applications: 0,
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'user_id,pattern_type'
                    });
            }
        } catch (error) {
            logger.error('Error storing patterns:', error);
        }
    }

    /**
     * Store proactive suggestions for tracking
     * @param {string} userId - User identifier
     * @param {Array} suggestions - Generated suggestions
     */
    async _storeSuggestions(userId, suggestions) {
        try {
            const suggestionRecords = suggestions.map(suggestion => ({
                user_id: userId,
                preference_type: 'suggestion',
                preference_key: suggestion.type,
                preference_value: suggestion,
                confidence_score: suggestion.confidence,
                usage_count: 1,
                last_updated: new Date().toISOString()
            }));

            for (const record of suggestionRecords) {
                await supabase
                    .from('user_preferences')
                    .upsert(record, {
                        onConflict: 'user_id,preference_type,preference_key'
                    });
            }
        } catch (error) {
            logger.error('Error storing suggestions:', error);
        }
    }

    /**
     * Extract trigger keywords from pattern data
     * @param {Object} patternData - Pattern analysis data
     * @returns {Array} - Array of trigger keywords
     */
    _extractTriggerKeywords(patternData) {
        const keywords = [];

        if (patternData.highCompletionRate) keywords.push('completion', 'finished', 'done');
        if (patternData.prefersBrief) keywords.push('brief', 'short', 'quick');
        if (patternData.prefersDetailed) keywords.push('detailed', 'explain', 'comprehensive');
        if (patternData.frequentUrgentTasks) keywords.push('urgent', 'asap', 'deadline');
        if (patternData.frequentEscalations) keywords.push('help', 'stuck', 'problem');

        return [...new Set(keywords)]; // Remove duplicates
    }

    /**
     * Check if cache is expired
     * @param {number} timestamp - Cache timestamp
     * @returns {boolean} - True if expired
     */
    _isCacheExpired(timestamp) {
        return Date.now() - timestamp > this.cacheTimeout;
    }
}

module.exports = { GlobalPreferenceLearner };
