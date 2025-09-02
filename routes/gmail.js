const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { supabase } = require('../database/connection');
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
                const { error } = await supabase
                    .from('emails')
                    .upsert({
                        user_id: req.user.id,
                        gmail_id: email.gmail_id,
                        sender: email.sender,
                        sender_email: email.sender_email,
                        subject: email.subject,
                        content: email.content,
                        content_snippet: email.content_snippet,
                        priority: email.priority,
                        is_automated: email.is_automated,
                        is_important: email.is_important,
                        summary: email.word_tree_summary || email.summary,
                        suggested_response: email.suggested_response,
                        status: 'unread',
                        labels: JSON.stringify(email.labels),
                        thread_id: email.thread_id,
                        received_at: email.received_at,
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'gmail_id'
                    });

                if (error) {
                    logger.error('Error storing email:', error);
                    throw error;
                }
            }

            // Create notifications for important emails
            for (const notification of notifications) {
                const { error } = await supabase
                    .from('notifications')
                    .insert({
                        user_id: req.user.id,
                        type: notification.type,
                        title: notification.title,
                        message: notification.message,
                        priority: notification.priority,
                        action_required: true,
                        created_at: new Date().toISOString()
                    });

                if (error) {
                    logger.error('Error creating notification:', error);
                    throw error;
                }
            }

            logger.info(`Processed ${processedEmails.length} emails for user ${req.user.id}`);
        }

        // Build dynamic query with sorting and filtering
        let queryBuilder = supabase
            .from('emails')
            .select('*')
            .eq('user_id', req.user.id);

        // Add priority filter if specified
        if (priority_filter) {
            if (priority_filter === 'high') {
                queryBuilder = queryBuilder.lte('priority', 2);
            } else if (priority_filter === 'medium') {
                queryBuilder = queryBuilder.gte('priority', 3).lte('priority', 4);
            } else if (priority_filter === 'low') {
                queryBuilder = queryBuilder.gte('priority', 5);
            }
        }

        // Add sorting
        if (sort === 'priority') {
            queryBuilder = queryBuilder.order('priority', { ascending: order === 'asc' }).order('received_at', { ascending: false });
        } else if (sort === 'subject') {
            queryBuilder = queryBuilder.order('subject', { ascending: order === 'asc' }).order('received_at', { ascending: false });
        } else if (sort === 'sender') {
            queryBuilder = queryBuilder.order('sender', { ascending: order === 'asc' }).order('received_at', { ascending: false });
        } else {
            queryBuilder = queryBuilder.order('received_at', { ascending: order === 'asc' ? true : false });
        }

        // Add limit and execute query
        const { data: emails, error } = await queryBuilder.limit(parseInt(limit));

        if (error) {
            logger.error('Error fetching emails:', error);
            throw error;
        }

        res.json(emails);
    } catch (error) {
        logger.error('Error fetching emails:', error);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
});

// Get email by ID
router.get('/emails/:id', async (req, res) => {
    try {
        const { data: email, error } = await supabase
            .from('emails')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
            logger.error('Error getting email:', error);
            throw error;
        }

        if (!email) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json(email);
    } catch (error) {
        logger.error('Error getting email:', error);
        res.status(500).json({ error: 'Failed to get email' });
    }
});

// Update email status (read, archived, etc.)
router.put('/emails/:id', async (req, res) => {
    try {
        const { status } = req.body;

        const { data: email, error } = await supabase
            .from('emails')
            .update({
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
            logger.error('Error updating email:', error);
            throw error;
        }

        if (!email) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json(email);
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
        const { data: email, error } = await supabase
            .from('emails')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
            logger.error('Error getting email for response:', error);
            throw error;
        }

        if (!email) {
            return res.status(404).json({ error: 'Email not found' });
        }
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
        // Get all emails for this user to calculate statistics
        const { data: emails, error } = await supabase
            .from('emails')
            .select('status, is_important, priority, is_automated')
            .eq('user_id', req.user.id);

        if (error) {
            logger.error('Error getting email stats:', error);
            throw error;
        }

        // Calculate statistics
        const stats = {
            total_emails: emails.length,
            unread_count: emails.filter(email => email.status === 'unread').length,
            important_count: emails.filter(email => email.is_important).length,
            high_priority_count: emails.filter(email => email.priority <= 2).length,
            medium_priority_count: emails.filter(email => email.priority >= 3 && email.priority <= 4).length,
            automated_count: emails.filter(email => email.is_automated).length
        };

        res.json(stats);
    } catch (error) {
        logger.error('Error getting email stats:', error);
        res.status(500).json({ error: 'Failed to get email statistics' });
    }
});

// Get word tree formatted email digest
router.get('/digest', authenticateToken, async (req, res) => {
    try {
        const { limit = 10, priority_filter } = req.query;

        let queryBuilder = supabase
            .from('emails')
            .select('*')
            .eq('user_id', req.user.id)
            .eq('is_important', true);

        if (priority_filter) {
            if (priority_filter === 'high') {
                queryBuilder = queryBuilder.lte('priority', 2);
            } else if (priority_filter === 'medium') {
                queryBuilder = queryBuilder.gte('priority', 3).lte('priority', 4);
            }
        }

        const { data: emails, error } = await queryBuilder
            .order('priority', { ascending: true })
            .order('received_at', { ascending: false })
            .limit(parseInt(limit));

        if (error) {
            logger.error('Error getting email digest:', error);
            throw error;
        }

        // Generate word tree digest
        const digest = {
            total_count: emails.length,
            high_priority_responses: [],
            medium_priority_summaries: [],
            generated_at: new Date().toISOString()
        };

        for (const email of emails) {
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
        const { data: emails, error } = await supabase
            .from('emails')
            .select('*')
            .eq('user_id', req.user.id)
            .eq('is_important', true)
            .gte('priority', 3)
            .lte('priority', 4)
            .order('received_at', { ascending: false })
            .limit(20);

        if (error) {
            logger.error('Error getting email reports:', error);
            throw error;
        }

        const reports = emails.map(email => ({
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
        const { data: emails, error } = await supabase
            .from('emails')
            .select('*')
            .eq('user_id', req.user.id)
            .eq('is_important', true)
            .lte('priority', 2)
            .not('suggested_response', 'is', null)
            .order('priority', { ascending: true })
            .order('received_at', { ascending: false })
            .limit(10);

        if (error) {
            logger.error('Error getting response-required emails:', error);
            throw error;
        }

        const responseEmails = emails.map(email => ({
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
