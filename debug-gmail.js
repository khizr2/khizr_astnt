// Comprehensive Gmail debugging script
require('dotenv').config();
const { supabase } = require('./database/connection');
const gmailService = require('./services/gmail');
const emailAI = require('./services/emailAI');
const { logger } = require('./utils/logger');

async function debugGmailIntegration() {
    console.log('🔍 Debugging Gmail Integration...\n');

    try {
        // Step 1: Check environment variables
        console.log('1️⃣ Checking Environment Variables...');
        const envVars = {
            'GMAIL_CLIENT_ID': process.env.GMAIL_CLIENT_ID,
            'GMAIL_CLIENT_SECRET': process.env.GMAIL_CLIENT_SECRET,
            'GMAIL_REDIRECT_URI': process.env.GMAIL_REDIRECT_URI,
            'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
            'OPENROUTER_API_KEY': process.env.OPENROUTER_API_KEY,
            'LMSTUDIO_BASE_URL': process.env.LMSTUDIO_BASE_URL
        };

        Object.entries(envVars).forEach(([key, value]) => {
            const status = value ? '✅ Set' : '❌ Missing';
            console.log(`   ${key}: ${status}`);
        });

        console.log('\n2️⃣ Testing Database Connection...');
        const { data: dbTest, error: dbError } = await supabase
            .from('users')
            .select('count')
            .limit(1);

        if (dbError) {
            throw new Error(`Database connection failed: ${dbError.message}`);
        }

        console.log('✅ Database connection successful');

        console.log('\n3️⃣ Checking Gmail Tokens Table...');
        try {
            const { count: tokenCount, error: tokenError } = await supabase
                .from('gmail_tokens')
                .select('*', { count: 'exact', head: true });

            if (tokenError) {
                throw tokenError;
            }

            console.log(`✅ Gmail tokens table exists (${tokenCount || 0} records)`);
        } catch (error) {
            console.log('❌ Gmail tokens table check failed:', error.message);
        }

        console.log('\n4️⃣ Checking Emails Table...');
        try {
            const { count: emailCount, error: emailError } = await supabase
                .from('emails')
                .select('*', { count: 'exact', head: true });

            if (emailError) {
                throw emailError;
            }

            console.log(`✅ Emails table exists (${emailCount || 0} records)`);
        } catch (error) {
            console.log('❌ Emails table check failed:', error.message);
        }

        console.log('\n5️⃣ Testing AI Configuration...');

        // Test OpenAI if configured
        if (process.env.OPENAI_API_KEY) {
            try {
                console.log('   Testing OpenAI...');
                await emailAI.analyzeEmail({
                    sender: 'Test User <test@example.com>',
                    subject: 'Test Email',
                    content: 'This is a test email for AI analysis.',
                    content_snippet: 'Test email content'
                });
                console.log('   ✅ OpenAI working');
            } catch (error) {
                console.log('   ❌ OpenAI failed:', error.message);
            }
        }

        // Test LMStudio if configured
        if (process.env.LMSTUDIO_BASE_URL) {
            console.log('   LMStudio configured at:', process.env.LMSTUDIO_BASE_URL);
            console.log('   ⚠️  Note: LMStudio integration needs to be added to emailAI.js');
        }

        // Test OpenRouter if configured (but user said not to connect)
        if (process.env.OPENROUTER_API_KEY) {
            console.log('   OpenRouter API key configured');
            console.log('   ⚠️  Note: OpenRouter integration structure ready but not connecting');
        }

        console.log('\n6️⃣ Testing Gmail Service Methods...');

        // Test auth URL generation
        try {
            const authUrl = gmailService.generateAuthUrl('test-user-id');
            console.log('   ✅ Auth URL generation working');
            console.log('   📧 Auth URL preview:', authUrl.substring(0, 50) + '...');
        } catch (error) {
            console.log('   ❌ Auth URL generation failed:', error.message);
        }

        console.log('\n📋 Summary of Findings:');
        console.log('========================');

        const issues = [];

        if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
            issues.push('❌ Gmail API credentials missing');
        }

        if (!process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.LMSTUDIO_BASE_URL) {
            issues.push('❌ No AI service configured (OpenAI, OpenRouter, or LMStudio)');
        }

        if (issues.length === 0) {
            console.log('✅ All basic configurations appear correct');
            console.log('🔄 Try the following next steps:');
            console.log('   1. Start the server: npm start');
            console.log('   2. Visit Gmail auth endpoint: /api/gmail/auth');
            console.log('   3. Check server logs for detailed errors');
            console.log('   4. Test email fetching: /api/gmail/emails?refresh=true');
        } else {
            console.log('❌ Issues found:');
            issues.forEach(issue => console.log(`   ${issue}`));
        }

    } catch (error) {
        console.error('❌ Debug failed:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Run the debug script
if (require.main === module) {
    debugGmailIntegration();
}

module.exports = { debugGmailIntegration };
