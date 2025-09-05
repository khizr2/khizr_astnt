const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { supabase } = require('../database/connection');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken);

// Get AI insights
router.get('/insights', async (req, res) => {
    try {
        // Get productivity insights
        const { data: tasksResult, error: tasksError } = await supabase
            .from('tasks')
            .select('status, priority')
            .eq('user_id', req.user.id)
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        if (tasksError) {
            throw tasksError;
        }

        const { data: overdueResult, error: overdueError } = await supabase
            .from('tasks')
            .select('id', { count: 'exact' })
            .eq('user_id', req.user.id)
            .lt('deadline', new Date().toISOString())
            .neq('status', 'completed');

        if (overdueError) {
            throw overdueError;
        }

        const insights = {
            tasksByStatus: tasksResult,
            overdueTasks: overdueResult?.length || 0,
            recommendations: generateRecommendations(tasksResult)
        };

        res.json(insights);
    } catch (error) {
        logger.error('Insights generation error:', error);
        res.status(500).json({ error: 'Failed to generate insights' });
    }
});

// Process AI note
router.post('/process-note', async (req, res) => {
    try {
        const { note } = req.body;

        if (!note) {
            return res.status(400).json({ error: 'Note is required' });
        }

        // For now, just acknowledge receipt without storing in database
        // The mind_notes table may not exist yet
        // In a real implementation, this would process the note with AI

        logger.info(`Processing AI note for user ${req.user.id}: ${note.substring(0, 100)}...`);

        res.json({
            success: true,
            message: 'Note processed successfully',
            note_length: note.length,
            processed_at: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Process note error:', error);
        res.status(500).json({ error: 'Failed to process note' });
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
