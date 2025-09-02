#!/usr/bin/env node

// Gmail Setup Helper Script
require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('🚀 Gmail Integration Setup Helper\n');

async function setupGmail() {
    try {
        // Check if .env exists
        const envPath = path.join(__dirname, '.env');
        let envExists = fs.existsSync(envPath);

        if (!envExists) {
            console.log('❌ No .env file found. Creating one from template...');
            const templatePath = path.join(__dirname, 'env.template');
            if (fs.existsSync(templatePath)) {
                fs.copyFileSync(templatePath, envPath);
                console.log('✅ .env file created from template');
                console.log('⚠️  Please edit .env file with your actual credentials');
            } else {
                console.log('❌ env.template not found. Please create .env file manually');
                return;
            }
        }

        // Read current .env
        let envContent = fs.readFileSync(envPath, 'utf8');
        console.log('\n📋 Current Configuration:');

        // Check each required variable
        const requiredVars = [
            'GMAIL_CLIENT_ID',
            'GMAIL_CLIENT_SECRET',
            'GMAIL_REDIRECT_URI',
            'OPENAI_API_KEY',
            'OPENROUTER_API_KEY',
            'LMSTUDIO_BASE_URL',
            'LMSTUDIO_MODEL',
            'SUPABASE_URL',
            'SUPABASE_ANON_KEY',
            'JWT_SECRET'
        ];

        let missingVars = [];
        requiredVars.forEach(varName => {
            const regex = new RegExp(`^${varName}=(.*)$`, 'm');
            const match = envContent.match(regex);
            const value = match ? match[1] : null;
            const status = value && value !== `your_${varName.toLowerCase().replace('_', '_')}here` ? '✅ Set' : '❌ Missing';
            console.log(`   ${varName}: ${status}`);
            if (!value || value === `your_${varName.toLowerCase().replace('_', '_')}here`) {
                missingVars.push(varName);
            }
        });

        if (missingVars.length > 0) {
            console.log('\n🔧 Missing Configuration:');
            console.log('==========================');

            console.log('\n1️⃣ Gmail API Setup:');
            console.log('   • Go to Google Cloud Console: https://console.cloud.google.com/');
            console.log('   • Create/select a project');
            console.log('   • Enable Gmail API');
            console.log('   • Create OAuth 2.0 credentials');
            console.log('   • Set redirect URI to: http://localhost:10000/api/gmail/callback');
            console.log('   • Add credentials to .env:');
            console.log('     GMAIL_CLIENT_ID=your_client_id_here');
            console.log('     GMAIL_CLIENT_SECRET=your_client_secret_here');
            console.log('     GMAIL_REDIRECT_URI=http://localhost:10000/api/gmail/callback');

            console.log('\n2️⃣ AI Service Setup:');
            console.log('   Choose ONE of the following:');

            console.log('\n   Option A - OpenAI:');
            console.log('   • Get API key from: https://platform.openai.com/api-keys');
            console.log('   • Add to .env: OPENAI_API_KEY=your_openai_key');

            console.log('\n   Option B - LMStudio (Recommended - Local):');
            console.log('   • Download LMStudio: https://lmstudio.ai/');
            console.log('   • Start LMStudio on port 1234');
            console.log('   • Download a model (e.g., llama-3.1-8b-instruct)');
            console.log('   • Add to .env:');
            console.log('     LMSTUDIO_BASE_URL=http://localhost:1234');
            console.log('     LMSTUDIO_MODEL=your_model_name_here');

            console.log('\n   Option C - OpenRouter (Cloud - Paid):');
            console.log('   • Get API key from: https://openrouter.ai/');
            console.log('   • Add to .env: OPENROUTER_API_KEY=your_openrouter_key');

            console.log('\n3️⃣ Database Setup:');
            console.log('   • Ensure SUPABASE_URL and SUPABASE_ANON_KEY are set');
            console.log('   • Run database migrations if needed');

            console.log('\n4️⃣ JWT Setup:');
            console.log('   • Generate a secure JWT secret');
            console.log('   • Add to .env: JWT_SECRET=your_secure_jwt_secret');

            console.log('\n🔄 After configuration:');
            console.log('   1. Restart the server: npm start');
            console.log('   2. Test Gmail: node debug-gmail.js');
            console.log('   3. Visit Gmail auth: http://localhost:10000/api/gmail/auth');

        } else {
            console.log('\n✅ All required variables are configured!');
            console.log('\n🚀 Ready to start:');
            console.log('   1. npm start');
            console.log('   2. Visit: http://localhost:10000');
            console.log('   3. Test Gmail integration in your app');
        }

        console.log('\n📚 Gmail API Usage Examples:');
        console.log('===========================');
        console.log('• Check status: GET /api/gmail/status');
        console.log('• Fetch emails: GET /api/gmail/emails?refresh=true&limit=20');
        console.log('• Sort by priority: GET /api/gmail/emails?sort=priority');
        console.log('• Filter high priority: GET /api/gmail/emails?priority_filter=high');
        console.log('• Get email digest: GET /api/gmail/digest');

        console.log('\n🧪 Testing Commands:');
        console.log('===================');
        console.log('• Debug script: node debug-gmail.js');
        console.log('• Test email processing: node tests/test-gmail-functionality.js');

    } catch (error) {
        console.error('❌ Setup failed:', error.message);
    }
}

// Interactive setup for LMStudio
async function setupLMStudio() {
    console.log('\n🤖 LMStudio Setup Helper:');
    console.log('========================');

    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('Is LMStudio running on localhost:1234? (y/n): ', (answer) => {
            if (answer.toLowerCase() === 'y') {
                rl.question('What model are you using? (e.g., llama-3.1-8b-instruct): ', (model) => {
                    const envPath = path.join(__dirname, '.env');
                    let envContent = fs.readFileSync(envPath, 'utf8');

                    // Update LMStudio config
                    envContent = envContent.replace(
                        /LMSTUDIO_BASE_URL=.*/,
                        'LMSTUDIO_BASE_URL=http://localhost:1234'
                    );
                    envContent = envContent.replace(
                        /LMSTUDIO_MODEL=.*/,
                        `LMSTUDIO_MODEL=${model}`
                    );

                    fs.writeFileSync(envPath, envContent);
                    console.log('✅ LMStudio configuration updated!');
                    rl.close();
                    resolve();
                });
            } else {
                console.log('⚠️  Please start LMStudio first, then run this script again.');
                rl.close();
                resolve();
            }
        });
    });
}

// Check if called with specific args
const args = process.argv.slice(2);
if (args.includes('--lmstudio')) {
    setupLMStudio();
} else {
    setupGmail();
}

module.exports = { setupGmail, setupLMStudio };
