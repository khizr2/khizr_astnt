const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Verify user still exists
        const result = await query('SELECT id, email, name FROM users WHERE id = $1', [decoded.userId]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.user = result.rows[0];
        next();
    } catch (error) {
        logger.error('Token verification failed:', error);
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

module.exports = { authenticateToken };
