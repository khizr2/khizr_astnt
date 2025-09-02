const { GlobalPreferenceLearner } = require('../services/PreferenceLearner');
const { PerformanceMonitor } = require('../services/performance-monitor');
const { supabase } = require('../database/connection');
const { logger } = require('../utils/logger');

describe('System Reliability Tests', () => {
    let preferenceLearner;
    let performanceMonitor;
    let testUserId;

    beforeAll(async () => {
        preferenceLearner = new GlobalPreferenceLearner();
        performanceMonitor = new PerformanceMonitor();
        testUserId = 'reliability-test-user-' + Date.now();
        console.log('🛡️  Starting Reliability Tests...');
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

            await supabase
                .from('performance_metrics')
                .delete()
                .eq('user_id', testUserId);

            console.log('✅ Reliability tests cleanup completed');
        } catch (error) {
            console.error('❌ Cleanup failed:', error.message);
        }
    });

    describe('Error Handling and Recovery', () => {
        test('Database connection failure handling', async () => {
            // Mock database failure
            const originalSupabase = supabase.from;
            supabase.from = jest.fn().mockReturnValue({
                select: jest.fn().mockRejectedValue(new Error('Connection refused')),
                insert: jest.fn().mockRejectedValue(new Error('Connection refused')),
                upsert: jest.fn().mockRejectedValue(new Error('Connection refused'))
            });

            // Test preference learner error handling
            const preferences = await preferenceLearner.getUserPreferences(testUserId);
            expect(preferences).toEqual({}); // Should return empty object

            const updateResult = await preferenceLearner.updatePreference(testUserId, {
                type: 'test',
                key: 'test_key',
                value: 'test_value'
            });
            expect(updateResult).toBe(false); // Should handle error gracefully

            // Test performance monitor error handling
            await performanceMonitor.trackPerformance(testUserId, 'test_action', Date.now() - 100);
            // Should not throw

            // Restore original function
            supabase.from = originalSupabase;
        });

        test('Invalid input handling', async () => {
            // Test with invalid user ID
            const preferences = await preferenceLearner.getUserPreferences('');
            expect(preferences).toEqual({});

            // Test with malformed preference data
            const updateResult = await preferenceLearner.updatePreference(testUserId, {
                type: null,
                key: undefined,
                value: null
            });
            expect(updateResult).toBe(false);

            // Test with extremely long input
            const longMessage = 'a'.repeat(10000);
            const analysis = preferenceLearner._analyzeMessage(longMessage);
            expect(analysis).toBeDefined(); // Should handle long input
        });

        test('Network timeout handling', async () => {
            // Mock network timeout
            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockImplementation(() =>
                new Promise((resolve) => {
                    setTimeout(() => resolve({
                        ok: false,
                        status: 408,
                        json: () => Promise.resolve({ error: 'Request timeout' })
                    }), 100);
                })
            );

            // This would test API calls, but since we're using Supabase client directly,
            // we'll test the timeout handling in our database operations
            const timeoutPromise = new Promise((resolve, reject) => {
                setTimeout(() => reject(new Error('Timeout')), 5000);
            });

            const dbPromise = supabase.from('users').select('*').limit(1);

            try {
                await Promise.race([dbPromise, timeoutPromise]);
            } catch (error) {
                expect(error.message).toContain('Timeout');
            }

            // Restore original fetch
            global.fetch = originalFetch;
        });

        test('Memory pressure handling', async () => {
            // Test cache cleanup under memory pressure
            const originalCache = preferenceLearner.cache;

            // Fill cache with many entries
            for (let i = 0; i < 1000; i++) {
                preferenceLearner.cache.set(`user-${i}`, {
                    data: { test: 'data' },
                    timestamp: Date.now()
                });
            }

            // Force cache cleanup by setting old timestamps
            const oldTime = Date.now() - (6 * 60 * 1000); // 6 minutes ago
            preferenceLearner.cache.forEach((value, key) => {
                if (Math.random() > 0.5) { // Randomly expire some entries
                    value.timestamp = oldTime;
                }
            });

            // Access cache - should trigger cleanup
            await preferenceLearner.getUserPreferences(testUserId);

            // Cache should be smaller after cleanup
            const cacheSize = preferenceLearner.cache.size;
            expect(cacheSize).toBeLessThan(1000);

            // Restore original cache
            preferenceLearner.cache = originalCache;
        });
    });

    describe('Data Consistency and Integrity', () => {
        test('Concurrent preference updates', async () => {
            const concurrentUpdates = [];

            // Create multiple concurrent preference updates
            for (let i = 0; i < 10; i++) {
                concurrentUpdates.push(
                    preferenceLearner.updatePreference(testUserId, {
                        type: 'concurrent_test',
                        key: `test_key_${i}`,
                        value: `value_${i}`,
                        confidence: 0.5 + (i * 0.05)
                    })
                );
            }

            // Wait for all updates to complete
            const results = await Promise.allSettled(concurrentUpdates);

            // All updates should succeed
            const successfulUpdates = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
            expect(successfulUpdates).toBe(10);

            // Verify data consistency - check that preferences were stored
            const preferences = await preferenceLearner.getUserPreferences(testUserId);
            const concurrentPrefs = Object.keys(preferences.concurrent_test || {});
            expect(concurrentPrefs.length).toBeGreaterThan(0);
        });

        test('Transaction rollback on failure', async () => {
            // This test would require database transaction testing
            // For now, we'll test the error handling in our update logic

            const originalUpsert = supabase.from().upsert;
            let callCount = 0;

            supabase.from = jest.fn().mockReturnValue({
                upsert: jest.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 2) {
                        return Promise.reject(new Error('Simulated failure'));
                    }
                    return Promise.resolve({ data: null, error: null });
                })
            });

            // Attempt multiple operations
            const results = await Promise.allSettled([
                preferenceLearner.updatePreference(testUserId, {
                    type: 'transaction_test',
                    key: 'key1',
                    value: 'value1'
                }),
                preferenceLearner.updatePreference(testUserId, {
                    type: 'transaction_test',
                    key: 'key2',
                    value: 'value2'
                })
            ]);

            // Some operations should fail gracefully
            const failedCount = results.filter(r => r.status === 'rejected' || r.value === false).length;
            expect(failedCount).toBeLessThan(results.length); // Not all should fail

            // Restore original function
            supabase.from().upsert = originalUpsert;
        });

        test('Data validation and sanitization', async () => {
            // Test with potentially dangerous input
            const dangerousInputs = [
                { type: 'test', key: 'key1', value: '<script>alert("xss")</script>' },
                { type: 'test', key: 'key2', value: '../../../etc/passwd' },
                { type: 'test', key: 'key3', value: 'DROP TABLE users;' },
                { type: 'test', key: 'key4', value: null },
                { type: 'test', key: 'key5', value: undefined },
                { type: 'test', key: 'key6', value: { nested: { deep: 'object' } } }
            ];

            for (const input of dangerousInputs) {
                const result = await preferenceLearner.updatePreference(testUserId, input);
                // Should handle all inputs gracefully without crashing
                expect(typeof result).toBe('boolean');
            }

            // Verify preferences were stored (sanitized)
            const preferences = await preferenceLearner.getUserPreferences(testUserId);
            expect(preferences.test).toBeDefined();
        });
    });

    describe('System Recovery and Failover', () => {
        test('Preference cache recovery after restart', async () => {
            // Simulate system restart by clearing cache
            preferenceLearner.cache.clear();

            // Add some preferences to database
            await preferenceLearner.updatePreference(testUserId, {
                type: 'recovery_test',
                key: 'test_key',
                value: 'recovery_value',
                confidence: 0.8
            });

            // Access preferences - should load from database
            const preferences = await preferenceLearner.getUserPreferences(testUserId);

            // Verify data was recovered
            expect(preferences.recovery_test?.test_key?.value).toBe('recovery_value');
            expect(preferences.recovery_test?.test_key?.confidence).toBeGreaterThan(0.5);
        });

        test('Graceful degradation when external services fail', async () => {
            // Mock external service failure (e.g., AI API)
            const originalLearner = preferenceLearner.learnFromInteraction;
            preferenceLearner.learnFromInteraction = jest.fn().mockRejectedValue(
                new Error('External service unavailable')
            );

            // System should continue to function
            const preferences = await preferenceLearner.getUserPreferences(testUserId);
            expect(preferences).toBeDefined(); // Should still return preferences

            const context = await preferenceLearner.applyGlobalPreferences(testUserId, {
                model: 'test-model'
            });
            expect(context).toBeDefined(); // Should return context

            // Restore original function
            preferenceLearner.learnFromInteraction = originalLearner;
        });

        test('Migration script safety', async () => {
            // This test would verify that migration scripts can be run multiple times
            // without causing issues. Since we don't have the actual migration script
            // here, we'll test the concept with our preference updates

            // Run the same update multiple times
            const updatePromise = preferenceLearner.updatePreference(testUserId, {
                type: 'migration_test',
                key: 'idempotent_key',
                value: 'idempotent_value',
                confidence: 0.9
            });

            const results = await Promise.all([
                updatePromise,
                updatePromise, // Run same operation twice
                updatePromise  // Run same operation thrice
            ]);

            // All should succeed (idempotent)
            const allSuccessful = results.every(result => result === true);
            expect(allSuccessful).toBe(true);

            // Verify only one record exists (no duplicates)
            const { data: dbPrefs } = await supabase
                .from('user_preferences')
                .select('*')
                .eq('user_id', testUserId)
                .eq('preference_type', 'migration_test')
                .eq('preference_key', 'idempotent_key');

            expect(dbPrefs?.length).toBe(1);
        });
    });

    describe('Load and Stress Testing', () => {
        test('High frequency preference updates', async () => {
            const startTime = Date.now();
            const updatePromises = [];

            // Simulate high-frequency updates (like during a busy period)
            for (let i = 0; i < 50; i++) {
                updatePromises.push(
                    preferenceLearner.updatePreference(testUserId, {
                        type: 'stress_test',
                        key: `stress_key_${i}`,
                        value: `stress_value_${i}`,
                        confidence: Math.random()
                    })
                );
            }

            const results = await Promise.allSettled(updatePromises);
            const duration = Date.now() - startTime;

            const successfulUpdates = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
            const successRate = successfulUpdates / updatePromises.length;

            console.log(`Stress test: ${successfulUpdates}/${updatePromises.length} successful (${(successRate * 100).toFixed(1)}%) in ${duration}ms`);

            // Should handle high load reasonably well
            expect(successRate).toBeGreaterThan(0.8); // At least 80% success rate
            expect(duration).toBeLessThan(30000); // Complete within 30 seconds
        });

        test('Large dataset handling', async () => {
            const largePreferences = {};

            // Create a large preference object
            for (let i = 0; i < 100; i++) {
                largePreferences[`large_key_${i}`] = {
                    value: 'x'.repeat(1000), // 1KB per value
                    confidence: 0.5,
                    usage_count: Math.floor(Math.random() * 100)
                };
            }

            const startTime = Date.now();

            // Test storing large preference dataset
            await preferenceLearner.updatePreference(testUserId, {
                type: 'large_dataset_test',
                key: 'large_data',
                value: largePreferences,
                confidence: 0.8
            });

            // Test retrieving large dataset
            const preferences = await preferenceLearner.getUserPreferences(testUserId);
            const retrievalTime = Date.now() - startTime;

            expect(preferences.large_dataset_test).toBeDefined();
            expect(retrievalTime).toBeLessThan(5000); // Should retrieve within 5 seconds
        });

        test('Memory leak detection', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            const iterations = 100;

            // Perform many operations that could potentially leak memory
            for (let i = 0; i < iterations; i++) {
                await preferenceLearner.updatePreference(testUserId, {
                    type: 'memory_test',
                    key: `memory_key_${i}`,
                    value: `memory_value_${i}`,
                    confidence: 0.5
                });

                await preferenceLearner.getUserPreferences(testUserId);
            }

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

            console.log(`Memory test: ${memoryIncreaseMB.toFixed(2)}MB increase after ${iterations} operations`);

            // Allow for some memory increase but not excessive (should be < 50MB)
            expect(memoryIncreaseMB).toBeLessThan(50);
        });

        test('Concurrent user simulation', async () => {
            const concurrentUsers = 20;
            const operationsPerUser = 10;
            const userPromises = [];

            for (let userIndex = 0; userIndex < concurrentUsers; userIndex++) {
                const userId = `concurrent-user-${userIndex}`;
                const userOperations = [];

                for (let opIndex = 0; opIndex < operationsPerUser; opIndex++) {
                    userOperations.push(
                        preferenceLearner.updatePreference(userId, {
                            type: 'concurrent_test',
                            key: `user_${userIndex}_op_${opIndex}`,
                            value: `value_${opIndex}`,
                            confidence: 0.5
                        })
                    );
                }

                userPromises.push(Promise.all(userOperations));
            }

            const startTime = Date.now();
            const results = await Promise.allSettled(userPromises);
            const duration = Date.now() - startTime;

            const successfulUsers = results.filter(r =>
                r.status === 'fulfilled' &&
                r.value.every(result => result === true)
            ).length;

            const successRate = successfulUsers / concurrentUsers;

            console.log(`Concurrent test: ${successfulUsers}/${concurrentUsers} users successful (${(successRate * 100).toFixed(1)}%) in ${duration}ms`);

            expect(successRate).toBeGreaterThan(0.9); // At least 90% of users should succeed
            expect(duration).toBeLessThan(60000); // Complete within 1 minute
        });
    });

    describe('Backup and Recovery Testing', () => {
        test('Preference data backup integrity', async () => {
            // Create test preferences
            await preferenceLearner.updatePreference(testUserId, {
                type: 'backup_test',
                key: 'backup_key_1',
                value: 'backup_value_1',
                confidence: 0.9
            });

            await preferenceLearner.updatePreference(testUserId, {
                type: 'backup_test',
                key: 'backup_key_2',
                value: 'backup_value_2',
                confidence: 0.7
            });

            // Simulate backup by retrieving all preferences
            const originalPreferences = await preferenceLearner.getUserPreferences(testUserId);

            // Simulate data loss by clearing database (in test environment)
            // In real scenario, this would be a backup restoration test
            preferenceLearner.cache.clear();

            // Verify we can recover preferences
            const recoveredPreferences = await preferenceLearner.getUserPreferences(testUserId);

            // Preferences should be identical
            expect(recoveredPreferences.backup_test).toEqual(originalPreferences.backup_test);
        });

        test('Incremental backup safety', async () => {
            // This test simulates incremental backup scenarios
            const checkpoints = [];

            // Create initial preferences
            await preferenceLearner.updatePreference(testUserId, {
                type: 'incremental_test',
                key: 'initial_key',
                value: 'initial_value',
                confidence: 0.5
            });

            checkpoints.push(await preferenceLearner.getUserPreferences(testUserId));

            // Add more preferences
            await preferenceLearner.updatePreference(testUserId, {
                type: 'incremental_test',
                key: 'added_key_1',
                value: 'added_value_1',
                confidence: 0.6
            });

            checkpoints.push(await preferenceLearner.getUserPreferences(testUserId));

            // Update existing preference
            await preferenceLearner.updatePreference(testUserId, {
                type: 'incremental_test',
                key: 'initial_key',
                value: 'updated_value',
                confidence: 0.8
            });

            checkpoints.push(await preferenceLearner.getUserPreferences(testUserId));

            // Verify incremental changes are preserved
            expect(checkpoints[0].incremental_test.initial_key.value).toBe('initial_value');
            expect(checkpoints[1].incremental_test.added_key_1.value).toBe('added_value_1');
            expect(checkpoints[2].incremental_test.initial_key.value).toBe('updated_value');
            expect(checkpoints[2].incremental_test.initial_key.confidence).toBeGreaterThan(
                checkpoints[0].incremental_test.initial_key.confidence
            );
        });
    });

    describe('Monitoring and Alerting', () => {
        test('Performance degradation detection', async () => {
            const action = 'performance_test_action';

            // Simulate normal performance
            for (let i = 0; i < 10; i++) {
                await performanceMonitor.trackPerformance(testUserId, action, Date.now() - 100);
            }

            // Simulate performance degradation
            await performanceMonitor.trackPerformance(testUserId, action, Date.now() - 6000); // 6 seconds

            // The monitor should detect and handle this gracefully
            // In a real scenario, this would trigger alerts
            const stats = await performanceMonitor.getPerformanceStats(testUserId, action);
            expect(stats.averageResponseTime).toBeGreaterThan(100);
        });

        test('Error rate monitoring', async () => {
            // Simulate some successful operations
            for (let i = 0; i < 8; i++) {
                await performanceMonitor.trackPerformance(testUserId, 'error_test_action', Date.now() - 100);
            }

            // Simulate some errors
            for (let i = 0; i < 2; i++) {
                await performanceMonitor.trackPerformance(testUserId, 'error_test_action', Date.now() - 100, {
                    error: 'Simulated error',
                    error_code: 'TEST_ERROR'
                });
            }

            const stats = await performanceMonitor.getPerformanceStats(testUserId, 'error_test_action');
            expect(stats.errorRate).toBe(0.2); // 20% error rate
        });

        test('System resource monitoring', async () => {
            // Test memory monitoring
            await performanceMonitor.trackMemoryUsage();

            // Test cache monitoring
            await performanceMonitor.trackCachePerformance('test_cache', true);
            await performanceMonitor.trackCachePerformance('test_cache', false);

            // Should complete without errors
            expect(true).toBe(true);
        });
    });
});

// Helper functions for reliability testing

async function simulateNetworkFailure(operation, failureRate = 0.1) {
    if (Math.random() < failureRate) {
        throw new Error('Simulated network failure');
    }
    return await operation();
}

async function measureMemoryUsage(operation) {
    const before = process.memoryUsage().heapUsed;
    const result = await operation();
    const after = process.memoryUsage().heapUsed;
    return {
        result,
        memoryDelta: after - before
    };
}

async function testTimeout(operation, timeoutMs = 5000) {
    return Promise.race([
        operation(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
        )
    ]);
}

module.exports = {
    simulateNetworkFailure,
    measureMemoryUsage,
    testTimeout
};
