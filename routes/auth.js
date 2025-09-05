const express = require('express');
const { supabase } = require('../database/connection');
const { logger } = require('../utils/logger');

const router = express.Router();

// Register - Now handled by Supabase auth (this endpoint can be removed or kept for legacy)
// This endpoint is kept for compatibility but redirects to Supabase auth
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, phone, timezone } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({
                error: 'Registration should be handled by Supabase auth',
                suggestion: 'Use Supabase auth.signUp() from the frontend'
            });
        }

        // Create user in Supabase auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name,
                    phone: phone || null,
                    timezone: timezone || 'UTC'
                }
            }
        });

        if (authError) {
            return res.status(400).json({ error: authError.message });
        }

        // Also create user record in our users table
        if (authData.user) {
            const { error: dbError } = await supabase
                .from('users')
                .insert([{
                    id: authData.user.id,
                    email,
                    password_hash: '', // Not needed for Supabase auth
                    name,
                    phone: phone || null,
                    timezone: timezone || 'UTC'
                }]);

            if (dbError && !dbError.message.includes('duplicate key')) {
                logger.error('Database user creation error:', dbError);
            }
        }

        res.status(201).json({
            message: 'User created successfully',
            user: authData.user,
            session: authData.session
        });

    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login - Now handled by Supabase auth
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: 'Login should be handled by Supabase auth',
                suggestion: 'Use Supabase auth.signInWithPassword() from the frontend'
            });
        }

        // Authenticate with Supabase
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (authError) {
            return res.status(401).json({ error: authError.message });
        }

        // Ensure user exists in our users table
        if (authData.user) {
            const { data: existingUser } = await supabase
                .from('users')
                .select('id, email, name')
                .eq('id', authData.user.id)
                .single();

            if (!existingUser) {
                // Create user record if it doesn't exist
                const { error: dbError } = await supabase
                    .from('users')
                    .insert([{
                        id: authData.user.id,
                        email: authData.user.email,
                        password_hash: '', // Not needed for Supabase auth
                        name: authData.user.user_metadata?.name || authData.user.email
                    }]);

                if (dbError && !dbError.message.includes('duplicate key')) {
                    logger.error('Database user creation error:', dbError);
                }
            }
        }

        res.json({
            message: 'Login successful',
            user: authData.user,
            session: authData.session
        });

    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Logout - handled by Supabase auth
router.post('/logout', async (req, res) => {
    try {
        // For Supabase auth, logout is handled client-side
        // This endpoint exists for consistency
        res.json({ message: 'Logout successful' });
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get current user session
router.get('/session', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No authorization header' });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid session' });
        }

        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name || user.email
            }
        });
    } catch (error) {
        logger.error('Session check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
