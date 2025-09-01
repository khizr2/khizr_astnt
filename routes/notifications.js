const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken);

// Get all notifications
router.get('/', async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;
        
        let queryText = `
            SELECT n.*, e.subject as email_subject, e.sender as email_sender
            FROM notifications n
            LEFT JOIN emails e ON n.email_id = e.id
            WHERE n.user_id = $1
        `;
        let queryParams = [req.user.id];
        let paramCount = 1;

        if (status) {
            queryText += ` AND n.status = $${++paramCount}`;
            queryParams.push(status);
        }

        queryText += ` ORDER BY n.priority ASC, n.created_at DESC LIMIT $${++paramCount}`;
        queryParams.push(limit);

        const result = await query(queryText, queryParams);
        res.json(result.rows);
    } catch (error) {
        logger.error('Error getting notifications:', error);
        res.status(500).json({ error: 'Failed to get notifications' });
    }
});

// Get unread notification count
router.get('/count', async (req, res) => {
    try {
        const result = await query(
            `SELECT COUNT(*) as count FROM notifications 
             WHERE user_id = $1 AND status = 'pending'`,
            [req.user.id]
        );

        res.json({ count: parseInt(result.rows[0].count) });
    } catch (error) {
        logger.error('Error getting notification count:', error);
        res.status(500).json({ error: 'Failed to get notification count' });
    }
});

// Update notification status
router.put('/:id', async (req, res) => {
    try {
        const { status, action } = req.body;
        
        const result = await query(
            `UPDATE notifications 
             SET status = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2 AND user_id = $3 
             RETURNING *`,
            [status, req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        // If notification is approved and it's an email notification, mark email as read
        if (status === 'approved' && result.rows[0].email_id) {
            await query(
                'UPDATE emails SET status = $1 WHERE id = $2 AND user_id = $3',
                ['read', result.rows[0].email_id, req.user.id]
            );
        }

        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error updating notification:', error);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// Mark all notifications as read
router.put('/read-all', async (req, res) => {
    try {
        await query(
            `UPDATE notifications 
             SET status = 'read', updated_at = CURRENT_TIMESTAMP 
             WHERE user_id = $1 AND status = 'pending'`,
            [req.user.id]
        );

        res.json({ success: true });
    } catch (error) {
        logger.error('Error marking notifications as read:', error);
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

// Delete notification
router.delete('/:id', async (req, res) => {
    try {
        const result = await query(
            'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting notification:', error);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

// Get notification statistics
router.get('/stats', async (req, res) => {
    try {
        const stats = await query(
            `SELECT 
                COUNT(*) as total_notifications,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
                COUNT(CASE WHEN status = 'denied' THEN 1 END) as denied_count,
                COUNT(CASE WHEN priority = 1 THEN 1 END) as urgent_count,
                COUNT(CASE WHEN type = 'email' THEN 1 END) as email_notifications
             FROM notifications 
             WHERE user_id = $1`,
            [req.user.id]
        );

        res.json(stats.rows[0]);
    } catch (error) {
        logger.error('Error getting notification stats:', error);
        res.status(500).json({ error: 'Failed to get notification statistics' });
    }
});

module.exports = router;
