// backend/services/claude-service.js - ENHANCED VERSION WITH ODPHP INTEGRATION

const Anthropic = require('@anthropic-ai/sdk');

class ClaudeService {
    constructor() {
        this.anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });
        
        this.medicalMappings = require('../config/medical-mappings');

        // Enhanced system prompts with ODPHP awareness
        this.systemPrompts = {
            conversational: `You are a caring medical assistant with access to comprehensive health guidance.
        
        STYLE:
        - Be warm and empathetic
        - Ask 1-2 follow-up questions to understand better
        - Keep responses to 2-3 sentences unless it's an emergency
        - When you have personalized health recommendations, mention them naturally
        
        REMEMBER: You have access to evidence-based health guidance from MyHealthfinder.`,
        
            medication_counselor: `You are helping with medication questions with access to safety data and health guidance.
        
        STYLE:
        - Ask about their specific medication concerns
        - Keep safety-focused but conversational
        - Integrate preventive health recommendations when relevant`,
        
            emergency_triage: `You are assessing potentially urgent situations.
        
        STYLE:
        - Be direct and calm
        - Give immediate guidance if truly urgent
        - Ask key questions to assess severity`,
        
            health_educator: `You are helping someone understand health topics with comprehensive educational resources.
        
        STYLE:
        - Ask what specifically they want to know
        - Give clear, simple explanations
        - Use available health guidance to provide complete answers
        - Mention preventive care recommendations when appropriate`,
        
            research_advisor: `You are helping with treatment and research questions.
        
        STYLE:
        - Ask about their specific interests in research/treatments
        - Be encouraging but realistic
        - Integrate clinical trials and health guidance information`
        };

        // Enhanced context detection including health topics
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
                'information about', 'tell me about', 'causes of', 'prevention',
                'healthy lifestyle', 'wellness', 'nutrition', 'exercise'
            ]
        };

        this.userProfiles = new Map();
        
        console.log('🧠 Enhanced Claude Service initialized with ODPHP integration');
    }

    // Enhanced symptom assessment with ODPHP integration
    async assessSymptoms(userMessage, medicalAnalysis, conversationHistory = [], sessionId = 'default') {
        try {
            console.log('🧠 Starting enhanced symptom assessment with ODPHP data...');

            // 1. Detect optimal context
            const context = this.detectMedicalContext(userMessage, medicalAnalysis);
            console.log(`📋 Using context: ${context}`);

            // 2. Build user profile
            const userProfile = this.buildUserProfile(sessionId, conversationHistory, medicalAnalysis);

            // 3. Generate enhanced prompt with ODPHP data
            const enhancedPrompt = this.buildEnhancedPromptWithODPHP(userMessage, medicalAnalysis, context, userProfile);

            // 4. Get response using appropriate system prompt
            const systemPrompt = this.systemPrompts[context] || this.systemPrompts.conversational;
            
            const response = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 700, // Increased for richer responses
                temperature: 0.7,
                system: systemPrompt,
                messages: [
                    ...conversationHistory.slice(-4),
                    { role: "user", content: enhancedPrompt }
                ]
            });

            // 5. Enhance response with ODPHP data
            let enhancedResponse = response.content[0].text;
            enhancedResponse = this.enhanceWithODPHPData(enhancedResponse, medicalAnalysis, context);

            // 6. Format based on context and user profile
            enhancedResponse = this.formatForUser(enhancedResponse, context, userProfile);

            console.log(`✅ Enhanced response generated with ODPHP data (${context}, ${userProfile.communicationStyle} style)`);

            return {
                success: true,
                response: enhancedResponse,
                metadata: {
                    context: context,
                    userProfile: userProfile,
                    apiSources: medicalAnalysis?.apiSources || [],
                    confidence: medicalAnalysis?.confidence || 'medium',
                    odphpDataUsed: this.hasODPHPData(medicalAnalysis)
                }
            };

        } catch (error) {
            console.error('❌ Enhanced assessment error:', error);
            
            const fallbackResponse = await this.generateBasicResponse(userMessage, medicalAnalysis);
            return {
                success: true,
                response: fallbackResponse,
                metadata: { fallback: true }
            };
        }
    }

    // NEW: Enhanced prompt building with ODPHP data
    buildEnhancedPromptWithODPHP(userMessage, medicalAnalysis, context, userProfile) {
        let prompt = `User said: "${userMessage}"\n\n`;
    
        // Add medical context briefly
        if (medicalAnalysis?.symptoms?.length > 0) {
            const mainSymptom = medicalAnalysis.symptoms[0];
            prompt += `Main symptom identified: ${mainSymptom.name}\n`;
        }

        // NEW: Add ODPHP health guidance context
        if (medicalAnalysis?.healthGuidance?.length > 0) {
            const guidance = medicalAnalysis.healthGuidance[0];
            prompt += `Health guidance available: ${guidance.title}\n`;
        }

        // NEW: Add ODPHP personalized recommendations context
        if (medicalAnalysis?.preventiveRecommendations?.length > 0) {
            const rec = medicalAnalysis.preventiveRecommendations[0];
            prompt += `Personalized health recommendation: ${rec.title}\n`;
        }

        // NEW: Add ODPHP educational resources context
        if (medicalAnalysis?.educationalResources?.length > 0) {
            const edu = medicalAnalysis.educationalResources[0];
            prompt += `Educational resource: ${edu.information?.title || 'Health education available'}\n`;
        }
    
        // Add simple context instruction
        switch (context) {
            case 'emergency_triage':
                prompt += `This seems urgent. Respond with immediate guidance but keep it brief and clear.\n`;
                break;
            case 'medication_counselor':
                prompt += `Focus on medication questions. Ask what they want to know specifically.\n`;
                break;
            case 'health_educator':
                prompt += `This is about health education. Use available health guidance to provide comprehensive information.\n`;
                break;
            default:
                prompt += `Respond conversationally. Ask 1-2 follow-up questions to understand better.\n`;
        }
    
        // Add user style
        if (userProfile.communicationStyle === 'concise') {
            prompt += `Keep response short and direct.\n`;
        }
    
        prompt += `\nBe conversational, empathetic, and naturally integrate available health guidance and recommendations.`;
    
        return prompt;
    }

    // NEW: Enhanced response enhancement with ODPHP data
    enhanceWithODPHPData(response, medicalAnalysis, context) {
        let enhanced = response;
    
        // Add ODPHP health guidance if relevant
        if (medicalAnalysis?.healthGuidance?.length > 0 && context === 'health_educator') {
            const guidance = medicalAnalysis.healthGuidance[0];
            if (guidance.summary) {
                enhanced += ` According to MyHealthfinder, ${guidance.summary.substring(0, 150)}...`;
            }
        }

        // Add personalized recommendations naturally
        if (medicalAnalysis?.preventiveRecommendations?.length > 0) {
            const rec = medicalAnalysis.preventiveRecommendations[0];
            if (rec.title && !enhanced.toLowerCase().includes('recommend')) {
                enhanced += ` Based on health guidelines, you might also consider looking into ${rec.title.toLowerCase()}.`;
            }
        }

        // Add educational resources for complex topics
        if (medicalAnalysis?.educationalResources?.length > 0 && context === 'health_educator') {
            const eduResource = medicalAnalysis.educationalResources[0];
            if (eduResource.information?.title) {
                enhanced += ` For more detailed information about ${eduResource.symptom}, MyHealthfinder provides guidance on ${eduResource.information.title.toLowerCase()}.`;
            }
        }

        // Show comprehensive data sources if multiple APIs used
        if (medicalAnalysis?.apiSources?.length >= 4) {
            enhanced += ` (This assessment uses ${medicalAnalysis.apiSources.length} medical databases including MyHealthfinder)`;
        }
    
        return enhanced;
    }

    // NEW: Check if ODPHP data is available
    hasODPHPData(medicalAnalysis) {
        if (!medicalAnalysis) return false;
        
        return (
            (medicalAnalysis.healthGuidance && medicalAnalysis.healthGuidance.length > 0) ||
            (medicalAnalysis.preventiveRecommendations && medicalAnalysis.preventiveRecommendations.length > 0) ||
            (medicalAnalysis.educationalResources && medicalAnalysis.educationalResources.length > 0) ||
            (medicalAnalysis.apiSources && medicalAnalysis.apiSources.some(source => source.includes('ODPHP')))
        );
    }

    // Enhanced context detection considering ODPHP data
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

        // Context based on API data availability (including ODPHP)
        if (medicalAnalysis?.medications?.length > 0 || medicalAnalysis?.apiSources?.includes('RxNorm')) {
            return 'medication_counselor';
        }

        if (medicalAnalysis?.clinicalTrials?.length > 0) {
            return 'research_advisor';
        }

        // NEW: Health educator context for ODPHP data
        if (medicalAnalysis?.healthGuidance?.length > 0 || 
            medicalAnalysis?.preventiveRecommendations?.length > 0 ||
            medicalAnalysis?.educationalResources?.length > 0) {
            return 'health_educator';
        }

        if (messageLower.includes('what') || messageLower.includes('explain')) {
            return 'health_educator';
        }

        return 'conversational';
    }

    // Enhanced user profiling with health interests
    buildUserProfile(sessionId, conversationHistory, medicalAnalysis) {
        let profile = this.userProfiles.get(sessionId) || {
            interactionCount: 0,
            knowledgeLevel: 'medium',
            communicationStyle: 'balanced',
            preferredDetail: 'moderate',
            healthInterests: [], // NEW: Track health topics of interest
            lastSeen: null
        };

        profile.interactionCount++;
        profile.lastSeen = Date.now();

        // Track health interests based on ODPHP data
        if (medicalAnalysis?.healthGuidance) {
            for (const guidance of medicalAnalysis.healthGuidance) {
                if (guidance.categories) {
                    profile.healthInterests.push(...guidance.categories);
                }
            }
        }

        // Analyze communication style from conversation
        if (conversationHistory.length > 0) {
            const userMessages = conversationHistory.filter(msg => msg.role === 'user');
            profile.communicationStyle = this.analyzeCommunicationStyle(userMessages);
            profile.knowledgeLevel = this.assessKnowledgeLevel(userMessages);
        }

        // Clean up health interests (keep unique, limit to 10)
        profile.healthInterests = [...new Set(profile.healthInterests)].slice(0, 10);

        this.userProfiles.set(sessionId, profile);
        return profile;
    }

    // Keep all existing methods (they remain unchanged)
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
    
        return formatted;
    }

    async generateBasicResponse(userMessage, medicalAnalysis) {
        const response = await this.anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 400,
            temperature: 0.7,
            system: this.systemPrompts.conversational,
            messages: [{ role: "user", content: userMessage }]
        });

        return response.content[0].text;
    }

    // All existing methods remain the same
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
            "User is ending the conversation. Give a warm, caring goodbye with a gentle reminder about health resources.",
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
                    { role: "user", content: "Say 'Enhanced Claude with ODPHP ready' if you can help with medical conversations." }
                ]
            });

            return {
                status: 'healthy',
                response: response.content[0].text,
                model: 'claude-3-5-sonnet-20241022',
                enhanced: true,
                odphpIntegration: true,
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

    // Get enhanced analytics with ODPHP insights
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
                'Multi-modal formatting',
                'ODPHP MyHealthfinder integration', // NEW
                'Personalized health recommendations', // NEW
                'Evidence-based health guidance' // NEW
            ]
        };
    }
}

module.exports = ClaudeService;