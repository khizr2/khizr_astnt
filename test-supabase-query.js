require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testSupabaseQuery() {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    console.log('Testing Supabase query with join...');

    try {
        const { data, error } = await supabase
            .from('approvals_queue')
            .select(`
                *,
                agents!inner (
                    id,
                    name,
                    type
                )
            `)
            .eq('status', 'pending')
            .limit(1);

        if (error) {
            console.log('❌ Query error:', error.message);
        } else {
            console.log('✅ Query successful, results:', data.length);
        }
    } catch (err) {
        console.log('❌ Network error:', err.message);
        console.log('❌ Error type:', err.constructor.name);
    }
}

testSupabaseQuery().catch(console.error);
