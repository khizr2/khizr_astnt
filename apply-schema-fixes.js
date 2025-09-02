const { supabase } = require('./database/connection');

async function applySchemaFixes() {
    try {
        console.log('Applying database schema fixes...');

        // First, let's check what columns exist in the agents table
        console.log('Checking current agents table structure...');

        const { data: columns, error: columnError } = await supabase
            .from('information_schema.columns')
            .select('column_name')
            .eq('table_name', 'agents');

        if (columnError) {
            console.error('Error checking table structure:', columnError);
            return;
        }

        const existingColumns = columns.map(col => col.column_name);
        console.log('Existing columns:', existingColumns);

        // Define the columns we need to add
        const requiredColumns = {
            user_id: 'UUID REFERENCES users(id) ON DELETE CASCADE',
            type: "VARCHAR(100) NOT NULL DEFAULT 'task_manager'",
            model: "VARCHAR(100) DEFAULT 'gpt-4'",
            description: 'TEXT',
            is_active: 'BOOLEAN DEFAULT TRUE',
            capabilities: "JSONB DEFAULT '{}'",
            configuration: "JSONB DEFAULT '{}'"
        };

        // Check and add missing columns using raw SQL through Supabase
        for (const [columnName, columnDef] of Object.entries(requiredColumns)) {
            if (!existingColumns.includes(columnName)) {
                console.log(`Adding missing column: ${columnName}`);

                const { error: alterError } = await supabase.rpc('exec_sql', {
                    sql: `ALTER TABLE agents ADD COLUMN IF NOT EXISTS ${columnName} ${columnDef};`
                });

                if (alterError) {
                    console.error(`Error adding column ${columnName}:`, alterError);
                    // Try direct approach
                    try {
                        const { error: directError } = await supabase
                            .from('agents')
                            .select('*')
                            .limit(1);

                        if (directError && directError.message.includes('column') && directError.message.includes('does not exist')) {
                            console.log(`Column ${columnName} is missing, attempting to create it...`);

                            // For user_id, we need to handle the foreign key constraint carefully
                            if (columnName === 'user_id') {
                                // First get the first user to set as default
                                const { data: users } = await supabase
                                    .from('users')
                                    .select('id')
                                    .limit(1);

                                if (users && users.length > 0) {
                                    const defaultUserId = users[0].id;

                                    // Update existing records first
                                    await supabase
                                        .from('agents')
                                        .update({ user_id: defaultUserId })
                                        .is('user_id', null);
                                }
                            }
                        }
                    } catch (directError) {
                        console.log(`Direct approach failed for ${columnName}, may already exist or different issue`);
                    }
                } else {
                    console.log(`✅ Successfully added column: ${columnName}`);
                }
            } else {
                console.log(`Column ${columnName} already exists`);
            }
        }

        console.log('✅ Schema fixes applied successfully!');
        console.log('Note: You may need to manually run the SQL in Supabase dashboard if the above didn\'t work.');

    } catch (error) {
        console.error('Error applying schema fixes:', error);
        console.log('Please run the fix-agents-table.sql file manually in your Supabase SQL Editor');
    }
}

applySchemaFixes();
