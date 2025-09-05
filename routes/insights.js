const express = require('express');
const { supabase } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken);

// Get insights
router.get('/', async (req, res) => {
    try {
        // Get task completion insights
        const { data: taskStats, error: taskError } = await supabase
            .from('tasks')
            .select('status, priority')
            .eq('user_id', req.user.id)
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        if (taskError) {
            throw taskError;
        }

        // Calculate insights
        const insights = [];

        // Task completion rate
        const completedTasks = taskStats.filter(t => t.status === 'completed').length;
        const totalTasks = taskStats.length;
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        insights.push({
            title: 'Task Completion Rate',
            value: `${completionRate}%`,
            description: `Completed ${completedTasks} of ${totalTasks} tasks in the last 30 days`
        });

        // Priority distribution
        const urgentTasks = taskStats.filter(t => t.priority >= 4).length;
        insights.push({
            title: 'High Priority Tasks',
            value: urgentTasks,
            description: 'Tasks marked as high priority in the last 30 days'
        });

        // Productivity trend (simple)
        const recentTasks = taskStats.filter(t =>
            new Date(t.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );
        const recentCompleted = recentTasks.filter(t => t.status === 'completed').length;

        insights.push({
            title: 'Weekly Progress',
            value: recentCompleted,
            description: 'Tasks completed in the last 7 days'
        });

        res.json({ success: true, insights });

    } catch (error) {
        logger.error('Get insights error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
