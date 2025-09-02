const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

// Supabase connection
const SUPABASE_URL = process.env.SUPABASE_URL || "https://tugoaqoadsqbvgckkoqf.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runUnifiedMessagingMigration() {
    try {
        console.log('🚀 Starting Unified Messaging Migration...\n');

        // Read the migration script
        const migrationPath = path.join(__dirname, 'unified-messaging-schema.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        console.log('📄 Migration script loaded');
        console.log('📊 Analyzing SQL statements...\n');

        // Split into individual statements
        const statements = migrationSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0)
            .filter(stmt => !stmt.startsWith('--')); // Remove comments

        console.log(`Found ${statements.length} SQL statements to execute\n`);

        // Execute statements in batches to avoid timeouts
        const batchSize = 10;
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < statements.length; i += batchSize) {
            const batch = statements.slice(i, i + batchSize);
            console.log(`\n📦 Executing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(statements.length/batchSize)} (${batch.length} statements)`);

            for (let j = 0; j < batch.length; j++) {
                const statement = batch[j] + ';';
                const statementNum = i + j + 1;

                try {
                    // Try using RPC if available, otherwise provide manual instructions
                    const { error } = await supabase.rpc('exec_sql', {
                        sql: statement
                    });

                    if (error) {
                        // RPC not available, provide manual instructions
                        console.log(`\n⚠️  Automatic migration not available. Please run the migration manually:`);
                        console.log('1. Go to https://supabase.com/dashboard');
                        console.log('2. Navigate to your project');
                        console.log('3. Go to SQL Editor');
                        console.log('4. Copy and paste the entire contents of unified-messaging-schema.sql');
                        console.log('5. Click "Run"');
                        console.log('\n📄 Migration script location:', migrationPath);
                        return;
                    }

                    successCount++;
                    console.log(`  ✅ Statement ${statementNum}/${statements.length} executed`);

                } catch (err) {
                    console.log(`  ❌ Statement ${statementNum} failed:`, err.message);
                    errorCount++;

                    // If it's a non-critical error, continue
                    if (err.message.includes('already exists') ||
                        err.message.includes('does not exist')) {
                        console.log(`     Continuing (non-critical error)`);
                    } else {
                        throw err;
                    }
                }

                // Small delay between statements
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(`\n📊 Migration Results:`);
        console.log(`  ✅ Successful statements: ${successCount}`);
        console.log(`  ❌ Failed statements: ${errorCount}`);
        console.log(`  📊 Total statements: ${statements.length}`);

        if (errorCount === 0) {
            console.log('\n🎉 MIGRATION COMPLETED SUCCESSFULLY!');
        } else if (successCount > errorCount) {
            console.log('\n⚠️  MIGRATION COMPLETED WITH SOME ERRORS');
            console.log('Some statements may need manual review');
        } else {
            console.log('\n❌ MIGRATION FAILED');
            console.log('Please check the errors above and try manual execution');
        }

        // Verify the migration
        console.log('\n🔍 Verifying migration...');
        await verifyMigration();

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        console.log('\n📋 Manual execution instructions:');
        console.log('1. Go to Supabase Dashboard → SQL Editor');
        console.log('2. Copy contents of unified-messaging-schema.sql');
        console.log('3. Click "Run"');
        process.exit(1);
    }
}

async function verifyMigration() {
    try {
        console.log('Testing new unified messaging tables...\n');

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

        let createdCount = 0;
        for (const table of newTables) {
            try {
                const { data, error } = await supabase
                    .from(table)
                    .select('*')
                    .limit(1);

                if (error && error.code === 'PGRST205') {
                    console.log(`❌ ${table} table creation failed`);
                } else if (error) {
                    console.log(`⚠️  ${table} table error:`, error.message);
                } else {
                    console.log(`✅ ${table} table created successfully`);
                    createdCount++;
                }
            } catch (err) {
                console.log(`❌ ${table} table creation failed:`, err.message);
            }
        }

        // Test existing functionality still works
        console.log('\nTesting existing functionality preservation...\n');

        const existingTables = ['users', 'emails', 'gmail_tokens', 'notifications'];
        let preservedCount = 0;

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
                    preservedCount++;
                }
            } catch (err) {
                console.log(`❌ ${table} table broken:`, err.message);
            }
        }

        console.log(`\n📊 Verification Results:`);
        console.log(`  🆕 New tables created: ${createdCount}/${newTables.length}`);
        console.log(`  🛡️  Existing tables preserved: ${preservedCount}/${existingTables.length}`);

        if (createdCount === newTables.length && preservedCount === existingTables.length) {
            console.log('\n🎉 PHASE 1 MIGRATION SUCCESSFUL!');
            console.log('✅ Unified messaging foundation is ready');
            console.log('✅ Existing functionality preserved');
            console.log('🚀 Ready to proceed to Phase 2');
        } else {
            console.log('\n⚠️  MIGRATION INCOMPLETE');
            if (createdCount < newTables.length) {
                console.log('Some new tables may not have been created properly');
            }
            if (preservedCount < existingTables.length) {
                console.log('Some existing functionality may be broken');
            }
        }

    } catch (error) {
        console.error('Verification failed:', error);
    }
}

// Run if called directly
if (require.main === module) {
    runUnifiedMessagingMigration();
}

module.exports = { runUnifiedMessagingMigration, verifyMigration };
