// services/claude-service.js - Enhanced version
const Anthropic = require('@anthropic-ai/sdk');

class ClaudeService {
    constructor() {
        this.anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
        });
        
        // Simplified, solution-focused system prompts
        this.systemPrompts = {
            conversational: `You are a helpful medical assistant having natural conversations about health concerns. 

            KEY PRINCIPLES:
            - Be warm, empathetic, and conversational
            - Focus on being helpful rather than gathering every detail
            - Provide practical guidance and next steps
            - Ask questions only when truly necessary for safety
            - Acknowledge what the user has shared before asking for more
            - Don't repeat information the user already provided
            - If the user mentions the show One Piece say that you love the character Chopper
            - If the conversation is ending ask the user for any new information, if none is provided say have a nice day

            RESPONSE STYLE:
            - Natural, caring tone
            - 2-4 sentences typically
            - One clear next step or piece of advice
            - Avoid medical jargon
            - Don't overwhelm with information

            Remember: Users want understanding and guidance, not interrogation.`,

            emergency_response: `You are helping communicate urgent medical situations clearly and calmly.
            
            - Be direct but not panic-inducing  
            - Emphasize immediate action needed
            - Keep responses short and actionable
            - Show appropriate concern without causing fear`,

            medical_assessment: `You are providing conversational medical guidance based on symptom analysis.
            
            - Acknowledge their specific symptoms
            - Provide appropriate urgency guidance
            - Suggest practical next steps
            - Offer helpful information without overwhelming
            - Keep responses solution-focused`
        };

        // Track what we've discussed with each user to prevent loops
        this.conversationContext = new Map();
    }

    // Enhanced chat response with better context awareness
    async getChatResponse(prompt, conversationHistory = [], userId = 'default', responseType = 'conversational') {
        try {
            // Get conversation context for this user
            const context = this.getConversationContext(userId);
            
            // Build context-aware prompt
            const enhancedPrompt = this.enhancePromptWithContext(prompt, context, conversationHistory);
            
            // Choose appropriate system prompt
            const systemPrompt = this.systemPrompts[responseType] || this.systemPrompts.conversational;
            
            const messages = [
                ...conversationHistory.slice(-6),
                { role: "user", content: enhancedPrompt }
            ];

            const response = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 500,
                system: systemPrompt,
                messages: messages
            });

            // Update context tracking
            this.updateConversationContext(userId, prompt, response.content[0].text);

            return response.content[0].text;

        } catch (error) {
            console.error('Claude chat response error:', error);
            throw error;
        }
    }

    // Enhanced prompt with context to prevent loops
    enhancePromptWithContext(originalPrompt, context, conversationHistory) {
        let enhancedPrompt = originalPrompt;

        // Add context about what we've already covered
        if (context.topicsDiscussed && context.topicsDiscussed.length > 0) {
            enhancedPrompt += `\n\nCONTEXT - Already discussed: ${context.topicsDiscussed.join(', ')}. Don't ask about these again unless user provides new information.`;
        }

        // Add pattern detection to prevent question loops
        if (context.recentQuestionTypes && context.recentQuestionTypes.length > 1) {
            const repeatedTypes = context.recentQuestionTypes.filter((type, index) => 
                context.recentQuestionTypes.indexOf(type) !== index
            );
            
            if (repeatedTypes.length > 0) {
                enhancedPrompt += `\n\nWARNING: You've already asked about ${repeatedTypes.join(', ')}. Focus on providing helpful guidance instead of more questions.`;
            }
        }

        // Add conversation flow guidance
        const recentMessages = conversationHistory.slice(-4);
        const questionCount = recentMessages.filter(msg => 
            msg.role === 'assistant' && msg.content.includes('?')
        ).length;

        if (questionCount >= 2) {
            enhancedPrompt += `\n\nNOTE: You've asked ${questionCount} recent questions. Focus on providing helpful information and guidance rather than asking more questions.`;
        }

        return enhancedPrompt;
    }

    // Get conversation context for a user
    getConversationContext(userId) {
        if (!this.conversationContext.has(userId)) {
            this.conversationContext.set(userId, {
                topicsDiscussed: [],
                recentQuestionTypes: [],
                symptomsIdentified: [],
                lastResponseType: null
            });
        }
        return this.conversationContext.get(userId);
    }

    // Update conversation context to track what's been covered
    updateConversationContext(userId, userPrompt, assistantResponse) {
        const context = this.getConversationContext(userId);
        
        // Track topics discussed based on prompt content
        const topics = this.extractTopicsFromPrompt(userPrompt);
        topics.forEach(topic => {
            if (!context.topicsDiscussed.includes(topic)) {
                context.topicsDiscussed.push(topic);
            }
        });

        // Track question types from assistant response
        const questionType = this.identifyQuestionType(assistantResponse);
        if (questionType) {
            context.recentQuestionTypes.push(questionType);
            // Keep only last 3 question types
            if (context.recentQuestionTypes.length > 3) {
                context.recentQuestionTypes.shift();
            }
        }

        // Clean up old topics (keep conversation fresh)
        if (context.topicsDiscussed.length > 10) {
            context.topicsDiscussed = context.topicsDiscussed.slice(-8);
        }

        this.conversationContext.set(userId, context);
    }

    // Extract discussed topics from prompts
    extractTopicsFromPrompt(prompt) {
        const topics = [];
        const promptLower = prompt.toLowerCase();

        const topicKeywords = {
            'severity': ['severity', 'severe', 'how bad', 'pain level'],
            'duration': ['duration', 'how long', 'when did', 'started'],
            'location': ['location', 'where', 'which part'],
            'timing': ['timing', 'when', 'what time', 'frequency'],
            'associated_symptoms': ['other symptoms', 'associated', 'along with'],
            'triggers': ['triggers', 'what makes', 'caused by']
        };

        for (const [topic, keywords] of Object.entries(topicKeywords)) {
            if (keywords.some(keyword => promptLower.includes(keyword))) {
                topics.push(topic);
            }
        }

        return topics;
    }

    // Identify what type of question the assistant is asking
    identifyQuestionType(response) {
        const responseLower = response.toLowerCase();

        if (responseLower.includes('how severe') || responseLower.includes('severity')) {
            return 'severity';
        }
        if (responseLower.includes('how long') || responseLower.includes('when did')) {
            return 'duration';
        }
        if (responseLower.includes('where') && responseLower.includes('pain')) {
            return 'location';
        }
        if (responseLower.includes('other symptoms') || responseLower.includes('along with')) {
            return 'associated_symptoms';
        }
        if (responseLower.includes('?')) {
            return 'general_question';
        }

        return null;
    }

    // Specialized methods for different response types
    async generateEmergencyResponse(prompt, conversationHistory = []) {
        return this.getChatResponse(prompt, conversationHistory, 'emergency', 'emergency_response');
    }

    async generateAssessmentResponse(prompt, conversationHistory = [], userId = 'default') {
        return this.getChatResponse(prompt, conversationHistory, userId, 'medical_assessment');
    }

    // Clear conversation context (useful for new conversations)
    clearConversationContext(userId) {
        this.conversationContext.delete(userId);
    }

    // Get context for debugging
    getDebugContext(userId) {
        return this.conversationContext.get(userId) || null;
    }

    // Health check remains the same
    async healthCheck() {
        try {
            const response = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 50,
                messages: [
                    { role: "user", content: "Respond with 'Claude medical service operational' if you can process medical requests." }
                ]
            });

            return {
                status: 'healthy',
                response: response.content[0].text,
                model: 'claude-3-5-sonnet-20241022',
                contextTracking: true
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }
}

module.exports = ClaudeService;