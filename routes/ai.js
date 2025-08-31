const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken);

// Get AI insights
router.get('/insights', async (req, res) => {
    try {
        // Get productivity insights
        const tasksResult = await query(`
            SELECT 
                status,
                COUNT(*)::int as count,
                AVG(priority) as avg_priority
            FROM tasks 
            WHERE user_id = $1 
            AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY status
        `, [req.user.id]);

        const overdueResult = await query(`
            SELECT COUNT(*)::int as count
            FROM tasks 
            WHERE user_id = $1 
            AND deadline < NOW() 
            AND status != 'completed'
        `, [req.user.id]);

        const insights = {
            tasksByStatus: tasksResult.rows,
            overdueTasks: parseInt(overdueResult.rows[0]?.count || 0),
            recommendations: generateRecommendations(tasksResult.rows)
        };

        res.json(insights);
    } catch (error) {
        logger.error('Insights generation error:', error);
        res.status(500).json({ error: 'Failed to generate insights' });
    }
});

function generateRecommendations(taskData) {
    const recommendations = [];
    
    const completed = taskData.find(t => t.status === 'completed')?.count || 0;
    const pending = taskData.find(t => t.status === 'pending')?.count || 0;
    
    if (pending > completed * 2) {
        recommendations.push('You have many pending tasks. Consider breaking them into smaller, actionable items.');
    }
    
    if (completed === 0) {
        recommendations.push('Try completing some quick tasks to build momentum.');
    }
    
    return recommendations;
}

module.exports = router;
