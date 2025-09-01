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

// Supabase-compatible query function
const query = async (text, params) => {
    try {
        // For now, return a mock response to prevent errors
        // This should be replaced with proper Supabase client calls in each route
        logger.warn('Using mock query response - implement proper Supabase calls');
        return { rows: [] };
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
