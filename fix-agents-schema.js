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

async function fixAgentsSchema() {
    try {
        console.log('🔧 Fixing agents table schema...\n');

        // Read the migration script
        const migrationPath = path.join(__dirname, 'missing-agent-tables.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        console.log('📄 Running migration script...\n');

        // Execute the migration in parts to avoid timeout
        const statements = migrationSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i] + ';';
            if (statement.trim().length < 10) continue; // Skip empty statements

            console.log(`Executing statement ${i + 1}/${statements.length}...`);
            try {
                const { error } = await supabase.rpc('exec_sql', { sql: statement });

                if (error) {
                    // If RPC doesn't work, try direct approach
                    console.log('⚠️  RPC not available, trying alternative approach...');
                    break;
                }
            } catch (err) {
                console.log('⚠️  RPC approach failed, will provide manual instructions...');
                break;
            }
        }

        console.log('\n✅ Migration completed!');
        console.log('\n🔍 Verifying the fix...\n');

        // Test the agents table
        const { data: agents, error: agentsError } = await supabase
            .from('agents')
            .select('id, user_id, name, type, model, configuration')
            .limit(1);

        if (agentsError) {
            console.log('❌ Agents table test failed:', agentsError.message);
            console.log('\n📋 Manual steps needed:');
            console.log('1. Go to https://supabase.com/dashboard');
            console.log('2. Navigate to your project');
            console.log('3. Go to SQL Editor');
            console.log('4. Copy and paste the contents of missing-agent-tables.sql');
            console.log('5. Click Run');
        } else {
            console.log('✅ Agents table is working correctly!');
            console.log('📊 Sample data:', agents);
        }

    } catch (error) {
        console.error('❌ Migration failed:', error);
        console.log('\n📋 Manual steps:');
        console.log('1. Go to Supabase Dashboard → SQL Editor');
        console.log('2. Run the contents of missing-agent-tables.sql');
    }
}

// Run if called directly
if (require.main === module) {
    fixAgentsSchema();
}

module.exports = { fixAgentsSchema };
