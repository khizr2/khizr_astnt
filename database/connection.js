const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../utils/logger');

// Create Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Test connection
const testConnection = async () => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('count')
            .limit(1);
        
        if (error) {
            logger.error('Supabase connection error:', error);
        } else {
            logger.info('Connected to Supabase database');
        }
    } catch (err) {
        logger.error('Database connection error:', err);
    }
};

// Initialize connection test
testConnection();

// Legacy query function for backward compatibility
const query = async (text, params) => {
    try {
        // For simple queries, we can use the client
        // This is a simplified version - you might want to migrate to Supabase client methods
        const { data, error } = await supabase.rpc('exec_sql', { 
            sql: text, 
            params: params 
        });
        
        if (error) throw error;
        
        return { rows: data };
    } catch (error) {
        logger.error('Query error:', error);
        throw error;
    }
};

module.exports = {
    supabase,
    query,
    pool: null // Keep for backward compatibility
};
