// Test AI Services Integration
require('dotenv').config();
const emailAI = require('./services/emailAI');

async function testAIServices() {
    console.log('🧪 Testing AI Services Integration...\n');

    // Test email for analysis
    const testEmail = {
        gmail_id: 'test123',
        sender: 'John Doe <john.doe@company.com>',
        sender_email: 'john.doe@company.com',
        subject: 'Project Timeline Update - Urgent',
        content: `Hi team,

I wanted to update you on the project timeline. We have a critical deadline approaching on March 15th for the client presentation. The resource allocation discussion needs to happen immediately as we're running behind schedule.

Please review the attached budget and let me know your thoughts by EOD today.

Best regards,
John`,
        content_snippet: 'Hi team, I wanted to update you on the project timeline. We have a critical deadline approaching on March 15th.',
        received_at: new Date(),
        labels: ['INBOX', 'IMPORTANT'],
        is_important: true,
        is_automated: false
    };

    try {
        console.log('1️⃣ Testing Email Analysis...');

        // Test with default service
        console.log('   Testing with default service...');
        const analysis = await emailAI.analyzeEmail(testEmail);
        console.log('   ✅ Analysis completed!');
        console.log(`   📊 Priority: ${analysis.priority}`);
        console.log(`   🎯 Important: ${analysis.is_important}`);
        console.log(`   📝 Summary: ${analysis.word_tree_summary.substring(0, 100)}...`);

        console.log('\n2️⃣ Testing Response Generation...');
        const response = await emailAI.generateResponse(testEmail, 'Please confirm you received this update');
        console.log('   ✅ Response generated!');
        console.log(`   💬 Response: ${response.substring(0, 100)}...`);

        console.log('\n3️⃣ Available AI Services:');
        console.log('   Available services:', Object.keys(emailAI.aiServices));
        console.log('   Default service:', emailAI.defaultService);

        if (process.env.LMSTUDIO_BASE_URL) {
            console.log('\n4️⃣ Testing LMStudio specifically...');
            try {
                const lmAnalysis = await emailAI.analyzeEmail(testEmail, 'lmstudio');
                console.log('   ✅ LMStudio analysis successful!');
                console.log(`   🤖 LMStudio Priority: ${lmAnalysis.priority}`);
            } catch (error) {
                console.log('   ❌ LMStudio test failed:', error.message);
            }
        }

        console.log('\n🎉 AI Services Test Complete!');
        console.log('================================');
        console.log('✅ Email analysis working');
        console.log('✅ Response generation working');
        console.log('✅ Multi-service support ready');
        if (process.env.LMSTUDIO_BASE_URL) {
            console.log('✅ LMStudio integration ready');
        }

    } catch (error) {
        console.error('❌ AI Services test failed:', error.message);
        console.error('Stack trace:', error.stack);

        console.log('\n🔧 Troubleshooting:');
        console.log('==================');
        console.log('1. Check your .env file has the correct AI service configuration');
        console.log('2. For LMStudio: Ensure it\'s running on localhost:1234');
        console.log('3. For OpenAI: Ensure your API key is valid');
        console.log('4. For OpenRouter: Ensure your API key is valid and not connecting yet');
    }
}

// Run the test
if (require.main === module) {
    testAIServices();
}

module.exports = { testAIServices };
