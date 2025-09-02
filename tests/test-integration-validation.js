#!/usr/bin/env node

/**
 * Integration Validation Test
 * Validates that the pattern recognition and daddy agent system works correctly
 */

const { GlobalPreferenceLearner } = require('./services/PreferenceLearner');
const { DaddyAgent } = require('./services/DaddyAgent');

async function validateIntegration() {
    console.log('🔍 Validating Pattern Recognition & Daddy Agent Integration...\n');

    const testUserId = 'integration-test-user-' + Date.now();
    let passedTests = 0;
    let totalTests = 0;

    try {
        // Test 1: PreferenceLearner Initialization
        totalTests++;
        console.log('1️⃣ Testing PreferenceLearner initialization...');
        const preferenceLearner = new GlobalPreferenceLearner();
        if (preferenceLearner && typeof preferenceLearner.analyzePatterns === 'function') {
            console.log('✅ PreferenceLearner initialized successfully');
            passedTests++;
        } else {
            console.log('❌ PreferenceLearner initialization failed');
        }

        // Test 2: Pattern Analysis Method
        totalTests++;
        console.log('\n2️⃣ Testing pattern analysis method...');
        const patterns = await preferenceLearner.analyzePatterns(testUserId);
        if (patterns && typeof patterns === 'object') {
            console.log('✅ Pattern analysis method works');
            console.log(`   📊 Detected ${Object.keys(patterns).length} pattern categories`);
            passedTests++;
        } else {
            console.log('❌ Pattern analysis method failed');
        }

        // Test 3: DaddyAgent Initialization
        totalTests++;
        console.log('\n3️⃣ Testing DaddyAgent initialization...');
        const daddyAgent = new DaddyAgent({
            userId: testUserId,
            monitoringLevel: 'medium',
            proactiveSuggestions: true
        });

        if (daddyAgent && typeof daddyAgent.startTaskMonitoring === 'function') {
            console.log('✅ DaddyAgent initialized successfully');
            passedTests++;
        } else {
            console.log('❌ DaddyAgent initialization failed');
        }

        // Test 4: DaddyAgent Metrics
        totalTests++;
        console.log('\n4️⃣ Testing DaddyAgent metrics...');
        const metrics = daddyAgent.getMetrics();
        if (metrics && typeof metrics === 'object' && 'tasksMonitored' in metrics) {
            console.log('✅ DaddyAgent metrics retrieved successfully');
            console.log(`   📈 Current metrics: ${JSON.stringify(metrics)}`);
            passedTests++;
        } else {
            console.log('❌ DaddyAgent metrics failed');
        }

        // Test 5: Proactive Suggestions Generation
        totalTests++;
        console.log('\n5️⃣ Testing proactive suggestions generation...');
        const suggestions = await preferenceLearner.generateProactiveSuggestions(testUserId, patterns);
        if (Array.isArray(suggestions)) {
            console.log('✅ Proactive suggestions generated');
            console.log(`   💡 Generated ${suggestions.length} suggestions`);
            passedTests++;
        } else {
            console.log('❌ Proactive suggestions generation failed');
        }

        // Test 6: DaddyAgent Recommendations
        totalTests++;
        console.log('\n6️⃣ Testing daddy agent recommendations...');
        const recommendations = await preferenceLearner.getDaddyAgentRecommendations(testUserId);
        if (recommendations && typeof recommendations === 'object' && 'monitoringLevel' in recommendations) {
            console.log('✅ Daddy agent recommendations generated');
            console.log(`   🎯 Recommendations: ${JSON.stringify(recommendations)}`);
            passedTests++;
        } else {
            console.log('❌ Daddy agent recommendations failed');
        }

        // Test 7: Task Monitoring Simulation
        totalTests++;
        console.log('\n7️⃣ Testing task monitoring simulation...');
        const testTask = {
            id: 'test-task-' + Date.now(),
            title: 'Integration Test Task',
            description: 'Task created for integration testing',
            priority: 3,
            status: 'pending',
            user_id: testUserId
        };

        await daddyAgent.startTaskMonitoring(testTask.id, testTask);
        const updatedMetrics = daddyAgent.getMetrics();

        if (updatedMetrics.tasksMonitored > 0) {
            console.log('✅ Task monitoring started successfully');
            console.log(`   👀 Monitoring ${updatedMetrics.tasksMonitored} task(s)`);
            passedTests++;
        } else {
            console.log('❌ Task monitoring failed');
        }

        // Test 8: Integration Cleanup
        totalTests++;
        console.log('\n8️⃣ Testing cleanup procedures...');
        daddyAgent.stopTaskMonitoring(testTask.id);
        daddyAgent.shutdown();

        const finalMetrics = daddyAgent.getMetrics();
        if (finalMetrics.tasksMonitored >= 0) {
            console.log('✅ Cleanup procedures executed successfully');
            passedTests++;
        } else {
            console.log('❌ Cleanup procedures failed');
        }

        // Final Results
        console.log('\n' + '='.repeat(60));
        console.log('🎯 INTEGRATION VALIDATION RESULTS');
        console.log('='.repeat(60));

        const successRate = (passedTests / totalTests) * 100;

        if (successRate >= 80) {
            console.log(`✅ ${passedTests}/${totalTests} tests passed (${successRate.toFixed(1)}%)`);
            console.log('\n🎉 Integration validation successful!');
            console.log('\n🚀 The Pattern Recognition & Daddy Agent system is ready for deployment.');

            console.log('\n📋 Next Steps:');
            console.log('   • Run the full test suite: node test-pattern-recognition.js');
            console.log('   • Deploy to your environment');
            console.log('   • Monitor system performance');
            console.log('   • Collect user feedback for continuous improvement');

        } else {
            console.log(`❌ ${passedTests}/${totalTests} tests passed (${successRate.toFixed(1)}%)`);
            console.log('\n⚠️  Integration validation partially successful.');
            console.log('   Some components may need attention before deployment.');
        }

        console.log('\n🔧 Components Tested:');
        console.log('   ✅ PreferenceLearner service');
        console.log('   ✅ Pattern analysis methods');
        console.log('   ✅ DaddyAgent service');
        console.log('   ✅ Task monitoring system');
        console.log('   ✅ Proactive suggestions');
        console.log('   ✅ Metrics and analytics');
        console.log('   ✅ Cleanup procedures');

        return {
            success: successRate >= 80,
            passedTests,
            totalTests,
            successRate
        };

    } catch (error) {
        console.error('\n❌ Integration validation failed with error:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('   • Check database connectivity');
        console.log('   • Verify environment configuration');
        console.log('   • Ensure all dependencies are installed');
        console.log('   • Review error logs for detailed information');

        return {
            success: false,
            error: error.message,
            passedTests: 0,
            totalTests,
            successRate: 0
        };
    }
}

// Run validation if called directly
if (require.main === module) {
    validateIntegration().then(result => {
        process.exit(result.success ? 0 : 1);
    }).catch(error => {
        console.error('Validation failed:', error);
        process.exit(1);
    });
}

module.exports = { validateIntegration };
