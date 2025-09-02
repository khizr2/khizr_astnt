const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const OpenAI = require('openai');

const router = express.Router();
router.use(authenticateToken);

// Initialize OpenRouter (uses OpenAI-compatible API)
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

// Available models on OpenRouter
const AVAILABLE_MODELS = {
  'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet (Best for quality)',
  'anthropic/claude-3-haiku': 'Claude 3 Haiku (Fast & cheap)',
  'openai/gpt-4o': 'GPT-4o (Latest OpenAI)',
  'openai/gpt-4o-mini': 'GPT-4o Mini (Cheapest option)',
  'google/gemini-pro-1.5': 'Gemini Pro 1.5 (Google\'s model)',
  'meta-llama/llama-3.1-70b-instruct': 'Llama 3.1 70B (Open source)',
  'mistralai/mistral-large': 'Mistral Large (Fast & capable)'
};

// Process chat messages
router.post('/process', async (req, res) => {
  try {
    const { message, model = 'anthropic/claude-3.5-sonnet' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Validate model exists
    if (!AVAILABLE_MODELS[model]) {
      return res.status(400).json({
        error: 'Invalid model selected',
        available_models: Object.keys(AVAILABLE_MODELS),
        model_names: AVAILABLE_MODELS
      });
    }

    logger.info(`Processing chat message with model: ${model}`);

    // Get user's context for personalized responses
    const context = await getUserContext(req.user.id);

    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: `You are a helpful personal assistant for a productivity app.

User Context: ${context}

Guidelines:
- Be helpful, concise, and friendly
- When users mention tasks (zz prefix), acknowledge you'll help create them
- When users ask questions (?), provide informative answers
- When users mark urgent (!!), acknowledge the priority
- Reference their existing tasks/projects when relevant
- Suggest improvements based on their current workload`
        },
        { role: "user", content: message }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    const aiResponse = completion.choices[0].message.content;

    // Detect message type for frontend actions
    const messageType = detectMessageType(message);

    res.json({
      success: true,
      message: aiResponse,
      model_used: model,
      type: messageType,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Chat processing error:', error);

    // Handle specific OpenRouter/API errors
    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded. Please wait a moment and try again.',
        error_type: 'rate_limit'
      });
    }

    if (error.status === 402) {
      return res.status(402).json({
        success: false,
        message: 'API credits exhausted. Please check your OpenRouter account.',
        error_type: 'insufficient_credits'
      });
    }

    if (error.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key. Please check your OpenRouter configuration.',
        error_type: 'auth_error'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Sorry, I encountered an error processing your message. Please try again.',
      error_type: 'processing_error'
    });
  }
});

// Get available models endpoint
router.get('/models', async (req, res) => {
  try {
    res.json({
      success: true,
      models: AVAILABLE_MODELS,
      default_model: 'anthropic/claude-3.5-sonnet',
      recommended_models: {
        quality: 'anthropic/claude-3.5-sonnet',
        speed: 'anthropic/claude-3-haiku',
        cost: 'openai/gpt-4o-mini'
      }
    });
  } catch (error) {
    logger.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch available models' });
  }
});

// Helper function to get user context
async function getUserContext(userId) {
  try {
    const { supabase } = require('../database/connection');

    // Get recent tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('title, status, priority')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5);

    // Get active projects
    const { data: projects } = await supabase
      .from('projects')
      .select('title')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(3);

    const taskCount = tasks?.length || 0;
    const projectCount = projects?.length || 0;

    let context = '';

    if (taskCount > 0) {
      context += `Has ${taskCount} pending tasks`;
      if (tasks.length <= 3) {
        const taskTitles = tasks.map(t => t.title).join(', ');
        context += `: ${taskTitles}`;
      }
    }

    if (projectCount > 0) {
      if (context) context += '. ';
      context += `Working on ${projectCount} projects`;
      if (projects.length <= 3) {
        const projectTitles = projects.map(p => p.title).join(', ');
        context += `: ${projectTitles}`;
      }
    }

    return context || 'No active tasks or projects';

  } catch (error) {
    logger.warn('Failed to get user context:', error);
    return 'Context unavailable';
  }
}

// Detect message type based on prefixes and content
function detectMessageType(message) {
  const msg = message.toLowerCase().trim();

  // Task creation prefixes
  if (msg.startsWith('zz ') || msg.startsWith('zz')) {
    return 'task_created';
  }

  // Urgent task prefix
  if (msg.startsWith('!! ') || msg.startsWith('!!')) {
    return 'urgent_created';
  }

  // Research question prefix
  if (msg.startsWith('? ') || msg.startsWith('?')) {
    return 'research';
  }

  // Task completion keywords
  if (msg.includes('complete') || msg.includes('done') || msg.includes('finish')) {
    return 'task_completion';
  }

  // Project-related keywords
  if (msg.includes('project') || msg.includes('goal')) {
    return 'project_related';
  }

  return 'general_chat';
}

module.exports = router;
