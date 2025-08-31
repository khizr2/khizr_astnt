const express = require('express');
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken);

// Get goals
router.get('/', async (req, res) => {
    try {
        const { type } = req.query;
        
        let queryText = 'SELECT * FROM goals WHERE user_id = $1';
        const queryParams = [req.user.id];
        
        if (type) {
            queryText += ' AND type = $2';
            queryParams.push(type);
        }
        
        queryText += ' ORDER BY created_at DESC';
        
        const result = await query(queryText, queryParams);
        res.json(result.rows);
    } catch (error) {
        logger.error('Get goals error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create goal
router.post('/', async (req, res) => {
    try {
        const { title, description, type, target_date } = req.body;
        
        if (!title || !type) {
            return res.status(400).json({ error: 'Title and type are required' });
        }
        
        const result = await query(
            'INSERT INTO goals (user_id, title, description, type, target_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [req.user.id, title, description, type, target_date || null]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        logger.error('Create goal error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update goal progress
router.put('/:id/progress', async (req, res) => {
    try {
        const { progress } = req.body;
        
        if (progress < 0 || progress > 100) {
            return res.status(400).json({ error: 'Progress must be between 0 and 100' });
        }
        
        const result = await query(
            'UPDATE goals SET progress = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
            [progress, req.params.id, req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Goal not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Update goal progress error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
