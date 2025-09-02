const OpenAI = require('openai');
const { logger } = require('../utils/logger');

class EmailAIProcessor {
    constructor() {
        // Initialize available AI services
        this.aiServices = {};

        // OpenAI (primary)
        if (process.env.OPENAI_API_KEY) {
            this.aiServices.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
        }

        // LMStudio (localhost)
        if (process.env.LMSTUDIO_BASE_URL) {
            this.aiServices.lmstudio = new OpenAI({
                baseURL: process.env.LMSTUDIO_BASE_URL + "/v1",
                apiKey: "lm-studio" // LMStudio doesn't require a real key
            });
        }

        // OpenRouter (structure ready but disabled for now)
        if (process.env.OPENROUTER_API_KEY && process.env.ENABLE_OPENROUTER === 'true') {
            this.aiServices.openrouter = new OpenAI({
                baseURL: "https://openrouter.ai/api/v1",
                apiKey: process.env.OPENROUTER_API_KEY
            });
        }

        // Default to first available service
        this.defaultService = Object.keys(this.aiServices)[0] || null;
    }

    // Get the appropriate AI service
    getAIService(serviceName = null) {
        if (serviceName && this.aiServices[serviceName]) {
            return this.aiServices[serviceName];
        }
        return this.aiServices[this.defaultService];
    }

    // Analyze email and determine priority, importance, and generate word tree summary
    async analyzeEmail(email, serviceName = null) {
        try {
            const aiService = this.getAIService(serviceName);
            if (!aiService) {
                throw new Error('No AI service available for email analysis');
            }

            const prompt = `
    Analyze this email and provide a JSON response with the following structure:
{
    "priority": 1-5 (1=urgent/high-importance, 5=low),
    "is_important": true/false,
    "is_from_person": true/false,
    "word_tree": {
        "main_topic": "single main topic",
        "subtopics": ["subtopic1", "subtopic2"],
        "key_points": ["point1", "point2"],
        "action_items": ["action1", "action2"],
        "deadlines": ["deadline1", "deadline2"],
        "sentiment": "positive/negative/neutral"
    },
    "action_required": true/false,
    "suggested_response": "professional response draft if action_required is true and priority <=2",
    "urgency_reason": "why this is urgent/high-importance",
    "response_needed": true/false
}

Email details:
From: ${email.sender}
Subject: ${email.subject}
Content: ${email.content.substring(0, 1000)}...

Consider:
- Is this from a real person or automated system?
- Does it require immediate attention or response?
- Are there deadlines or urgent matters?
- Is this business-critical or personal?
- What are the main topics and subtopics?
- What actions are needed?
- Priority 1-2 = High importance (needs response)
- Priority 3-4 = Medium importance (needs summary report)
- Priority 5 = Low importance (can be ignored)
`;

            // Choose model based on service
            let model = "gpt-3.5-turbo";
            if (serviceName === 'lmstudio') {
                model = process.env.LMSTUDIO_MODEL || "local-model";
            } else if (serviceName === 'openrouter') {
                model = process.env.OPENROUTER_MODEL || "anthropic/claude-3-haiku";
            }

            const response = await aiService.chat.completions.create({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: "You are an AI assistant that analyzes emails for priority and importance. Respond only with valid JSON."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 500
            });

            const analysis = JSON.parse(response.choices[0].message.content);

            // Generate word tree formatted summary
            const wordTreeSummary = this.formatWordTreeSummary(analysis.word_tree);

            return {
                priority: analysis.priority || 3,
                is_important: analysis.is_important || false,
                is_from_person: analysis.is_from_person || false,
                word_tree: analysis.word_tree || {},
                word_tree_summary: wordTreeSummary,
                action_required: analysis.action_required || false,
                suggested_response: analysis.priority <= 2 ? analysis.suggested_response || '' : '',
                response_needed: analysis.response_needed || false,
                urgency_reason: analysis.urgency_reason || '',
                // For backward compatibility
                summary: wordTreeSummary,
                key_topics: analysis.word_tree?.subtopics || [],
                deadlines: analysis.word_tree?.deadlines || []
            };
        } catch (error) {
            logger.error('Error analyzing email:', error);
            // Fallback analysis
            return {
                priority: 3,
                is_important: email.is_important || false,
                is_from_person: !email.is_automated,
                word_tree: {
                    main_topic: 'Email Communication',
                    subtopics: ['General correspondence'],
                    key_points: [email.content_snippet || 'Content unavailable'],
                    action_items: [],
                    deadlines: [],
                    sentiment: 'neutral'
                },
                word_tree_summary: this.formatWordTreeSummary({
                    main_topic: 'Email Communication',
                    subtopics: ['General correspondence'],
                    key_points: [email.content_snippet || 'Content unavailable'],
                    action_items: [],
                    deadlines: [],
                    sentiment: 'neutral'
                }),
                action_required: false,
                suggested_response: '',
                response_needed: false,
                urgency_reason: '',
                // For backward compatibility
                summary: email.content_snippet || 'Email content unavailable',
                key_topics: [],
                deadlines: []
            };
        }
    }

    // Format analysis into word tree structure for concise information display
    formatWordTreeSummary(wordTree) {
        if (!wordTree) return 'No analysis available';

        let tree = `📧 ${wordTree.main_topic || 'Email'}\n`;

        if (wordTree.subtopics && wordTree.subtopics.length > 0) {
            tree += `├── ${wordTree.subtopics.join(', ')}\n`;
        }

        if (wordTree.key_points && wordTree.key_points.length > 0) {
            tree += `├── Key Points:\n`;
            wordTree.key_points.forEach(point => {
                tree += `│   └── ${point}\n`;
            });
        }

        if (wordTree.action_items && wordTree.action_items.length > 0) {
            tree += `├── Actions:\n`;
            wordTree.action_items.forEach(action => {
                tree += `│   └── ${action}\n`;
            });
        }

        if (wordTree.deadlines && wordTree.deadlines.length > 0) {
            tree += `├── Deadlines:\n`;
            wordTree.deadlines.forEach(deadline => {
                tree += `│   └── ${deadline}\n`;
            });
        }

        if (wordTree.sentiment) {
            const sentimentEmoji = {
                'positive': '😊',
                'negative': '😟',
                'neutral': '😐'
            };
            tree += `└── Sentiment: ${sentimentEmoji[wordTree.sentiment] || '😐'} ${wordTree.sentiment}\n`;
        }

        return tree;
    }

    // Generate summary report for medium-importance emails (priority 3-4)
    generateSummaryReport(email, analysis) {
        if (analysis.priority > 4) return null; // Skip low priority emails

        const report = {
            type: analysis.priority <= 2 ? 'high_importance_response' : 'medium_importance_summary',
            priority: analysis.priority,
            word_tree_summary: analysis.word_tree_summary,
            email_details: {
                from: email.sender,
                subject: email.subject,
                received: email.received_at
            }
        };

        if (analysis.priority <= 2 && analysis.suggested_response) {
            report.suggested_response = analysis.suggested_response;
            report.action_type = 'response_required';
        } else {
            report.action_type = 'summary_only';
        }

        return report;
    }

    // Generate a more detailed response draft
    async generateResponse(email, context = '', serviceName = null) {
        try {
            const aiService = this.getAIService(serviceName);
            if (!aiService) {
                throw new Error('No AI service available for response generation');
            }

            const prompt = `
Generate a professional email response based on the following email:

Original Email:
From: ${email.sender}
Subject: ${email.subject}
Content: ${email.content.substring(0, 800)}...

Context: ${context}

Requirements:
- Professional and courteous tone
- Address the main points from the original email
- Keep it concise but complete
- Include appropriate greeting and closing
- If it's a question, provide a clear answer
- If it's a request, acknowledge and respond appropriately

Generate only the email body content (no subject line or headers):
`;

            // Choose model based on service
            let model = "gpt-3.5-turbo";
            if (serviceName === 'lmstudio') {
                model = process.env.LMSTUDIO_MODEL || "local-model";
            } else if (serviceName === 'openrouter') {
                model = process.env.OPENROUTER_MODEL || "anthropic/claude-3-haiku";
            }

            const response = await aiService.chat.completions.create({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: "You are a professional email assistant. Generate clear, professional email responses."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 300
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            logger.error('Error generating response:', error);
            return 'Thank you for your email. I will review and respond shortly.';
        }
    }

    // Process multiple emails and create notifications and reports
    async processEmails(emails) {
        const processedEmails = [];
        const notifications = [];
        const reports = [];

        for (const email of emails) {
            try {
                const analysis = await this.analyzeEmail(email);

                const processedEmail = {
                    ...email,
                    priority: analysis.priority,
                    is_important: analysis.is_important,
                    summary: analysis.word_tree_summary,
                    suggested_response: analysis.suggested_response,
                    key_topics: analysis.key_topics,
                    deadlines: analysis.deadlines,
                    urgency_reason: analysis.urgency_reason,
                    word_tree: analysis.word_tree,
                    response_needed: analysis.response_needed
                };

                processedEmails.push(processedEmail);

                // Generate summary report for all important emails
                if (analysis.is_important) {
                    const report = this.generateSummaryReport(email, analysis);
                    if (report) {
                        reports.push(report);

                        // Create notification for high-importance emails that need responses
                        if (analysis.priority <= 2 && analysis.response_needed) {
                            notifications.push({
                                type: 'email_response_required',
                                title: `🚨 Response Required: ${email.sender}`,
                                message: analysis.word_tree_summary,
                                priority: analysis.priority,
                                email_data: {
                                    gmail_id: email.gmail_id,
                                    subject: email.subject,
                                    sender: email.sender,
                                    suggested_response: analysis.suggested_response
                                }
                            });
                        } else if (analysis.priority <= 4) {
                            // Notification for medium-importance emails (summary only)
                            notifications.push({
                                type: 'email_summary',
                                title: `📋 Email Summary: ${email.sender}`,
                                message: analysis.word_tree_summary,
                                priority: analysis.priority,
                                email_data: {
                                    gmail_id: email.gmail_id,
                                    subject: email.subject,
                                    sender: email.sender
                                }
                            });
                        }
                    }
                }
            } catch (error) {
                logger.error(`Error processing email ${email.gmail_id}:`, error);
                // Add email without AI processing
                processedEmails.push(email);
            }
        }

        return { processedEmails, notifications, reports };
    }
}

module.exports = new EmailAIProcessor();
