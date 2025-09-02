const fetch = require('node-fetch');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:10000';
const JWT_TOKEN = process.env.JWT_TOKEN;

// Test the new OpenRouter free models
async function testOpenRouterModels() {
    console.log('🧪 Testing OpenRouter AI Models Integration\n');

    // Test models to verify
    const testModels = [
        'deepseek/deepseek-r1:free',
        'deepseek/deepseek-v3-0324:free',
        'tng/deepseek-r1t2-chimera:free',
        'z-ai/glm-4.5-air:free',
        'qwen/qwen3-coder-480b-a35b:free',
        'moonshotai/kimi-k2:free'
    ];

    for (const model of testModels) {
        console.log(`\n🤖 Testing model: ${model}`);

        try {
            const response = await fetch(`${API_BASE_URL}/api/chat/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${JWT_TOKEN}`
                },
                body: JSON.stringify({
                    message: "Hello! Please respond with a simple greeting and mention you're a free OpenRouter model.",
                    model: model
                })
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ SUCCESS:', data.message);
                console.log('📊 Model used:', data.model_used);
            } else {
                const error = await response.json();
                console.log('❌ ERROR:', error.error);
            }

        } catch (error) {
            console.log('❌ NETWORK ERROR:', error.message);
        }

        // Add delay between tests to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n🎯 Test completed! Check the results above.');
}

// Test getting available models
async function testModelsEndpoint() {
    console.log('\n📋 Testing /api/chat/models endpoint...\n');

    try {
        const response = await fetch(`${API_BASE_URL}/api/chat/models`, {
            headers: {
                'Authorization': `Bearer ${JWT_TOKEN}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ Models endpoint working!');
            console.log('🆓 Free models available:', data.free_models_available);
            console.log('📊 Total models:', data.total_models);
            console.log('🎯 Default model:', data.default_model);
            console.log('\n🔥 Free Models:');
            Object.entries(data.categorized_models.free).forEach(([key, value]) => {
                console.log(`  - ${key}: ${value}`);
            });
        } else {
            console.log('❌ Models endpoint failed');
        }
    } catch (error) {
        console.log('❌ Network error:', error.message);
    }
}

// Run tests
async function runTests() {
    console.log('🚀 Starting OpenRouter Integration Tests\n');

    // First test the models endpoint
    await testModelsEndpoint();

    // Then test actual chat with free models
    await testOpenRouterModels();

    console.log('\n✨ Tests completed! Your OpenRouter integration should now be working.');
    console.log('\n💡 Next steps:');
    console.log('1. Start your server: npm start');
    console.log('2. Open your app and try chatting with the new free models');
    console.log('3. Check the model selector dropdown for all the new options');
}

// Run if called directly
if (require.main === module) {
    runTests();
}

module.exports = { testOpenRouterModels, testModelsEndpoint, runTests };
