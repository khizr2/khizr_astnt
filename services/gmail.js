const { google } = require('googleapis');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

class GmailService {
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GMAIL_CLIENT_ID,
            process.env.GMAIL_CLIENT_SECRET,
            process.env.GMAIL_REDIRECT_URI || 'http://localhost:10000/api/gmail/callback'
        );
    }

    // Generate OAuth URL for user to authorize Gmail access
    generateAuthUrl(userId) {
        const scopes = [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.send'
        ];

        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent',
            state: userId // Pass user ID in state for security
        });
    }

    // Handle OAuth callback and store tokens
    async handleCallback(code, userId) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            
            // Store tokens in database
            await query(
                `INSERT INTO gmail_tokens (user_id, access_token, refresh_token, token_type, expires_at)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (user_id) DO UPDATE SET
                 access_token = EXCLUDED.access_token,
                 refresh_token = EXCLUDED.refresh_token,
                 token_type = EXCLUDED.token_type,
                 expires_at = EXCLUDED.expires_at,
                 updated_at = CURRENT_TIMESTAMP`,
                [
                    userId,
                    tokens.access_token,
                    tokens.refresh_token,
                    tokens.token_type,
                    tokens.expiry_date ? new Date(tokens.expiry_date) : null
                ]
            );

            logger.info(`Gmail tokens stored for user ${userId}`);
            return { success: true };
        } catch (error) {
            logger.error('Error handling Gmail callback:', error);
            throw error;
        }
    }

    // Get user's Gmail tokens
    async getTokens(userId) {
        try {
            const result = await query(
                'SELECT access_token, refresh_token, expires_at FROM gmail_tokens WHERE user_id = $1',
                [userId]
            );

            if (result.rows.length === 0) {
                return null;
            }

            const tokens = result.rows[0];
            
            // Check if token is expired and refresh if needed
            if (tokens.expires_at && new Date() > new Date(tokens.expires_at)) {
                return await this.refreshTokens(userId, tokens.refresh_token);
            }

            return tokens;
        } catch (error) {
            logger.error('Error getting Gmail tokens:', error);
            throw error;
        }
    }

    // Refresh expired tokens
    async refreshTokens(userId, refreshToken) {
        try {
            this.oauth2Client.setCredentials({
                refresh_token: refreshToken
            });

            const { tokens } = await this.oauth2Client.refreshAccessToken();
            
            // Update tokens in database
            await query(
                `UPDATE gmail_tokens 
                 SET access_token = $1, expires_at = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $3`,
                [
                    tokens.access_token,
                    tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                    userId
                ]
            );

            return {
                access_token: tokens.access_token,
                refresh_token: refreshToken,
                expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null
            };
        } catch (error) {
            logger.error('Error refreshing Gmail tokens:', error);
            throw error;
        }
    }

    // Fetch emails from Gmail
    async fetchEmails(userId, maxResults = 50) {
        try {
            const tokens = await this.getTokens(userId);
            if (!tokens) {
                throw new Error('No Gmail tokens found for user');
            }

            this.oauth2Client.setCredentials({
                access_token: tokens.access_token
            });

            const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

            // Fetch emails with enhanced filtering for truly important emails only
            const response = await gmail.users.messages.list({
                userId: 'me',
                maxResults: maxResults,
                q: 'is:important -category:promotions -category:social -category:updates -category:forums -label:unread -older_than:30d',
                labelIds: ['INBOX', 'IMPORTANT']
            });

            const messages = response.data.messages || [];
            const emails = [];

            for (const message of messages) {
                const email = await this.getEmailDetails(gmail, message.id);
                if (email) {
                    emails.push(email);
                }
            }

            return emails;
        } catch (error) {
            logger.error('Error fetching emails:', error);
            throw error;
        }
    }

    // Get detailed email information
    async getEmailDetails(gmail, messageId) {
        try {
            const response = await gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full'
            });

            const message = response.data;
            const headers = message.payload.headers;
            
            const email = {
                gmail_id: message.id,
                thread_id: message.threadId,
                sender: this.getHeader(headers, 'From'),
                sender_email: this.extractEmail(this.getHeader(headers, 'From')),
                subject: this.getHeader(headers, 'Subject'),
                content: this.extractContent(message.payload),
                content_snippet: message.snippet,
                received_at: new Date(parseInt(message.internalDate)),
                labels: message.labelIds,
                is_important: message.labelIds.includes('IMPORTANT'),
                is_automated: this.isAutomatedEmail(headers, message.snippet)
            };

            return email;
        } catch (error) {
            logger.error(`Error getting email details for ${messageId}:`, error);
            return null;
        }
    }

    // Helper methods
    getHeader(headers, name) {
        const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return header ? header.value : '';
    }

    extractEmail(fromHeader) {
        const match = fromHeader.match(/<(.+?)>/);
        return match ? match[1] : fromHeader;
    }

    extractContent(payload) {
        if (payload.body && payload.body.data) {
            return Buffer.from(payload.body.data, 'base64').toString('utf-8');
        }

        if (payload.parts) {
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body && part.body.data) {
                    return Buffer.from(part.body.data, 'base64').toString('utf-8');
                }
            }
        }

        return '';
    }

    isAutomatedEmail(headers, snippet) {
        const automatedKeywords = [
            'noreply', 'no-reply', 'donotreply', 'do-not-reply',
            'automated', 'system', 'notification', 'alert',
            'newsletter', 'promotion', 'marketing', 'unsubscribe'
        ];

        const fromHeader = this.getHeader(headers, 'From').toLowerCase();
        const subjectHeader = this.getHeader(headers, 'Subject').toLowerCase();
        const snippetLower = snippet.toLowerCase();

        return automatedKeywords.some(keyword => 
            fromHeader.includes(keyword) || 
            subjectHeader.includes(keyword) || 
            snippetLower.includes(keyword)
        );
    }

    // Send email
    async sendEmail(userId, to, subject, body) {
        try {
            const tokens = await this.getTokens(userId);
            if (!tokens) {
                throw new Error('No Gmail tokens found for user');
            }

            this.oauth2Client.setCredentials({
                access_token: tokens.access_token
            });

            const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

            const email = [
                `To: ${to}`,
                `Subject: ${subject}`,
                '',
                body
            ].join('\n');

            const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

            const response = await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedEmail
                }
            });

            logger.info(`Email sent successfully: ${response.data.id}`);
            return response.data;
        } catch (error) {
            logger.error('Error sending email:', error);
            throw error;
        }
    }
}

module.exports = new GmailService();
