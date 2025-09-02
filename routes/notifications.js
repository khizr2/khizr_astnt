const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { supabase } = require('../database/connection');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticateToken);

// Get all notifications
router.get('/', async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;
        
        let queryBuilder = supabase
            .from('notifications')
            .select(`
                *,
                emails!notifications_email_id_fkey(subject, sender)
            `)
            .eq('user_id', req.user.id)
            .order('priority', { ascending: true })
            .order('created_at', { ascending: false })
            .limit(parseInt(limit));

        if (status) {
            queryBuilder = queryBuilder.eq('status', status);
        }

        const { data: notifications, error } = await queryBuilder;

        if (error) {
            logger.error('Error getting notifications:', error);
            throw error;
        }

        // Transform the nested email data to flat structure
        const transformedNotifications = notifications.map(notification => ({
            ...notification,
            email_subject: notification.emails?.subject || null,
            email_sender: notification.emails?.sender || null,
            emails: undefined // Remove the nested object
        }));

        res.json(transformedNotifications);
    } catch (error) {
        logger.error('Error getting notifications:', error);
        res.status(500).json({ error: 'Failed to get notifications' });
    }
});

// Get unread notification count
router.get('/count', async (req, res) => {
    try {
        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', req.user.id)
            .eq('status', 'pending');

        if (error) {
            logger.error('Error getting notification count:', error);
            throw error;
        }

        res.json({ count: count || 0 });
    } catch (error) {
        logger.error('Error getting notification count:', error);
        res.status(500).json({ error: 'Failed to get notification count' });
    }
});

// Update notification status
router.put('/:id', async (req, res) => {
    try {
        const { status, action } = req.body;
        
        const { data: notification, error } = await supabase
            .from('notifications')
            .update({
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('Error updating notification:', error);
            throw error;
        }

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        // If notification is approved and it's an email notification, mark email as read
        if (status === 'approved' && notification.email_id) {
            const { error: emailError } = await supabase
                .from('emails')
                .update({
                    status: 'read',
                    updated_at: new Date().toISOString()
                })
                .eq('id', notification.email_id)
                .eq('user_id', req.user.id);

            if (emailError) {
                logger.error('Error updating email status:', emailError);
                // Don't throw here as the notification was already updated
            }
        }

        res.json(notification);
    } catch (error) {
        logger.error('Error updating notification:', error);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// Mark all notifications as read
router.put('/read-all', async (req, res) => {
    try {
        const { error } = await supabase
            .from('notifications')
            .update({
                status: 'read',
                updated_at: new Date().toISOString()
            })
            .eq('user_id', req.user.id)
            .eq('status', 'pending');

        if (error) {
            logger.error('Error marking notifications as read:', error);
            throw error;
        }

        res.json({ success: true });
    } catch (error) {
        logger.error('Error marking notifications as read:', error);
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

// Delete notification
router.delete('/:id', async (req, res) => {
    try {
        const { data: deletedNotification, error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .select('id')
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('Error deleting notification:', error);
            throw error;
        }

        if (!deletedNotification) {
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
        const { data: notifications, error } = await supabase
            .from('notifications')
            .select('status, priority, type')
            .eq('user_id', req.user.id);

        if (error) {
            logger.error('Error getting notification stats:', error);
            throw error;
        }

        // Calculate statistics
        const stats = {
            total_notifications: notifications.length,
            pending_count: notifications.filter(n => n.status === 'pending').length,
            approved_count: notifications.filter(n => n.status === 'approved').length,
            denied_count: notifications.filter(n => n.status === 'denied').length,
            urgent_count: notifications.filter(n => n.priority === 1).length,
            email_notifications: notifications.filter(n => n.type === 'email').length
        };

        res.json(stats);
    } catch (error) {
        logger.error('Error getting notification stats:', error);
        res.status(500).json({ error: 'Failed to get notification statistics' });
    }
});

module.exports = router;
