const express = require('express');
const { supabase } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken);

// Get all tags
router.get('/', async (req, res) => {
    try {
        // Get all tags
        const { data: tags, error: tagsError } = await supabase
            .from('tags')
            .select('*')
            .order('name', { ascending: true });

        if (tagsError) {
            logger.error('Error getting tags:', tagsError);
            throw tagsError;
        }

        // Get project and task counts for each tag
        for (let tag of tags) {
            // Get project count
            const { count: projectCount } = await supabase
                .from('project_tags')
                .select('*', { count: 'exact', head: true })
                .eq('tag_id', tag.id)
                .in('project_id',
                    (await supabase
                        .from('projects')
                        .select('id')
                        .eq('user_id', req.user.id)
                    ).data?.map(p => p.id) || []
                );

            // Get task count
            const { count: taskCount } = await supabase
                .from('task_tags')
                .select('*', { count: 'exact', head: true })
                .eq('tag_id', tag.id)
                .in('task_id',
                    (await supabase
                        .from('tasks')
                        .select('id')
                        .eq('user_id', req.user.id)
                    ).data?.map(t => t.id) || []
                );

            tag.project_count = projectCount || 0;
            tag.task_count = taskCount || 0;
        }

        res.json(tags);
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

        const { data: tag, error } = await supabase
            .from('tags')
            .insert({
                name: name.toLowerCase().trim(),
                color: color,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Tag already exists' });
            }
            logger.error('Error creating tag:', error);
            throw error;
        }

        res.status(201).json(tag);
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

        // Check if project exists and belongs to user
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .eq('user_id', req.user.id)
            .single();

        if (projectError && projectError.code !== 'PGRST116') {
            logger.error('Error checking project:', projectError);
            throw projectError;
        }

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Upsert tag
        const { error: tagError } = await supabase
            .from('tags')
            .upsert({
                name: tagName.toLowerCase().trim(),
                created_at: new Date().toISOString()
            }, {
                onConflict: 'name'
            });

        if (tagError) {
            logger.error('Error creating tag:', tagError);
            throw tagError;
        }

        // Get tag ID and create project-tag relationship
        const { data: tag } = await supabase
            .from('tags')
            .select('id')
            .eq('name', tagName.toLowerCase().trim())
            .single();

        if (tag) {
            const { error: relationError } = await supabase
                .from('project_tags')
                .upsert({
                    project_id: projectId,
                    tag_id: tag.id,
                    created_at: new Date().toISOString()
                }, {
                    onConflict: 'project_id,tag_id'
                });

            if (relationError) {
                logger.error('Error creating project-tag relation:', relationError);
                throw relationError;
            }
        }

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

        // Check if task exists and belongs to user
        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('id')
            .eq('id', taskId)
            .eq('user_id', req.user.id)
            .single();

        if (taskError && taskError.code !== 'PGRST116') {
            logger.error('Error checking task:', taskError);
            throw taskError;
        }

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Upsert tag
        const { error: tagError } = await supabase
            .from('tags')
            .upsert({
                name: tagName.toLowerCase().trim(),
                created_at: new Date().toISOString()
            }, {
                onConflict: 'name'
            });

        if (tagError) {
            logger.error('Error creating tag:', tagError);
            throw tagError;
        }

        // Get tag ID and create task-tag relationship
        const { data: tag } = await supabase
            .from('tags')
            .select('id')
            .eq('name', tagName.toLowerCase().trim())
            .single();

        if (tag) {
            const { error: relationError } = await supabase
                .from('task_tags')
                .upsert({
                    task_id: taskId,
                    tag_id: tag.id,
                    created_at: new Date().toISOString()
                }, {
                    onConflict: 'task_id,tag_id'
                });

            if (relationError) {
                logger.error('Error creating task-tag relation:', relationError);
                throw relationError;
            }
        }

        res.status(201).json({ message: 'Tag added to task' });
    } catch (error) {
        logger.error('Add task tag error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
