const express = require('express');
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken);

// Get all projects with hierarchical structure
router.get('/', async (req, res) => {
    try {
        const { category, include_subprojects, include_tasks } = req.query;
        
        let whereClause = 'WHERE p.user_id = $1';
        let queryParams = [req.user.id];
        let paramCount = 1;

        if (category && category !== 'all') {
            whereClause += ` AND p.category = $${++paramCount}`;
            queryParams.push(category);
        }

        let projectQuery = `
            SELECT p.*, 
                   COUNT(DISTINCT sp.id)::int as subproject_count,
                   COUNT(DISTINCT t.id)::int as direct_task_count,
                   COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END)::int as completed_tasks,
                   array_agg(DISTINCT tag.name) FILTER (WHERE tag.name IS NOT NULL) as tags
            FROM projects p 
            LEFT JOIN projects sp ON p.id = sp.parent_project_id 
            LEFT JOIN tasks t ON p.id = t.project_id 
            LEFT JOIN project_tags pt ON p.id = pt.project_id
            LEFT JOIN tags tag ON pt.tag_id = tag.id
            ${whereClause} AND p.parent_project_id IS NULL
            GROUP BY p.id 
            ORDER BY p.priority ASC, p.created_at DESC
        `;

        const projects = await query(projectQuery, queryParams);

        if (include_subprojects === 'true' || include_tasks === 'true') {
            for (let project of projects.rows) {
                if (include_subprojects === 'true') {
                    const subprojects = await query(`
                        SELECT sp.*, 
                               COUNT(DISTINCT t.id)::int as task_count,
                               COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END)::int as completed_tasks,
                               array_agg(DISTINCT tag.name) FILTER (WHERE tag.name IS NOT NULL) as tags
                        FROM projects sp
                        LEFT JOIN tasks t ON sp.id = t.project_id
                        LEFT JOIN project_tags pt ON sp.id = pt.project_id
                        LEFT JOIN tags tag ON pt.tag_id = tag.id
                        WHERE sp.parent_project_id = $1 AND sp.user_id = $2
                        GROUP BY sp.id
                        ORDER BY sp.priority ASC, sp.created_at DESC
                    `, [project.id, req.user.id]);
                    
                    project.subprojects = subprojects.rows;
                }

                if (include_tasks === 'true') {
                    const tasks = await query(`
                        SELECT t.*, 
                               array_agg(DISTINCT tag.name) FILTER (WHERE tag.name IS NOT NULL) as tags
                        FROM tasks t
                        LEFT JOIN task_tags tt ON t.id = tt.task_id
                        LEFT JOIN tags tag ON tt.tag_id = tag.id
                        WHERE t.project_id = $1 AND t.user_id = $2
                        GROUP BY t.id
                        ORDER BY t.priority ASC, t.created_at DESC
                        LIMIT 5
                    `, [project.id, req.user.id]);
                    
                    project.tasks = tasks.rows;
                }
            }
        }

        res.json(projects.rows);
    } catch (error) {
        logger.error('Get projects error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get project by ID with full hierarchy
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const projectResult = await query(`
            SELECT p.*,
                   parent.title as parent_title,
                   array_agg(DISTINCT tag.name) FILTER (WHERE tag.name IS NOT NULL) as tags
            FROM projects p
            LEFT JOIN projects parent ON p.parent_project_id = parent.id
            LEFT JOIN project_tags pt ON p.id = pt.project_id
            LEFT JOIN tags tag ON pt.tag_id = tag.id
            WHERE p.id = $1 AND p.user_id = $2
            GROUP BY p.id, parent.title
        `, [id, req.user.id]);

        if (projectResult.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const project = projectResult.rows[0];

        if (!project.parent_project_id) {
            const subprojects = await query(`
                SELECT sp.*, 
                       COUNT(DISTINCT t.id)::int as task_count,
                       COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END)::int as completed_tasks
                FROM projects sp
                LEFT JOIN tasks t ON sp.id = t.project_id
                WHERE sp.parent_project_id = $1 AND sp.user_id = $2
                GROUP BY sp.id
                ORDER BY sp.priority ASC
            `, [id, req.user.id]);
            
            project.subprojects = subprojects.rows;
        }

        const tasks = await query(`
            SELECT t.*,
                   array_agg(DISTINCT tag.name) FILTER (WHERE tag.name IS NOT NULL) as tags
            FROM tasks t
            LEFT JOIN task_tags tt ON t.id = tt.task_id
            LEFT JOIN tags tag ON tt.tag_id = tag.id
            WHERE t.project_id = $1 AND t.user_id = $2
            GROUP BY t.id
            ORDER BY t.priority ASC, t.created_at DESC
        `, [id, req.user.id]);
        
        project.tasks = tasks.rows;

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
            const parentCheck = await query(
                'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
                [parent_project_id, req.user.id]
            );
            
            if (parentCheck.rows.length === 0) {
                return res.status(400).json({ error: 'Parent project not found' });
            }
        }

        const result = await query(
            `INSERT INTO projects (user_id, title, description, priority, category, project_type, parent_project_id, deadline) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [req.user.id, title, description, priority, category, project_type, parent_project_id || null, deadline || null]
        );

        const project = result.rows[0];

        if (tags.length > 0) {
            for (const tagName of tags) {
                await query(
                    'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
                    [tagName]
                );
                
                await query(`
                    INSERT INTO project_tags (project_id, tag_id)
                    SELECT $1, id FROM tags WHERE name = $2
                    ON CONFLICT DO NOTHING
                `, [project.id, tagName]);
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
