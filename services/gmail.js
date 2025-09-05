const { google } = require('googleapis');
const { supabase } = require('../database/connection');
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
            const { error } = await supabase
                .from('gmail_tokens')
                .upsert({
                    user_id: userId,
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    token_type: tokens.token_type,
                    expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id'
                });

            if (error) {
                logger.error('Error storing Gmail tokens:', error);
                throw error;
            }

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
            const { data: tokens, error } = await supabase
                .from('gmail_tokens')
                .select('access_token, refresh_token, expires_at')
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
                logger.error('Error getting Gmail tokens:', error);
                throw error;
            }

            if (!tokens) {
                return null;
            }
            
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
            const { error: updateError } = await supabase
                .from('gmail_tokens')
                .update({
                    access_token: tokens.access_token,
                    expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

            if (updateError) {
                logger.error('Error updating Gmail tokens:', updateError);
                throw updateError;
            }

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

    // Fetch emails from Gmail with configurable options
    async fetchEmails(userId, maxResults = 50, options = {}) {
        try {
            const tokens = await this.getTokens(userId);
            if (!tokens) {
                throw new Error('No Gmail tokens found for user');
            }

            this.oauth2Client.setCredentials({
                access_token: tokens.access_token
            });

            const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

            // Build Gmail search query
            const query = this.buildGmailQuery(options);

            // Fetch emails with enhanced filtering
            const response = await gmail.users.messages.list({
                userId: 'me',
                maxResults: maxResults,
                q: query,
                labelIds: ['INBOX']
            });

            const messages = response.data.messages || [];
            const emails = [];

            for (const message of messages) {
                const email = await this.getEmailDetails(gmail, message.id);
                if (email) {
                    emails.push(email);
                }
            }

            logger.info(`Fetched ${emails.length} emails for user ${userId}`);
            return emails;
        } catch (error) {
            logger.error('Error fetching emails:', error);
            throw error;
        }
    }

    // Build Gmail search query based on options
    buildGmailQuery(options = {}) {
        const queryParts = [];

        // Default to important emails only, but allow override
        if (options.includeAll !== true) {
            queryParts.push('is:important');
            queryParts.push('-category:promotions');
            queryParts.push('-category:social');
            queryParts.push('-category:updates');
            queryParts.push('-category:forums');
        }

        // Add time filters
        if (options.since) {
            queryParts.push(`after:${options.since}`);
        }
        if (options.before) {
            queryParts.push(`before:${options.before}`);
        }
        if (options.olderThan) {
            queryParts.push(`older_than:${options.olderThan}d`);
        } else {
            // Default to last 30 days unless explicitly disabled
            if (options.noTimeLimit !== true) {
                queryParts.push('older_than:30d');
            }
        }

        // Add label filters
        if (options.label) {
            queryParts.push(`label:${options.label}`);
        }

        // Add sender filters
        if (options.from) {
            queryParts.push(`from:${options.from}`);
        }

        return queryParts.join(' ');
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

    // Get email summaries for dashboard
    async getEmailSummaries(userId, limit = 10) {
        try {
            const tokens = await this.getTokens(userId);
            if (!tokens) {
                throw new Error('No Gmail tokens found');
            }

            this.oauth2Client.setCredentials({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                token_type: tokens.token_type,
                expiry_date: tokens.expires_at ? new Date(tokens.expires_at).getTime() : null
            });

            const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

            // Get list of messages
            const response = await gmail.users.messages.list({
                userId: 'me',
                maxResults: limit,
                q: 'in:inbox'
            });

            if (!response.data.messages) {
                return [];
            }

            // Get full message details for each
            const summaries = [];
            for (const message of response.data.messages.slice(0, limit)) {
                try {
                    const messageResponse = await gmail.users.messages.get({
                        userId: 'me',
                        id: message.id,
                        format: 'metadata',
                        metadataHeaders: ['Subject', 'From', 'Date']
                    });

                    const headers = messageResponse.data.payload.headers;
                    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
                    const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
                    const date = headers.find(h => h.name === 'Date')?.value || '';

                    // Extract sender name and email
                    const fromMatch = from.match(/^([^<]+)<(.+)>$/);
                    const senderName = fromMatch ? fromMatch[1].trim() : from;
                    const senderEmail = fromMatch ? fromMatch[2] : from;

                    summaries.push({
                        id: message.id,
                        subject,
                        sender: senderName,
                        senderEmail,
                        date,
                        preview: messageResponse.data.snippet || 'No preview available'
                    });
                } catch (error) {
                    logger.error(`Error getting message ${message.id}:`, error);
                    // Continue with other messages
                }
            }

            return summaries;
        } catch (error) {
            logger.error('Error getting email summaries:', error);
            throw error;
        }
    }
}

module.exports = new GmailService();
