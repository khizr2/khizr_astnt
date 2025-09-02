const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const projectRoutes = require('./routes/projects');
const goalRoutes = require('./routes/goals');
const aiRoutes = require('./routes/ai');
const ingestRoutes = require('./routes/ingest');
const gmailRoutes = require('./routes/gmail');
const notificationRoutes = require('./routes/notifications');
const debugRoutes = require('./routes/debug');
const agentRoutes = require('./routes/agents');
const messagingRoutes = require('./routes/messaging');
const chatRoutes = require('./routes/chat');
const preferencesRoutes = require('./routes/preferences');

const { logger } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 10000;

// Trust proxy for reverse proxy deployments (like Render)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://openrouter.ai", "https://api.openrouter.ai"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false // Disable COEP for development
}));
app.use(cors({
    origin: true,
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Static file serving
app.use('/public', express.static('public'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - ${req.ip}`);
    next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ingest', ingestRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/messaging', messagingRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/user/preferences', preferencesRoutes);

// Serve main application
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/app.html');
});

// API health check endpoint
app.get('/api', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Khizr Personal Assistant API',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Error:', err);

    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler - This should be LAST and only catch API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
});

// Start server
const server = app.listen(PORT, () => {
    logger.info(`🚀 Khizr Assistant API running on port ${PORT}`);
    logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
});
