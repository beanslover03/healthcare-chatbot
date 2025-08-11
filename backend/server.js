// server.js - FIXED VERSION with proper medical API integration
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import the COMPREHENSIVE services (not the simple ones)
const ClaudeService = require('./services/claude-service');
const MedicalAPIService = require('./services/medical-apis'); // This is the comprehensive one

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services with error handling
let claudeService, medicalAPI;

async function initializeServices() {
    try {
        console.log('🔍 Initializing Claude service...');
        claudeService = new ClaudeService();
        console.log('✅ Claude service initialized');
        
        console.log('🔍 Initializing Medical API service...');
        medicalAPI = new MedicalAPIService();
        console.log('✅ Medical API service initialized');
        
        // Test medical APIs on startup
        console.log('🧪 Testing medical API connections...');
        const apiStatus = await medicalAPI.getAPIStatus();
        console.log('📊 API Status:', apiStatus);
        
    } catch (error) {
        console.error('❌ Service initialization error:', error);
        process.exit(1);
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Simple conversation storage
const conversationSessions = new Map();

// Input validation middleware
function validateInput(req, res, next) {
    const { message } = req.body;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.json({
            success: false,
            response: 'Please provide a valid message describing your symptoms.'
        });
    }
    
    if (message.length > 1000) {
        return res.json({
            success: false,
            response: 'Please keep your message under 1000 characters for better analysis.'
        });
    }
    
    req.body.message = message.trim();
    next();
}

// ENHANCED chat endpoint that actually uses medical databases
app.post('/api/chat', validateInput, async (req, res) => {
    try {
        const { message, sessionId = 'default', source = 'chat' } = req.body;
        
        console.log(`💬 ${source.toUpperCase()}: "${message}"`);
        
        // Get conversation history
        if (!conversationSessions.has(sessionId)) {
            conversationSessions.set(sessionId, []);
        }
        const history = conversationSessions.get(sessionId);

        let response;
        let urgency = 'normal';
        let medicalData = null;

        // STEP 1: Check for emergency conditions first
        if (claudeService.isEmergency(message)) {
            console.log('🚨 Emergency detected');
            response = await claudeService.generateEmergencyResponse(message, history);
            urgency = 'emergency';
            
        } else {
            // STEP 2: Get comprehensive medical analysis from databases
            console.log('🔍 Analyzing symptoms with medical databases...');
            try {
                medicalData = await medicalAPI.analyzeSymptoms([], message);
                console.log('📊 Medical analysis results:', {
                    symptomsFound: medicalData.symptoms?.length || 0,
                    conditionsFound: medicalData.conditions?.length || 0,
                    medicationsFound: medicalData.medications?.length || 0,
                    apiSources: medicalData.apiSources
                });
            } catch (error) {
                console.warn('⚠️ Medical API analysis failed:', error.message);
                medicalData = { error: error.message };
            }
            
            // STEP 3: Get Claude's assessment using medical data
            if (source === 'symptom_tracker') {
                response = await claudeService.assessSymptoms(message, medicalData, history);
                response = response.response || response;
            } else if (claudeService.isConversationEnding(message)) {
                console.log('👋 Conversation ending');
                response = await claudeService.generateEndingResponse(history);
                urgency = 'ending';
            } else {
                console.log('💭 Normal conversation with medical context');
                response = await claudeService.assessSymptoms(message, medicalData, history);
                response = response.response || response;
            }
            
            // Determine urgency from medical data
            if (medicalData && medicalData.emergencyFactors && medicalData.emergencyFactors.length > 0) {
                urgency = 'high';
            } else if (medicalData && medicalData.conditions && medicalData.conditions.some(c => c.urgency === 'high')) {
                urgency = 'medium';
            }
        }

        // Update history
        history.push(
            { role: "user", content: message },
            { role: "assistant", content: response }
        );

        // Keep history manageable
        if (history.length > 10) {
            history.splice(0, history.length - 10);
        }

        conversationSessions.set(sessionId, history);

        console.log(`🤖 Response generated (urgency: ${urgency})`);

        res.json({
            success: true,
            response: response,
            urgency: urgency,
            sessionId: sessionId,
            source: source,
            medicalData: medicalData ? {
                symptomsAnalyzed: medicalData.symptoms?.length || 0,
                databasesUsed: medicalData.apiSources || [],
                confidence: medicalData.confidence || 'unknown'
            } : null,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('💥 Chat error:', error);
        
        let fallbackResponse = "I'm having trouble right now. For urgent medical concerns, please contact your healthcare provider or call 911.";
        
        if (error.message.includes('API key')) {
            fallbackResponse = "I'm experiencing technical difficulties. Please consult a healthcare professional directly for medical concerns.";
        }
        
        res.json({
            success: false,
            response: fallbackResponse,
            error: error.message,
            emergencyContact: "If this is an emergency, call 911"
        });
    }
});

// NEW: Medical database testing endpoint
app.post('/api/test-medical-apis', async (req, res) => {
    try {
        const { testType = 'all' } = req.body;
        
        console.log(`🧪 Testing medical APIs (type: ${testType})`);
        
        const results = {
            timestamp: new Date().toISOString(),
            tests: []
        };
        
        if (testType === 'all' || testType === 'rxnorm') {
            console.log('🧪 Testing RxNorm with aspirin search...');
            try {
                const rxnormResult = await medicalAPI.comprehensiveMedicationLookup('aspirin');
                results.tests.push({
                    service: 'RxNorm',
                    test: 'aspirin lookup',
                    success: rxnormResult.found,
                    details: {
                        found: rxnormResult.found,
                        resultsCount: rxnormResult.rxnorm?.length || 0,
                        hasInteractions: (rxnormResult.interactions?.length || 0) > 0
                    }
                });
            } catch (error) {
                results.tests.push({
                    service: 'RxNorm',
                    test: 'aspirin lookup',
                    success: false,
                    error: error.message
                });
            }
        }
        
        if (testType === 'all' || testType === 'symptom') {
            console.log('🧪 Testing symptom analysis with headache...');
            try {
                const symptomResult = await medicalAPI.analyzeSymptoms([], 'I have a severe headache with nausea');
                results.tests.push({
                    service: 'SymptomAnalysis',
                    test: 'headache analysis',
                    success: symptomResult.symptoms?.length > 0,
                    details: {
                        symptomsFound: symptomResult.symptoms?.length || 0,
                        conditionsFound: symptomResult.conditions?.length || 0,
                        emergencyFactors: symptomResult.emergencyFactors?.length || 0,
                        confidence: symptomResult.confidence
                    }
                });
            } catch (error) {
                results.tests.push({
                    service: 'SymptomAnalysis',
                    test: 'headache analysis',
                    success: false,
                    error: error.message
                });
            }
        }
        
        if (testType === 'all' || testType === 'status') {
            console.log('🧪 Getting API status...');
            try {
                const statusResult = await medicalAPI.getAPIStatus();
                results.tests.push({
                    service: 'APIStatus',
                    test: 'health check',
                    success: statusResult.overall === 'healthy',
                    details: statusResult
                });
            } catch (error) {
                results.tests.push({
                    service: 'APIStatus',
                    test: 'health check',
                    success: false,
                    error: error.message
                });
            }
        }
        
        const successCount = results.tests.filter(t => t.success).length;
        const totalCount = results.tests.length;
        
        console.log(`🧪 Medical API tests complete: ${successCount}/${totalCount} passed`);
        
        res.json({
            success: true,
            summary: `${successCount}/${totalCount} tests passed`,
            results: results
        });
        
    } catch (error) {
        console.error('🧪 Medical API test error:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Enhanced health check with medical API status
app.get('/api/health', async (req, res) => {
    try {
        const claudeHealth = await claudeService.healthCheck();
        const apiStatus = await medicalAPI.getAPIStatus();
        
        res.json({
            status: apiStatus.overall,
            timestamp: new Date().toISOString(),
            services: {
                claude: claudeHealth,
                medical_apis: apiStatus,
                active_sessions: conversationSessions.size
            },
            features: {
                chat_assistant: true,
                symptom_tracker: true,
                rxnorm_integration: apiStatus.services?.rxnorm?.status === 'healthy',
                fhir_integration: apiStatus.services?.fhir?.status === 'healthy',
                emergency_detection: true,
                medication_lookup: true
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

// Keep other endpoints...
app.get('/api/session/:sessionId/context', (req, res) => {
    const sessionId = req.params.sessionId;
    const history = conversationSessions.get(sessionId) || [];
    
    res.json({
        sessionId: sessionId,
        messageCount: history.length,
        lastMessages: history.slice(-4),
        summary: history.length === 0 ? "No conversation yet" : `${history.length/2} exchanges`
    });
});

app.delete('/api/session/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    conversationSessions.delete(sessionId);
    
    res.json({ 
        message: `Session ${sessionId} cleared`,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/emergency-contacts', (req, res) => {
    res.json({
        emergency: { number: '911', description: 'Life-threatening emergencies' },
        poison_control: { number: '1-800-222-1222', description: 'Poison emergencies' },
        mental_health: { number: '988', description: 'Suicide & Crisis Lifeline' }
    });
});

// Error handling
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        success: false,
        response: 'Technical issue occurred. For urgent medical concerns, please contact a healthcare professional.',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api/')) {
        res.status(404).json({ 
            error: 'API endpoint not found',
            availableEndpoints: [
                'POST /api/chat',
                'POST /api/test-medical-apis',
                'GET /api/health',
                'GET /api/emergency-contacts'
            ]
        });
    } else {
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    }
});

// Initialize and start server
async function startServer() {
    await initializeServices();
    
    app.listen(PORT, () => {
        console.log(`🏥 Healthcare Chatbot running on http://localhost:${PORT}`);
        console.log('✅ FEATURES:');
        console.log('   💬 Enhanced Chat - Uses medical databases for context');
        console.log('   📋 Smart Symptom Tracker - Database-backed analysis');
        console.log('   💊 RxNorm Integration - Real medication data');
        console.log('   🏥 FHIR Integration - Healthcare standards compliance');
        console.log('   🚨 Emergency Detection - Pattern-based triage');
        console.log('   🧪 API Testing - /api/test-medical-apis endpoint');
        console.log(`🔑 Claude API: ${process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Missing'}`);
        console.log(`🌐 Access: http://localhost:${PORT}`);
        console.log(`🧪 Test APIs: http://localhost:${PORT}/api/test-medical-apis`);
    });
}

startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

module.exports = app;