const OpenAI = require('openai');
const { logger } = require('../utils/logger');

class EmailAIProcessor {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    // Analyze email and determine priority, importance, and generate summary
    async analyzeEmail(email) {
        try {
            const prompt = `
Analyze this email and provide a JSON response with the following structure:
{
    "priority": 1-5 (1=urgent, 5=low),
    "is_important": true/false,
    "is_from_person": true/false,
    "summary": "2-3 sentence summary",
    "action_required": true/false,
    "suggested_response": "professional response draft if action_required is true",
    "key_topics": ["topic1", "topic2"],
    "deadlines": ["any deadlines mentioned"],
    "urgency_reason": "why this is urgent/important"
}

Email details:
From: ${email.sender}
Subject: ${email.subject}
Content: ${email.content.substring(0, 1000)}...

Consider:
- Is this from a real person or automated system?
- Does it require immediate attention?
- Are there deadlines or urgent matters?
- Is this business or personal communication?
- Does it need a response?
`;

            const response = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
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
            
            return {
                priority: analysis.priority || 3,
                is_important: analysis.is_important || false,
                is_from_person: analysis.is_from_person || false,
                summary: analysis.summary || '',
                action_required: analysis.action_required || false,
                suggested_response: analysis.suggested_response || '',
                key_topics: analysis.key_topics || [],
                deadlines: analysis.deadlines || [],
                urgency_reason: analysis.urgency_reason || ''
            };
        } catch (error) {
            logger.error('Error analyzing email:', error);
            // Fallback analysis
            return {
                priority: 3,
                is_important: email.is_important || false,
                is_from_person: !email.is_automated,
                summary: email.content_snippet || 'Email content unavailable',
                action_required: false,
                suggested_response: '',
                key_topics: [],
                deadlines: [],
                urgency_reason: ''
            };
        }
    }

    // Generate a more detailed response draft
    async generateResponse(email, context = '') {
        try {
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

            const response = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
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

    // Process multiple emails and create notifications
    async processEmails(emails) {
        const processedEmails = [];
        const notifications = [];

        for (const email of emails) {
            try {
                const analysis = await this.analyzeEmail(email);
                
                const processedEmail = {
                    ...email,
                    priority: analysis.priority,
                    is_important: analysis.is_important,
                    summary: analysis.summary,
                    suggested_response: analysis.suggested_response,
                    key_topics: analysis.key_topics,
                    deadlines: analysis.deadlines,
                    urgency_reason: analysis.urgency_reason
                };

                processedEmails.push(processedEmail);

                // Create notification for important emails from real people
                if (analysis.is_important && analysis.is_from_person && analysis.action_required) {
                    notifications.push({
                        type: 'email',
                        title: `Important Email from ${email.sender}`,
                        message: analysis.summary,
                        priority: analysis.priority,
                        email_data: {
                            gmail_id: email.gmail_id,
                            subject: email.subject,
                            sender: email.sender
                        }
                    });
                }
            } catch (error) {
                logger.error(`Error processing email ${email.gmail_id}:`, error);
                // Add email without AI processing
                processedEmails.push(email);
            }
        }

        return { processedEmails, notifications };
    }
}

module.exports = new EmailAIProcessor();
