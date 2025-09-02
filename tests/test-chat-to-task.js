const fetch = require('node-fetch');

// Test the chat-to-task functionality with deployed API
const API_BASE_URL = 'https://khizr-assistant-api.onrender.com';
const JWT_TOKEN = process.env.JWT_TOKEN; // You'll need to get this from your deployed app

async function testChatToTask() {
    console.log('🧪 Testing Chat-to-Task Functionality\n');

    // Test cases for task creation
    const testCases = [
        {
            message: 'zz buy groceries for dinner',
            expected: 'Normal priority task: "buy groceries for dinner"'
        },
        {
            message: '!! fix server immediately',
            expected: 'Urgent priority task: "fix server immediately"'
        },
        {
            message: 'zz',
            expected: 'Should reject empty task'
        },
        {
            message: '!!',
            expected: 'Should reject empty task'
        },
        {
            message: 'regular chat message without prefix',
            expected: 'Normal chat response, no task created'
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n📝 Testing: "${testCase.message}"`);
        console.log(`Expected: ${testCase.expected}`);

        try {
            const response = await fetch(`${API_BASE_URL}/api/chat/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${JWT_TOKEN}`
                },
                body: JSON.stringify({
                    message: testCase.message,
                    model: 'deepseek/deepseek-r1:free'
                })
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ Response received');
                console.log('🤖 AI Response:', data.message?.substring(0, 100) + '...');

                // Check if task was created
                if (data.task_created) {
                    console.log('✅ Task Created!');
                    console.log('📋 Task Title:', data.task_title);
                    console.log('🔥 Priority:', data.task_priority === 1 ? 'Urgent' : 'Normal');
                    console.log('🆔 Task ID:', data.task_id);
                    console.log('💬 Task Message:', data.task_message);
                } else {
                    console.log('ℹ️  No task created (expected for regular chat)');
                }

                if (data.task_error) {
                    console.log('❌ Task Error:', data.task_error);
                }

                console.log('📊 Message Type:', data.type);
                console.log('🤖 Model Used:', data.model_used);

            } else {
                const error = await response.json();
                console.log('❌ HTTP Error:', response.status);
                console.log('❌ Error Details:', error);
            }

        } catch (error) {
            console.log('❌ Network Error:', error.message);
        }

        // Add delay between tests
        console.log('\n⏳ Waiting 2 seconds before next test...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n🎯 Chat-to-Task Testing Complete!');
    console.log('\n📋 Summary:');
    console.log('- "zz message" should create normal priority tasks');
    console.log('- "!! message" should create urgent priority tasks');
    console.log('- Empty prefixes should be rejected');
    console.log('- Regular messages should work normally');
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
        } else {
            console.log('❌ Models endpoint failed:', response.status);
        }
    } catch (error) {
        console.log('❌ Network error:', error.message);
    }
}

// Check if JWT token is available
function checkEnvironment() {
    if (!JWT_TOKEN) {
        console.log('❌ JWT_TOKEN environment variable is not set!');
        console.log('💡 Please set JWT_TOKEN in your environment or .env file');
        console.log('💡 You can get the token from your deployed app by logging in');
        process.exit(1);
    }
    console.log('✅ JWT_TOKEN is set');
}

// Run tests
async function runTests() {
    console.log('🚀 Testing Chat-to-Task Functionality on Deployed API\n');
    console.log('🌐 API URL:', API_BASE_URL);

    checkEnvironment();

    // First test the models endpoint to verify API is working
    await testModelsEndpoint();

    // Then test the chat-to-task functionality
    await testChatToTask();

    console.log('\n✨ Tests completed!');
}

// Run if called directly
if (require.main === module) {
    runTests();
}

module.exports = { testChatToTask, testModelsEndpoint, runTests };
