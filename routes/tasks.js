const express = require('express');
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken);

// Get all tasks
router.get('/', async (req, res) => {
    try {
        const { status, priority, project_id, limit = 50, offset = 0 } = req.query;
        
        let queryText = `
            SELECT t.*, p.title as project_title 
            FROM tasks t 
            LEFT JOIN projects p ON t.project_id = p.id 
            WHERE t.user_id = $1
        `;
        let queryParams = [req.user.id];
        let paramCount = 1;

        if (status) {
            queryText += ` AND t.status = $${++paramCount}`;
            queryParams.push(status);
        }

        if (priority) {
            queryText += ` AND t.priority = $${++paramCount}`;
            queryParams.push(priority);
        }

        if (project_id) {
            queryText += ` AND t.project_id = $${++paramCount}`;
            queryParams.push(project_id);
        }

        queryText += ` ORDER BY t.priority ASC, t.created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        queryParams.push(limit, offset);

        const result = await query(queryText, queryParams);
        res.json(result.rows);

    } catch (error) {
        logger.error('Get tasks error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create task
router.post('/', async (req, res) => {
    try {
        const { 
            title, description, priority = 3, project_id, 
            estimated_duration, deadline, source = 'manual' 
        } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const result = await query(
            `INSERT INTO tasks (user_id, title, description, priority, project_id, estimated_duration, deadline, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [req.user.id, title, description, priority, project_id || null, 
             estimated_duration || null, deadline || null, source]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        logger.error('Create task error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update task
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        const allowedUpdates = ['title', 'description', 'priority', 'status', 'project_id', 'estimated_duration', 'deadline'];
        const updateFields = [];
        const updateValues = [];
        let paramCount = 1;

        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                updateFields.push(`${key} = $${++paramCount}`);
                updateValues.push(updates[key]);
            }
        });

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
        
        if (updates.status === 'completed') {
            updateFields.push(`completed_at = CURRENT_TIMESTAMP`);
        }

        const queryText = `
            UPDATE tasks 
            SET ${updateFields.join(', ')} 
            WHERE id = $1 AND user_id = $${++paramCount}
            RETURNING *
        `;
        
        const result = await query(queryText, [id, ...updateValues, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        logger.error('Update task error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete task
router.delete('/:id', async (req, res) => {
    try {
        const result = await query(
            'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json({ message: 'Task deleted successfully' });

    } catch (error) {
        logger.error('Delete task error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
