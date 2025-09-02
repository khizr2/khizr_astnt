#!/usr/bin/env node

// LMStudio Setup Helper
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function setupLMStudio() {
    console.log('🤖 LMStudio Setup Helper\n');

    try {
        const envPath = path.join(__dirname, '.env');
        let envContent = fs.readFileSync(envPath, 'utf8');

        console.log('📋 Current LMStudio Configuration:');
        const baseUrlMatch = envContent.match(/^LMSTUDIO_BASE_URL=(.*)$/m);
        const modelMatch = envContent.match(/^LMSTUDIO_MODEL=(.*)$/m);

        console.log(`   Base URL: ${baseUrlMatch ? baseUrlMatch[1] : 'Not set'}`);
        console.log(`   Model: ${modelMatch ? modelMatch[1] : 'Not set'}`);

        console.log('\n🔧 LMStudio Setup Steps:');
        console.log('========================');
        console.log('1. Download LMStudio: https://lmstudio.ai/');
        console.log('2. Install and launch LMStudio');
        console.log('3. Go to "My Models" tab');
        console.log('4. Download a model (recommended: llama-3.1-8b-instruct or similar)');
        console.log('5. Go to "Chat" tab');
        console.log('6. Click the gear icon ⚙️ (Local Server)');
        console.log('7. Ensure these settings:');
        console.log('   • Port: 1234');
        console.log('   • Context Length: 4096+');
        console.log('   • GPU Layers: As many as your GPU allows');
        console.log('8. Start the server');

        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question('\nIs LMStudio running on localhost:1234? (y/n): ', (answer) => {
                if (answer.toLowerCase() === 'y') {
                    rl.question('What model did you load? (e.g., llama-3.1-8b-instruct): ', (model) => {
                        // Update .env file
                        envContent = envContent.replace(
                            /LMSTUDIO_BASE_URL=.*/,
                            'LMSTUDIO_BASE_URL=http://localhost:1234'
                        );
                        envContent = envContent.replace(
                            /LMSTUDIO_MODEL=.*/,
                            `LMSTUDIO_MODEL=${model}`
                        );

                        fs.writeFileSync(envPath, envContent);
                        console.log('\n✅ LMStudio configuration updated!');
                        console.log('📝 Added to .env:');
                        console.log(`   LMSTUDIO_BASE_URL=http://localhost:1234`);
                        console.log(`   LMSTUDIO_MODEL=${model}`);

                        console.log('\n🧪 Testing LMStudio...');
                        const emailAI = require('./services/emailAI');

                        // Test with a simple email
                        const testEmail = {
                            sender: 'Test User',
                            subject: 'Test Email',
                            content: 'This is a test to verify LMStudio integration.',
                            content_snippet: 'Test email content'
                        };

                        emailAI.analyzeEmail(testEmail, 'lmstudio')
                            .then(analysis => {
                                console.log('✅ LMStudio test successful!');
                                console.log(`   Priority: ${analysis.priority}`);
                                console.log(`   Important: ${analysis.is_important}`);
                            })
                            .catch(error => {
                                console.log('❌ LMStudio test failed:', error.message);
                                console.log('💡 Make sure your model is loaded and server is running');
                            })
                            .finally(() => {
                                rl.close();
                                resolve();
                            });
                    });
                } else {
                    console.log('\n⚠️  Please start LMStudio first, then run this script again.');
                    console.log('💡 Run: node setup-lmstudio.js');
                    rl.close();
                    resolve();
                }
            });
        });

    } catch (error) {
        console.error('❌ Setup failed:', error.message);
    }
}

// Run if called directly
if (require.main === module) {
    setupLMStudio();
}

module.exports = { setupLMStudio };
