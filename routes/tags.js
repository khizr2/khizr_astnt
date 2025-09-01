const express = require('express');
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken);

// Get all tags
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT t.*, 
                   COUNT(DISTINCT pt.project_id) as project_count,
                   COUNT(DISTINCT tt.task_id) as task_count
            FROM tags t
            LEFT JOIN project_tags pt ON t.id = pt.tag_id
            LEFT JOIN task_tags tt ON t.id = tt.tag_id
            LEFT JOIN projects p ON pt.project_id = p.id AND p.user_id = $1
            LEFT JOIN tasks task ON tt.task_id = task.id AND task.user_id = $1
            GROUP BY t.id
            ORDER BY t.name ASC
        `, [req.user.id]);

        res.json(result.rows);
    } catch (error) {
        logger.error('Get tags error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create tag
router.post('/', async (req, res) => {
    try {
        const { name, color = '#8B5CF6' } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Tag name is required' });
        }

        const result = await query(
            'INSERT INTO tags (name, color) VALUES ($1, $2) RETURNING *',
            [name.toLowerCase().trim(), color]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Tag already exists' });
        }
        logger.error('Create tag error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add tag to project
router.post('/project/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { tagName } = req.body;

        if (!tagName) {
            return res.status(400).json({ error: 'Tag name is required' });
        }

        const projectCheck = await query(
            'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
            [projectId, req.user.id]
        );

        if (projectCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        await query(
            'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
            [tagName.toLowerCase().trim()]
        );

        await query(`
            INSERT INTO project_tags (project_id, tag_id)
            SELECT $1, id FROM tags WHERE name = $2
            ON CONFLICT DO NOTHING
        `, [projectId, tagName.toLowerCase().trim()]);

        res.status(201).json({ message: 'Tag added to project' });
    } catch (error) {
        logger.error('Add project tag error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add tag to task
router.post('/task/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        const { tagName } = req.body;

        if (!tagName) {
            return res.status(400).json({ error: 'Tag name is required' });
        }

        const taskCheck = await query(
            'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
            [taskId, req.user.id]
        );

        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        await query(
            'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
            [tagName.toLowerCase().trim()]
        );

        await query(`
            INSERT INTO task_tags (task_id, tag_id)
            SELECT $1, id FROM tags WHERE name = $2
            ON CONFLICT DO NOTHING
        `, [taskId, tagName.toLowerCase().trim()]);

        res.status(201).json({ message: 'Tag added to task' });
    } catch (error) {
        logger.error('Add task tag error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
