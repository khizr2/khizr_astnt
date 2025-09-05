require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testDatabase() {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    console.log('Testing database connection and schema...');

    // Test agents table
    try {
        const result = await supabase.from('agents').select('id, user_id, type').limit(1);
        console.log('✅ Agents table exists:', !result.error);
        if (result.error) {
            console.log('❌ Error:', result.error.message);
        } else {
            console.log('✅ Sample data:', result.data);
        }
    } catch (err) {
        console.log('❌ Agents table error:', err.message);
    }

    // Test users table
    try {
        const result = await supabase.from('users').select('id, email').limit(1);
        console.log('✅ Users table exists:', !result.error);
        if (result.error) {
            console.log('❌ Error:', result.error.message);
        }
    } catch (err) {
        console.log('❌ Users table error:', err.message);
    }
}

testDatabase().catch(console.error);
