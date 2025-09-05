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
const configRoutes = require('./routes/config');

const { logger } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 10000;

// Trust proxy for reverse proxy deployments (like Render)
app.set('trust proxy', 1);

// Security middleware - TEMPORARILY DISABLED CSP FOR DEBUGGING
// if (process.env.NODE_ENV === 'production') {
//     app.use(helmet({
//         contentSecurityPolicy: {
//             directives: {
//                 defaultSrc: ["'self'"],
//                 styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
//                 scriptSrc: ["'self'"],
//                 imgSrc: ["'self'", "data:", "https:"],
//                 connectSrc: ["'self'", "https://openrouter.ai", "https://api.openrouter.ai"],
//                 fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
//                 objectSrc: ["'none'"],
//                 mediaSrc: ["'self'"],
//                 frameSrc: ["'none'"],
//             },
//         },
//         crossOriginEmbedderPolicy: false
//     }));
// } else {
    // Development mode - minimal security headers
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
    }));
// }
// CORS configuration for multiple deployment platforms
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            // Netlify frontend
            'https://euphonious-puppy-a1c1c7.netlify.app',
            // Local development
            'http://localhost:3000',
            'http://localhost:10000',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:10000',
            // Add your custom domain if you have one
            'https://www.khizrkazmi.com'
        ];

        // Allow all localhost and 127.0.0.1 for development
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        // In development, allow all origins
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }

        console.warn(`CORS: Blocked origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Add dynamic env.js route for frontend environment variables
app.get('/env.js', (_req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send(`window.SUPABASE_URL = '${process.env.SUPABASE_URL}';\nwindow.SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY}';\nwindow.API_BASE_URL = '${process.env.API_BASE_URL || ''}';`);
});

// Static file serving
app.use(express.static('public'));

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
app.use('/api/config', configRoutes);

// Serve main application
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Serve login page
app.get('/index.html', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Serve main app page
app.get('/app.html', (req, res) => {
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
