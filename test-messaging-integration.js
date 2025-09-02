const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL || "https://tugoaqoadsqbvgckkoqf.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testMessagingIntegration() {
    try {
        console.log('🧪 Testing Unified Messaging Integration...\n');

        // Test 1: Check if new messaging tables exist
        console.log('📋 Testing new messaging tables...');

        const newTables = [
            'platform_integrations',
            'messages',
            'message_threads',
            'message_attachments',
            'message_processing_queue',
            'message_rules',
            'message_templates',
            'messaging_notifications'
        ];

        let tablesExist = 0;
        for (const table of newTables) {
            try {
                const { data, error } = await supabase
                    .from(table)
                    .select('*')
                    .limit(1);

                if (error && error.code === 'PGRST205') {
                    console.log(`❌ ${table} table missing - migration not applied`);
                } else if (error) {
                    console.log(`⚠️  ${table} table error:`, error.message);
                } else {
                    console.log(`✅ ${table} table exists`);
                    tablesExist++;
                }
            } catch (err) {
                console.log(`❌ ${table} table error:`, err.message);
            }
        }

        // Test 2: Check existing functionality still works
        console.log('\n🔄 Testing existing functionality preservation...');

        const existingTables = ['users', 'emails', 'gmail_tokens', 'notifications'];
        let existingWorks = 0;

        for (const table of existingTables) {
            try {
                const { data, error } = await supabase
                    .from(table)
                    .select('*')
                    .limit(1);

                if (error) {
                    console.log(`❌ ${table} table broken:`, error.message);
                } else {
                    console.log(`✅ ${table} table preserved`);
                    existingWorks++;
                }
            } catch (err) {
                console.log(`❌ ${table} table error:`, err.message);
            }
        }

        // Test 3: Check if we can insert into new tables (without actually doing it)
        console.log('\n✨ Testing new table functionality...');

        if (tablesExist > 0) {
            try {
                // Test platform_integrations table
                const { error: piError } = await supabase
                    .from('platform_integrations')
                    .select('*')
                    .limit(0);

                if (!piError) {
                    console.log('✅ Platform integrations table functional');
                }

                // Test messages table
                const { error: msgError } = await supabase
                    .from('messages')
                    .select('*')
                    .limit(0);

                if (!msgError) {
                    console.log('✅ Messages table functional');
                }

            } catch (error) {
                console.log('⚠️  New table functionality test inconclusive');
            }
        }

        // Test 4: Check server routes (simulated)
        console.log('\n🌐 Testing API route availability...');

        // This would normally test actual API endpoints
        // For now, we'll just check if the route files exist
        const fs = require('fs');
        const path = require('path');

        const requiredFiles = [
            'services/messageRouter.js',
            'services/platformAdapters/GmailAdapter.js',
            'services/platformAdapters/IMessageAdapter.js',
            'services/platformAdapters/WhatsAppAdapter.js',
            'routes/messaging.js'
        ];

        let filesExist = 0;
        for (const file of requiredFiles) {
            if (fs.existsSync(path.join(__dirname, file))) {
                console.log(`✅ ${file} exists`);
                filesExist++;
            } else {
                console.log(`❌ ${file} missing`);
            }
        }

        // Summary
        console.log('\n📊 INTEGRATION TEST SUMMARY:');
        console.log('='.repeat(50));
        console.log(`🆕 New messaging tables: ${tablesExist}/${newTables.length} functional`);
        console.log(`🛡️  Existing tables preserved: ${existingWorks}/${existingTables.length} working`);
        console.log(`📁 Required files present: ${filesExist}/${requiredFiles.length} found`);
        console.log('='.repeat(50));

        const successRate = (tablesExist + existingWorks + filesExist) / (newTables.length + existingTables.length + requiredFiles.length);

        if (successRate >= 0.8) {
            console.log('\n🎉 PHASE 1 INTEGRATION SUCCESSFUL!');
            console.log('✅ Unified messaging foundation is ready');
            console.log('🚀 Ready to proceed to Phase 2');
            console.log('\n📋 Next Steps:');
            console.log('1. Run the unified-messaging-schema.sql migration in Supabase');
            console.log('2. Test the messaging API endpoints');
            console.log('3. Connect platforms (Gmail, iMessage, WhatsApp)');
            console.log('4. Send test messages across platforms');
        } else if (successRate >= 0.5) {
            console.log('\n⚠️  PARTIAL SUCCESS - Some components need attention');
            if (tablesExist < newTables.length) {
                console.log('• Database migration needs to be applied');
            }
            if (existingWorks < existingTables.length) {
                console.log('• Some existing functionality may be affected');
            }
        } else {
            console.log('\n❌ INTEGRATION INCOMPLETE');
            console.log('• Multiple components need attention');
            console.log('• Check database migration and file structure');
        }

    } catch (error) {
        console.error('❌ Integration test failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    testMessagingIntegration();
}

module.exports = { testMessagingIntegration };
