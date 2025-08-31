const express = require('express');
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken);

// Get all projects
router.get('/', async (req, res) => {
    try {
        const result = await query(
            `SELECT p.*, 
                    COUNT(t.id)::int as task_count,
                    COUNT(CASE WHEN t.status = 'completed' THEN 1 END)::int as completed_tasks
             FROM projects p 
             LEFT JOIN tasks t ON p.id = t.project_id 
             WHERE p.user_id = $1 
             GROUP BY p.id 
             ORDER BY p.priority ASC, p.created_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (error) {
        logger.error('Get projects error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create project
router.post('/', async (req, res) => {
    try {
        const { title, description, priority = 3, deadline } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const result = await query(
            'INSERT INTO projects (user_id, title, description, priority, deadline) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [req.user.id, title, description, priority, deadline || null]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        logger.error('Create project error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
