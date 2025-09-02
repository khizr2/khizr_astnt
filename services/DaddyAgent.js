const { supabase } = require('../database/connection');
const { logger } = require('../utils/logger');

class DaddyAgent {
    constructor(config = {}) {
        this.userId = config.userId;
        this.preferences = config.preferences || {};
        this.patterns = config.patterns || {};
        this.monitoringLevel = config.monitoringLevel || 'medium';
        this.escalationThreshold = config.escalationThreshold || 'medium';
        this.proactiveSuggestions = config.proactiveSuggestions !== false;
        this.personalizedReminders = config.personalizedReminders !== false;
        this.taskBreakdown = config.taskBreakdown || false;
        this.communicationStyle = config.communicationStyle || 'balanced';

        // Internal state
        this.activeTasks = new Map();
        this.escalationQueue = [];
        this.suggestionHistory = [];
        this.monitoringIntervals = new Map();

        // Performance metrics
        this.metrics = {
            tasksMonitored: 0,
            escalationsTriggered: 0,
            suggestionsProvided: 0,
            userFeedbackReceived: 0,
            effectivenessScore: 0.8
        };
    }

    /**
     * Initialize daddy agent with user preferences and patterns
     */
    async initialize() {
        try {
            // Load user preferences if not provided
            if (!this.preferences || Object.keys(this.preferences).length === 0) {
                const { GlobalPreferenceLearner } = require('./PreferenceLearner');
                const preferenceLearner = new GlobalPreferenceLearner();
                this.preferences = await preferenceLearner.getUserPreferences(this.userId);
                this.patterns = await preferenceLearner.analyzePatterns(this.userId);

                // Get daddy agent recommendations
                const recommendations = await preferenceLearner.getDaddyAgentRecommendations(this.userId);
                this.applyRecommendations(recommendations);
            }

            logger.info(`DaddyAgent initialized for user ${this.userId}`);
            return true;
        } catch (error) {
            logger.error('Error initializing DaddyAgent:', error);
            return false;
        }
    }

    /**
     * Apply pattern-based recommendations to agent behavior
     */
    applyRecommendations(recommendations) {
        this.monitoringLevel = recommendations.monitoringLevel;
        this.escalationThreshold = recommendations.escalationThreshold;
        this.proactiveSuggestions = recommendations.proactiveSuggestions;
        this.personalizedReminders = recommendations.personalizedReminders;
        this.taskBreakdown = recommendations.taskBreakdown;
        this.communicationStyle = recommendations.communicationStyle;
    }

    /**
     * Start monitoring a task with enhanced oversight
     */
    async startTaskMonitoring(taskId, taskData) {
        try {
            // Store task in active monitoring
            this.activeTasks.set(taskId, {
                ...taskData,
                monitoringStart: new Date(),
                lastCheck: new Date(),
                escalationLevel: 0,
                remindersSent: 0,
                status: 'active'
            });

            // Set up monitoring based on task priority and user patterns
            const monitoringInterval = this._calculateMonitoringInterval(taskData);
            const intervalId = setInterval(() => {
                this._checkTaskProgress(taskId);
            }, monitoringInterval);

            this.monitoringIntervals.set(taskId, intervalId);
            this.metrics.tasksMonitored++;

            // Generate initial proactive suggestions if enabled
            if (this.proactiveSuggestions) {
                await this._generateTaskSuggestions(taskId, taskData);
            }

            logger.info(`Started monitoring task ${taskId} for user ${this.userId}`);
        } catch (error) {
            logger.error('Error starting task monitoring:', error);
        }
    }

    /**
     * Stop monitoring a task
     */
    stopTaskMonitoring(taskId) {
        const intervalId = this.monitoringIntervals.get(taskId);
        if (intervalId) {
            clearInterval(intervalId);
            this.monitoringIntervals.delete(taskId);
        }
        this.activeTasks.delete(taskId);
        logger.info(`Stopped monitoring task ${taskId}`);
    }

    /**
     * Check task progress and trigger interventions if needed
     */
    async _checkTaskProgress(taskId) {
        try {
            const task = this.activeTasks.get(taskId);
            if (!task) return;

            task.lastCheck = new Date();

            // Get current task status from database
            const { data: currentTask } = await supabase
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .single();

            if (!currentTask) {
                this.stopTaskMonitoring(taskId);
                return;
            }

            // Check for escalation conditions
            const escalationNeeded = this._evaluateEscalationConditions(task, currentTask);

            if (escalationNeeded.needed) {
                await this._triggerEscalation(taskId, task, escalationNeeded.reason);
            }

            // Send personalized reminders if enabled
            if (this.personalizedReminders && this._shouldSendReminder(task, currentTask)) {
                await this._sendPersonalizedReminder(taskId, task, currentTask);
            }

            // Generate follow-up suggestions
            if (this.proactiveSuggestions) {
                await this._generateFollowUpSuggestions(taskId, task, currentTask);
            }

        } catch (error) {
            logger.error('Error checking task progress:', error);
        }
    }

    /**
     * Evaluate if escalation is needed based on patterns and preferences
     */
    _evaluateEscalationConditions(task, currentTask) {
        const now = new Date();
        const taskAge = now - new Date(task.monitoringStart);
        const hoursSinceStart = taskAge / (1000 * 60 * 60);

        // Base escalation thresholds
        const thresholds = {
            low: { hours: 48, noProgressHours: 24 },
            medium: { hours: 24, noProgressHours: 12 },
            high: { hours: 12, noProgressHours: 6 }
        };

        const threshold = thresholds[this.escalationThreshold] || thresholds.medium;

        // Check time-based escalation
        if (hoursSinceStart > threshold.hours) {
            return {
                needed: true,
                reason: `Task overdue (${hoursSinceStart.toFixed(1)} hours without completion)`,
                priority: this._calculateEscalationPriority(task, currentTask)
            };
        }

        // Check progress-based escalation
        const lastUpdate = new Date(currentTask.updated_at);
        const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

        if (hoursSinceUpdate > threshold.noProgressHours && currentTask.status !== 'completed') {
            return {
                needed: true,
                reason: `No progress for ${hoursSinceUpdate.toFixed(1)} hours`,
                priority: this._calculateEscalationPriority(task, currentTask)
            };
        }

        // Check pattern-based escalation
        if (this.patterns.urgencyPatterns?.frequentUrgentTasks && task.priority <= 2) {
            if (hoursSinceStart > 6) { // Urgent tasks need faster attention
                return {
                    needed: true,
                    reason: 'Urgent task pattern detected - requires immediate attention',
                    priority: 1
                };
            }
        }

        return { needed: false };
    }

    /**
     * Trigger escalation with personalized messaging
     */
    async _triggerEscalation(taskId, task, reason) {
        try {
            this.metrics.escalationsTriggered++;

            // Create escalation notification
            const escalationMessage = this._generateEscalationMessage(task, reason);

            const notificationData = {
                user_id: this.userId,
                type: 'task_escalation',
                title: `Task Escalation: ${task.title}`,
                message: escalationMessage,
                priority: task.priority,
                action_required: true,
                data: JSON.stringify({
                    task_id: taskId,
                    escalation_reason: reason,
                    escalation_time: new Date().toISOString(),
                    monitoring_level: this.monitoringLevel
                })
            };

            const { data: notification } = await supabase
                .from('notifications')
                .insert([notificationData])
                .select()
                .single();

            // Log escalation
            await supabase
                .from('agent_logs')
                .insert([{
                    agent_id: 'daddy_agent',
                    user_id: this.userId,
                    action: 'task_escalation_triggered',
                    resource_type: 'task',
                    resource_id: taskId,
                    details: {
                        reason,
                        monitoring_level: this.monitoringLevel,
                        escalation_threshold: this.escalationThreshold,
                        task_priority: task.priority
                    },
                    severity: 'warning'
                }]);

            // Update task escalation level
            task.escalationLevel = (task.escalationLevel || 0) + 1;

            logger.info(`Escalation triggered for task ${taskId}: ${reason}`);

        } catch (error) {
            logger.error('Error triggering escalation:', error);
        }
    }

    /**
     * Generate personalized escalation message
     */
    _generateEscalationMessage(task, reason) {
        let message = `I've noticed your task "${task.title}" needs attention: ${reason}. `;

        // Personalize based on communication style
        if (this.communicationStyle === 'brief') {
            message += 'Please review and update status.';
        } else if (this.communicationStyle === 'detailed') {
            message += 'Based on your task completion patterns, I recommend breaking this down into smaller steps or seeking assistance if needed. Let me know how I can help you move forward.';
        } else {
            message += 'Would you like me to help you break this down or provide suggestions to get it completed?';
        }

        return message;
    }

    /**
     * Send personalized reminder based on user patterns
     */
    async _sendPersonalizedReminder(taskId, task, currentTask) {
        try {
            if (task.remindersSent >= 3) return; // Limit reminders

            // Check if it's a good time based on patterns
            const currentHour = new Date().getHours();
            const preferredHours = this.patterns.preferredTimes?.peakHours || [];

            if (preferredHours.length > 0 && !preferredHours.includes(currentHour)) {
                // Not in preferred time, delay reminder
                return;
            }

            const reminderMessage = this._generateReminderMessage(task, currentTask);

            const notificationData = {
                user_id: this.userId,
                type: 'task_reminder',
                title: `Reminder: ${task.title}`,
                message: reminderMessage,
                priority: task.priority,
                action_required: false,
                data: JSON.stringify({
                    task_id: taskId,
                    reminder_type: 'personalized',
                    reminder_count: task.remindersSent + 1
                })
            };

            await supabase
                .from('notifications')
                .insert([notificationData]);

            task.remindersSent++;

            logger.info(`Sent personalized reminder for task ${taskId}`);

        } catch (error) {
            logger.error('Error sending personalized reminder:', error);
        }
    }

    /**
     * Generate personalized reminder message
     */
    _generateReminderMessage(task, currentTask) {
        let message = `Just a friendly reminder about your task "${task.title}". `;

        // Personalize based on patterns and preferences
        if (this.patterns.taskCompletion?.highCompletionRate) {
            message += 'You usually complete tasks efficiently - this should be no different!';
        } else if (this.patterns.taskCompletion?.prefersSmallTasks) {
            message += 'Consider breaking this down into smaller, manageable steps.';
        }

        if (this.communicationStyle === 'brief') {
            message += ' Please update when you can.';
        } else {
            message += ' Let me know if you need any assistance or would like me to help organize your approach.';
        }

        return message;
    }

    /**
     * Generate proactive suggestions for task completion
     */
    async _generateTaskSuggestions(taskId, taskData) {
        try {
            const suggestions = [];

            // Task breakdown suggestions
            if (this.taskBreakdown && taskData.description && taskData.description.length > 200) {
                suggestions.push({
                    type: 'task_breakdown',
                    message: 'This task seems complex. Would you like me to help break it down into smaller steps?',
                    confidence: 0.8
                });
            }

            // Time-based suggestions
            if (this.patterns.preferredTimes?.peakHours) {
                const currentHour = new Date().getHours();
                const bestHour = this.patterns.preferredTimes.peakHours[0];

                if (Math.abs(currentHour - bestHour) > 2) {
                    suggestions.push({
                        type: 'timing_suggestion',
                        message: `Based on your patterns, you're most productive around ${bestHour}:00. Consider scheduling focused work then.`,
                        confidence: 0.7
                    });
                }
            }

            // Urgency pattern suggestions
            if (this.patterns.urgencyPatterns?.frequentUrgentTasks && taskData.priority >= 4) {
                suggestions.push({
                    type: 'priority_assessment',
                    message: 'This task seems important. Would you like me to help prioritize your current workload?',
                    confidence: 0.6
                });
            }

            // Store and send suggestions
            for (const suggestion of suggestions) {
                await this._storeSuggestion(taskId, suggestion);
                this.metrics.suggestionsProvided++;
            }

            // Send notification if we have suggestions
            if (suggestions.length > 0) {
                await this._sendSuggestionNotification(taskId, suggestions);
            }

        } catch (error) {
            logger.error('Error generating task suggestions:', error);
        }
    }

    /**
     * Generate follow-up suggestions during task monitoring
     */
    async _generateFollowUpSuggestions(taskId, task, currentTask) {
        const suggestions = [];

        // Progress check suggestions
        const hoursSinceStart = (new Date() - new Date(task.monitoringStart)) / (1000 * 60 * 60);
        if (hoursSinceStart > 4 && currentTask.status === 'pending') {
            suggestions.push({
                type: 'progress_check',
                message: 'How is progress on this task going? Would you like me to help with any blockers?',
                confidence: 0.7
            });
        }

        // Completion prediction suggestions
        if (this.patterns.taskCompletion?.highCompletionRate && hoursSinceStart > 2) {
            suggestions.push({
                type: 'completion_prediction',
                message: 'Based on your completion patterns, this task should be wrapping up soon. Need any final assistance?',
                confidence: 0.6
            });
        }

        // Send suggestions if any
        if (suggestions.length > 0) {
            await this._sendSuggestionNotification(taskId, suggestions);
        }
    }

    /**
     * Store suggestion for tracking
     */
    async _storeSuggestion(taskId, suggestion) {
        try {
            this.suggestionHistory.push({
                taskId,
                suggestion,
                timestamp: new Date(),
                delivered: false
            });
        } catch (error) {
            logger.error('Error storing suggestion:', error);
        }
    }

    /**
     * Send suggestion notification
     */
    async _sendSuggestionNotification(taskId, suggestions) {
        try {
            const notificationData = {
                user_id: this.userId,
                type: 'task_suggestions',
                title: 'Task Assistance Available',
                message: `I have ${suggestions.length} suggestion(s) to help you with your current task(s).`,
                priority: 4,
                action_required: false,
                data: JSON.stringify({
                    task_id: taskId,
                    suggestions: suggestions,
                    suggestion_count: suggestions.length
                })
            };

            await supabase
                .from('notifications')
                .insert([notificationData]);

        } catch (error) {
            logger.error('Error sending suggestion notification:', error);
        }
    }

    /**
     * Calculate monitoring interval based on task priority and patterns
     */
    _calculateMonitoringInterval(taskData) {
        const baseIntervals = {
            low: 2 * 60 * 60 * 1000,    // 2 hours
            medium: 1 * 60 * 60 * 1000, // 1 hour
            high: 30 * 60 * 1000        // 30 minutes
        };

        let interval = baseIntervals[this.monitoringLevel] || baseIntervals.medium;

        // Adjust based on task priority
        if (taskData.priority <= 2) {
            interval = Math.max(interval * 0.5, 15 * 60 * 1000); // More frequent for high priority
        }

        // Adjust based on urgency patterns
        if (this.patterns.urgencyPatterns?.frequentUrgentTasks) {
            interval = Math.max(interval * 0.7, 20 * 60 * 1000);
        }

        return interval;
    }

    /**
     * Calculate escalation priority
     */
    _calculateEscalationPriority(task, currentTask) {
        let priority = task.priority;

        // Increase priority based on patterns
        if (this.patterns.urgencyPatterns?.frequentUrgentTasks) {
            priority = Math.max(1, priority - 1);
        }

        if (this.patterns.escalationTriggers?.frequentEscalations) {
            priority = Math.max(1, priority - 1);
        }

        return priority;
    }

    /**
     * Determine if reminder should be sent
     */
    _shouldSendReminder(task, currentTask) {
        const hoursSinceLastReminder = task.lastReminder ?
            (new Date() - new Date(task.lastReminder)) / (1000 * 60 * 60) : 24;

        // Send reminder if:
        // 1. Task is still pending
        // 2. No reminder sent in last 6 hours
        // 3. Task is overdue or high priority
        return currentTask.status === 'pending' &&
               hoursSinceLastReminder >= 6 &&
               (task.priority <= 3 || this._isTaskOverdue(task));
    }

    /**
     * Check if task is overdue
     */
    _isTaskOverdue(task) {
        if (!task.deadline) return false;
        return new Date() > new Date(task.deadline);
    }

    /**
     * Get daddy agent metrics for reporting
     */
    getMetrics() {
        return {
            ...this.metrics,
            activeTasksCount: this.activeTasks.size,
            escalationQueueLength: this.escalationQueue.length,
            suggestionHistoryLength: this.suggestionHistory.length
        };
    }

    /**
     * Process user feedback on suggestions
     */
    async processFeedback(suggestionId, feedback) {
        try {
            // Update suggestion effectiveness
            const suggestion = this.suggestionHistory.find(s => s.id === suggestionId);
            if (suggestion) {
                suggestion.feedback = feedback;
                this.metrics.userFeedbackReceived++;

                // Adjust future suggestions based on feedback
                if (feedback.helpful) {
                    this.metrics.effectivenessScore = Math.min(1.0, this.metrics.effectivenessScore + 0.05);
                } else {
                    this.metrics.effectivenessScore = Math.max(0.1, this.metrics.effectivenessScore - 0.05);
                }
            }

            logger.info(`Processed feedback for suggestion ${suggestionId}: ${feedback.helpful ? 'helpful' : 'not helpful'}`);

        } catch (error) {
            logger.error('Error processing feedback:', error);
        }
    }

    /**
     * Clean up resources when shutting down
     */
    shutdown() {
        // Clear all monitoring intervals
        for (const [taskId, intervalId] of this.monitoringIntervals) {
            clearInterval(intervalId);
            logger.info(`Cleared monitoring interval for task ${taskId}`);
        }

        this.monitoringIntervals.clear();
        this.activeTasks.clear();
        this.escalationQueue = [];

        logger.info(`DaddyAgent shutdown completed for user ${this.userId}`);
    }
}

module.exports = { DaddyAgent };
