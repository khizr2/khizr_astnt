const express = require('express');
const { supabase } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken);

// Get all projects with hierarchical structure
router.get('/', async (req, res) => {
    try {
        const { category, include_subprojects, include_tasks } = req.query;
        
        let queryBuilder = supabase
            .from('projects')
            .select('*')
            .eq('user_id', req.user.id)
            .is('parent_project_id', null)
            .order('priority', { ascending: true })
            .order('created_at', { ascending: false });

        if (category && category !== 'all') {
            queryBuilder = queryBuilder.eq('category', category);
        }

        const { data: projects, error } = await queryBuilder;

        if (error) {
            logger.error('Error fetching projects:', error);
            throw error;
        }

        // Get additional data for each project
        for (let project of projects) {
            // Get subproject count
            const { count: subprojectCount } = await supabase
                .from('projects')
                .select('*', { count: 'exact', head: true })
                .eq('parent_project_id', project.id);

            project.subproject_count = subprojectCount || 0;

            // Get task counts
            const { data: tasks } = await supabase
                .from('tasks')
                .select('status')
                .eq('project_id', project.id);

            project.direct_task_count = tasks.length;
            project.completed_tasks = tasks.filter(t => t.status === 'completed').length;

            // Get tags (simplified - we'll get tags separately if needed)
            project.tags = [];
        }

        if (include_subprojects === 'true' || include_tasks === 'true') {
            for (let project of projects) {
                if (include_subprojects === 'true') {
                    const { data: subprojects, error: subError } = await supabase
                        .from('projects')
                        .select('*')
                        .eq('parent_project_id', project.id)
                        .eq('user_id', req.user.id)
                        .order('priority', { ascending: true })
                        .order('created_at', { ascending: false });

                    if (subError) {
                        logger.error('Error fetching subprojects:', subError);
                        throw subError;
                    }

                    // Get task counts for each subproject
                    for (let subproject of subprojects) {
                        const { data: tasks } = await supabase
                            .from('tasks')
                            .select('status')
                            .eq('project_id', subproject.id);

                        subproject.task_count = tasks.length;
                        subproject.completed_tasks = tasks.filter(t => t.status === 'completed').length;
                        subproject.tags = [];
                    }

                    project.subprojects = subprojects;
                }

                if (include_tasks === 'true') {
                    const { data: tasks, error: taskError } = await supabase
                        .from('tasks')
                        .select('*')
                        .eq('project_id', project.id)
                        .eq('user_id', req.user.id)
                        .order('priority', { ascending: true })
                        .order('created_at', { ascending: false })
                        .limit(5);

                    if (taskError) {
                        logger.error('Error fetching tasks:', taskError);
                        throw taskError;
                    }

                    // Add tags to tasks (simplified)
                    for (let task of tasks) {
                        task.tags = [];
                    }

                    project.tasks = tasks;
                }
            }
        }

        res.json(projects);
    } catch (error) {
        logger.error('Get projects error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get project by ID with full hierarchy
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: project, error } = await supabase
            .from('projects')
            .select(`
                *,
                parent:parent_project_id(title)
            `)
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('Error getting project:', error);
            throw error;
        }

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Add parent title if exists
        if (project.parent) {
            project.parent_title = project.parent.title;
        }

        project.tags = [];

        if (!project.parent_project_id) {
            const { data: subprojects, error: subError } = await supabase
                .from('projects')
                .select('*')
                .eq('parent_project_id', id)
                .eq('user_id', req.user.id)
                .order('priority', { ascending: true });

            if (subError) {
                logger.error('Error getting subprojects:', subError);
                throw subError;
            }

            // Get task counts for subprojects
            for (let subproject of subprojects) {
                const { data: tasks } = await supabase
                    .from('tasks')
                    .select('status')
                    .eq('project_id', subproject.id);

                subproject.task_count = tasks.length;
                subproject.completed_tasks = tasks.filter(t => t.status === 'completed').length;
            }

            project.subprojects = subprojects;
        }

        const { data: tasks, error: taskError } = await supabase
            .from('tasks')
            .select('*')
            .eq('project_id', id)
            .eq('user_id', req.user.id)
            .order('priority', { ascending: true })
            .order('created_at', { ascending: false });

        if (taskError) {
            logger.error('Error getting tasks:', taskError);
            throw taskError;
        }

        // Add tags to tasks (simplified)
        for (let task of tasks) {
            task.tags = [];
        }

        project.tasks = tasks;

        res.json(project);
    } catch (error) {
        logger.error('Get project by ID error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create project
router.post('/', async (req, res) => {
    try {
        const { 
            title, 
            description, 
            priority = 3, 
            category = 'personal',
            project_type = 'project',
            parent_project_id,
            deadline,
            tags = []
        } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        if (parent_project_id) {
            const { data: parentProject, error: parentError } = await supabase
                .from('projects')
                .select('id')
                .eq('id', parent_project_id)
                .eq('user_id', req.user.id)
                .single();

            if (parentError && parentError.code !== 'PGRST116') {
                logger.error('Error checking parent project:', parentError);
                throw parentError;
            }

            if (!parentProject) {
                return res.status(400).json({ error: 'Parent project not found' });
            }
        }

        const { data: project, error: insertError } = await supabase
            .from('projects')
            .insert({
                user_id: req.user.id,
                title,
                description,
                priority,
                category,
                project_type,
                parent_project_id: parent_project_id || null,
                deadline: deadline || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) {
            logger.error('Error creating project:', insertError);
            throw insertError;
        }

        if (tags.length > 0) {
            for (const tagName of tags) {
                // Upsert tag
                const { error: tagError } = await supabase
                    .from('tags')
                    .upsert({
                        name: tagName
                    }, {
                        onConflict: 'name'
                    });

                if (tagError) {
                    logger.error('Error creating tag:', tagError);
                    throw tagError;
                }

                // Get tag ID and create project_tag relationship
                const { data: tag } = await supabase
                    .from('tags')
                    .select('id')
                    .eq('name', tagName)
                    .single();

                if (tag) {
                    const { error: relationError } = await supabase
                        .from('project_tags')
                        .upsert({
                            project_id: project.id,
                            tag_id: tag.id
                        }, {
                            onConflict: 'project_id,tag_id'
                        });

                    if (relationError) {
                        logger.error('Error creating project-tag relation:', relationError);
                        throw relationError;
                    }
                }
            }
        }

        res.status(201).json(project);
    } catch (error) {
        logger.error('Create project error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get categories
router.get('/meta/categories', async (req, res) => {
    try {
        const result = await query(`
            SELECT category, COUNT(*)::int as count
            FROM projects 
            WHERE user_id = $1 AND parent_project_id IS NULL
            GROUP BY category
            ORDER BY count DESC
        `, [req.user.id]);

        res.json(result.rows);
    } catch (error) {
        logger.error('Get categories error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update project
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, priority, deadline, status, category } = req.body;

        const updateFields = [];
        const values = [req.user.id, id];
        let paramCount = 2;

        if (name !== undefined) {
            updateFields.push(`title = $${++paramCount}`);
            values.push(name);
        }
        if (description !== undefined) {
            updateFields.push(`description = $${++paramCount}`);
            values.push(description);
        }
        if (priority !== undefined) {
            updateFields.push(`priority = $${++paramCount}`);
            values.push(priority);
        }
        if (deadline !== undefined) {
            updateFields.push(`deadline = $${++paramCount}`);
            values.push(deadline ? new Date(deadline) : null);
        }
        if (status !== undefined) {
            updateFields.push(`status = $${++paramCount}`);
            values.push(status);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

        const updateQuery = `
            UPDATE projects
            SET ${updateFields.join(', ')}
            WHERE id = $2 AND user_id = $1
            RETURNING *
        `;

        const result = await query(updateQuery, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        logger.info(`Project ${id} updated by user ${req.user.id}`);
        res.json({
            success: true,
            project: result.rows[0]
        });

    } catch (error) {
        logger.error('Update project error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete project
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if project exists and belongs to user
        const projectResult = await query(
            'SELECT id, title FROM projects WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Delete project (cascade will handle related records)
        await query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [id, req.user.id]);

        logger.info(`Project ${id} deleted by user ${req.user.id}`);
        res.json({
            success: true,
            message: 'Project deleted successfully'
        });

    } catch (error) {
        logger.error('Delete project error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
