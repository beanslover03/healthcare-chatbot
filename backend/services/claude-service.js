// services/claude-service.js - FIXED VERSION for new medical mappings
const Anthropic = require('@anthropic-ai/sdk');

class ClaudeService {
    constructor() {
        this.anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });
        
        // UPDATED: Use new medical mappings structure
        this.medicalMappings = require('../config/medical-mappings');

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

    // FIXED: Simple emergency detection using new medical mappings
    isEmergency(userMessage) {
        const messageLower = userMessage.toLowerCase();
        
        // UPDATED: Use new emergency patterns from medical mappings
        const emergencyPatterns = this.medicalMappings.emergencyPatterns;
        
        // Check emergency patterns
        for (const [conditionId, pattern] of Object.entries(emergencyPatterns)) {
            // Check for emergency keywords
            const hasEmergencyKeywords = pattern.keywords.some(keyword => 
                messageLower.includes(keyword.toLowerCase())
            );
            
            // Check for symptom mentions
            const hasEmergencySymptoms = pattern.symptoms.some(symptom => 
                messageLower.includes(symptom.toLowerCase())
            );
            
            // Check for red flags
            const hasRedFlags = pattern.redFlags.some(flag => 
                messageLower.includes(flag.toLowerCase())
            );
            
            // If we have keywords or (symptoms + red flags), it's an emergency
            if (hasEmergencyKeywords || (hasEmergencySymptoms && hasRedFlags)) {
                console.log(`🚨 Emergency detected: ${conditionId}`);
                return true;
            }
        }
        
        // Keep existing simple keywords as backup
        const emergencyKeywords = [
            'can\'t breathe', 'crushing chest', 'call 911', 'emergency',
            'severe chest pain', 'worst headache ever', 'losing consciousness',
            'difficulty breathing', 'chest crushing', 'heart attack'
        ];
        
        const hasBackupKeywords = emergencyKeywords.some(keyword => 
            messageLower.includes(keyword)
        );
        
        if (hasBackupKeywords) {
            console.log('🚨 Emergency detected via backup keywords');
            return true;
        }
        
        return false;
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

    // ADDED: Enhanced methods for integration with medical APIs
    async assessSymptoms(userMessage, medicalAnalysis, conversationHistory = []) {
        try {
            const prompt = this.buildSymptomAssessmentPrompt(userMessage, medicalAnalysis);
            
            const response = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 600,
                temperature: 0.7,
                system: this.systemPrompts.conversational,
                messages: [
                    ...conversationHistory.slice(-4),
                    { role: "user", content: prompt }
                ]
            });

            return {
                success: true,
                response: response.content[0].text
            };

        } catch (error) {
            console.error('Claude symptom assessment error:', error);
            return {
                success: false,
                response: this.getFallbackSymptomResponse(userMessage),
                error: error.message
            };
        }
    }

    buildSymptomAssessmentPrompt(userMessage, medicalAnalysis) {
        let prompt = `User described: "${userMessage}"\n\n`;
        
        if (medicalAnalysis && medicalAnalysis.symptoms && medicalAnalysis.symptoms.length > 0) {
            prompt += "MEDICAL DATABASE ANALYSIS:\n";
            
            // Add identified symptoms with medical codes
            prompt += "Identified Symptoms:\n";
            for (const symptom of medicalAnalysis.symptoms) {
                prompt += `- ${symptom.name}`;
                if (symptom.icd10) prompt += ` (ICD-10: ${symptom.icd10})`;
                if (symptom.severity && symptom.severity !== 'unknown') {
                    prompt += `, Severity: ${symptom.severity}`;
                }
                prompt += "\n";
            }
            prompt += "\n";

            // Add potential conditions
            if (medicalAnalysis.conditions && medicalAnalysis.conditions.length > 0) {
                prompt += "Related Conditions from Medical Databases:\n";
                medicalAnalysis.conditions.slice(0, 3).forEach(condition => {
                    prompt += `- ${condition.name}`;
                    if (condition.code) prompt += ` (${condition.code})`;
                    prompt += "\n";
                });
                prompt += "\n";
            }

            // Add emergency factors if any
            if (medicalAnalysis.emergencyFactors && medicalAnalysis.emergencyFactors.length > 0) {
                prompt += "⚠️ CONCERNING FACTORS:\n";
                medicalAnalysis.emergencyFactors.forEach(factor => {
                    prompt += `- ${factor.factor}\n`;
                });
                prompt += "\n";
            }

            // Add medication recommendations
            if (medicalAnalysis.medications && medicalAnalysis.medications.length > 0) {
                prompt += "Medication Options:\n";
                medicalAnalysis.medications.slice(0, 3).forEach(med => {
                    if (med.type === 'otc') {
                        prompt += `- ${med.name} (Over-the-counter)\n`;
                    }
                });
                prompt += "\n";
            }
        }

        prompt += `Please provide a helpful, conversational response that:
1. Acknowledges their symptoms with empathy
2. Uses the medical database information naturally (don't just list it)
3. Gives clear guidance on what they should do
4. Keeps a warm, supportive tone
5. Always emphasizes this is guidance, not a diagnosis

Be conversational and caring, not clinical.`;

        return prompt;
    }

    getFallbackSymptomResponse(userMessage) {
        return `I understand you're experiencing some concerning symptoms. While I'm having trouble accessing my medical databases right now, I'd recommend:

For any symptoms that worry you, it's always best to consult with a healthcare professional. If your symptoms are severe or you're feeling unwell, don't hesitate to seek medical care.

Is there anything specific about your symptoms that's particularly concerning you?`;
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
                model: 'claude-3-5-sonnet-20241022',
                medicalMappings: Object.keys(this.medicalMappings).length > 0
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