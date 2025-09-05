const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const OpenAI = require('openai');
const { GlobalPreferenceLearner } = require('../services/PreferenceLearner');

const router = express.Router();
router.use(authenticateToken);

// Initialize OpenRouter (uses OpenAI-compatible API)
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

// Initialize Global Preference Learner
const preferenceLearner = new GlobalPreferenceLearner();

// Available models on OpenRouter (Free Models)
const AVAILABLE_MODELS = {
  // Premium Paid Models
  'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet (Best for quality)',
  'anthropic/claude-3-haiku': 'Claude 3 Haiku (Fast & cheap)',
  'openai/gpt-4o': 'GPT-4o (Latest OpenAI)',
  'openai/gpt-4o-mini': 'GPT-4o Mini (Cheapest option)',
  'google/gemini-pro-1.5': 'Gemini Pro 1.5 (Google\'s model)',
  'meta-llama/llama-3.1-70b-instruct': 'Llama 3.1 70B (Open source)',
  'mistralai/mistral-large': 'Mistral Large (Fast & capable)',

  // Free Models - DeepSeek Family
  'deepseek/deepseek-r1:free': 'DeepSeek R1 0528 (Free - Best Reasoning)',
  'deepseek/deepseek-v3-0324:free': 'DeepSeek V3 0324 (Free - Balanced)',
  'tng/deepseek-r1t2-chimera:free': 'DeepSeek R1T2 Chimera (Free - Fast Reasoning)',
  'deepseek/deepseek-r1': 'DeepSeek R1 (Free - Open Source Reasoning)',
  'deepseek/deepseek-v3.1': 'DeepSeek V3.1 (Free - Hybrid Reasoning)',

  // Free Models - Other Providers
  'z-ai/glm-4.5-air:free': 'GLM 4.5 Air (Free - Agent Focused)',
  'qwen/qwen3-coder-480b-a35b:free': 'Qwen3 Coder 480B (Free - Code Expert)',
  'tng/deepseek-r1t-chimera:free': 'DeepSeek R1T Chimera (Free - Efficient)',
  'moonshotai/kimi-k2:free': 'Kimi K2 (Free - MoE Expert)'
};

// Process chat messages
router.post('/process', async (req, res) => {
  try {
    const { message, model = 'deepseek/deepseek-r1:free' } = req.body;

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

    // Apply global preferences to personalize AI responses
    const personalizedContext = await preferenceLearner.applyGlobalPreferences(req.user.id, {
      model: model,
      temperature: 0.7,
      max_tokens: 1000
    });

    // Build system prompt with user context and preferences
    let systemPrompt = `You are a helpful personal assistant for a productivity app.

User Context: ${context}

Guidelines:
- Be helpful, concise, and friendly
- Use structured markdown formatting for better readability
- When providing complex information, use headers, lists, and code blocks
- When users mention tasks (zz prefix), acknowledge you'll help create them
- When users ask questions (?), provide informative answers
- When users mark urgent (!!), acknowledge the priority
- When users mention projects (pp prefix), acknowledge you'll help create them
- When users say "create project" or similar, offer to create the project for them
- Reference their existing tasks/projects when relevant
- Suggest improvements based on their current workload
- Format responses with clear sections and bullet points when appropriate`;

    // Add preference-based system prompt additions
    if (personalizedContext.system_prompt_addition) {
      systemPrompt += personalizedContext.system_prompt_addition;
    }

    // Add word tree formatting instruction if user prefers it
    if (personalizedContext.response_format === 'word_tree') {
      systemPrompt += '\n\nIMPORTANT: Structure your responses using word tree format with clear hierarchical organization, bullet points, and code blocks for technical content.';
    }

    const completion = await openai.chat.completions.create({
      model: personalizedContext.model || model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        { role: "user", content: message }
      ],
      max_tokens: personalizedContext.max_tokens || 1000,
      temperature: personalizedContext.temperature || 0.7
    });

    const aiResponse = completion.choices[0].message.content;

    // Learn from this interaction to improve future responses
    try {
      await preferenceLearner.learnFromInteraction(req.user.id, {
        message: message,
        response: aiResponse,
        timestamp: new Date().toISOString(),
        model: model,
        context: context
      });
    } catch (learningError) {
      logger.warn('Preference learning failed, continuing with response:', learningError);
    }

    // Detect message type for frontend actions
    const messageType = detectMessageType(message);

    // Handle task creation for 'zz' and '!!' prefixes
    let taskResult = null;
    if (messageType === 'task_created' || messageType === 'urgent_created') {
      taskResult = await createTaskFromChat(message, req.user.id);
    }

    // Handle project creation for 'pp' prefix or project-related keywords
    let projectResult = null;
    if (messageType === 'project_created' || messageType === 'project_related') {
      projectResult = await createProjectFromChat(message, req.user.id);
    }

    // Prepare response
    const response = {
      success: true,
      message: aiResponse,
      model_used: model,
      type: messageType,
      timestamp: new Date().toISOString()
    };

    // Add task creation result if applicable
    if (taskResult) {
      response.task_created = taskResult.success;
      response.task_message = taskResult.message;
      if (taskResult.task) {
        response.task_id = taskResult.task.id;
        response.task_title = taskResult.task.title;
        response.task_priority = taskResult.task.priority;
      }
      if (taskResult.error) {
        response.task_error = taskResult.error;
      }
    }

    // Add project creation result if applicable
    if (projectResult) {
      response.project_created = projectResult.success;
      response.project_message = projectResult.message;
      if (projectResult.project) {
        response.project_id = projectResult.project.id;
        response.project_title = projectResult.project.title;
      }
      if (projectResult.error) {
        response.project_error = projectResult.error;
      }
    }

    res.json(response);

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
    // Categorize models for better UX
    const categorizedModels = {
      free: {
        'deepseek/deepseek-r1:free': 'DeepSeek R1 0528 (Free - Best Reasoning)',
        'deepseek/deepseek-v3-0324:free': 'DeepSeek V3 0324 (Free - Balanced)',
        'tng/deepseek-r1t2-chimera:free': 'DeepSeek R1T2 Chimera (Free - Fast Reasoning)',
        'deepseek/deepseek-r1': 'DeepSeek R1 (Free - Open Source Reasoning)',
        'deepseek/deepseek-v3.1': 'DeepSeek V3.1 (Free - Hybrid Reasoning)',
        'z-ai/glm-4.5-air:free': 'GLM 4.5 Air (Free - Agent Focused)',
        'qwen/qwen3-coder-480b-a35b:free': 'Qwen3 Coder 480B (Free - Code Expert)',
        'tng/deepseek-r1t-chimera:free': 'DeepSeek R1T Chimera (Free - Efficient)',
        'moonshotai/kimi-k2:free': 'Kimi K2 (Free - MoE Expert)'
      },
      premium: {
        'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet (Best for quality)',
        'anthropic/claude-3-haiku': 'Claude 3 Haiku (Fast & cheap)',
        'openai/gpt-4o': 'GPT-4o (Latest OpenAI)',
        'openai/gpt-4o-mini': 'GPT-4o Mini (Cheapest option)',
        'google/gemini-pro-1.5': 'Gemini Pro 1.5 (Google\'s model)',
        'meta-llama/llama-3.1-70b-instruct': 'Llama 3.1 70B (Open source)',
        'mistralai/mistral-large': 'Mistral Large (Fast & capable)'
      }
    };

    res.json({
      success: true,
      models: AVAILABLE_MODELS,
      categorized_models: categorizedModels,
      default_model: 'deepseek/deepseek-r1:free',
      recommended_models: {
        free_reasoning: 'deepseek/deepseek-r1:free',
        free_balanced: 'deepseek/deepseek-v3-0324:free',
        free_fast: 'tng/deepseek-r1t2-chimera:free',
        free_coding: 'qwen/qwen3-coder-480b-a35b:free',
        premium_quality: 'anthropic/claude-3.5-sonnet',
        premium_speed: 'anthropic/claude-3-haiku',
        premium_cost: 'openai/gpt-4o-mini'
      },
      free_models_available: Object.keys(categorizedModels.free).length,
      total_models: Object.keys(AVAILABLE_MODELS).length
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

// Create task from chat message
async function createTaskFromChat(chatMessage, userId) {
  try {
    const { supabase } = require('../database/connection');

    // Extract task content by removing prefix
    let fullContent = chatMessage.trim();
    let priority = 3; // Default normal priority

    if (chatMessage.toLowerCase().startsWith('zz ')) {
      fullContent = chatMessage.substring(3).trim();
      priority = 3; // Normal priority
    } else if (chatMessage.toLowerCase().startsWith('!! ')) {
      fullContent = chatMessage.substring(3).trim();
      priority = 1; // Urgent priority
    } else if (chatMessage.toLowerCase().startsWith('zz')) {
      fullContent = chatMessage.substring(2).trim();
      priority = 3;
    } else if (chatMessage.toLowerCase().startsWith('!!')) {
      fullContent = chatMessage.substring(2).trim();
      priority = 1;
    }

    // Don't create empty tasks
    if (!fullContent) {
      return { success: false, error: 'Task content cannot be empty' };
    }

    // Use full content as title (after VARCHAR limit increase)
    let title = fullContent;
    let description = null;

    // Insert task into database
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        title: title,
        priority: priority,
        status: 'pending',
        source: 'chat'
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating task from chat:', error);
      return { success: false, error: 'Failed to create task' };
    }

    logger.info(`Created task from chat: "${title}" (priority: ${priority}) for user: ${userId}`);
    const priorityText = priority === 1 ? 'urgent' : 'normal';

    return {
      success: true,
      task: data,
      message: `Task "${title}" created successfully with ${priorityText} priority.`
    };

  } catch (error) {
    logger.error('Error in createTaskFromChat:', error);
    return { success: false, error: 'Internal server error creating task' };
  }
}

// Create project from chat message
async function createProjectFromChat(chatMessage, userId) {
  try {
    const { supabase } = require('../database/connection');

    // Extract project content by removing prefix
    let fullContent = chatMessage.trim();
    let projectType = 'project';
    let category = 'personal';

    if (chatMessage.toLowerCase().startsWith('pp ')) {
      fullContent = chatMessage.substring(3).trim();
    } else if (chatMessage.toLowerCase().startsWith('pp')) {
      fullContent = chatMessage.substring(2).trim();
    }

    // Don't create empty projects
    if (!fullContent) {
      return { success: false, error: 'Project name cannot be empty' };
    }

    // Try to extract project details from the message
    let title = fullContent;
    let description = null;

    // Simple parsing to extract title and description
    if (fullContent.includes(' - ') || fullContent.includes(': ')) {
      const parts = fullContent.split(/ - |: /);
      title = parts[0].trim();
      description = parts.slice(1).join(' ').trim();
    }

    // Detect project type from keywords
    if (title.toLowerCase().includes('goal') || title.toLowerCase().includes('objective')) {
      projectType = 'goal';
    }

    // Detect category from keywords
    if (title.toLowerCase().includes('work') || title.toLowerCase().includes('business')) {
      category = 'work';
    } else if (title.toLowerCase().includes('personal') || title.toLowerCase().includes('home')) {
      category = 'personal';
    } else if (title.toLowerCase().includes('learning') || title.toLowerCase().includes('study')) {
      category = 'learning';
    }

    // Insert project into database
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        title: title,
        description: description,
        priority: 3, // Default priority
        category: category,
        project_type: projectType,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating project from chat:', error);
      return { success: false, error: 'Failed to create project' };
    }

    logger.info(`Created project from chat: "${title}" (${category}) for user: ${userId}`);

    return {
      success: true,
      project: data,
      message: `Project "${title}" created successfully in ${category} category.`
    };

  } catch (error) {
    logger.error('Error in createProjectFromChat:', error);
    return { success: false, error: 'Internal server error creating project' };
  }
}

// Detect message type based on prefixes and content
function detectMessageType(message) {
  const msg = message.toLowerCase().trim();

  // Project creation prefix
  if (msg.startsWith('pp ') || msg.startsWith('pp')) {
    return 'project_created';
  }

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

  // Project-related keywords (only if not already handled by prefix)
  if (msg.includes('create project') || msg.includes('new project') ||
      msg.includes('start project') || msg.includes('project called') ||
      msg.includes('project named')) {
    return 'project_created';
  }

  // General project discussion
  if (msg.includes('project') || msg.includes('goal')) {
    return 'project_related';
  }

  return 'general_chat';
}

// Get chat history
router.get('/history', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    // For now, return empty array since we don't have a dedicated chat messages table
    // In the future, this could query a chat_messages table or agent_conversations
    const messages = [];

    res.json({
      success: true,
      messages: messages,
      total: messages.length
    });
  } catch (error) {
    logger.error('Get chat history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load chat history'
    });
  }
});

// Feedback endpoint for learning from user responses
router.post('/feedback', async (req, res) => {
  try {
    const { messageId, feedback } = req.body;

    if (!messageId || !feedback) {
      return res.status(400).json({ error: 'messageId and feedback are required' });
    }

    if (!['positive', 'negative'].includes(feedback)) {
      return res.status(400).json({ error: 'feedback must be either "positive" or "negative"' });
    }

    // Learn from feedback using the preference learner
    await preferenceLearner.learnFromFeedback(req.user.id, {
      messageId,
      feedback,
      timestamp: new Date().toISOString()
    });

    logger.info(`Feedback received: ${feedback} for message ${messageId} from user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Feedback recorded successfully'
    });
  } catch (error) {
    logger.error('Error processing feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process feedback'
    });
  }
});

module.exports = router;

// Export functions for testing
module.exports.createTaskFromChat = createTaskFromChat;
module.exports.createProjectFromChat = createProjectFromChat;
module.exports.getUserContext = getUserContext;
