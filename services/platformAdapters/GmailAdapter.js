/**
 * Gmail Platform Adapter
 * Handles Gmail-specific messaging operations
 */

const { google } = require('googleapis');
const { logger } = require('../../utils/logger');

class GmailAdapter {
    constructor() {
        this.name = 'gmail';
        this.displayName = 'Gmail';
        this.connections = new Map();

        // Gmail API configuration
        this.scopes = [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.modify'
        ];
    }

    /**
     * Connect to Gmail API
     */
    async connect(credentials) {
        try {
            if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
                throw new Error('Missing Gmail API credentials');
            }

            const oauth2Client = new google.auth.OAuth2(
                credentials.clientId,
                credentials.clientSecret,
                credentials.redirectUri || 'urn:ietf:wg:oauth:2.0:oob'
            );

            oauth2Client.setCredentials({
                refresh_token: credentials.refreshToken
            });

            // Test the connection
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            const profile = await gmail.users.getProfile({ userId: 'me' });

            if (!profile.data) {
                throw new Error('Failed to get Gmail profile');
            }

            const connectionId = `gmail_${profile.data.emailAddress}`;
            this.connections.set(connectionId, {
                oauth2Client,
                gmail,
                userId: profile.data.emailAddress,
                connectedAt: new Date()
            });

            logger.info(`Gmail connection established for ${profile.data.emailAddress}`);

            return {
                success: true,
                userId: profile.data.emailAddress,
                displayName: profile.data.emailAddress,
                connectionId
            };

        } catch (error) {
            logger.error('Gmail connection failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Disconnect from Gmail
     */
    async disconnect(connectionId) {
        if (this.connections.has(connectionId)) {
            this.connections.delete(connectionId);
            logger.info(`Gmail connection ${connectionId} disconnected`);
        }
    }

    /**
     * Send a message via Gmail
     */
    async sendMessage(messageData) {
        try {
            const connection = this.getConnection(messageData.connectionId);
            if (!connection) {
                throw new Error('No active Gmail connection');
            }

            const { gmail } = connection;

            // Create the email content
            const emailContent = this.createEmailContent(messageData);
            const encodedEmail = Buffer.from(emailContent)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            // Send the email
            const result = await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedEmail
                }
            });

            logger.info(`Email sent via Gmail: ${result.data.id}`);

            return {
                success: true,
                messageId: result.data.id,
                threadId: result.data.threadId
            };

        } catch (error) {
            logger.error('Failed to send Gmail message:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Receive messages from Gmail
     */
    async receiveMessages(options = {}) {
        try {
            const connection = this.getConnection(options.connectionId);
            if (!connection) {
                throw new Error('No active Gmail connection');
            }

            const { gmail } = connection;

            // Build query parameters
            const queryParams = {
                userId: 'me',
                maxResults: options.limit || 50,
                q: this.buildGmailQuery(options)
            };

            if (options.pageToken) {
                queryParams.pageToken = options.pageToken;
            }

            // Fetch message list
            const messagesResponse = await gmail.users.messages.list(queryParams);

            if (!messagesResponse.data.messages) {
                return [];
            }

            // Fetch full message details
            const messages = [];
            for (const message of messagesResponse.data.messages) {
                try {
                    const messageDetail = await gmail.users.messages.get({
                        userId: 'me',
                        id: message.id,
                        format: 'full'
                    });

                    const parsedMessage = this.parseGmailMessage(messageDetail.data);
                    if (parsedMessage) {
                        messages.push(parsedMessage);
                    }
                } catch (error) {
                    logger.error(`Failed to fetch Gmail message ${message.id}:`, error);
                }
            }

            return messages;

        } catch (error) {
            logger.error('Failed to receive Gmail messages:', error);
            return [];
        }
    }

    /**
     * Get a specific message
     */
    async getMessage(messageId, connectionId) {
        try {
            const connection = this.getConnection(connectionId);
            if (!connection) {
                throw new Error('No active Gmail connection');
            }

            const { gmail } = connection;

            const messageDetail = await gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full'
            });

            return this.parseGmailMessage(messageDetail.data);

        } catch (error) {
            logger.error(`Failed to get Gmail message ${messageId}:`, error);
            return null;
        }
    }

    /**
     * Mark message as read/unread
     */
    async markAsRead(messageId, read = true, connectionId) {
        try {
            const connection = this.getConnection(connectionId);
            if (!connection) {
                throw new Error('No active Gmail connection');
            }

            const { gmail } = connection;

            const request = {
                userId: 'me',
                id: messageId,
                requestBody: {
                    removeLabelIds: read ? ['UNREAD'] : [],
                    addLabelIds: read ? [] : ['UNREAD']
                }
            };

            await gmail.users.messages.modify(request);
            return { success: true };

        } catch (error) {
            logger.error(`Failed to mark Gmail message as ${read ? 'read' : 'unread'}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get message threads
     */
    async getThreads(options = {}) {
        try {
            const connection = this.getConnection(options.connectionId);
            if (!connection) {
                throw new Error('No active Gmail connection');
            }

            const { gmail } = connection;

            const threadsResponse = await gmail.users.threads.list({
                userId: 'me',
                maxResults: options.limit || 20,
                q: options.query || ''
            });

            return threadsResponse.data.threads || [];

        } catch (error) {
            logger.error('Failed to get Gmail threads:', error);
            return [];
        }
    }

    /**
     * Create email content for sending
     */
    createEmailContent(messageData) {
        const boundary = 'boundary_' + Math.random().toString(36).substr(2, 9);

        let email = [
            'Content-Type: multipart/alternative; boundary="' + boundary + '"',
            'MIME-Version: 1.0',
            'To: ' + messageData.recipientIdentifier,
            'Subject: ' + (messageData.subject || 'No Subject'),
            '',
            '--' + boundary,
            'Content-Type: text/plain; charset=UTF-8',
            '',
            messageData.content,
            '',
            '--' + boundary + '--'
        ].join('\r\n');

        return email;
    }

    /**
     * Parse Gmail message data
     */
    parseGmailMessage(messageData) {
        try {
            const headers = this.parseHeaders(messageData.payload.headers);

            // Extract sender information
            const from = headers['From'] || headers['from'] || '';
            const senderInfo = this.parseEmailAddress(from);

            // Extract recipient information
            const to = headers['To'] || headers['to'] || '';
            const recipientInfo = this.parseEmailAddress(to);

            // Extract content
            const content = this.extractMessageContent(messageData.payload);
            const snippet = content.text ? content.text.substring(0, 200) : '';

            return {
                externalId: messageData.id,
                threadId: messageData.threadId,
                type: 'email',
                senderName: senderInfo.name,
                senderIdentifier: senderInfo.email,
                recipientName: recipientInfo.name,
                recipientIdentifier: recipientInfo.email,
                subject: headers['Subject'] || headers['subject'] || 'No Subject',
                content: content.text,
                snippet: snippet,
                metadata: {
                    labels: messageData.labelIds || [],
                    size: messageData.sizeEstimate,
                    historyId: messageData.historyId
                },
                receivedAt: new Date(parseInt(messageData.internalDate)).toISOString(),
                platform: 'gmail'
            };

        } catch (error) {
            logger.error('Failed to parse Gmail message:', error);
            return null;
        }
    }

    /**
     * Parse email headers
     */
    parseHeaders(headers) {
        const parsed = {};
        headers.forEach(header => {
            parsed[header.name.toLowerCase()] = header.value;
        });
        return parsed;
    }

    /**
     * Parse email address from header
     */
    parseEmailAddress(addressString) {
        // Handle formats like "Name <email@domain.com>" or just "email@domain.com"
        const emailMatch = addressString.match(/([^<]+)?\s*<([^>]+)>/);
        if (emailMatch) {
            return {
                name: emailMatch[1]?.trim() || '',
                email: emailMatch[2]?.trim() || ''
            };
        }

        // Just email address
        return {
            name: '',
            email: addressString.trim()
        };
    }

    /**
     * Extract message content from Gmail payload
     */
    extractMessageContent(payload) {
        let text = '';
        let html = '';

        if (payload.body && payload.body.data) {
            // Simple message
            text = Buffer.from(payload.body.data, 'base64').toString();
        } else if (payload.parts) {
            // Multipart message
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body && part.body.data) {
                    text = Buffer.from(part.body.data, 'base64').toString();
                } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
                    html = Buffer.from(part.body.data, 'base64').toString();
                } else if (part.parts) {
                    // Nested parts
                    for (const subPart of part.parts) {
                        if (subPart.mimeType === 'text/plain' && subPart.body && subPart.body.data) {
                            text = Buffer.from(subPart.body.data, 'base64').toString();
                        } else if (subPart.mimeType === 'text/html' && subPart.body && subPart.body.data) {
                            html = Buffer.from(subPart.body.data, 'base64').toString();
                        }
                    }
                }
            }
        }

        return { text, html };
    }

    /**
     * Build Gmail search query
     */
    buildGmailQuery(options) {
        const queryParts = [];

        if (options.unreadOnly) {
            queryParts.push('is:unread');
        }

        if (options.sender) {
            queryParts.push(`from:${options.sender}`);
        }

        if (options.subject) {
            queryParts.push(`subject:${options.subject}`);
        }

        if (options.after) {
            queryParts.push(`after:${options.after}`);
        }

        if (options.before) {
            queryParts.push(`before:${options.before}`);
        }

        return queryParts.join(' ');
    }

    /**
     * Get active connection
     */
    getConnection(connectionId) {
        if (connectionId) {
            return this.connections.get(connectionId);
        }

        // Return first available connection
        const connections = Array.from(this.connections.values());
        return connections[0] || null;
    }

    /**
     * Get platform capabilities
     */
    getCapabilities() {
        return {
            send: true,
            receive: true,
            threads: true,
            attachments: true,
            readReceipts: false,
            typingIndicators: false,
            messageHistory: true
        };
    }
}

module.exports = GmailAdapter;
