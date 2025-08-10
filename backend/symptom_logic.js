const fs = require('fs').promises;
const path = require('path');

class SymptomAssessor {
    constructor() {
        this.symptoms = null;
        this.conditions = null;
        this.userSessions = new Map();
    }

    async initialize() {
        try {
            const symptomsData = await fs.readFile(path.join(__dirname, 'data/symptoms.json'), 'utf8');
            const conditionsData = await fs.readFile(path.join(__dirname, 'data/conditions.json'), 'utf8');
            
            this.symptoms = JSON.parse(symptomsData);
            this.conditions = JSON.parse(conditionsData);
            
            console.log('✅ Symptom assessment system initialized');
        } catch (error) {
            console.error('❌ Error loading symptom data:', error);
            throw error;
        }
    }

    getUserSession(sessionId = 'default') {
        if (!this.userSessions.has(sessionId)) {
            this.userSessions.set(sessionId, {
                reportedSymptoms: new Map(), // symptom_id -> {severity, duration, context}
                conversationHistory: [],
                currentFocus: null, // What we're currently asking about
                assessmentStage: 'initial',
                riskScore: 0,
                emergencyFactors: [],
                clarificationNeeded: []
            });
        }
        return this.userSessions.get(sessionId);
    }

    // More nuanced symptom identification with context
    identifySymptoms(message, session) {
        const identifiedSymptoms = new Map();
        const messageLower = message.toLowerCase();
        
        // Enhanced symptom detection with severity and context clues
        const symptomPatterns = {
            'headache': {
                keywords: ['headache', 'head pain', 'head hurt', 'migraine', 'head ache'],
                severityClues: {
                    severe: ['worst', 'severe', 'excruciating', 'unbearable', 'splitting'],
                    moderate: ['bad', 'strong', 'intense', 'pounding'],
                    mild: ['slight', 'dull', 'minor', 'little']
                }
            },
            'chest_pain': {
                keywords: ['chest pain', 'chest hurt', 'chest pressure', 'heart pain', 'chest tight'],
                severityClues: {
                    severe: ['crushing', 'stabbing', 'severe', 'sharp', 'radiating'],
                    moderate: ['pressure', 'tight', 'heavy', 'aching'],
                    mild: ['slight', 'minor', 'occasional']
                }
            },
            'fever': {
                keywords: ['fever', 'temperature', 'hot', 'chills', 'feverish'],
                contextClues: ['degrees', '°F', '°C', 'thermometer']
            },
            'nausea': {
                keywords: ['nausea', 'nauseous', 'sick', 'queasy', 'throw up', 'vomit'],
                severityClues: {
                    severe: ['can\'t stop', 'constantly', 'severe', 'violent'],
                    moderate: ['several times', 'often', 'repeatedly'],
                    mild: ['slight', 'little', 'occasionally']
                }
            }
        };

        for (const [symptomId, pattern] of Object.entries(symptomPatterns)) {
            if (pattern.keywords.some(keyword => messageLower.includes(keyword))) {
                const symptomData = {
                    id: symptomId,
                    severity: this.detectSeverity(messageLower, pattern.severityClues),
                    context: this.extractContext(messageLower, symptomId),
                    mentioned_at: new Date()
                };
                identifiedSymptoms.set(symptomId, symptomData);
            }
        }

        return identifiedSymptoms;
    }

    detectSeverity(message, severityClues) {
        if (!severityClues) return 'unknown';
        
        if (severityClues.severe && severityClues.severe.some(clue => message.includes(clue))) {
            return 'severe';
        }
        if (severityClues.moderate && severityClues.moderate.some(clue => message.includes(clue))) {
            return 'moderate';
        }
        if (severityClues.mild && severityClues.mild.some(clue => message.includes(clue))) {
            return 'mild';
        }
        return 'unknown';
    }

    extractContext(message, symptomId) {
        const context = {};
        
        // Duration patterns
        const durationPatterns = [
            { pattern: /(\d+)\s*(hour|hr)s?/i, type: 'hours' },
            { pattern: /(\d+)\s*(day)s?/i, type: 'days' },
            { pattern: /(\d+)\s*(week)s?/i, type: 'weeks' },
            { pattern: /(sudden|suddenly|just started)/i, type: 'sudden' },
            { pattern: /(gradual|slowly|getting worse)/i, type: 'gradual' }
        ];

        for (const dp of durationPatterns) {
            const match = message.match(dp.pattern);
            if (match) {
                if (dp.type === 'sudden' || dp.type === 'gradual') {
                    context.onset = dp.type;
                } else {
                    context.duration = { value: parseInt(match[1]), unit: dp.type };
                }
            }
        }

        // Associated symptoms
        const associations = {
            'chest_pain': ['shortness of breath', 'arm pain', 'jaw pain', 'sweating', 'nausea'],
            'headache': ['nausea', 'vision changes', 'neck stiffness', 'fever']
        };

        if (associations[symptomId]) {
            context.associated = associations[symptomId].filter(assoc => 
                message.includes(assoc)
            );
        }

        return context;
    }

    // More sophisticated emergency detection
    assessEmergencyRisk(symptoms, session) {
        let riskScore = 0;
        let emergencyFactors = [];

        // Critical combinations that warrant immediate attention
        const criticalCombinations = [
            {
                condition: (s) => s.has('chest_pain') && s.get('chest_pain').severity === 'severe',
                factor: 'severe chest pain',
                score: 8
            },
            {
                condition: (s) => s.has('chest_pain') && s.get('chest_pain').context.associated?.includes('shortness of breath'),
                factor: 'chest pain with breathing difficulty',
                score: 9
            },
            {
                condition: (s) => s.has('headache') && s.get('headache').severity === 'severe' && s.get('headache').context.onset === 'sudden',
                factor: 'sudden severe headache',
                score: 7
            }
        ];

        for (const combo of criticalCombinations) {
            if (combo.condition(symptoms)) {
                riskScore += combo.score;
                emergencyFactors.push(combo.factor);
            }
        }

        return {
            isEmergency: riskScore >= 8,
            riskScore,
            factors: emergencyFactors
        };
    }

    // Generate more natural follow-up questions
    generateFollowUpQuestion(symptoms, session) {
        // Prioritize which symptom to ask about based on risk and completeness
        const symptomToExplore = this.selectSymptomToExplore(symptoms, session);
        if (!symptomToExplore) return null;

        const symptomData = symptoms.get(symptomToExplore);
        
        // Generate context-appropriate questions
        if (symptomData.severity === 'unknown') {
            return {
                question: `How would you describe the severity of your ${symptomToExplore.replace('_', ' ')}? Is it mild, moderate, or severe?`,
                focus: symptomToExplore,
                type: 'severity'
            };
        }

        if (!symptomData.context.duration && !symptomData.context.onset) {
            return {
                question: `When did your ${symptomToExplore.replace('_', ' ')} start? Was it sudden or did it come on gradually?`,
                focus: symptomToExplore,
                type: 'timing'
            };
        }

        // Ask about associated symptoms for high-risk conditions
        if (symptomToExplore === 'chest_pain' && !symptomData.context.associated) {
            return {
                question: "Are you experiencing any shortness of breath, arm pain, nausea, or sweating along with the chest pain?",
                focus: symptomToExplore,
                type: 'associated'
            };
        }

        return null;
    }

    selectSymptomToExplore(symptoms, session) {
        // Priority order: high-risk symptoms first, then incomplete information
        const priorityOrder = ['chest_pain', 'headache', 'fever', 'nausea'];
        
        for (const symptomId of priorityOrder) {
            if (symptoms.has(symptomId)) {
                const symptomData = symptoms.get(symptomId);
                if (symptomData.severity === 'unknown' || 
                    (!symptomData.context.duration && !symptomData.context.onset)) {
                    return symptomId;
                }
            }
        }
        return null;
    }

    // Generate conversational responses instead of information dumps
    generateConversationalResponse(assessment) {
        if (assessment.type === 'emergency') {
            return {
                message: `I'm concerned about what you're describing. ${assessment.emergencyRisk.factors.join(' and ')} can be serious. I'd recommend calling 911 or getting immediate medical attention.`,
                tone: 'urgent',
                followUp: null
            };
        }

        if (assessment.type === 'question') {
            return {
                message: assessment.question.question,
                tone: 'conversational',
                followUp: `This helps me understand your situation better.`
            };
        }

        if (assessment.type === 'assessment') {
            let message = this.createPersonalizedResponse(assessment);
            return {
                message,
                tone: assessment.urgency === 'high' ? 'concerned' : 'helpful',
                followUp: assessment.urgency === 'high' ? 
                    'Would you like me to help you find urgent care nearby?' : 
                    'Is there anything specific about your symptoms you\'d like to discuss?'
            };
        }

        return {
            message: "I'd like to help you with your health concerns. Could you tell me what symptoms you're experiencing?",
            tone: 'helpful',
            followUp: null
        };
    }

    createPersonalizedResponse(assessment) {
        const { symptoms, urgency, recommendations } = assessment;
        let response = '';

        // Start with acknowledgment
        if (symptoms.size === 1) {
            const [symptomId, data] = symptoms.entries().next().value;
            response += `I understand you're dealing with ${symptomId.replace('_', ' ')}`;
            if (data.severity !== 'unknown') {
                response += ` that seems to be ${data.severity}`;
            }
            response += '. ';
        } else {
            response += `I see you're experiencing several symptoms. `;
        }

        // Add appropriate urgency guidance
        if (urgency === 'high') {
            response += `Given what you've described, I'd recommend contacting your healthcare provider today or considering urgent care. `;
        } else if (urgency === 'medium') {
            response += `These symptoms are worth monitoring, and you might want to check in with your healthcare provider if they continue. `;
        } else {
            response += `This sounds manageable with some self-care, but keep an eye on how you're feeling. `;
        }

        // Add one key recommendation
        if (recommendations.self_care.length > 0) {
            response += `In the meantime, ${recommendations.self_care[0].toLowerCase()}.`;
        }

        return response;
    }

    // Main assessment function with improved flow
    async assessSymptoms(userMessage, sessionId = 'default') {
        if (!this.symptoms || !this.conditions) {
            await this.initialize();
        }

        const session = this.getUserSession(sessionId);
        session.conversationHistory.push(userMessage);

        // Update symptoms with new information
        const newSymptoms = this.identifySymptoms(userMessage, session);
        for (const [symptomId, symptomData] of newSymptoms) {
            session.reportedSymptoms.set(symptomId, symptomData);
        }

        // Check for emergency conditions
        const emergencyRisk = this.assessEmergencyRisk(session.reportedSymptoms, session);
        if (emergencyRisk.isEmergency) {
            return {
                type: 'emergency',
                emergencyRisk,
                response: this.generateConversationalResponse({ type: 'emergency', emergencyRisk })
            };
        }

        // Generate follow-up questions if needed
        const followUpQuestion = this.generateFollowUpQuestion(session.reportedSymptoms, session);
        if (followUpQuestion && session.reportedSymptoms.size > 0) {
            return {
                type: 'question',
                question: followUpQuestion,
                response: this.generateConversationalResponse({ type: 'question', question: followUpQuestion })
            };
        }

        // Provide assessment if we have enough information
        if (session.reportedSymptoms.size > 0) {
            const urgency = this.calculateUrgency(session.reportedSymptoms);
            const potentialConditions = this.findPotentialConditions([...session.reportedSymptoms.keys()]);
            const recommendations = this.generateRecommendations([...session.reportedSymptoms.keys()], { level: urgency }, potentialConditions);

            const assessment = {
                type: 'assessment',
                symptoms: session.reportedSymptoms,
                urgency,
                potentialConditions: potentialConditions.slice(0, 2),
                recommendations
            };

            return {
                ...assessment,
                response: this.generateConversationalResponse(assessment)
            };
        }

        // Default clarification request
        return {
            type: 'clarification',
            response: this.generateConversationalResponse({ type: 'clarification' })
        };
    }

    calculateUrgency(symptoms) {
        let urgencyScore = 0;
        
        for (const [symptomId, data] of symptoms) {
            // Base urgency on severity and symptom type
            const baseScores = {
                'chest_pain': 3,
                'headache': 2,
                'fever': 1,
                'nausea': 1
            };
            
            urgencyScore += baseScores[symptomId] || 0;
            
            if (data.severity === 'severe') urgencyScore += 2;
            if (data.context.onset === 'sudden') urgencyScore += 1;
            if (data.context.associated?.length > 0) urgencyScore += 1;
        }

        if (urgencyScore >= 6) return 'high';
        if (urgencyScore >= 3) return 'medium';
        return 'low';
    }

    // Keep your existing findPotentialConditions and generateRecommendations methods
    // but modify them to be less verbose in their output

    findPotentialConditions(symptoms) {
        // Your existing implementation
        const potentialConditions = [];
        // ... existing logic
        return potentialConditions;
    }

    generateRecommendations(symptoms, urgency, potentialConditions) {
        // Your existing implementation but simplified
        // ... existing logic
        return {
            immediate_action: '',
            self_care: [],
            when_to_seek_care: ''
        };
    }
}

module.exports = SymptomAssessor;