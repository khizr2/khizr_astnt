const express = require('express');
const { supabase } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken);

// Get all tasks
router.get('/', async (req, res) => {
    try {
        const { status, priority, project_id, limit = 50, offset = 0 } = req.query;

        let query = supabase
            .from('tasks')
            .select(`
                *,
                projects (
                    title
                )
            `)
            .eq('user_id', req.user.id)
            .order('priority', { ascending: true })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status) {
            query = query.eq('status', status);
        }

        if (priority) {
            query = query.eq('priority', parseInt(priority));
        }

        if (project_id) {
            query = query.eq('project_id', project_id);
        }

        const { data: tasks, error } = await query;

        if (error) {
            throw error;
        }

        res.json(tasks);

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

        const { data: task, error } = await supabase
            .from('tasks')
            .insert([{
                user_id: req.user.id,
                title,
                description,
                priority,
                project_id: project_id || null,
                estimated_duration: estimated_duration || null,
                deadline: deadline || null,
                source
            }])
            .select()
            .single();

        if (error) {
            throw error;
        }

        res.status(201).json(task);

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
        const updateData = {};

        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                updateData[key] = updates[key];
            }
        });

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        updateData.updated_at = new Date().toISOString();

        if (updates.status === 'completed') {
            updateData.completed_at = new Date().toISOString();
        }

        const { data: task, error } = await supabase
            .from('tasks')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Task not found' });
            }
            throw error;
        }

        res.json(task);

    } catch (error) {
        logger.error('Update task error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete task
router.delete('/:id', async (req, res) => {
    try {
        const { data: deletedTask, error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Task not found' });
            }
            throw error;
        }

        res.json({ message: 'Task deleted successfully' });

    } catch (error) {
        logger.error('Delete task error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
