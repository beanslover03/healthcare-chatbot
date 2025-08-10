// services/claude-service.js - FIXED VERSION
const Anthropic = require('@anthropic-ai/sdk');

class ClaudeService {
    constructor() {
        this.anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });
        
        this.medicalData = {
            conditions: require('../data/conditions.json'),
            symptoms: require('../data/symptoms.json'),
            medications: require('../data/otc-medications.json')
        };

        // FIXED: Much simpler, more conversational system prompts
        this.systemPrompts = {
            conversational: `You are a warm, helpful medical assistant having natural conversations.

CONVERSATION RULES:
- Respond directly to what the user says without explaining your process
- Be empathetic and supportive, not clinical
- Keep responses to 1-3 sentences unless emergency
- Don't repeat information the user already gave you
- If user switches topics, switch with them immediately
- When conversation seems done, ask if there's anything else or say goodbye naturally
- If user mentions One Piece, mention you love Chopper

RESPONSE STYLE:
- Natural, caring tone like talking to a friend
- "I understand you're dealing with..." not "Based on your symptoms..."
- "That sounds concerning" not "This requires medical evaluation"
- Focus on being helpful, not thorough

Remember: Users want understanding and quick help, not medical lectures.`,

            emergency_response: `Respond to medical emergencies with urgent but calm guidance.
- Be direct: "This sounds serious, please call 911"
- Don't explain why or give medical details
- Keep very short and actionable`,

            ending_conversation: `The user wants to end the conversation.
- Be warm and supportive
- Quick goodbye with care message
- Don't ask more questions`
        };
    }

    // FIXED: Simpler response generation
    async getChatResponse(prompt, conversationHistory = [], responseType = 'conversational') {
        try {
            const systemPrompt = this.systemPrompts[responseType] || this.systemPrompts.conversational;
            
            // FIXED: Don't overthink the prompt - let Claude be natural
            const messages = [
                ...conversationHistory.slice(-4), // Less history = less confusion
                { role: "user", content: prompt }
            ];

            const response = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 300, // FIXED: Shorter responses
                temperature: 0.7, // FIXED: More natural variation
                system: systemPrompt,
                messages: messages
            });

            return response.content[0].text;

        } catch (error) {
            console.error('Claude chat response error:', error);
            throw error;
        }
    }

    // FIXED: Detect conversation ending signals
    isConversationEnding(userMessage) {
        const endingSignals = [
            'thanks', 'thank you', 'that helps', 'that\'s all', 'i\'m good',
            'goodbye', 'bye', 'no more questions', 'done', 'ok thanks'
        ];
        
        const messageLower = userMessage.toLowerCase();
        return endingSignals.some(signal => messageLower.includes(signal));
    }

    // FIXED: Simple emergency detection  
    isEmergency(userMessage) {
        const messageLower = userMessage.toLowerCase();
        
        // Use your emergency conditions data
        const emergencyConditions = this.medicalData.conditions.emergency_conditions;
        
        for (const [conditionId, condition] of Object.entries(emergencyConditions)) {
            for (const symptom of condition.symptoms) {
                if (messageLower.includes(symptom.toLowerCase())) {
                    return true;
                }
            }
        }
        
        // Keep existing simple keywords as backup
        const emergencyKeywords = [
            'can\'t breathe', 'crushing chest', 'call 911', 'emergency',
            'severe chest pain', 'worst headache ever', 'losing consciousness'
        ];
        
        return emergencyKeywords.some(keyword => messageLower.includes(keyword));
    }

    // FIXED: Generate ending responses
    async generateEndingResponse(conversationHistory = []) {
        return this.getChatResponse(
            "User is ending the conversation. Give a warm, caring goodbye.",
            conversationHistory,
            'ending_conversation'
        );
    }

    // FIXED: Generate emergency responses
    async generateEmergencyResponse(userMessage, conversationHistory = []) {
        return this.getChatResponse(
            `User said: "${userMessage}" - This seems like a medical emergency. Respond with urgent but calm guidance.`,
            conversationHistory,
            'emergency_response'
        );
    }

    async healthCheck() {
        try {
            const response = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 50,
                messages: [
                    { role: "user", content: "Say 'Claude ready' if you can help with medical conversations." }
                ]
            });

            return {
                status: 'healthy',
                response: response.content[0].text,
                model: 'claude-3-5-sonnet-20241022'
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    // FIXED: Remove complex context tracking that was causing loops
    clearConversationContext(userId) {
        // Simplified - just clear any cached data if needed
        console.log(`Cleared context for user ${userId}`);
    }
}

module.exports = ClaudeService;