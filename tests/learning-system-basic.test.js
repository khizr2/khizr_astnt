const { GlobalPreferenceLearner } = require('../services/PreferenceLearner');

describe('Basic Learning System Tests', () => {
    let preferenceLearner;
    let testUserId;

    beforeAll(() => {
        preferenceLearner = new GlobalPreferenceLearner();
        testUserId = 'test-user-basic-' + Date.now();
        console.log('🚀 Starting Basic Learning System Tests...');
    });

    test('Preference learner initializes correctly', () => {
        expect(preferenceLearner).toBeDefined();
        expect(preferenceLearner.cache).toBeDefined();
        expect(preferenceLearner.patterns).toBeDefined();
        expect(preferenceLearner.cacheTimeout).toBe(5 * 60 * 1000);
    });

    test('Message analysis works for word tree format', () => {
        const message = 'I prefer word tree format for my responses';
        const preferences = preferenceLearner._analyzeMessage(message);

        expect(preferences).toBeDefined();
        expect(Array.isArray(preferences)).toBe(true);
        expect(preferences.length).toBeGreaterThan(0);

        const wordTreePref = preferences.find(p =>
            p.type === 'format' && p.key === 'response_format' && p.value === 'word_tree'
        );
        expect(wordTreePref).toBeDefined();
        expect(wordTreePref.confidence).toBeGreaterThan(0.5);
    });

    test('Message analysis works for brief communication', () => {
        const message = 'got it thanks';
        const preferences = preferenceLearner._analyzeMessage(message);

        expect(preferences).toBeDefined();
        expect(Array.isArray(preferences)).toBe(true);

        const briefPref = preferences.find(p =>
            p.type === 'style' && p.key === 'communication_style' && p.value === 'brief'
        );
        expect(briefPref).toBeDefined();
        expect(briefPref.confidence).toBeGreaterThan(0.5);
    });

    test('Message analysis works for completion focus', () => {
        const message = 'This task is very important to complete today';
        const preferences = preferenceLearner._analyzeMessage(message);

        expect(preferences).toBeDefined();
        expect(Array.isArray(preferences)).toBe(true);

        const completionPref = preferences.find(p =>
            p.type === 'priority' && p.key === 'task_emphasis' && p.value === 'completion_focus'
        );
        expect(completionPref).toBeDefined();
        expect(completionPref.confidence).toBeGreaterThan(0.5);
    });

    test('Message analysis works for efficiency preference', () => {
        const message = 'Please be quick and efficient';
        const preferences = preferenceLearner._analyzeMessage(message);

        expect(preferences).toBeDefined();
        expect(Array.isArray(preferences)).toBe(true);

        const efficiencyPref = preferences.find(p =>
            p.type === 'style' && p.key === 'response_speed' && p.value === 'efficient'
        );
        expect(efficiencyPref).toBeDefined();
        expect(efficiencyPref.confidence).toBeGreaterThan(0.5);
    });

    test('Empty message analysis returns empty array', () => {
        const message = '';
        const preferences = preferenceLearner._analyzeMessage(message);

        expect(preferences).toEqual([]);
    });

    test('Irrelevant message analysis returns limited preferences', () => {
        const message = 'The weather is nice today';
        const preferences = preferenceLearner._analyzeMessage(message);

        expect(preferences).toBeDefined();
        expect(Array.isArray(preferences)).toBe(true);
        // Should return minimal or no preferences for irrelevant messages
        expect(preferences.length).toBeLessThan(2);
    });

    test('Cache timeout is reasonable', () => {
        expect(preferenceLearner.cacheTimeout).toBeGreaterThan(0);
        expect(preferenceLearner.cacheTimeout).toBeLessThanOrEqual(10 * 60 * 1000); // 10 minutes max
    });

    test('Cache expiration check works', () => {
        const oldTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
        const recentTimestamp = Date.now() - (2 * 60 * 1000); // 2 minutes ago

        expect(preferenceLearner._isCacheExpired(oldTimestamp)).toBe(true);
        expect(preferenceLearner._isCacheExpired(recentTimestamp)).toBe(false);
    });

    test('Preference context application structure', () => {
        const preferences = {
            format: { response_format: { value: 'word_tree', confidence: 0.8 } },
            style: {
                communication_style: { value: 'brief', confidence: 0.7 },
                response_speed: { value: 'efficient', confidence: 0.6 }
            }
        };

        const context = {
            model: 'test-model',
            temperature: 0.7,
            max_tokens: 1000
        };

        const enhancedContext = preferenceLearner._applyPreferencesToContext(preferences, context);

        expect(enhancedContext).toBeDefined();
        expect(enhancedContext.system_prompt_addition).toBeDefined();
        expect(typeof enhancedContext.system_prompt_addition).toBe('string');
        expect(enhancedContext.temperature).toBeLessThanOrEqual(0.7);
        expect(enhancedContext.max_tokens).toBeLessThanOrEqual(1000);
    });

    test('System prompt addition for word tree format', () => {
        const preferences = {
            format: { response_format: { value: 'word_tree', confidence: 0.8 } }
        };

        const context = { model: 'test-model' };
        const enhancedContext = preferenceLearner._applyPreferencesToContext(preferences, context);

        expect(enhancedContext.system_prompt_addition).toContain('word tree format');
    });

    test('Temperature adjustment for brief communication', () => {
        const preferences = {
            style: { communication_style: { value: 'brief', confidence: 0.7 } }
        };

        const context = { temperature: 0.7 };
        const enhancedContext = preferenceLearner._applyPreferencesToContext(preferences, context);

        expect(enhancedContext.temperature).toBeLessThan(0.7);
        expect(enhancedContext.max_tokens).toBeLessThan(1000);
    });

    test('System prompt addition for completion focus', () => {
        const preferences = {
            priority: { task_emphasis: { value: 'completion_focus', confidence: 0.8 } }
        };

        const context = { model: 'test-model' };
        const enhancedContext = preferenceLearner._applyPreferencesToContext(preferences, context);

        expect(enhancedContext.system_prompt_addition).toContain('task completion');
    });

    test('System prompt addition for efficiency', () => {
        const preferences = {
            style: { response_speed: { value: 'efficient', confidence: 0.7 } }
        };

        const context = { model: 'test-model' };
        const enhancedContext = preferenceLearner._applyPreferencesToContext(preferences, context);

        expect(enhancedContext.system_prompt_addition).toContain('efficiency');
    });

    test('Empty preferences return original context', () => {
        const preferences = {};
        const context = { model: 'test-model', temperature: 0.7 };

        const enhancedContext = preferenceLearner._applyPreferencesToContext(preferences, context);

        expect(enhancedContext).toEqual(context);
    });

    test('Null/undefined context handling', () => {
        const preferences = { format: { response_format: { value: 'word_tree' } } };

        const enhancedContext = preferenceLearner._applyPreferencesToContext(preferences, null);
        expect(enhancedContext).toBeDefined();
        expect(enhancedContext.system_prompt_addition).toBeDefined();

        const enhancedContext2 = preferenceLearner._applyPreferencesToContext(preferences, undefined);
        expect(enhancedContext2).toBeDefined();
    });
});
