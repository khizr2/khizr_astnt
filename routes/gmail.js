const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const gmailService = require('../services/gmail');
const emailAI = require('../services/emailAI');

const router = express.Router();

// Get Gmail auth URL (requires auth)
router.get('/auth', authenticateToken, async (req, res) => {
    try {
        const authUrl = gmailService.generateAuthUrl(req.user.id);
        res.json({ authUrl });
    } catch (error) {
        logger.error('Error generating Gmail auth URL:', error);
        res.status(500).json({ error: 'Failed to generate auth URL' });
    }
});

// Handle OAuth callback (must be public endpoint for Google redirect)
router.get('/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        
        if (!code || !state) {
            return res.status(400).json({ error: 'Missing authorization code or state' });
        }

        await gmailService.handleCallback(code, state);

        // Redirect to frontend with success message
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8002';
        res.redirect(`${frontendUrl}/app.html?gmail=connected`);
    } catch (error) {
        logger.error('Error handling Gmail callback:', error);
        res.redirect('/app.html?gmail=error');
    }
});

// Check Gmail connection status (requires auth)
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const tokens = await gmailService.getTokens(req.user.id);
        res.json({ 
            connected: !!tokens,
            hasTokens: !!tokens?.access_token
        });
    } catch (error) {
        logger.error('Error checking Gmail status:', error);
        res.status(500).json({ error: 'Failed to check Gmail status' });
    }
});

// Fetch and process emails (requires auth)
router.get('/emails', authenticateToken, async (req, res) => {
    try {
        const { limit = 20, refresh = false, sort = 'received_at', order = 'desc', priority_filter } = req.query;

        // If refresh is true, fetch from Gmail API
        if (refresh === 'true') {
            const gmailEmails = await gmailService.fetchEmails(req.user.id, parseInt(limit));
            const { processedEmails, notifications, reports } = await emailAI.processEmails(gmailEmails);

            // Store processed emails in database
            for (const email of processedEmails) {
                await query(
                    `INSERT INTO emails (
                        user_id, gmail_id, sender, sender_email, subject, content,
                        content_snippet, priority, is_automated, is_important,
                        summary, suggested_response, status, labels, thread_id, received_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                    ON CONFLICT (gmail_id) DO UPDATE SET
                        updated_at = CURRENT_TIMESTAMP,
                        priority = EXCLUDED.priority,
                        is_important = EXCLUDED.is_important,
                        summary = EXCLUDED.summary,
                        suggested_response = EXCLUDED.suggested_response`,
                    [
                        req.user.id, email.gmail_id, email.sender, email.sender_email,
                        email.subject, email.content, email.content_snippet, email.priority,
                        email.is_automated, email.is_important, email.word_tree_summary || email.summary,
                        email.suggested_response, 'unread', JSON.stringify(email.labels),
                        email.thread_id, email.received_at
                    ]
                );
            }

            // Create notifications for important emails
            for (const notification of notifications) {
                await query(
                    `INSERT INTO notifications (
                        user_id, type, title, message, priority, action_required
                    ) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        req.user.id, notification.type, notification.title,
                        notification.message, notification.priority, true
                    ]
                );
            }

            logger.info(`Processed ${processedEmails.length} emails for user ${req.user.id}`);
        }

        // Build dynamic query with sorting and filtering
        let whereClause = 'WHERE user_id = $1';
        let orderByClause = 'ORDER BY received_at DESC';
        let params = [req.user.id];
        let paramIndex = 2;

        // Add priority filter if specified
        if (priority_filter) {
            if (priority_filter === 'high') {
                whereClause += ` AND priority <= 2`;
            } else if (priority_filter === 'medium') {
                whereClause += ` AND priority BETWEEN 3 AND 4`;
            } else if (priority_filter === 'low') {
                whereClause += ` AND priority >= 5`;
            }
        }

        // Add sorting
        if (sort === 'priority') {
            orderByClause = `ORDER BY priority ${order === 'asc' ? 'ASC' : 'DESC'}, received_at DESC`;
        } else if (sort === 'subject') {
            orderByClause = `ORDER BY subject ${order === 'asc' ? 'ASC' : 'DESC'}, received_at DESC`;
        } else if (sort === 'sender') {
            orderByClause = `ORDER BY sender ${order === 'asc' ? 'ASC' : 'DESC'}, received_at DESC`;
        } else {
            orderByClause = `ORDER BY received_at ${order === 'asc' ? 'ASC' : 'DESC'}`;
        }

        // Get emails from database
        const result = await query(
            `SELECT * FROM emails ${whereClause} ${orderByClause} LIMIT $${paramIndex}`,
            [...params, parseInt(limit)]
        );

        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching emails:', error);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
});

// Get email by ID
router.get('/emails/:id', async (req, res) => {
    try {
        const result = await query(
            'SELECT * FROM emails WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error getting email:', error);
        res.status(500).json({ error: 'Failed to get email' });
    }
});

// Update email status (read, archived, etc.)
router.put('/emails/:id', async (req, res) => {
    try {
        const { status } = req.body;
        
        const result = await query(
            'UPDATE emails SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
            [status, req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error updating email:', error);
        res.status(500).json({ error: 'Failed to update email' });
    }
});

// Send email
router.post('/send', async (req, res) => {
    try {
        const { to, subject, body } = req.body;

        if (!to || !subject || !body) {
            return res.status(400).json({ error: 'To, subject, and body are required' });
        }

        const result = await gmailService.sendEmail(req.user.id, to, subject, body);
        res.json({ success: true, messageId: result.id });
    } catch (error) {
        logger.error('Error sending email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// Generate AI response for email
router.post('/emails/:id/respond', async (req, res) => {
    try {
        const { context } = req.body;

        // Get email details
        const emailResult = await query(
            'SELECT * FROM emails WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );

        if (emailResult.rows.length === 0) {
            return res.status(404).json({ error: 'Email not found' });
        }

        const email = emailResult.rows[0];
        const response = await emailAI.generateResponse(email, context);

        res.json({ response });
    } catch (error) {
        logger.error('Error generating response:', error);
        res.status(500).json({ error: 'Failed to generate response' });
    }
});

// Get email statistics
router.get('/stats', async (req, res) => {
    try {
        const stats = await query(
            `SELECT
                COUNT(*) as total_emails,
                COUNT(CASE WHEN status = 'unread' THEN 1 END) as unread_count,
                COUNT(CASE WHEN is_important = true THEN 1 END) as important_count,
                COUNT(CASE WHEN priority <= 2 THEN 1 END) as high_priority_count,
                COUNT(CASE WHEN priority BETWEEN 3 AND 4 THEN 1 END) as medium_priority_count,
                COUNT(CASE WHEN is_automated = true THEN 1 END) as automated_count
             FROM emails
             WHERE user_id = $1`,
            [req.user.id]
        );

        res.json(stats.rows[0]);
    } catch (error) {
        logger.error('Error getting email stats:', error);
        res.status(500).json({ error: 'Failed to get email statistics' });
    }
});

// Get word tree formatted email digest
router.get('/digest', authenticateToken, async (req, res) => {
    try {
        const { limit = 10, priority_filter } = req.query;

        let whereClause = 'WHERE user_id = $1 AND is_important = true';
        let params = [req.user.id];

        if (priority_filter) {
            if (priority_filter === 'high') {
                whereClause += ' AND priority <= 2';
            } else if (priority_filter === 'medium') {
                whereClause += ' AND priority BETWEEN 3 AND 4';
            }
        }

        const result = await query(
            `SELECT * FROM emails ${whereClause}
             ORDER BY priority ASC, received_at DESC
             LIMIT $${params.length + 1}`,
            [...params, parseInt(limit)]
        );

        // Generate word tree digest
        const digest = {
            total_count: result.rows.length,
            high_priority_responses: [],
            medium_priority_summaries: [],
            generated_at: new Date().toISOString()
        };

        for (const email of result.rows) {
            const emailData = {
                id: email.id,
                from: email.sender,
                subject: email.subject,
                received_at: email.received_at,
                priority: email.priority,
                word_tree_summary: email.summary // This now contains the word tree format
            };

            if (email.priority <= 2 && email.suggested_response) {
                emailData.suggested_response = email.suggested_response;
                digest.high_priority_responses.push(emailData);
            } else if (email.priority <= 4) {
                digest.medium_priority_summaries.push(emailData);
            }
        }

        res.json(digest);
    } catch (error) {
        logger.error('Error getting email digest:', error);
        res.status(500).json({ error: 'Failed to get email digest' });
    }
});

// Get summary reports for medium importance emails
router.get('/reports', authenticateToken, async (req, res) => {
    try {
        const result = await query(
            `SELECT * FROM emails
             WHERE user_id = $1 AND is_important = true AND priority BETWEEN 3 AND 4
             ORDER BY received_at DESC
             LIMIT 20`,
            [req.user.id]
        );

        const reports = result.rows.map(email => ({
            id: email.id,
            gmail_id: email.gmail_id,
            from: email.sender,
            subject: email.subject,
            received_at: email.received_at,
            priority: email.priority,
            type: 'medium_importance_summary',
            word_tree_summary: email.summary,
            action_type: 'summary_only'
        }));

        res.json({
            reports,
            count: reports.length,
            message: 'Summary reports for medium-importance emails'
        });
    } catch (error) {
        logger.error('Error getting email reports:', error);
        res.status(500).json({ error: 'Failed to get email reports' });
    }
});

// Get high-priority emails requiring responses
router.get('/responses-required', authenticateToken, async (req, res) => {
    try {
        const result = await query(
            `SELECT * FROM emails
             WHERE user_id = $1 AND is_important = true AND priority <= 2
             AND suggested_response IS NOT NULL
             ORDER BY priority ASC, received_at DESC
             LIMIT 10`,
            [req.user.id]
        );

        const responseEmails = result.rows.map(email => ({
            id: email.id,
            gmail_id: email.gmail_id,
            from: email.sender,
            subject: email.subject,
            received_at: email.received_at,
            priority: email.priority,
            type: 'high_importance_response',
            word_tree_summary: email.summary,
            suggested_response: email.suggested_response,
            action_type: 'response_required'
        }));

        res.json({
            emails: responseEmails,
            count: responseEmails.length,
            message: 'High-priority emails requiring responses'
        });
    } catch (error) {
        logger.error('Error getting response-required emails:', error);
        res.status(500).json({ error: 'Failed to get response-required emails' });
    }
});

module.exports = router;
