/**
 * Unified Messaging API Routes
 * Provides endpoints for cross-platform messaging operations
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../utils/logger');
const MessageRouter = require('../services/messageRouter');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Initialize message router
const messageRouter = new MessageRouter();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/messaging/platforms
 * Get available messaging platforms
 */
router.get('/platforms', async (req, res) => {
    try {
        const platforms = [
            {
                id: 'gmail',
                name: 'Gmail',
                description: 'Send and receive emails',
                capabilities: ['send', 'receive', 'attachments', 'threads'],
                isAvailable: true
            },
            {
                id: 'imessage',
                name: 'iMessage',
                description: 'Send and receive iMessages on macOS',
                capabilities: ['send', 'receive', 'threads'],
                isAvailable: process.platform === 'darwin'
            },
            {
                id: 'whatsapp',
                name: 'WhatsApp',
                description: 'Send and receive WhatsApp messages',
                capabilities: ['send', 'receive', 'attachments', 'readReceipts'],
                isAvailable: !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
            }
        ];

        res.json({
            success: true,
            platforms
        });

    } catch (error) {
        logger.error('Failed to get platforms:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get platforms'
        });
    }
});

/**
 * GET /api/messaging/connections
 * Get user's active platform connections
 */
router.get('/connections', async (req, res) => {
    try {
        const { data: connections, error } = await supabase
            .from('platform_integrations')
            .select('*')
            .eq('user_id', req.user.id)
            .eq('is_active', true);

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            connections: connections || []
        });

    } catch (error) {
        logger.error('Failed to get connections:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get connections'
        });
    }
});

/**
 * POST /api/messaging/connect/:platform
 * Connect to a messaging platform
 */
router.post('/connect/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const credentials = req.body;

        const result = await messageRouter.connectPlatform(req.user.id, platform, credentials);

        if (result.success) {
            res.json({
                success: true,
                connection: result
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        logger.error(`Failed to connect to ${req.params.platform}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to connect to platform'
        });
    }
});

/**
 * DELETE /api/messaging/connect/:platform
 * Disconnect from a messaging platform
 */
router.delete('/connect/:platform', async (req, res) => {
    try {
        const { platform } = req.params;

        const result = await messageRouter.disconnectPlatform(req.user.id, platform);

        res.json({
            success: true,
            message: 'Disconnected from platform'
        });

    } catch (error) {
        logger.error(`Failed to disconnect from ${req.params.platform}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to disconnect from platform'
        });
    }
});

/**
 * POST /api/messaging/send
 * Send a message through the specified platform
 */
router.post('/send', async (req, res) => {
    try {
        const { platform, recipientIdentifier, content, subject, type = 'text' } = req.body;

        if (!platform || !recipientIdentifier || !content) {
            return res.status(400).json({
                success: false,
                error: 'Platform, recipient, and content are required'
            });
        }

        const messageData = {
            recipientIdentifier,
            content,
            subject,
            type
        };

        const result = await messageRouter.sendMessage(req.user.id, platform, messageData);

        if (result.success) {
            res.json({
                success: true,
                message: result
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        logger.error('Failed to send message:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send message'
        });
    }
});

/**
 * GET /api/messaging/messages
 * Get messages with optional filtering
 */
router.get('/messages', async (req, res) => {
    try {
        const {
            platform,
            limit = 50,
            offset = 0,
            unreadOnly = false,
            threadId
        } = req.query;

        let query = supabase
            .from('messages')
            .select(`
                *,
                message_threads (
                    title,
                    participant_count,
                    participants
                )
            `)
            .eq('user_id', req.user.id)
            .order('received_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (platform) {
            query = query.eq('platform', platform);
        }

        if (unreadOnly === 'true') {
            query = query.eq('is_read', false);
        }

        if (threadId) {
            query = query.eq('thread_id', threadId);
        }

        const { data: messages, error } = await query;

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            messages: messages || [],
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: messages && messages.length === parseInt(limit)
            }
        });

    } catch (error) {
        logger.error('Failed to get messages:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get messages'
        });
    }
});

/**
 * GET /api/messaging/threads
 * Get message threads/conversations
 */
router.get('/threads', async (req, res) => {
    try {
        const { platform, limit = 20 } = req.query;

        let query = supabase
            .from('message_threads')
            .select(`
                *,
                messages (
                    id,
                    content,
                    received_at,
                    is_read
                )
            `)
            .eq('user_id', req.user.id)
            .order('last_message_at', { ascending: false })
            .limit(limit);

        if (platform) {
            query = query.eq('platform', platform);
        }

        const { data: threads, error } = await query;

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            threads: threads || []
        });

    } catch (error) {
        logger.error('Failed to get threads:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get threads'
        });
    }
});

/**
 * PATCH /api/messaging/messages/:id/read
 * Mark message as read/unread
 */
router.patch('/messages/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        const { read = true } = req.body;

        const { error } = await supabase
            .from('messages')
            .update({ is_read: read })
            .eq('id', id)
            .eq('user_id', req.user.id);

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            message: `Message marked as ${read ? 'read' : 'unread'}`
        });

    } catch (error) {
        logger.error('Failed to update message read status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update message'
        });
    }
});

/**
 * GET /api/messaging/notifications
 * Get messaging notifications
 */
router.get('/notifications', async (req, res) => {
    try {
        const { limit = 20, unreadOnly = false } = req.query;

        let query = supabase
            .from('messaging_notifications')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (unreadOnly === 'true') {
            query = query.eq('is_read', false);
        }

        const { data: notifications, error } = await query;

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            notifications: notifications || []
        });

    } catch (error) {
        logger.error('Failed to get notifications:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get notifications'
        });
    }
});

/**
 * PATCH /api/messaging/notifications/:id/read
 * Mark notification as read
 */
router.patch('/notifications/:id/read', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('messaging_notifications')
            .update({ is_read: true })
            .eq('id', id)
            .eq('user_id', req.user.id);

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            message: 'Notification marked as read'
        });

    } catch (error) {
        logger.error('Failed to mark notification as read:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update notification'
        });
    }
});

/**
 * POST /api/messaging/sync/:platform
 * Manually sync messages from a platform
 */
router.post('/sync/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const { fullSync = false } = req.body;

        const result = await messageRouter.receiveMessages(req.user.id, platform, {
            fullSync,
            limit: fullSync ? 100 : 20
        });

        res.json({
            success: true,
            synced: result.messages?.length || 0,
            message: `Synced ${result.messages?.length || 0} messages from ${platform}`
        });

    } catch (error) {
        logger.error(`Failed to sync ${req.params.platform}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync messages'
        });
    }
});

/**
 * GET /api/messaging/templates
 * Get message templates
 */
router.get('/templates', async (req, res) => {
    try {
        const { platform, category } = req.query;

        let query = supabase
            .from('message_templates')
            .select('*')
            .eq('user_id', req.user.id)
            .eq('is_active', true)
            .order('usage_count', { ascending: false });

        if (platform) {
            query = query.or(`platform.eq.${platform},platform.is.null`);
        }

        if (category) {
            query = query.eq('category', category);
        }

        const { data: templates, error } = await query;

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            templates: templates || []
        });

    } catch (error) {
        logger.error('Failed to get templates:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get templates'
        });
    }
});

/**
 * POST /api/messaging/templates
 * Create a message template
 */
router.post('/templates', async (req, res) => {
    try {
        const { name, category, platform, subjectTemplate, contentTemplate, variables } = req.body;

        if (!name || !contentTemplate) {
            return res.status(400).json({
                success: false,
                error: 'Name and content template are required'
            });
        }

        const { data, error } = await supabase
            .from('message_templates')
            .insert({
                user_id: req.user.id,
                name,
                category: category || 'general',
                platform,
                subject_template: subjectTemplate,
                content_template: contentTemplate,
                variables: variables || {}
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            template: data
        });

    } catch (error) {
        logger.error('Failed to create template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create template'
        });
    }
});

/**
 * Webhook endpoints for platforms
 */

// WhatsApp webhook
router.post('/webhook/whatsapp', async (req, res) => {
    try {
        const webhookData = req.body;

        // Verify webhook signature (in production)
        // const signature = req.headers['x-hub-signature-256'];

        const adapter = messageRouter.getAdapter('whatsapp');
        const messages = await adapter.handleWebhook(webhookData);

        // Process messages through message router
        for (const message of messages) {
            // Find the user based on the WhatsApp phone number
            // This is a simplified version - real implementation would need user lookup
            const userId = await findUserByWhatsAppNumber(message.senderIdentifier);

            if (userId) {
                await messageRouter.processIncomingMessage(
                    userId,
                    'whatsapp',
                    null, // integrationId
                    message
                );
            }
        }

        res.json({ success: true });

    } catch (error) {
        logger.error('WhatsApp webhook error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// WhatsApp webhook verification
router.get('/webhook/whatsapp', (req, res) => {
    const adapter = messageRouter.getAdapter('whatsapp');
    const challenge = adapter.verifyWebhook(
        req.query['hub.mode'],
        req.query['hub.verify_token'],
        req.query['hub.challenge']
    );

    if (challenge) {
        res.send(challenge);
    } else {
        res.sendStatus(403);
    }
});

/**
 * Helper function to find user by WhatsApp number
 * This is a placeholder - real implementation would need proper user lookup
 */
async function findUserByWhatsAppNumber(phoneNumber) {
    // Placeholder implementation
    // In real implementation, this would query the platform_integrations table
    return null;
}

module.exports = router;
