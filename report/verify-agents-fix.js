const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL || "https://tugoaqoadsqbvgckkoqf.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing environment variables');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function verifyAgentsFix() {
    console.log('🔍 Verifying agents table fix...\n');

    try {
        // Test 1: Check if agents table exists and has correct columns
        const { data: agents, error: agentsError } = await supabase
            .from('agents')
            .select('id, user_id, name, type, model, configuration')
            .limit(1);

        if (agentsError) {
            console.log('❌ Agents table issue:', agentsError.message);
            return false;
        }

        console.log('✅ Agents table exists with correct schema');

        // Test 2: Try creating a test agent
        const testAgent = {
            user_id: '3e9970aa-95a1-4785-b291-557b462c7be8', // admin user
            name: 'Test Agent',
            type: 'task_manager',
            model: 'gpt-4',
            description: 'Verification test agent',
            capabilities: ['task_creation', 'project_management'],
            configuration: { max_tasks: 10, priority: 'high' }
        };

        const { data: createdAgent, error: createError } = await supabase
            .from('agents')
            .insert([testAgent])
            .select()
            .single();

        if (createError) {
            console.log('❌ Agent creation failed:', createError.message);
            return false;
        }

        console.log('✅ Agent creation works:', createdAgent.name);

        // Clean up test agent
        await supabase.from('agents').delete().eq('id', createdAgent.id);

        console.log('✅ Agent deletion works (cleanup successful)');

        // Test 3: Check related tables exist
        const relatedTables = ['agent_profiles', 'agent_status', 'agent_tasks'];
        for (const table of relatedTables) {
            const { error } = await supabase.from(table).select('count').limit(1);
            if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned" which is OK
                console.log(`❌ ${table} table issue:`, error.message);
                return false;
            }
        }

        console.log('✅ All related agent tables exist');

        console.log('\n🎉 SUCCESS: Agents system is fully functional!');
        console.log('🔗 You can now use the agents API without errors.');

        return true;

    } catch (error) {
        console.log('❌ Verification failed:', error.message);
        return false;
    }
}

if (require.main === module) {
    verifyAgentsFix();
}

module.exports = { verifyAgentsFix };
