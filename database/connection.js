const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../utils/logger');

// Check for required environment variables
if (!process.env.SUPABASE_URL) {
    logger.error('SUPABASE_URL environment variable is required');
    throw new Error('SUPABASE_URL environment variable is required');
}

if (!process.env.SUPABASE_ANON_KEY) {
    logger.error('SUPABASE_ANON_KEY environment variable is required');
    throw new Error('SUPABASE_ANON_KEY environment variable is required');
}

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

// Note: The mock query function has been removed.
// All database operations should now use the Supabase client directly.

module.exports = {
    supabase,
    pool: null // Keep for backward compatibility
};
