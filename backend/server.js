const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import services
const ClaudeService = require('./services/claude-service');
const MedicalAPIService = require('./services/medical-api');
const SymptomAssessor = require('./symptom_logic');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const claudeService = new ClaudeService();
const medicalAPI = new MedicalAPIService();
const symptomAssessor = new SymptomAssessor();

// Initialize symptom assessor
symptomAssessor.initialize().catch(console.error);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Simple conversation storage (for Claude context only)
const conversationSessions = new Map();

// FIXED: Integrated approach - SymptomAssessor determines WHAT to do, Claude determines HOW to say it
app.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId = 'default' } = req.body;
        
        console.log(`💬 Processing: "${message}" (Session: ${sessionId})`);
        
        // Get Claude conversation history
        if (!conversationSessions.has(sessionId)) {
            conversationSessions.set(sessionId, []);
        }
        const claudeHistory = conversationSessions.get(sessionId);

        // Step 1: Let SymptomAssessor analyze the medical situation
        const assessmentResult = await symptomAssessor.assessSymptoms(message, sessionId);
        console.log(`🔍 Assessment type: ${assessmentResult.type}`);

        // Step 2: Use Claude to generate natural responses based on the assessment
        let finalResponse;
        let urgencyLevel = 'normal';

        switch (assessmentResult.type) {
            case 'emergency':
                finalResponse = await generateEmergencyResponse(assessmentResult, claudeService, claudeHistory);
                urgencyLevel = 'emergency';
                break;
                
            case 'question':
                finalResponse = await generateNaturalQuestion(assessmentResult, claudeService, message, claudeHistory);
                urgencyLevel = 'gathering_info';
                break;
                
            case 'assessment':
                finalResponse = await generateAssessmentResponse(assessmentResult, claudeService, claudeHistory);
                urgencyLevel = assessmentResult.urgency || 'normal';
                break;
                
            default: // clarification
                finalResponse = await generateClarificationResponse(claudeService, message, claudeHistory);
                urgencyLevel = 'clarification';
        }

        // Step 3: Update Claude conversation history for context
        claudeHistory.push(
            { role: "user", content: message },
            { role: "assistant", content: finalResponse }
        );

        // Keep history manageable
        if (claudeHistory.length > 20) {
            claudeHistory.splice(0, claudeHistory.length - 20);
        }

        conversationSessions.set(sessionId, claudeHistory);

        // Step 4: Send response
        res.json({
            success: true,
            response: finalResponse,
            urgency: urgencyLevel,
            sessionId: sessionId,
            assessmentType: assessmentResult.type,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('💥 Chat error:', error);
        res.json({
            success: false,
            response: "I'm having trouble right now. For urgent medical concerns, please contact your healthcare provider or call 911.",
            error: error.message
        });
    }
});

// Generate emergency response using Claude
async function generateEmergencyResponse(assessmentResult, claudeService, claudeHistory) {
    const prompt = `
    EMERGENCY SITUATION DETECTED
    Risk factors: ${assessmentResult.emergencyRisk.factors.join(', ')}
    Risk score: ${assessmentResult.emergencyRisk.riskScore}/10
    
    Generate a clear, calm but urgent response that:
    1. Acknowledges their serious symptoms
    2. Recommends immediate medical attention (911 or ER)
    3. Doesn't cause panic but conveys urgency
    4. Is supportive and professional
    
    Keep it 2-3 sentences maximum.
    `;

    try {
        const response = await claudeService.getChatResponse(prompt, claudeHistory.slice(-2));
        return `🚨 ${response}`;
    } catch (error) {
        return `🚨 I'm concerned about the symptoms you're describing. These can be serious and I'd recommend calling 911 or getting immediate medical attention right away.`;
    }
}

// Generate natural follow-up questions using Claude
async function generateNaturalQuestion(assessmentResult, claudeService, userMessage, claudeHistory) {
    const symptomAssessorQuestion = assessmentResult.question.question;
    const questionType = assessmentResult.question.type;
    const focusSymptom = assessmentResult.question.focus;

    const prompt = `
    USER SAID: "${userMessage}"
    
    I need to ask about: ${questionType} for their ${focusSymptom.replace('_', ' ')}
    
    Original question: "${symptomAssessorQuestion}"
    
    Make this question more natural and conversational:
    1. First acknowledge what they told me
    2. Then ask the question in a caring, natural way
    3. Briefly explain why this helps (1 sentence)
    4. Keep the overall response to 2-3 sentences
    5. Don't ask if they've already mentioned this information
    
    Previous conversation context: ${claudeHistory.slice(-4).map(h => h.content).join('\n')}
    `;

    try {
        const response = await claudeService.getChatResponse(prompt, []);
        return response;
    } catch (error) {
        // Fallback to assessor's question
        return `I understand you're experiencing ${focusSymptom.replace('_', ' ')}. ${symptomAssessorQuestion} This helps me better understand your situation.`;
    }
}

// Generate comprehensive assessment response using Claude
async function generateAssessmentResponse(assessmentResult, claudeService, claudeHistory) {
    const symptoms = Array.from(assessmentResult.symptoms.keys()).join(', ');
    const urgency = assessmentResult.urgency;
    const conditions = assessmentResult.potentialConditions?.map(c => c.name).slice(0, 2).join(', ') || 'various conditions';

    const prompt = `
    MEDICAL ASSESSMENT COMPLETE
    
    User's symptoms: ${symptoms}
    Urgency level: ${urgency}
    Possible conditions: ${conditions}
    
    Generate a helpful, conversational response that:
    1. Acknowledges their specific symptoms
    2. Provides appropriate guidance based on urgency:
       - High: Contact healthcare provider today/urgent care
       - Medium: Monitor and contact if worsens, routine appointment
       - Low: Self-care suggestions, monitor symptoms
    3. Gives 1-2 practical next steps they can take
    4. Offers to answer questions or provide more information
    5. Remains supportive and non-alarming
    
    Keep it conversational and helpful (3-4 sentences).
    Don't list multiple conditions - focus on most helpful guidance.
    `;

    try {
        const response = await claudeService.getChatResponse(prompt, claudeHistory.slice(-2));
        return response;
    } catch (error) {
        // Enhanced fallback
        if (urgency === 'high') {
            return `Based on your ${symptoms}, I'd recommend contacting your healthcare provider today to get this properly evaluated. These symptoms warrant prompt medical attention. Is there anything specific you'd like to know while you arrange to see a healthcare professional?`;
        } else if (urgency === 'medium') {
            return `Your ${symptoms} sound concerning but manageable. I'd suggest monitoring these symptoms and contacting your healthcare provider if they worsen or don't improve. Would you like some suggestions for what might help in the meantime?`;
        } else {
            return `Your ${symptoms} sound like something you can manage with some self-care, but keep monitoring how you feel. Would you like some suggestions for relief, or do you have questions about when to seek care?`;
        }
    }
}

// Generate clarification request using Claude  
async function generateClarificationResponse(claudeService, userMessage, claudeHistory) {
    const prompt = `
    USER MESSAGE: "${userMessage}"
    
    This user contacted a medical chatbot but hasn't clearly described symptoms yet.
    
    Generate a warm, encouraging response that:
    1. Shows you're ready to help with their health concerns
    2. Asks them to describe their symptoms naturally
    3. Gives a brief example of what's helpful
    4. Keeps it friendly and approachable (2 sentences)
    
    Recent conversation: ${claudeHistory.slice(-2).map(h => h.content).join('\n')}
    `;

    try {
        const response = await claudeService.getChatResponse(prompt, []);
        return response;
    } catch (error) {
        return "Hi! I'm here to help you understand your health concerns. Could you tell me what symptoms you're experiencing and when they started?";
    }
}

// Medication lookup (unchanged)
app.post('/api/medication-lookup', async (req, res) => {
    try {
        const { medicationName, userContext = '' } = req.body;
        
        const medicationData = await medicalAPI.comprehensiveMedicationLookup(medicationName);
        
        const prompt = `The user is asking about "${medicationName}". Context: ${userContext}
        
        Available data: ${JSON.stringify(medicationData, null, 2)}
        
        Provide helpful information about this medication in a conversational way. Include key uses, safety notes, and remind them to consult their pharmacist or doctor.`;

        const response = await claudeService.getChatResponse(prompt, []);
        
        res.json({
            success: true,
            response: response,
            medication: medicationName
        });

    } catch (error) {
        console.error('Medication lookup error:', error);
        res.json({
            success: false,
            response: `I'd recommend speaking with your pharmacist or healthcare provider about ${req.body.medicationName} for the most accurate information.`
        });
    }
});

// Enhanced session context endpoint
app.get('/api/session/:sessionId/context', (req, res) => {
    const sessionId = req.params.sessionId;
    
    try {
        // Get both symptom assessor and Claude context
        const symptomSession = symptomAssessor.getUserSession(sessionId);
        const claudeHistory = conversationSessions.get(sessionId) || [];
        
        res.json({
            sessionId: sessionId,
            symptomAssessor: {
                reportedSymptoms: Object.fromEntries(symptomSession.reportedSymptoms || new Map()),
                currentFocus: symptomSession.currentFocus,
                assessmentStage: symptomSession.assessmentStage,
                riskScore: symptomSession.riskScore,
                conversationLength: symptomSession.conversationHistory?.length || 0
            },
            claude: {
                conversationLength: claudeHistory.length,
                lastMessages: claudeHistory.slice(-4)
            }
        });
    } catch (error) {
        res.json({
            sessionId: sessionId,
            error: 'Could not retrieve session data',
            message: error.message
        });
    }
});

// Enhanced session reset
app.delete('/api/session/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    
    // Clear both systems
    try {
        symptomAssessor.userSessions.delete(sessionId);
    } catch (error) {
        console.log('Error clearing symptom assessor session:', error);
    }
    
    conversationSessions.delete(sessionId);
    claudeService.clearConversationContext(sessionId);
    
    res.json({ 
        message: `Session ${sessionId} cleared completely. Fresh conversation started.`,
        timestamp: new Date().toISOString()
    });
});

// Health check with integration status
app.get('/api/health', async (req, res) => {
    try {
        const claudeHealth = await claudeService.healthCheck();
        const apiStatus = medicalAPI.getAPIStatus();
        const symptomAssessorStatus = symptomAssessor.symptoms ? 'ready' : 'initializing';
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            architecture: 'integrated_symptom_assessor_claude',
            services: {
                claude: claudeHealth,
                medical_apis: apiStatus,
                symptom_assessor: symptomAssessorStatus,
                active_sessions: {
                    symptom_assessor: symptomAssessor.userSessions?.size || 0,
                    claude: conversationSessions.size
                }
            },
            features: {
                medical_analysis: symptomAssessorStatus === 'ready',
                natural_responses: claudeHealth.status === 'healthy',
                emergency_detection: true,
                conversational_questions: true,
                integrated_assessment: true
            }
        });

    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Emergency contacts (unchanged)
app.get('/api/emergency-contacts', (req, res) => {
    res.json({
        emergency: {
            number: '911',
            when: 'Life-threatening symptoms: severe chest pain, difficulty breathing, loss of consciousness'
        },
        urgent_care: {
            description: 'For non-life-threatening but urgent symptoms',
            when: 'Symptoms that need same-day care but aren\'t emergencies'
        },
        primary_care: {
            description: 'Your healthcare provider',
            when: 'Routine concerns, follow-up questions, medication issues'
        }
    });
});

// Error handling
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        success: false,
        response: 'I encountered a technical issue. For urgent medical concerns, please contact a healthcare professional.',
        timestamp: new Date().toISOString()
    });
});

// 404 for API routes
app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found' });
    } else {
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    }
});

app.listen(PORT, () => {
    console.log(`🏥 Medical Chatbot Server (Integrated) running on http://localhost:${PORT}`);
    console.log('🎯 Architecture: SymptomAssessor (medical logic) + Claude (natural language)');
    console.log('✅ Integration: SymptomAssessor decides WHAT to do, Claude decides HOW to say it');
    console.log('🚫 Fixed: Competing conversation managers causing loops');
    console.log('⚡ Features: Smart questioning, emergency detection, natural responses');
    console.log(`🔑 Claude API: ${process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Missing'}`);
});

module.exports = app;