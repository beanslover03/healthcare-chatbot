const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import services
const ClaudeService = require('./services/claude-service');
const MedicalAPIService = require('./services/medical-api');

const app = express();
const PORT = process.env.PORT || 3000;

// DEBUG: Log environment variables (without exposing the actual keys)
console.log('🔍 DEBUG: Environment check:');
console.log('  Claude API Key:', process.env.CLAUDE_API_KEY ? `Present (${process.env.CLAUDE_API_KEY.substring(0, 10)}...)` : 'MISSING');
console.log('  Anthropic API Key:', process.env.ANTHROPIC_API_KEY ? `Present (${process.env.ANTHROPIC_API_KEY.substring(0, 10)}...)` : 'MISSING');
console.log('  Other env vars:', Object.keys(process.env).filter(key => key.includes('API')));

// Initialize services with error handling
let claudeService, medicalAPI;

try {
    console.log('🔍 DEBUG: Initializing Claude service...');
    claudeService = new ClaudeService();
    console.log('✅ Claude service initialized successfully');
} catch (error) {
    console.error('❌ ERROR: Failed to initialize Claude service:', error.message);
    console.error('Full error:', error);
}

try {
    console.log('🔍 DEBUG: Initializing Medical API service...');
    medicalAPI = new MedicalAPIService();
    console.log('✅ Medical API service initialized successfully');
} catch (error) {
    console.error('❌ ERROR: Failed to initialize Medical API service:', error.message);
    console.error('Full error:', error);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Add request logging middleware
app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api/')) {
        console.log(`🔍 DEBUG: ${req.method} ${req.originalUrl} - ${new Date().toISOString()}`);
        console.log('Request body:', req.body);
    }
    next();
});

// Store conversation sessions
const conversationSessions = new Map();

// Main chat endpoint with comprehensive medical assessment
app.post('/api/chat', async (req, res) => {
    console.log('🔍 DEBUG: Chat endpoint hit');
    
    try {
        const { message, sessionId = 'default', patientInfo = {} } = req.body;
        
        console.log('🔍 DEBUG: Request data:');
        console.log('  Message:', message);
        console.log('  Session ID:', sessionId);
        console.log('  Patient Info:', patientInfo);
        
        // Validate required data
        if (!message) {
            console.log('❌ ERROR: No message provided');
            return res.json({
                success: false,
                response: 'No message provided',
                error: 'Message is required'
            });
        }

        // Check if services are initialized
        if (!claudeService) {
            console.log('❌ ERROR: Claude service not initialized');
            return res.json({
                success: false,
                response: 'Claude service unavailable',
                error: 'Claude service not initialized'
            });
        }

        if (!medicalAPI) {
            console.log('❌ ERROR: Medical API service not initialized');
            return res.json({
                success: false,
                response: 'Medical API service unavailable',
                error: 'Medical API service not initialized'
            });
        }
        
        console.log(`🔍 DEBUG: Processing message for session ${sessionId}: ${message}`);
        
        // Get or create conversation history
        if (!conversationSessions.has(sessionId)) {
            console.log('🔍 DEBUG: Creating new conversation session');
            conversationSessions.set(sessionId, []);
        }
        const history = conversationSessions.get(sessionId);
        console.log(`🔍 DEBUG: Session history length: ${history.length}`);

        // Step 1: Emergency triage assessment first
        console.log('🔍 DEBUG: Starting emergency triage assessment...');
        let triageResult;
        try {
            triageResult = await claudeService.assessEmergencyLevel([], message);
            console.log('🔍 DEBUG: Triage result:', triageResult);
        } catch (error) {
            console.error('❌ ERROR in emergency triage:', error.message);
            console.error('Full triage error:', error);
            throw new Error(`Triage assessment failed: ${error.message}`);
        }
        
        if (triageResult.level === 'EMERGENCY') {
            console.log('🚨 DEBUG: Emergency detected, returning immediate response');
            // For emergencies, respond immediately
            const emergencyResponse = `🚨 **MEDICAL EMERGENCY DETECTED** 🚨

${triageResult.triage}

**IMMEDIATE ACTION REQUIRED:**
- Call 911 now or go to the nearest emergency room
- Do not delay medical care
- If someone is with you, have them call while you prepare to leave

This is not a substitute for emergency medical services. When in doubt, always call 911.`;

            history.push(
                { role: "user", content: message },
                { role: "assistant", content: emergencyResponse }
            );
            
            return res.json({
                success: true,
                response: emergencyResponse,
                urgency: 'EMERGENCY',
                sessionId: sessionId
            });
        }

        // Step 2: Comprehensive medical analysis
        console.log('🔍 DEBUG: Starting medical analysis...');
        let medicalAnalysis;
        try {
            medicalAnalysis = await medicalAPI.analyzeSymptoms([], message);
            console.log('🔍 DEBUG: Medical analysis result:', medicalAnalysis);
        } catch (error) {
            console.error('❌ ERROR in medical analysis:', error.message);
            console.error('Full medical analysis error:', error);
            throw new Error(`Medical analysis failed: ${error.message}`);
        }
        
        // Step 3: Get Claude's comprehensive assessment
        console.log('🔍 DEBUG: Getting Claude assessment...');
        let assessmentResult;
        try {
            assessmentResult = await claudeService.assessSymptoms(message, medicalAnalysis, history);
            console.log('🔍 DEBUG: Assessment result:', assessmentResult);
        } catch (error) {
            console.error('❌ ERROR in Claude assessment:', error.message);
            console.error('Full assessment error:', error);
            throw new Error(`Claude assessment failed: ${error.message}`);
        }
        
        // Step 4: Update conversation history
        console.log('🔍 DEBUG: Updating conversation history...');
        history.push(
            { role: "user", content: message },
            { role: "assistant", content: assessmentResult.response }
        );

        // Keep history manageable (last 20 messages)
        if (history.length > 20) {
            console.log('🔍 DEBUG: Trimming conversation history');
            history.splice(0, history.length - 20);
        }

        conversationSessions.set(sessionId, history);

        // Step 5: Send comprehensive response
        console.log('🔍 DEBUG: Sending successful response');
        const responseData = {
            success: assessmentResult.success,
            response: assessmentResult.response,
            medicalData: {
                analysis: medicalAnalysis,
                triage: triageResult,
                apiStatus: medicalAPI.getAPIStatus()
            },
            sessionId: sessionId
        };
        console.log('🔍 DEBUG: Response data structure:', {
            success: responseData.success,
            hasResponse: !!responseData.response,
            hasMedicalData: !!responseData.medicalData,
            sessionId: responseData.sessionId
        });
        
        res.json(responseData);

    } catch (error) {
        console.error('❌ CRITICAL ERROR in chat endpoint:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Full error object:', error);
        
        res.json({
            success: false,
            response: 'I apologize, but I encountered an error processing your request. For urgent medical concerns, please contact a healthcare professional immediately or call 911.',
            error: error.message,
            debug: {
                timestamp: new Date().toISOString(),
                endpoint: '/api/chat'
            }
        });
    }
});

// Medication lookup endpoint with RxNorm integration
app.post('/api/medication-lookup', async (req, res) => {
    console.log('🔍 DEBUG: Medication lookup endpoint hit');
    
    try {
        const { medicationName, userContext = '' } = req.body;
        
        console.log(`🔍 DEBUG: Looking up medication: ${medicationName}`);
        
        // Get comprehensive medication data
        const medicationData = await medicalAPI.comprehensiveMedicationLookup(medicationName);
        console.log('🔍 DEBUG: Medication data received:', medicationData);
        
        // Get Claude's medication guidance
        const guidanceResult = await claudeService.getMedicationGuidance(
            medicationName, 
            medicationData, 
            userContext
        );
        console.log('🔍 DEBUG: Guidance result:', guidanceResult);
        
        res.json({
            success: guidanceResult.success,
            medication: medicationName,
            guidance: guidanceResult.response,
            databaseInfo: {
                rxnorm: medicationData.rxnorm,
                fhir: medicationData.fhir,
                otc: medicationData.otc,
                interactions: medicationData.interactions
            },
            timestamp: medicationData.timestamp
        });

    } catch (error) {
        console.error('❌ ERROR in medication lookup:', error.message);
        console.error('Full error:', error);
        res.json({
            success: false,
            error: `Unable to retrieve information about ${req.body.medicationName}. Please consult your pharmacist or healthcare provider.`
        });
    }
});

// Symptom analysis endpoint
app.post('/api/analyze-symptoms', async (req, res) => {
    console.log('🔍 DEBUG: Symptom analysis endpoint hit');
    
    try {
        const { symptoms, additionalInfo = {} } = req.body;
        
        console.log(`🔍 DEBUG: Analyzing symptoms: ${symptoms?.join ? symptoms.join(', ') : symptoms}`);
        
        // Get clinical analysis from Claude
        const analysisResult = await claudeService.analyzeSymptomPattern(symptoms, additionalInfo);
        console.log('🔍 DEBUG: Analysis result:', analysisResult);
        
        // Get medical database information
        const medicalData = await medicalAPI.analyzeSymptoms(symptoms, symptoms.join ? symptoms.join(' ') : symptoms);
        console.log('🔍 DEBUG: Medical data:', medicalData);
        
        res.json({
            success: analysisResult.success,
            symptoms: symptoms,
            clinicalAnalysis: analysisResult.analysis,
            medicalData: {
                conditions: medicalData.conditions,
                medications: medicalData.medications,
                fhirData: medicalData.fhirData,
                urgency: medicalData.urgency
            },
            additionalInfo: additionalInfo
        });

    } catch (error) {
        console.error('❌ ERROR in symptom analysis:', error.message);
        console.error('Full error:', error);
        res.json({
            success: false,
            error: 'Unable to complete symptom analysis. Please consult a healthcare professional for proper evaluation.'
        });
    }
});

// Follow-up questions endpoint
app.post('/api/follow-up-questions', async (req, res) => {
    console.log('🔍 DEBUG: Follow-up questions endpoint hit');
    
    try {
        const { symptoms, currentInfo = {} } = req.body;
        
        const questionsResult = await claudeService.generateFollowUpQuestions(symptoms, currentInfo);
        console.log('🔍 DEBUG: Questions result:', questionsResult);
        
        res.json({
            success: questionsResult.success,
            questions: questionsResult.questions,
            symptoms: symptoms
        });

    } catch (error) {
        console.error('❌ ERROR in follow-up questions:', error.message);
        console.error('Full error:', error);
        res.json({
            success: false,
            questions: 'Please provide more details about when your symptoms started, their severity, and any factors that make them better or worse.'
        });
    }
});

// System health and status endpoint
app.get('/api/health', async (req, res) => {
    console.log('🔍 DEBUG: Health check endpoint hit');
    
    try {
        // Check Claude service
        const claudeHealth = await claudeService.healthCheck();
        console.log('🔍 DEBUG: Claude health:', claudeHealth);
        
        // Check Medical API service
        const apiStatus = medicalAPI.getAPIStatus();
        console.log('🔍 DEBUG: API status:', apiStatus);
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                claude: claudeHealth,
                medical_apis: apiStatus,
                conversation_sessions: conversationSessions.size
            },
            features: {
                symptom_assessment: true,
                medication_lookup: true,
                emergency_triage: true,
                rxnorm_integration: apiStatus.rxnorm,
                fhir_integration: apiStatus.fhir,
                conversation_history: true
            }
        });

    } catch (error) {
        console.error('❌ ERROR in health check:', error.message);
        console.error('Full error:', error);
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get conversation history
app.get('/api/session/:sessionId/history', (req, res) => {
    const sessionId = req.params.sessionId;
    const history = conversationSessions.get(sessionId) || [];
    console.log(`🔍 DEBUG: Retrieved history for session ${sessionId}, length: ${history.length}`);
    
    res.json({
        sessionId: sessionId,
        messageCount: history.length,
        history: history
    });
});

// Reset conversation session
app.delete('/api/session/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    conversationSessions.delete(sessionId);
    console.log(`🔍 DEBUG: Cleared session ${sessionId}`);
    
    res.json({ 
        message: `Session ${sessionId} cleared successfully`,
        remainingSessions: conversationSessions.size
    });
});

// Emergency contact information endpoint
app.get('/api/emergency-contacts', (req, res) => {
    console.log('🔍 DEBUG: Emergency contacts endpoint hit');
    
    res.json({
        emergency: {
            number: '911',
            description: 'Life-threatening emergencies'
        },
        poison_control: {
            number: '1-800-222-1222',
            description: 'Poison emergencies and information'
        },
        mental_health: {
            number: '988',
            description: 'Suicide & Crisis Lifeline'
        },
        non_emergency_resources: [
            {
                name: 'Urgent Care',
                description: 'Non-life-threatening injuries and illnesses'
            },
            {
                name: 'Telehealth',
                description: 'Virtual consultations with healthcare providers'
            },
            {
                name: 'Pharmacy Consultation',
                description: 'Medication questions and minor health concerns'
            }
        ]
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ UNHANDLED SERVER ERROR:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Full error:', error);
    
    res.status(500).json({
        success: false,
        error: 'Internal server error. If this is a medical emergency, please call 911.',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res, next) => {
    console.log(`🔍 DEBUG: 404 hit for ${req.originalUrl}`);
    
    // Check if the request is for an API endpoint
    if (req.originalUrl.startsWith('/api/')) {
        res.status(404).json({
            error: 'API endpoint not found',
            availableEndpoints: [
                'POST /api/chat',
                'POST /api/medication-lookup',
                'POST /api/analyze-symptoms',
                'POST /api/follow-up-questions',
                'GET /api/health',
                'GET /api/emergency-contacts'
            ]
        });
    } else {
        // For non-API routes, send the HTML file
        res.status(404).sendFile(path.join(__dirname, '../frontend/index.html'));
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🏥 Advanced Medical Chatbot Server running on http://localhost:${PORT}`);
    console.log('🔗 Services initialized:');
    console.log('  ✅ Claude-3 Sonnet Medical Assessment');
    console.log('  ✅ RxNorm Drug Database Integration');
    console.log('  ✅ FHIR Healthcare Standards');
    console.log('  ✅ Emergency Triage System');
    console.log('  ✅ Comprehensive Medication Lookup');
    console.log('📊 API Status:');
    console.log(`  • RxNorm: Available (Free NIH API)`);
    console.log(`  • FHIR: Available (Public test server)`);
    console.log(`  • Claude API: ${process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Missing API key'}`);
    console.log('🔍 DEBUG MODE: Extensive logging enabled');
});

module.exports = app;