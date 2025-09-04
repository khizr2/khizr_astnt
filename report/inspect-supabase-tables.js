require('dotenv').config();
const { supabase } = require('./database/connection');

async function inspectSupabaseTables() {
    try {
        console.log('🔍 Inspecting Supabase tables...\n');

        // Query to get table structure from information_schema
        const { data: columns, error } = await supabase
            .rpc('get_table_columns', { table_name: 'users' });

        if (error) {
            console.log('❌ RPC function not available, trying direct query...');

            // Alternative: Try to get column info using a raw query
            const { data: tableInfo, error: tableError } = await supabase
                .from('users')
                .select('*')
                .limit(1);

            if (tableError) {
                console.error('❌ Error querying users table:', tableError);
                return;
            }

            if (tableInfo && tableInfo.length > 0) {
                console.log('📋 Users table columns (from data):');
                Object.keys(tableInfo[0]).forEach((column, index) => {
                    console.log(`${index + 1}. ${column}`);
                });
            } else {
                console.log('📋 Users table exists but is empty');
                // Try to get column info from a test insert (won't actually insert)
                console.log('🔄 Getting column info...');
            }
        } else {
            console.log('📋 Users table structure:');
            columns.forEach((col, index) => {
                console.log(`${index + 1}. ${col.column_name} (${col.data_type})`);
            });
        }

        // Also show actual user data
        console.log('\n👤 Actual user records:');
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('*');

        if (usersError) {
            console.error('❌ Error getting user records:', usersError);
        } else {
            users.forEach((user, index) => {
                console.log(`\n--- User ${index + 1} ---`);
                Object.keys(user).forEach(key => {
                    if (key === 'password_hash') {
                        console.log(`${key}: [HIDDEN - ${user[key]?.length || 0} chars]`);
                    } else {
                        console.log(`${key}: ${user[key]}`);
                    }
                });
            });
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Run if called directly
if (require.main === module) {
    inspectSupabaseTables();
}

module.exports = { inspectSupabaseTables };
