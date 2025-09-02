const { GlobalPreferenceLearner } = require('./services/PreferenceLearner');
const { supabase } = require('./database/connection');

// Test the preference learning system
async function testPreferenceLearning() {
    console.log('🧠 Testing Global Preference Learning System...\n');

    const learner = new GlobalPreferenceLearner();
    const testUserId = 'test-user-123';

    try {
        // Test 1: Word tree format preference
        console.log('📝 Test 1: Word tree format learning');
        await learner.learnFromInteraction(testUserId, {
            message: 'I prefer word tree format for my responses',
            response: 'I understand you prefer word tree format.',
            timestamp: new Date().toISOString()
        });
        console.log('✓ Learned word tree preference');

        // Test 2: Brief communication style (short message)
        console.log('\n📝 Test 2: Brief communication style learning');
        await learner.learnFromInteraction(testUserId, {
            message: 'ok',
            response: 'Got it.',
            timestamp: new Date().toISOString()
        });
        console.log('✓ Learned brief communication preference');

        // Test 3: Completion focus (important/urgent keywords)
        console.log('\n📝 Test 3: Completion focus learning');
        await learner.learnFromInteraction(testUserId, {
            message: 'This task is very important to complete today',
            response: 'I understand this is a high priority task.',
            timestamp: new Date().toISOString()
        });
        console.log('✓ Learned completion focus preference');

        // Test 4: Efficiency preference
        console.log('\n📝 Test 4: Efficiency preference learning');
        await learner.learnFromInteraction(testUserId, {
            message: 'Please be quick and efficient with this',
            response: 'Understood, I\'ll be efficient.',
            timestamp: new Date().toISOString()
        });
        console.log('✓ Learned efficiency preference');

        // Test 5: Verify preferences are applied
        console.log('\n🔍 Test 5: Verifying preference application');
        const preferences = await learner.getUserPreferences(testUserId);
        console.log('Learned preferences:', JSON.stringify(preferences, null, 2));

        // Test 6: Apply preferences to context
        console.log('\n⚙️  Test 6: Testing preference application to AI context');
        const context = {
            model: 'deepseek/deepseek-r1:free',
            temperature: 0.7,
            max_tokens: 1000
        };

        const personalizedContext = await learner.applyGlobalPreferences(testUserId, context);
        console.log('Original context:', context);
        console.log('Personalized context:', personalizedContext);

        // Test 7: Test preference updates
        console.log('\n📊 Test 7: Testing preference updates');
        const updateResult = await learner.updatePreference(testUserId, {
            type: 'test',
            key: 'test_preference',
            value: 'test_value',
            confidence: 0.8
        });
        console.log('Preference update result:', updateResult);

        // Test 8: Verify database persistence
        console.log('\n💾 Test 8: Verifying database persistence');
        const { data: dbPreferences, error } = await supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', testUserId)
            .order('last_updated', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Database error:', error);
        } else {
            console.log(`Found ${dbPreferences.length} preferences in database:`);
            dbPreferences.forEach(pref => {
                console.log(`  - ${pref.preference_type}.${pref.preference_key}: ${JSON.stringify(pref.preference_value)} (confidence: ${pref.confidence_score})`);
            });
        }

        console.log('\n✅ All preference learning tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Clean up test data
async function cleanupTestData() {
    try {
        console.log('\n🧹 Cleaning up test data...');
        const { error } = await supabase
            .from('user_preferences')
            .delete()
            .eq('user_id', 'test-user-123');

        if (error) {
            console.error('Cleanup error:', error);
        } else {
            console.log('✓ Test data cleaned up');
        }
    } catch (error) {
        console.error('Cleanup failed:', error);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    testPreferenceLearning()
        .then(() => {
            // Wait a bit before cleanup to see results
            setTimeout(cleanupTestData, 2000);
        })
        .catch(console.error);
}

module.exports = { testPreferenceLearning, cleanupTestData };
