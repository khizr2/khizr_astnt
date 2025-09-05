const { supabase } = require('../database/connection');
const { logger } = require('../utils/logger');

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        // Verify with Supabase auth
        const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);

        if (error || !supabaseUser) {
            logger.error('Supabase auth verification failed:', error);
            return res.status(403).json({ error: 'Invalid or expired token' });
        }

        // Set user info from Supabase
        req.user = {
            id: supabaseUser.id,
            email: supabaseUser.email,
            name: supabaseUser.user_metadata?.name || supabaseUser.email
        };

        next();
    } catch (error) {
        logger.error('Token verification failed:', error);
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

module.exports = { authenticateToken };
