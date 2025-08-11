// backend/services/claude-service.js - ENHANCED VERSION (REPLACE YOUR EXISTING FILE)
const Anthropic = require('@anthropic-ai/sdk');

class ClaudeService {
    constructor() {
        this.anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });
        
        // Keep your existing medical mappings
        this.medicalMappings = require('../config/medical-mappings');

        // Enhanced system prompts with context awareness
        this.systemPrompts = {
            conversational: `You are a caring medical assistant. Have natural conversations about health concerns.
        
        STYLE:
        - Be warm and empathetic
        - Ask 1-2 follow-up questions to understand better
        - Keep responses to 2-3 sentences unless it's an emergency
        - Focus on understanding their specific situation first
        
        REMEMBER: You're here to listen and guide, not lecture.`,
        
            medication_counselor: `You are helping with medication questions. Be focused and ask what they specifically want to know.
        
        STYLE:
        - Ask about their specific medication concerns
        - Keep safety-focused but conversational
        - 1-2 sentences max unless they ask for details`,
        
            emergency_triage: `You are assessing potentially urgent situations.
        
        STYLE:
        - Be direct and calm
        - Give immediate guidance if truly urgent
        - Ask key questions to assess severity
        - Keep instructions clear and brief`,
        
            health_educator: `You are helping someone understand a health topic.
        
        STYLE:
        - Ask what specifically they want to know
        - Give clear, simple explanations
        - Check if they want more detail`,
        
            research_advisor: `You are helping with treatment and research questions.
        
        STYLE:
        - Ask about their specific interests in research/treatments
        - Be encouraging but realistic
        - Keep responses focused`
        };

        // Enhanced context detection
        this.contextTriggers = {
            medication_counselor: [
                'medication', 'drug', 'prescription', 'side effects', 'dosage',
                'taking', 'pills', 'interactions', 'pharmacy', 'medicine'
            ],
            research_advisor: [
                'clinical trial', 'research', 'study', 'experimental', 'treatment options',
                'latest research', 'new treatments', 'studies show'
            ],
            emergency_triage: [
                'emergency', 'urgent', 'severe', 'can\'t breathe', 'chest pain',
                'call 911', 'hospital', 'ambulance', 'immediate', 'critical'
            ],
            health_educator: [
                'what is', 'how does', 'explain', 'learn about', 'understand',
                'information about', 'tell me about', 'causes of'
            ]
        };

        // User profiling system
        this.userProfiles = new Map();
        
        console.log('🧠 Enhanced Claude Service initialized with medical intelligence');
    }

    // Enhanced context detection
    detectMedicalContext(userMessage, medicalAnalysis) {
        const messageLower = userMessage.toLowerCase();
        
        // Emergency context takes highest priority
        if (this.isEmergency(userMessage) || medicalAnalysis?.emergencyFactors?.length > 0) {
            return 'emergency_triage';
        }

        // Check for explicit context triggers
        for (const [context, triggers] of Object.entries(this.contextTriggers)) {
            if (triggers.some(trigger => messageLower.includes(trigger))) {
                return context;
            }
        }

        // Context based on API data availability
        if (medicalAnalysis?.medications?.length > 0 || medicalAnalysis?.apiSources?.includes('RxNorm')) {
            return 'medication_counselor';
        }

        if (medicalAnalysis?.clinicalTrials?.length > 0) {
            return 'research_advisor';
        }

        if (messageLower.includes('what') || messageLower.includes('explain')) {
            return 'health_educator';
        }

        return 'conversational';
    }

    // Enhanced user profiling
    buildUserProfile(sessionId, conversationHistory, medicalAnalysis) {
        let profile = this.userProfiles.get(sessionId) || {
            interactionCount: 0,
            knowledgeLevel: 'medium',
            communicationStyle: 'balanced',
            preferredDetail: 'moderate',
            lastSeen: null
        };

        profile.interactionCount++;
        profile.lastSeen = Date.now();

        // Analyze communication style from conversation
        if (conversationHistory.length > 0) {
            const userMessages = conversationHistory.filter(msg => msg.role === 'user');
            profile.communicationStyle = this.analyzeCommunicationStyle(userMessages);
            profile.knowledgeLevel = this.assessKnowledgeLevel(userMessages);
        }

        this.userProfiles.set(sessionId, profile);
        return profile;
    }

    analyzeCommunicationStyle(userMessages) {
        if (userMessages.length === 0) return 'balanced';

        let avgLength = 0;
        let technicalTerms = 0;
        let urgencyIndicators = 0;

        userMessages.forEach(msg => {
            avgLength += msg.content.length;
            
            // Count medical terms
            const medTerms = ['diagnosis', 'symptoms', 'medication', 'treatment'];
            technicalTerms += medTerms.filter(term => 
                msg.content.toLowerCase().includes(term)
            ).length;

            // Count urgency words
            const urgentWords = ['urgent', 'emergency', 'severe', 'immediately'];
            urgencyIndicators += urgentWords.filter(word => 
                msg.content.toLowerCase().includes(word)
            ).length;
        });

        avgLength = avgLength / userMessages.length;

        if (urgencyIndicators > 1) return 'urgent';
        if (technicalTerms > 2) return 'technical';
        if (avgLength > 100) return 'detailed';
        if (avgLength < 30) return 'concise';
        
        return 'balanced';
    }

    assessKnowledgeLevel(userMessages) {
        let score = 0;
        
        userMessages.forEach(msg => {
            const content = msg.content.toLowerCase();
            
            // Advanced terms (+2 points)
            const advanced = ['pathophysiology', 'contraindication', 'pharmacokinetics'];
            score += advanced.filter(term => content.includes(term)).length * 2;

            // Intermediate terms (+1 point)
            const intermediate = ['side effects', 'dosage', 'interaction', 'diagnosis'];
            score += intermediate.filter(term => content.includes(term)).length;

            // Basic terms (+0.5 points)
            const basic = ['symptoms', 'medicine', 'doctor', 'treatment'];
            score += basic.filter(term => content.includes(term)).length * 0.5;
        });

        const avgScore = score / userMessages.length;
        
        if (avgScore >= 2.5) return 'high';
        if (avgScore >= 1) return 'medium';
        return 'basic';
    }

    // Enhanced symptom assessment with context awareness
    async assessSymptoms(userMessage, medicalAnalysis, conversationHistory = [], sessionId = 'default') {
        try {
            console.log('🧠 Starting enhanced symptom assessment...');

            // 1. Detect optimal context
            const context = this.detectMedicalContext(userMessage, medicalAnalysis);
            console.log(`📋 Using context: ${context}`);

            // 2. Build user profile
            const userProfile = this.buildUserProfile(sessionId, conversationHistory, medicalAnalysis);

            // 3. Generate enhanced prompt
            const enhancedPrompt = this.buildEnhancedPrompt(userMessage, medicalAnalysis, context, userProfile);

            // 4. Get response using appropriate system prompt
            const systemPrompt = this.systemPrompts[context] || this.systemPrompts.conversational;
            
            const response = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 600,
                temperature: 0.7,
                system: systemPrompt,
                messages: [
                    ...conversationHistory.slice(-4),
                    { role: "user", content: enhancedPrompt }
                ]
            });

            // 5. Enhance response with API data
            let enhancedResponse = response.content[0].text;
            enhancedResponse = this.enhanceWithAPIData(enhancedResponse, medicalAnalysis, context);

            // 6. Format based on context and user profile
            enhancedResponse = this.formatForUser(enhancedResponse, context, userProfile);

            console.log(`✅ Enhanced response generated (${context}, ${userProfile.communicationStyle} style)`);

            return {
                success: true,
                response: enhancedResponse,
                metadata: {
                    context: context,
                    userProfile: userProfile,
                    apiSources: medicalAnalysis?.apiSources || [],
                    confidence: medicalAnalysis?.confidence || 'medium'
                }
            };

        } catch (error) {
            console.error('❌ Enhanced assessment error:', error);
            
            // Fallback to basic response
            const fallbackResponse = await this.generateBasicResponse(userMessage, medicalAnalysis);
            return {
                success: true,
                response: fallbackResponse,
                metadata: { fallback: true }
            };
        }
    }

    buildEnhancedPrompt(userMessage, medicalAnalysis, context, userProfile) {
        let prompt = `User said: "${userMessage}"\n\n`;
    
        // Add medical context briefly
        if (medicalAnalysis?.symptoms?.length > 0) {
            const mainSymptom = medicalAnalysis.symptoms[0];
            prompt += `Main symptom identified: ${mainSymptom.name}\n`;
        }
    
        // Add simple context instruction
        switch (context) {
            case 'emergency_triage':
                prompt += `This seems urgent. Respond with immediate guidance but keep it brief and clear.\n`;
                break;
            case 'medication_counselor':
                prompt += `Focus on medication questions. Ask what they want to know specifically.\n`;
                break;
            default:
                prompt += `Respond conversationally. Ask 1-2 follow-up questions to understand better.\n`;
        }
    
        // Add user style
        if (userProfile.communicationStyle === 'concise') {
            prompt += `Keep response short and direct.\n`;
        }
    
        prompt += `\nBe conversational, empathetic, and ask questions to understand their situation better.`;
    
        return prompt;
    }

    enhanceWithAPIData(response, medicalAnalysis, context) {
        let enhanced = response;
    
        // Only add brief API insights, not long explanations
        if (medicalAnalysis?.medications?.length > 0 && context === 'medication_counselor') {
            const otcMed = medicalAnalysis.medications.find(m => m.type === 'otc');
            if (otcMed) {
                enhanced += ` ${otcMed.name} is one option that's available over-the-counter.`;
            }
        }
    
        // Only show confidence if it's high or if there are many sources
        if (medicalAnalysis?.apiSources?.length >= 3) {
            enhanced += ` (This assessment uses ${medicalAnalysis.apiSources.length} medical databases)`;
        }
    
        return enhanced;
    }

    formatForUser(response, context, userProfile) {
        let formatted = response;
    
        // Only simplify language for basic users, don't add extra content
        if (userProfile.knowledgeLevel === 'basic') {
            const simplifications = {
                'myocardial infarction': 'heart attack',
                'hypertension': 'high blood pressure'
            };
            
            Object.entries(simplifications).forEach(([complex, simple]) => {
                formatted = formatted.replace(new RegExp(complex, 'gi'), simple);
            });
        }
    
        // Remove the summary addition and other extra formatting
        return formatted;
    }

    extractKeySentences(text) {
        const sentences = text.split('.').filter(s => s.trim().length > 10);
        return sentences.slice(0, 2).join('. ') + '.';
    }

    async generateBasicResponse(userMessage, medicalAnalysis) {
        // Your existing basic response logic
        const response = await this.anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 400,
            temperature: 0.7,
            system: this.systemPrompts.conversational,
            messages: [{ role: "user", content: userMessage }]
        });

        return response.content[0].text;
    }

    // Keep all your existing methods unchanged
    isConversationEnding(userMessage) {
        const endingSignals = [
            'thanks', 'thank you', 'that helps', 'that\'s all', 'i\'m good',
            'goodbye', 'bye', 'no more questions', 'done', 'ok thanks'
        ];
        
        const messageLower = userMessage.toLowerCase();
        return endingSignals.some(signal => messageLower.includes(signal));
    }

    isEmergency(userMessage) {
        const messageLower = userMessage.toLowerCase();
        
        // Use existing emergency patterns
        const emergencyPatterns = this.medicalMappings.emergencyPatterns;
        
        for (const [conditionId, pattern] of Object.entries(emergencyPatterns)) {
            const hasEmergencyKeywords = pattern.keywords.some(keyword => 
                messageLower.includes(keyword.toLowerCase())
            );
            
            const hasEmergencySymptoms = pattern.symptoms.some(symptom => 
                messageLower.includes(symptom.toLowerCase())
            );
            
            const hasRedFlags = pattern.redFlags.some(flag => 
                messageLower.includes(flag.toLowerCase())
            );
            
            if (hasEmergencyKeywords || (hasEmergencySymptoms && hasRedFlags)) {
                console.log(`🚨 Emergency detected: ${conditionId}`);
                return true;
            }
        }
        
        return false;
    }

    async generateEndingResponse(conversationHistory = []) {
        return this.getChatResponse(
            "User is ending the conversation. Give a warm, caring goodbye.",
            conversationHistory,
            'ending_conversation'
        );
    }

    async generateEmergencyResponse(userMessage, conversationHistory = []) {
        return this.getChatResponse(
            `User said: "${userMessage}" - This seems like a medical emergency. Respond with urgent but calm guidance.`,
            conversationHistory,
            'emergency_triage'
        );
    }

    async getChatResponse(prompt, conversationHistory = [], responseType = 'conversational') {
        try {
            const systemPrompt = this.systemPrompts[responseType] || this.systemPrompts.conversational;
            
            const messages = [
                ...conversationHistory.slice(-4),
                { role: "user", content: prompt }
            ];

            const response = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 300,
                temperature: 0.7,
                system: systemPrompt,
                messages: messages
            });

            return response.content[0].text;

        } catch (error) {
            console.error('Claude chat response error:', error);
            throw error;
        }
    }

    async healthCheck() {
        try {
            const response = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 50,
                messages: [
                    { role: "user", content: "Say 'Enhanced Claude ready' if you can help with medical conversations." }
                ]
            });

            return {
                status: 'healthy',
                response: response.content[0].text,
                model: 'claude-3-5-sonnet-20241022',
                enhanced: true,
                contexts: Object.keys(this.systemPrompts).length,
                userProfiles: this.userProfiles.size
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    clearConversationContext(userId) {
        this.userProfiles.delete(userId);
        console.log(`Cleared enhanced context for user ${userId}`);
    }

    // Get enhanced analytics
    getEnhancedAnalytics(sessionId) {
        const profile = this.userProfiles.get(sessionId);
        
        return {
            userProfile: profile,
            totalProfiles: this.userProfiles.size,
            availableContexts: Object.keys(this.systemPrompts),
            enhancedFeatures: [
                'Context-aware responses',
                'User profiling',
                'API-driven intelligence', 
                'Adaptive communication',
                'Multi-modal formatting'
            ]
        };
    }
}

module.exports = ClaudeService;