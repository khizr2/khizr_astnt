const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase connection details from the old file
const SUPABASE_URL = "https://tugoaqoadsqbvgckkoqf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1Z29hcW9hZHNxYnZnY2trb3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NzkyMTAsImV4cCI6MjA3MjI1NTIxMH0.WU3b_pnTungZgPDcBhEVEzVugJYdIvMu_cE-zhGjvP4";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkExistingTables() {
    try {
        console.log('🔍 Checking existing agent tables in Supabase...\n');

        // Agent tables we expect based on schema.sql
        const expectedAgentTables = [
            'agents',
            'agent_profiles',
            'agent_tasks',
            'agent_status',
            'agent_conversations',
            'agent_tools',
            'agent_permissions',
            'agent_logs',
            'agent_analytics',
            'approvals_queue',
            'approval_history',
            'agent_metrics'
        ];

        console.log('🤖 Checking agent-related tables:');

        // Test each table by trying to select from it
        const existingTables = [];
        const missingTables = [];

        for (const tableName of expectedAgentTables) {
            try {
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .limit(1);

                if (error && error.code === 'PGRST205') {
                    // Table doesn't exist
                    missingTables.push(tableName);
                    console.log(`  ❌ ${tableName} - MISSING`);
                } else {
                    // Table exists (or we got a different error, but assume it exists)
                    existingTables.push(tableName);
                    console.log(`  ✅ ${tableName} - EXISTS`);
                }
            } catch (err) {
                missingTables.push(tableName);
                console.log(`  ❌ ${tableName} - MISSING`);
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`  ✅ Existing tables: ${existingTables.length}`);
        console.log(`  ❌ Missing tables: ${missingTables.length}`);

        if (missingTables.length > 0) {
            console.log('\n🚨 Missing tables that need to be created:');
            missingTables.forEach(table => {
                console.log(`  - ${table}`);
            });

            // Read schema.sql to get the CREATE statements for missing tables
            const fs = require('fs');
            const path = require('path');
            const schemaPath = path.join(__dirname, 'database', 'schema.sql');

            if (fs.existsSync(schemaPath)) {
                console.log('\n📄 Reading schema.sql to extract missing table definitions...');
                const schemaContent = fs.readFileSync(schemaPath, 'utf8');

                // Create a script to create missing tables
                const createStatements = [];
                for (const missingTable of missingTables) {
                    const tableRegex = new RegExp(`CREATE TABLE ${missingTable}[\\s\\S]*?;`, 'i');
                    const match = schemaContent.match(tableRegex);
                    if (match) {
                        createStatements.push(match[0]);
                    }
                }

                if (createStatements.length > 0) {
                    console.log('\n🛠️  Creating migration script for missing tables...');
                    const migrationScript = createStatements.join('\n\n');
                    const migrationPath = path.join(__dirname, 'missing-agent-tables.sql');

                    fs.writeFileSync(migrationPath, migrationScript);
                    console.log(`📝 Migration script saved to: ${migrationPath}`);
                    console.log('\n⚠️  Run this SQL script in your Supabase dashboard to create the missing tables.');
                }
            }
        } else {
            console.log('\n✅ All agent tables already exist!');
        }

    } catch (error) {
        console.error('❌ Error checking schema:', error);
    }
}

// Run the check
checkExistingTables();
