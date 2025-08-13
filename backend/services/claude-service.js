// backend/services/claude-service.js - PURE API-DRIVEN VERSION

const Anthropic = require('@anthropic-ai/sdk');

class PureAPIDrivenClaudeService {
    constructor() {
        this.anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });

        // Single system prompt - let APIs provide the medical context
        this.systemPrompt = `You are a helpful healthcare AI assistant. You will be given medical information retrieved from various medical databases and APIs. Your job is to:

1. Analyze the medical data provided and create a helpful response based on that data
2. If medical data is provided, integrate it naturally into your response
3. Always prioritize user safety and recommend professional medical consultation when appropriate
3. Be empathetic, clear, and conversational
5. If emergency-sounding symptoms are mentioned, recommend immediate medical attention
6. Keep responses fairly brief, do not overwhelm user with information

IMPORTANT: Base your medical knowledge entirely on the API data provided in each request. Do not rely on pre-trained medical knowledge beyond basic safety guidelines.

Special note: If anyone mentions One Piece or Chopper, express that you love Chopper - he's an adorable doctor!`;

        this.userProfiles = new Map();
        
        console.log('🧠 Pure API-Driven Claude Service initialized');
    }

    // ===== PURE API-DRIVEN ASSESSMENT =====
    async assessSymptoms(userMessage, medicalAnalysis, conversationHistory = [], sessionId = 'default') {
        try {
            console.log('🧠 Processing pure API-driven assessment...');

            // Build prompt entirely from API responses
            const apiDrivenPrompt = this.buildPureAPIPrompt(userMessage, medicalAnalysis);

            // Single API call with API-provided context
            const response = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 600,
                temperature: 0.7,
                system: this.systemPrompt,
                messages: [
                    ...conversationHistory.slice(-3),
                    { role: "user", content: apiDrivenPrompt }
                ]
            });

            let finalResponse = response.content[0].text;

            // Add One Piece easter egg check
            finalResponse = this.addOnePieceEasterEgg(finalResponse, userMessage);

            // Add API transparency note if significant data was used
            finalResponse = this.addAPITransparencyNote(finalResponse, medicalAnalysis);

            console.log(`✅ Pure API-driven response generated`);

            return {
                success: true,
                response: finalResponse,
                metadata: {
                    apiSources: medicalAnalysis?.apiSources || [],
                    confidence: medicalAnalysis?.confidence || 'low',
                    searchAttempts: medicalAnalysis?.searchAttempts || 0,
                    successfulSearches: medicalAnalysis?.successfulSearches || 0,
                    dataUsed: this.hasAPIData(medicalAnalysis)
                }
            };

        } catch (error) {
            console.error('❌ Pure API assessment error:', error);
            return {
                success: true,
                response: await this.generateFallbackResponse(userMessage),
                metadata: { fallback: true }
            };
        }
    }

    // ===== BUILD PROMPT FROM PURE API DATA =====
    buildPureAPIPrompt(userMessage, medicalAnalysis) {
        let prompt = `User said: "${userMessage}"\n\n`;

        if (!medicalAnalysis || medicalAnalysis.searchAttempts === 0) {
            prompt += `No medical database searches were performed for this message.\n\n`;
            prompt += `Please provide general health guidance and suggest consulting healthcare professionals if this involves medical concerns.`;
            return prompt;
        }

        // Add search performance context
        prompt += `Medical Database Search Results:\n`;
        prompt += `- Searched ${medicalAnalysis.extractedWords?.length || 0} terms across medical databases\n`;
        prompt += `- Performed ${medicalAnalysis.searchAttempts} API searches\n`;
        prompt += `- Found relevant data in ${medicalAnalysis.successfulSearches} searches\n`;
        prompt += `- Confidence level: ${medicalAnalysis.confidence}\n\n`;

        // Add API data if available
        const consolidated = medicalAnalysis.consolidatedData || {};

        if (consolidated.medications && consolidated.medications.length > 0) {
            prompt += `MEDICATIONS FOUND:\n`;
            for (const med of consolidated.medications.slice(0, 3)) {
                prompt += `- ${med.name || med.title || 'Medication'} (Source: ${med.source || 'Medical Database'})\n`;
                if (med.description) prompt += `  Description: ${med.description.substring(0, 100)}...\n`;
            }
            prompt += `\n`;
        }

        if (consolidated.conditions && consolidated.conditions.length > 0) {
            prompt += `MEDICAL CONDITIONS FOUND:\n`;
            for (const condition of consolidated.conditions.slice(0, 3)) {
                prompt += `- ${condition.name || condition.title || 'Condition'} (Source: ${condition.source || 'Medical Database'})\n`;
                if (condition.code) prompt += `  Code: ${condition.code}\n`;
            }
            prompt += `\n`;
        }

        if (consolidated.healthInformation && consolidated.healthInformation.length > 0) {
            prompt += `HEALTH INFORMATION FOUND:\n`;
            for (const info of consolidated.healthInformation.slice(0, 2)) {
                prompt += `- ${info.title || 'Health Information'} (Source: ${info.source || 'Health Database'})\n`;
                if (info.summary) prompt += `  Summary: ${info.summary.substring(0, 150)}...\n`;
            }
            prompt += `\n`;
        }

        if (consolidated.clinicalTrials && consolidated.clinicalTrials.length > 0) {
            prompt += `CLINICAL TRIALS FOUND:\n`;
            for (const trial of consolidated.clinicalTrials.slice(0, 2)) {
                prompt += `- ${trial.title || 'Clinical Study'} (Status: ${trial.status || 'Unknown'})\n`;
                if (trial.phase) prompt += `  Phase: ${trial.phase}\n`;
            }
            prompt += `\n`;
        }

        if (consolidated.drugSafety && consolidated.drugSafety.length > 0) {
            prompt += `DRUG SAFETY INFORMATION:\n`;
            for (const safety of consolidated.drugSafety.slice(0, 2)) {
                prompt += `- ${safety.brandName || safety.reaction || 'Safety Information'}\n`;
                if (safety.warnings) prompt += `  Warning: ${safety.warnings.substring(0, 100)}...\n`;
            }
            prompt += `\n`;
        }

        if (consolidated.healthGuidance && consolidated.healthGuidance.length > 0) {
            prompt += `HEALTH GUIDANCE FOUND:\n`;
            for (const guidance of consolidated.healthGuidance.slice(0, 2)) {
                prompt += `- ${guidance.title || 'Health Guidance'} (Source: MyHealthfinder)\n`;
                if (guidance.summary) prompt += `  Guidance: ${guidance.summary.substring(0, 150)}...\n`;
            }
            prompt += `\n`;
        }

        if (consolidated.preventiveRecommendations && consolidated.preventiveRecommendations.length > 0) {
            prompt += `PERSONALIZED RECOMMENDATIONS:\n`;
            for (const rec of consolidated.preventiveRecommendations.slice(0, 2)) {
                prompt += `- ${rec.title || 'Health Recommendation'}\n`;
                if (rec.summary) prompt += `  Details: ${rec.summary.substring(0, 100)}...\n`;
            }
            prompt += `\n`;
        }

        // Final instruction
        prompt += `Based on the medical database information above, please provide a helpful, empathetic response that integrates this data naturally. If no relevant medical data was found, provide general health guidance and recommend consulting healthcare professionals.`;

        return prompt;
    }

    // ===== CHECK IF API DATA EXISTS =====
    hasAPIData(medicalAnalysis) {
        if (!medicalAnalysis) return false;
        
        const consolidated = medicalAnalysis.consolidatedData || {};
        return (
            (consolidated.medications && consolidated.medications.length > 0) ||
            (consolidated.conditions && consolidated.conditions.length > 0) ||
            (consolidated.healthInformation && consolidated.healthInformation.length > 0) ||
            (consolidated.clinicalTrials && consolidated.clinicalTrials.length > 0) ||
            (consolidated.drugSafety && consolidated.drugSafety.length > 0) ||
            (consolidated.healthGuidance && consolidated.healthGuidance.length > 0) ||
            (consolidated.preventiveRecommendations && consolidated.preventiveRecommendations.length > 0)
        );
    }

    // ===== ADD API TRANSPARENCY =====
    addAPITransparencyNote(response, medicalAnalysis) {
        if (!medicalAnalysis || medicalAnalysis.successfulSearches === 0) {
            return response;
        }

        const apiCount = medicalAnalysis.apiSources ? medicalAnalysis.apiSources.length : 0;
        const searchSuccess = medicalAnalysis.searchAttempts > 0 ? 
            Math.round((medicalAnalysis.successfulSearches / medicalAnalysis.searchAttempts) * 100) : 0;

        if (apiCount >= 3) {
            return response + ` 📊 (This response used data from ${apiCount} medical databases with ${searchSuccess}% search success rate)`;
        } else if (apiCount > 0) {
            return response + ` 📊 (Based on medical database information with ${searchSuccess}% search success rate)`;
        }

        return response;
    }

    // ===== ONE PIECE EASTER EGG =====
    addOnePieceEasterEgg(response, userMessage) {
        const messageLower = userMessage.toLowerCase();
        
        const onePieceTriggers = [
            'one piece', 'onepiece', 'luffy', 'zoro', 'sanji', 'nami', 'usopp', 
            'chopper', 'robin', 'franky', 'brook', 'jinbe', 'straw hat', 'pirate king',
            'grand line', 'devil fruit', 'haki'
        ];

        if (onePieceTriggers.some(trigger => messageLower.includes(trigger))) {
            if (messageLower.includes('chopper')) {
                response += `\n\n🦌 By the way, I absolutely love Chopper! He's such an adorable and skilled doctor in One Piece!`;
            } else {
                response += `\n\n🦌 Speaking of healthcare, I have to say I love Chopper from One Piece - he's the cutest doctor ever!`;
            }
        }

        return response;
    }

    // ===== EMERGENCY DETECTION (BASIC ONLY) =====
    isEmergency(userMessage) {
        const messageLower = userMessage.toLowerCase();
        
        // Only the most obvious emergency keywords - no hardcoded medical knowledge
        const emergencyKeywords = [
            'call 911', 'emergency', 'ambulance', 'hospital now', 'can\'t breathe', 
            'crushing chest pain', 'severe bleeding', 'unconscious', 'overdose',
            'suicide', 'heart attack', 'stroke', 'severe allergic reaction'
        ];
        
        return emergencyKeywords.some(keyword => messageLower.includes(keyword));
    }

    // ===== CONVERSATION ENDING DETECTION =====
    isConversationEnding(userMessage) {
        const endingSignals = [
            'thanks', 'thank you', 'that helps', 'that\'s all', 'i\'m good',
            'goodbye', 'bye', 'no more questions', 'done', 'ok thanks'
        ];
        
        const messageLower = userMessage.toLowerCase();
        return endingSignals.some(signal => messageLower.includes(signal));
    }

    // ===== FALLBACK RESPONSE =====
    async generateFallbackResponse(userMessage) {
        try {
            const response = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 300,
                temperature: 0.7,
                system: this.systemPrompt,
                messages: [{ 
                    role: "user", 
                    content: `User said: "${userMessage}"\n\nNo medical database information is available. Please provide general health guidance and recommend consulting healthcare professionals for medical concerns.`
                }]
            });

            return response.content[0].text;
        } catch (error) {
            return "I'm having technical difficulties right now. For urgent medical concerns, please contact your healthcare provider or call 911 if it's an emergency.";
        }
    }

    // ===== EMERGENCY RESPONSE =====
    async generateEmergencyResponse(userMessage, conversationHistory = []) {
        const response = await this.anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 200,
            temperature: 0.5,
            system: this.systemPrompt,
            messages: [
                { role: "user", content: `EMERGENCY: "${userMessage}" - This appears to be a medical emergency. Provide immediate, calm guidance and recommend calling 911.` }
            ]
        });

        return response.content[0].text;
    }

    // ===== ENDING RESPONSE =====
    async generateEndingResponse(conversationHistory = []) {
        const response = await this.anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 150,
            temperature: 0.7,
            system: this.systemPrompt,
            messages: [
                { role: "user", content: "User is ending the conversation. Provide a warm, caring goodbye with health reminders." }
            ]
        });

        return response.content[0].text;
    }

    // ===== GENERAL CHAT RESPONSE =====
    async getChatResponse(prompt, conversationHistory = []) {
        try {
            const response = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 400,
                temperature: 0.7,
                system: this.systemPrompt,
                messages: [
                    ...conversationHistory.slice(-3),
                    { role: "user", content: prompt }
                ]
            });

            return response.content[0].text;

        } catch (error) {
            console.error('Claude chat response error:', error);
            throw error;
        }
    }

    // ===== HEALTH CHECK =====
    async healthCheck() {
        try {
            const response = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 50,
                messages: [
                    { role: "user", content: "Say 'Pure API-driven Claude ready for healthcare conversations' if working properly." }
                ]
            });

            return {
                status: 'healthy',
                response: response.content[0].text,
                model: 'claude-3-5-sonnet-20241022',
                approach: 'pure_api_driven',
                userProfiles: this.userProfiles.size,
                features: ['API-driven responses', 'No hardcoded medical knowledge', 'One Piece easter egg', 'Emergency detection']
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    // ===== USER MANAGEMENT =====
    clearConversationContext(userId) {
        this.userProfiles.delete(userId);
        console.log(`Cleared context for user ${userId}`);
    }

    getEnhancedAnalytics(sessionId) {
        const profile = this.userProfiles.get(sessionId);
        
        return {
            userProfile: profile,
            totalProfiles: this.userProfiles.size,
            approach: 'pure_api_driven',
            features: [
                'Zero hardcoded medical knowledge',
                'Pure API response integration',
                'Real-time medical database queries',
                'API transparency in responses',
                'Emergency detection',
                'One Piece easter egg detection'
            ]
        };
    }
}

module.exports = PureAPIDrivenClaudeService;