/**
 * Unified Message Router Service
 * Handles routing messages between different platforms (email, iMessage, WhatsApp, etc.)
 * Provides platform abstraction and unified messaging API
 */

const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../utils/logger');

class MessageRouter {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );

        // Platform adapters registry
        this.platformAdapters = new Map();
        this.activeConnections = new Map();

        // Initialize platform adapters
        this.initializePlatformAdapters();

        logger.info('MessageRouter initialized');
    }

    /**
     * Initialize platform adapters
     */
    initializePlatformAdapters() {
        // Import platform adapters
        const GmailAdapter = require('./platformAdapters/GmailAdapter');
        const IMessageAdapter = require('./platformAdapters/IMessageAdapter');
        const WhatsAppAdapter = require('./platformAdapters/WhatsAppAdapter');

        // Register adapters
        this.registerAdapter('gmail', new GmailAdapter());
        this.registerAdapter('imessage', new IMessageAdapter());
        this.registerAdapter('whatsapp', new WhatsAppAdapter());

        logger.info('Platform adapters initialized');
    }

    /**
     * Register a platform adapter
     */
    registerAdapter(platform, adapter) {
        this.platformAdapters.set(platform, adapter);
        logger.info(`Platform adapter registered: ${platform}`);
    }

    /**
     * Get platform adapter for a given platform
     */
    getAdapter(platform) {
        const adapter = this.platformAdapters.get(platform);
        if (!adapter) {
            throw new Error(`No adapter registered for platform: ${platform}`);
        }
        return adapter;
    }

    /**
     * Connect to a platform for a user
     */
    async connectPlatform(userId, platform, credentials = {}) {
        try {
            logger.info(`Connecting to ${platform} for user ${userId}`);

            const adapter = this.getAdapter(platform);

            // Test connection
            const connectionResult = await adapter.connect(credentials);

            if (!connectionResult.success) {
                throw new Error(`Failed to connect to ${platform}: ${connectionResult.error}`);
            }

            // Store platform integration in database
            const { data, error } = await this.supabase
                .from('platform_integrations')
                .upsert({
                    user_id: userId,
                    platform: platform,
                    platform_user_id: connectionResult.userId,
                    display_name: connectionResult.displayName,
                    credentials: this.encryptCredentials(credentials),
                    is_active: true,
                    last_sync: new Date().toISOString()
                })
                .select()
                .single();

            if (error) {
                throw new Error(`Failed to store platform integration: ${error.message}`);
            }

            // Store active connection
            const connectionId = `${platform}_${userId}`;
            this.activeConnections.set(connectionId, {
                adapter,
                integrationId: data.id,
                userId,
                platform,
                connectedAt: new Date()
            });

            // Start message sync for this platform
            this.startMessageSync(data.id, userId, platform);

            logger.info(`Successfully connected to ${platform} for user ${userId}`);
            return {
                success: true,
                integrationId: data.id,
                displayName: connectionResult.displayName
            };

        } catch (error) {
            logger.error(`Failed to connect to ${platform} for user ${userId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Disconnect from a platform
     */
    async disconnectPlatform(userId, platform) {
        try {
            const connectionId = `${platform}_${userId}`;
            const connection = this.activeConnections.get(connectionId);

            if (connection) {
                // Disconnect from platform
                await connection.adapter.disconnect();

                // Remove active connection
                this.activeConnections.delete(connectionId);

                // Update database
                await this.supabase
                    .from('platform_integrations')
                    .update({
                        is_active: false,
                        sync_status: 'disabled'
                    })
                    .eq('user_id', userId)
                    .eq('platform', platform);
            }

            logger.info(`Disconnected from ${platform} for user ${userId}`);
            return { success: true };

        } catch (error) {
            logger.error(`Failed to disconnect from ${platform}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send a message through the appropriate platform
     */
    async sendMessage(userId, platform, messageData) {
        try {
            const adapter = this.getAdapter(platform);
            const connectionId = `${platform}_${userId}`;
            const connection = this.activeConnections.get(connectionId);

            if (!connection) {
                throw new Error(`No active connection for ${platform}`);
            }

            // Send message through platform adapter
            const sendResult = await adapter.sendMessage(messageData);

            if (!sendResult.success) {
                throw new Error(`Failed to send message: ${sendResult.error}`);
            }

            // Store sent message in database
            const { data, error } = await this.supabase
                .from('messages')
                .insert({
                    user_id: userId,
                    platform_integration_id: connection.integrationId,
                    platform: platform,
                    external_id: sendResult.messageId,
                    message_type: messageData.type || 'text',
                    direction: 'outbound',
                    sender_name: connection.displayName,
                    sender_identifier: connection.userId,
                    recipient_name: messageData.recipientName,
                    recipient_identifier: messageData.recipientIdentifier,
                    subject: messageData.subject,
                    content: messageData.content,
                    sent_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) {
                logger.error('Failed to store sent message:', error);
            }

            // Create thread if this is part of a conversation
            if (messageData.threadId || sendResult.threadId) {
                await this.updateOrCreateThread(
                    userId,
                    platform,
                    messageData.threadId || sendResult.threadId,
                    messageData
                );
            }

            logger.info(`Message sent via ${platform} for user ${userId}`);
            return {
                success: true,
                messageId: data?.id,
                externalId: sendResult.messageId
            };

        } catch (error) {
            logger.error(`Failed to send message via ${platform}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Receive messages from a platform
     */
    async receiveMessages(userId, platform, options = {}) {
        try {
            const adapter = this.getAdapter(platform);
            const connectionId = `${platform}_${userId}`;
            const connection = this.activeConnections.get(connectionId);

            if (!connection) {
                throw new Error(`No active connection for ${platform}`);
            }

            // Fetch messages from platform
            const messages = await adapter.receiveMessages(options);

            // Process and store messages
            const processedMessages = [];
            for (const messageData of messages) {
                try {
                    const processedMessage = await this.processIncomingMessage(
                        userId,
                        platform,
                        connection.integrationId,
                        messageData
                    );
                    processedMessages.push(processedMessage);
                } catch (error) {
                    logger.error('Failed to process incoming message:', error);
                }
            }

            logger.info(`Received ${processedMessages.length} messages from ${platform}`);
            return {
                success: true,
                messages: processedMessages
            };

        } catch (error) {
            logger.error(`Failed to receive messages from ${platform}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Process an incoming message
     */
    async processIncomingMessage(userId, platform, integrationId, messageData) {
        // Store message in database
        const { data, error } = await this.supabase
            .from('messages')
            .insert({
                user_id: userId,
                platform_integration_id: integrationId,
                platform: platform,
                external_id: messageData.externalId,
                message_type: messageData.type || 'text',
                direction: 'inbound',
                sender_name: messageData.senderName,
                sender_identifier: messageData.senderIdentifier,
                recipient_name: messageData.recipientName,
                recipient_identifier: messageData.recipientIdentifier,
                subject: messageData.subject,
                content: messageData.content,
                content_snippet: messageData.snippet,
                metadata: messageData.metadata || {},
                received_at: messageData.receivedAt || new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            // Check if it's a duplicate message
            if (error.code === '23505') { // Unique constraint violation
                logger.warn('Duplicate message received, skipping');
                return null;
            }
            throw error;
        }

        // Create or update thread
        if (messageData.threadId) {
            await this.updateOrCreateThread(userId, platform, messageData.threadId, messageData);
        }

        // Queue message for processing (AI analysis, auto-responses, etc.)
        await this.queueMessageForProcessing(data.id, userId, platform, messageData);

        // Send notification
        await this.createMessageNotification(userId, data.id, messageData);

        return data;
    }

    /**
     * Update or create message thread
     */
    async updateOrCreateThread(userId, platform, threadId, messageData) {
        const { data, error } = await this.supabase
            .from('message_threads')
            .upsert({
                user_id: userId,
                platform: platform,
                external_thread_id: threadId,
                title: messageData.subject || `Conversation with ${messageData.senderName}`,
                participant_count: 2, // Basic implementation
                participants: [messageData.senderIdentifier, messageData.recipientIdentifier],
                is_group: false,
                last_message_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to update/create thread:', error);
        }

        return data;
    }

    /**
     * Queue message for processing
     */
    async queueMessageForProcessing(messageId, userId, platform, messageData) {
        const { error } = await this.supabase
            .from('message_processing_queue')
            .insert({
                message_id: messageId,
                user_id: userId,
                processing_type: 'ai_analysis',
                status: 'pending',
                parameters: {
                    platform: platform,
                    message_type: messageData.type,
                    priority: messageData.priority || 3
                }
            });

        if (error) {
            logger.error('Failed to queue message for processing:', error);
        }
    }

    /**
     * Create notification for new message
     */
    async createMessageNotification(userId, messageId, messageData) {
        const { error } = await this.supabase
            .from('messaging_notifications')
            .insert({
                user_id: userId,
                message_id: messageId,
                notification_type: 'new_message',
                title: `New message from ${messageData.senderName}`,
                content: messageData.snippet || messageData.content?.substring(0, 100),
                platform: messageData.platform,
                priority: messageData.priority || 3
            });

        if (error) {
            logger.error('Failed to create message notification:', error);
        }
    }

    /**
     * Start background message sync for a platform
     */
    startMessageSync(integrationId, userId, platform) {
        const syncInterval = setInterval(async () => {
            try {
                await this.receiveMessages(userId, platform);
            } catch (error) {
                logger.error(`Message sync failed for ${platform}:`, error);
            }
        }, 60000); // Sync every minute

        // Store sync interval for cleanup
        const connectionId = `${platform}_${userId}`;
        const connection = this.activeConnections.get(connectionId);
        if (connection) {
            connection.syncInterval = syncInterval;
        }
    }

    /**
     * Encrypt platform credentials (placeholder - implement proper encryption)
     */
    encryptCredentials(credentials) {
        // TODO: Implement proper encryption
        return credentials;
    }

    /**
     * Decrypt platform credentials (placeholder - implement proper decryption)
     */
    decryptCredentials(encryptedCredentials) {
        // TODO: Implement proper decryption
        return encryptedCredentials;
    }

    /**
     * Get active platform connections for a user
     */
    async getUserConnections(userId) {
        const { data, error } = await this.supabase
            .from('platform_integrations')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true);

        if (error) {
            logger.error('Failed to get user connections:', error);
            return [];
        }

        return data;
    }

    /**
     * Clean up resources
     */
    cleanup() {
        // Clear all sync intervals
        for (const connection of this.activeConnections.values()) {
            if (connection.syncInterval) {
                clearInterval(connection.syncInterval);
            }
        }

        // Disconnect from all platforms
        for (const connection of this.activeConnections.values()) {
            try {
                connection.adapter.disconnect();
            } catch (error) {
                logger.error('Error disconnecting platform:', error);
            }
        }

        this.activeConnections.clear();
        logger.info('MessageRouter cleaned up');
    }
}

module.exports = MessageRouter;
