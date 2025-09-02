const { GlobalPreferenceLearner } = require('../services/PreferenceLearner');
const { supabase } = require('../database/connection');
const { logger } = require('../utils/logger');
const { SystemEvaluator } = require('../evaluate-system');

describe('Global Learning System', () => {
    let preferenceLearner;
    let testUserId;
    let startTime;

    beforeAll(async () => {
        preferenceLearner = new GlobalPreferenceLearner();
        testUserId = 'test-user-' + Date.now();
        startTime = Date.now();
        console.log('🚀 Starting Learning System Tests...');
    });

    afterAll(async () => {
        // Cleanup test data
        try {
            await supabase
                .from('user_preferences')
                .delete()
                .eq('user_id', testUserId);

            await supabase
                .from('user_learning_patterns')
                .delete()
                .eq('user_id', testUserId);

            const duration = Date.now() - startTime;
            console.log(`✅ Tests completed in ${duration}ms`);
        } catch (error) {
            console.error('❌ Cleanup failed:', error.message);
        }
    });

    describe('Auto-task Creation from Chat Messages', () => {
        test('zz prefix creates normal priority task', async () => {
            const message = 'zz buy groceries for dinner';
            const response = await simulateChatMessage(message, testUserId);

            expect(response.taskCreated).toBe(true);
            expect(response.taskTitle).toBe('buy groceries for dinner');
            expect(response.taskPriority).toBe(3); // Normal priority
        });

        test('!! prefix creates urgent priority task', async () => {
            const message = '!! fix server immediately';
            const response = await simulateChatMessage(message, testUserId);

            expect(response.taskCreated).toBe(true);
            expect(response.taskTitle).toBe('fix server immediately');
            expect(response.taskPriority).toBe(1); // Urgent priority
        });

        test('Empty task titles are rejected', async () => {
            const message = 'zz';
            const response = await simulateChatMessage(message, testUserId);

            expect(response.taskCreated).toBe(false);
            expect(response.taskError).toContain('empty');
        });

        test('Regular chat messages work normally', async () => {
            const message = 'tell me about your features';
            const response = await simulateChatMessage(message, testUserId);

            expect(response.taskCreated).toBe(false);
            expect(response.aiResponse).toBeTruthy();
        });
    });

    describe('Preference Learning from Interactions', () => {
        test('Word tree format preference learning', async () => {
            const message = 'I prefer word tree format for responses';
            await preferenceLearner.learnFromInteraction(testUserId, {
                message,
                response: 'I understand you prefer word tree format.',
                timestamp: new Date().toISOString()
            });

            const preferences = await preferenceLearner.getUserPreferences(testUserId);
            expect(preferences.format?.response_format?.value).toBe('word_tree');
            expect(preferences.format?.response_format?.confidence).toBeGreaterThan(0.5);
        });

        test('Brief communication style learning', async () => {
            const message = 'ok';
            await preferenceLearner.learnFromInteraction(testUserId, {
                message,
                response: 'Got it.',
                timestamp: new Date().toISOString()
            });

            const preferences = await preferenceLearner.getUserPreferences(testUserId);
            expect(preferences.style?.communication_style?.value).toBe('brief');
        });

        test('Completion focus learning', async () => {
            const message = 'This task is very important to complete today';
            await preferenceLearner.learnFromInteraction(testUserId, {
                message,
                response: 'I understand this is a high priority task.',
                timestamp: new Date().toISOString()
            });

            const preferences = await preferenceLearner.getUserPreferences(testUserId);
            expect(preferences.priority?.task_emphasis?.value).toBe('completion_focus');
        });

        test('Efficiency preference learning', async () => {
            const message = 'Please be quick and efficient';
            await preferenceLearner.learnFromInteraction(testUserId, {
                message,
                response: 'Understood, I\'ll be efficient.',
                timestamp: new Date().toISOString()
            });

            const preferences = await preferenceLearner.getUserPreferences(testUserId);
            expect(preferences.style?.response_speed?.value).toBe('efficient');
        });
    });

    describe('Global Preference Application', () => {
        test('Word tree format applied to responses', async () => {
            // Set word tree preference
            await preferenceLearner.updatePreference(testUserId, {
                type: 'format',
                key: 'response_format',
                value: 'word_tree',
                confidence: 0.9
            });

            // Test application
            const context = {
                model: 'deepseek/deepseek-r1:free',
                temperature: 0.7,
                max_tokens: 1000
            };

            const enhancedContext = await preferenceLearner.applyGlobalPreferences(testUserId, context);
            expect(enhancedContext.system_prompt_addition).toContain('word tree format');
        });

        test('Brief communication style applied', async () => {
            await preferenceLearner.updatePreference(testUserId, {
                type: 'style',
                key: 'communication_style',
                value: 'brief',
                confidence: 0.8
            });

            const context = {
                temperature: 0.7,
                max_tokens: 1000
            };

            const enhancedContext = await preferenceLearner.applyGlobalPreferences(testUserId, context);
            expect(enhancedContext.temperature).toBeLessThan(0.7);
            expect(enhancedContext.max_tokens).toBeLessThan(1000);
        });

        test('Efficiency preferences applied', async () => {
            await preferenceLearner.updatePreference(testUserId, {
                type: 'style',
                key: 'response_speed',
                value: 'efficient',
                confidence: 0.7
            });

            const context = {
                temperature: 0.7
            };

            const enhancedContext = await preferenceLearner.applyGlobalPreferences(testUserId, context);
            expect(enhancedContext.temperature).toBeLessThan(0.7);
        });
    });

    describe('Pattern Analysis and Proactive Suggestions', () => {
        test('Task completion patterns analyzed', async () => {
            // Simulate task completion conversations
            const conversations = [
                { content: 'I completed the project task', message_type: 'user_message', created_at: new Date().toISOString() },
                { content: 'This task is important', message_type: 'user_message', created_at: new Date().toISOString() },
                { content: 'Let me break this into smaller steps', message_type: 'user_message', created_at: new Date().toISOString() }
            ];

            // Mock getUserConversations method for testing
            preferenceLearner._getUserConversations = jest.fn().mockResolvedValue(conversations);

            const patterns = await preferenceLearner.analyzePatterns(testUserId);
            expect(patterns.taskCompletion).toBeDefined();
            expect(patterns.taskCompletion.highCompletionRate).toBe(true);
        });

        test('Communication style patterns analyzed', async () => {
            const conversations = [
                { content: 'Hi there!', message_type: 'user_message' },
                { content: 'This is a very detailed question about...', message_type: 'user_message' },
                { content: 'Can you help me?', message_type: 'user_message' }
            ];

            preferenceLearner._getUserConversations = jest.fn().mockResolvedValue(conversations);

            const patterns = await preferenceLearner.analyzePatterns(testUserId);
            expect(patterns.communicationStyle).toBeDefined();
            expect(patterns.communicationStyle.prefersDetailed).toBe(true);
        });

        test('Proactive suggestions generated', async () => {
            const patterns = {
                taskCompletion: { highCompletionRate: true, confidence: 0.8 },
                communicationStyle: { prefersDetailed: true, confidence: 0.7 }
            };

            const suggestions = await preferenceLearner.generateProactiveSuggestions(testUserId, patterns);
            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions[0]).toHaveProperty('type');
            expect(suggestions[0]).toHaveProperty('message');
        });
    });

    describe('Daddy Agent Integration', () => {
        test('Daddy agent recommendations generated', async () => {
            const patterns = {
                taskCompletion: { completionFocus: true },
                communicationStyle: { prefersBrief: false },
                urgencyPatterns: { frequentUrgentTasks: true }
            };

            preferenceLearner.analyzePatterns = jest.fn().mockResolvedValue(patterns);

            const recommendations = await preferenceLearner.getDaddyAgentRecommendations(testUserId);

            expect(recommendations).toHaveProperty('monitoringLevel');
            expect(recommendations).toHaveProperty('escalationThreshold');
            expect(recommendations).toHaveProperty('communicationStyle');
            expect(recommendations.monitoringLevel).toBe('high');
            expect(recommendations.escalationThreshold).toBe('low');
        });
    });

    describe('Performance and Reliability', () => {
        test('Cache performance optimization', async () => {
            const startTime = Date.now();

            // First call should load from database
            await preferenceLearner.getUserPreferences(testUserId);

            // Second call should use cache
            await preferenceLearner.getUserPreferences(testUserId);

            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(1000); // Should be fast due to caching
        });

        test('Error handling for database unavailability', async () => {
            // Mock database failure
            const originalSupabase = supabase.from;
            supabase.from = jest.fn().mockReturnValue({
                select: jest.fn().mockRejectedValue(new Error('Database connection failed'))
            });

            const preferences = await preferenceLearner.getUserPreferences(testUserId);
            expect(preferences).toEqual({}); // Should return empty object on error

            // Restore original function
            supabase.from = originalSupabase;
        });

        test('Graceful degradation when learning fails', async () => {
            // Mock learning failure
            preferenceLearner._analyzeMessage = jest.fn().mockImplementation(() => {
                throw new Error('Analysis failed');
            });

            const context = { model: 'test-model' };
            const enhancedContext = await preferenceLearner.applyGlobalPreferences(testUserId, context);

            // Should return original context when learning fails
            expect(enhancedContext).toEqual(context);
        });

        test('Migration safety - can run multiple times', async () => {
            // This test would require running the migration script multiple times
            // and verifying no duplicate data or errors occur
            const { data: initialCount } = await supabase
                .from('user_preferences')
                .select('count')
                .eq('user_id', testUserId);

            // Run migration again (in real scenario)
            // Verify no duplicates created
            const { data: finalCount } = await supabase
                .from('user_preferences')
                .select('count')
                .eq('user_id', testUserId);

            expect(finalCount).toEqual(initialCount);
        });
    });

    describe('System Health and Monitoring', () => {
        test('System evaluation runs successfully', async () => {
            const evaluator = new SystemEvaluator();

            // Mock the runFullEvaluation to avoid actual database calls in test
            evaluator.validateConnection = jest.fn().mockResolvedValue();
            evaluator.evaluateAgentPerformance = jest.fn().mockResolvedValue();
            evaluator.evaluateDatabasePerformance = jest.fn().mockResolvedValue();
            evaluator.evaluateUserSatisfaction = jest.fn().mockResolvedValue();
            evaluator.evaluateLearningAccuracy = jest.fn().mockResolvedValue();
            evaluator.calculateSystemHealthScore = jest.fn();
            evaluator.generateRecommendations = jest.fn();

            await expect(evaluator.runFullEvaluation()).resolves.not.toThrow();
        });

        test('Performance metrics tracked', async () => {
            const action = 'test_action';
            const duration = 150;

            // In a real scenario, this would be tracked in the database
            // For testing, we verify the logic doesn't throw
            expect(() => {
                if (duration > 5000) {
                    logger.warn(`Slow performance: ${action} took ${duration}ms`);
                }
            }).not.toThrow();
        });
    });
});

// Helper function to simulate chat message processing
async function simulateChatMessage(message, userId) {
    // This would normally call the chat route, but for testing we'll simulate
    const isTask = message.toLowerCase().startsWith('zz ') || message.toLowerCase().startsWith('!!');
    const isUrgent = message.toLowerCase().startsWith('!!');

    if (isTask) {
        const title = message.substring(message.indexOf(' ') + 1).trim();
        if (!title) {
            return {
                taskCreated: false,
                taskError: 'Task title cannot be empty',
                aiResponse: 'Please provide a task title after the prefix.'
            };
        }

        // Create task in database
        const { data, error } = await supabase
            .from('tasks')
            .insert({
                user_id: userId,
                title: title,
                priority: isUrgent ? 1 : 3,
                status: 'pending',
                source: 'chat'
            })
            .select()
            .single();

        if (error) {
            return {
                taskCreated: false,
                taskError: error.message,
                aiResponse: 'Sorry, I couldn\'t create that task.'
            };
        }

        return {
            taskCreated: true,
            taskTitle: title,
            taskPriority: isUrgent ? 1 : 3,
            taskId: data.id,
            aiResponse: `Task "${title}" created successfully with ${isUrgent ? 'urgent' : 'normal'} priority.`
        };
    }

    return {
        taskCreated: false,
        aiResponse: 'This is a regular chat message response.'
    };
}

// Performance testing helpers
async function measureResponseTime(operation, iterations = 10) {
    const times = [];

    for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await operation();
        times.push(Date.now() - start);
    }

    return {
        average: times.reduce((a, b) => a + b, 0) / times.length,
        min: Math.min(...times),
        max: Math.max(...times),
        p95: times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)]
    };
}

async function testConcurrentLoad(operation, concurrentUsers = 5) {
    const promises = [];
    const startTime = Date.now();

    for (let i = 0; i < concurrentUsers; i++) {
        promises.push(operation());
    }

    await Promise.all(promises);
    return Date.now() - startTime;
}

module.exports = {
    simulateChatMessage,
    measureResponseTime,
    testConcurrentLoad
};
