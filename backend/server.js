// backend/server.js - ENHANCED VERSION with all 5 medical databases

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const ClaudeService = require('./services/claude-service');
const MedicalAPIService = require('./services/medical-apis'); // Now includes all 5 services

const app = express();
const PORT = process.env.PORT || 3000;

let claudeService, medicalAPI;

async function initializeServices() {
    try {
        console.log('🔍 Initializing Claude service...');
        claudeService = new ClaudeService();
        console.log('✅ Claude service initialized');
        
        console.log('🔍 Initializing Enhanced Medical API service...');
        medicalAPI = new MedicalAPIService();
        console.log('✅ Enhanced Medical API service initialized with 5 databases');
        
        // Test all medical APIs on startup
        console.log('🧪 Testing enhanced medical API connections...');
        const apiStatus = await medicalAPI.getAPIStatus();
        console.log('📊 Enhanced API Status:', {
            overall: apiStatus.overall,
            services: Object.keys(apiStatus.services).length,
            coverage: apiStatus.coverage
        });
        
    } catch (error) {
        console.error('❌ Service initialization error:', error);
        process.exit(1);
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const conversationSessions = new Map();

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

// ENHANCED chat endpoint using ALL 5 medical databases
app.post('/api/chat', validateInput, async (req, res) => {
    try {
        const { message, sessionId = 'default', source = 'chat' } = req.body;
        
        console.log(`💬 ${source.toUpperCase()}: "${message}"`);
        
        if (!conversationSessions.has(sessionId)) {
            conversationSessions.set(sessionId, []);
        }
        const history = conversationSessions.get(sessionId);

        let response;
        let urgency = 'normal';
        let medicalData = null;

        // Emergency check first
        if (claudeService.isEmergency(message)) {
            console.log('🚨 Emergency detected');
            response = await claudeService.generateEmergencyResponse(message, history);
            urgency = 'emergency';
            
        } else {
            // ENHANCED: Comprehensive medical analysis using ALL 5 databases
            console.log('🔍 Analyzing symptoms with ALL medical databases...');
            try {
                medicalData = await medicalAPI.analyzeSymptoms([], message);
                console.log('📊 Enhanced medical analysis results:', {
                    symptomsFound: medicalData.symptoms?.length || 0,
                    conditionsFound: medicalData.conditions?.length || 0,
                    medicationsFound: medicalData.medications?.length || 0,
                    clinicalTrialsFound: medicalData.clinicalTrials?.length || 0,
                    healthInfoFound: medicalData.healthInformation?.length || 0,
                    safetyDataFound: medicalData.drugSafety?.length || 0,
                    apiSources: medicalData.apiSources,
                    confidence: medicalData.confidence
                });
            } catch (error) {
                console.warn('⚠️ Enhanced medical API analysis failed:', error.message);
                medicalData = { error: error.message };
            }
            
            // Claude assessment with enhanced medical data
            if (source === 'symptom_tracker') {
                response = await claudeService.assessSymptoms(message, medicalData, history);
                response = response.response || response;
            } else if (claudeService.isConversationEnding(message)) {
                console.log('👋 Conversation ending');
                response = await claudeService.generateEndingResponse(history);
                urgency = 'ending';
            } else {
                console.log('💭 Normal conversation with enhanced medical context');
                response = await claudeService.assessSymptoms(message, medicalData, history);
                response = response.response || response;
            }
            
            // Enhanced urgency determination
            if (medicalData && medicalData.emergencyFactors && medicalData.emergencyFactors.length > 0) {
                urgency = 'high';
            } else if (medicalData && medicalData.conditions && medicalData.conditions.some(c => c.urgency === 'high')) {
                urgency = 'medium';
            } else if (medicalData && medicalData.confidence === 'very_high') {
                urgency = 'low'; // High confidence in non-urgent condition
            }
        }

        // Update history
        history.push(
            { role: "user", content: message },
            { role: "assistant", content: response }
        );

        if (history.length > 10) {
            history.splice(0, history.length - 10);
        }

        conversationSessions.set(sessionId, history);

        console.log(`🤖 Enhanced response generated (urgency: ${urgency}, confidence: ${medicalData?.confidence || 'unknown'})`);

        res.json({
            success: true,
            response: response,
            urgency: urgency,
            sessionId: sessionId,
            source: source,
            medicalData: medicalData ? {
                symptomsAnalyzed: medicalData.symptoms?.length || 0,
                databasesUsed: medicalData.apiSources || [],
                confidence: medicalData.confidence || 'unknown',
                clinicalTrialsAvailable: medicalData.clinicalTrials?.length || 0,
                healthResourcesFound: medicalData.healthInformation?.length || 0,
                safetyDataIncluded: medicalData.drugSafety?.length || 0
            } : null,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('💥 Enhanced chat error:', error);
        
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

// ENHANCED: Comprehensive medical database testing endpoint
app.post('/api/test-medical-apis', async (req, res) => {
    try {
        const { testType = 'all' } = req.body;
        
        console.log(`🧪 Testing enhanced medical APIs (type: ${testType})`);
        
        const results = {
            timestamp: new Date().toISOString(),
            tests: []
        };
        
        // Test RxNorm
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
                        interactions: rxnormResult.interactions?.length || 0,
                        apiSources: rxnormResult.apiSources
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
        
        // Test Clinical Trials
        if (testType === 'all' || testType === 'clinical_trials') {
            console.log('🧪 Testing Clinical Trials with headache search...');
            try {
                const trialsResult = await medicalAPI.clinicalTrials.searchTrialsByCondition('headache');
                results.tests.push({
                    service: 'ClinicalTrials.gov',
                    test: 'headache trials',
                    success: trialsResult.length > 0,
                    details: {
                        trialsFound: trialsResult.length,
                        recruitingTrials: trialsResult.filter(t => t.status === 'Recruiting').length
                    }
                });
            } catch (error) {
                results.tests.push({
                    service: 'ClinicalTrials.gov',
                    test: 'headache trials',
                    success: false,
                    error: error.message
                });
            }
        }
        
        // Test MedlinePlus
        if (testType === 'all' || testType === 'medlineplus') {
            console.log('🧪 Testing MedlinePlus with fever search...');
            try {
                const healthResult = await medicalAPI.medlinePlus.searchHealthTopics('fever');
                results.tests.push({
                    service: 'MedlinePlus',
                    test: 'fever information',
                    success: healthResult.length > 0,
                    details: {
                        topicsFound: healthResult.length
                    }
                });
            } catch (error) {
                results.tests.push({
                    service: 'MedlinePlus',
                    test: 'fever information',
                    success: false,
                    error: error.message
                });
            }
        }
        
        // Test OpenFDA
        if (testType === 'all' || testType === 'openfda') {
            console.log('🧪 Testing OpenFDA with ibuprofen search...');
            try {
                const fdaResult = await medicalAPI.openFDA.searchDrugLabels('ibuprofen');
                results.tests.push({
                    service: 'OpenFDA',
                    test: 'ibuprofen safety data',
                    success: fdaResult.length > 0,
                    details: {
                        labelsFound: fdaResult.length,
                        hasWarnings: fdaResult.some(l => l.warnings)
                    }
                });
            } catch (error) {
                results.tests.push({
                    service: 'OpenFDA',
                    test: 'ibuprofen safety data',
                    success: false,
                    error: error.message
                });
            }
        }
        
        // Test comprehensive symptom analysis
        if (testType === 'all' || testType === 'symptom') {
            console.log('🧪 Testing comprehensive symptom analysis...');
            try {
                const symptomResult = await medicalAPI.analyzeSymptoms([], 'I have a severe headache with nausea and fever');
                results.tests.push({
                    service: 'Comprehensive Analysis',
                    test: 'multi-symptom analysis',
                    success: symptomResult.symptoms?.length > 0,
                    details: {
                        symptomsFound: symptomResult.symptoms?.length || 0,
                        conditionsFound: symptomResult.conditions?.length || 0,
                        medicationsFound: symptomResult.medications?.length || 0,
                        trialsFound: symptomResult.clinicalTrials?.length || 0,
                        healthInfoFound: symptomResult.healthInformation?.length || 0,
                        confidence: symptomResult.confidence,
                        apiSources: symptomResult.apiSources
                    }
                });
            } catch (error) {
                results.tests.push({
                    service: 'Comprehensive Analysis',
                    test: 'multi-symptom analysis',
                    success: false,
                    error: error.message
                });
            }
        }
        
        // Test API status
        if (testType === 'all' || testType === 'status') {
            console.log('🧪 Getting comprehensive API status...');
            try {
                const statusResult = await medicalAPI.getAPIStatus();
                results.tests.push({
                    service: 'API Status',
                    test: 'health check',
                    success: statusResult.overall !== 'degraded',
                    details: {
                        overall: statusResult.overall,
                        serviceCount: Object.keys(statusResult.services).length,
                        coverage: statusResult.coverage
                    }
                });
            } catch (error) {
                results.tests.push({
                    service: 'API Status',
                    test: 'health check',
                    success: false,
                    error: error.message
                });
            }
        }
        
        const successCount = results.tests.filter(t => t.success).length;
        const totalCount = results.tests.length;
        
        console.log(`🧪 Enhanced medical API tests complete: ${successCount}/${totalCount} passed`);
        
        res.json({
            success: true,
            summary: `${successCount}/${totalCount} enhanced tests passed`,
            results: results
        });
        
    } catch (error) {
        console.error('🧪 Enhanced medical API test error:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Enhanced health check with all 5 medical APIs
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
                clinical_trials_integration: apiStatus.services?.clinicalTrials?.status === 'healthy',
                medlineplus_integration: apiStatus.services?.medlinePlus?.status === 'healthy',
                openfda_integration: apiStatus.services?.openFDA?.status === 'healthy',
                emergency_detection: true,
                comprehensive_medication_lookup: true,
                safety_data_integration: true,
                clinical_trial_matching: true,
                health_education_resources: true
            },
            coverage: apiStatus.coverage,
            confidence: {
                drug_information: apiStatus.coverage.drugDatabase,
                condition_information: apiStatus.coverage.conditionDatabase,
                safety_information: apiStatus.coverage.safetyDatabase,
                treatment_options: apiStatus.coverage.clinicalTrials,
                educational_resources: apiStatus.coverage.healthEducation
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

// NEW: Comprehensive medication lookup endpoint
app.post('/api/medication-lookup', async (req, res) => {
    try {
        const { medication } = req.body;
        
        if (!medication) {
            return res.json({
                success: false,
                error: 'Medication name is required'
            });
        }
        
        console.log(`💊 Comprehensive medication lookup: ${medication}`);
        
        const results = await medicalAPI.comprehensiveMedicationLookup(medication);
        
        res.json({
            success: results.found,
            medication: medication,
            data: results,
            sources: results.apiSources,
            safetyWarnings: results.warnings,
            recommendations: results.recommendations,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Medication lookup error:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// NEW: Clinical trials search endpoint
app.post('/api/clinical-trials', async (req, res) => {
    try {
        const { condition, limit = 5 } = req.body;
        
        if (!condition) {
            return res.json({
                success: false,
                error: 'Condition is required'
            });
        }
        
        console.log(`🔬 Clinical trials search: ${condition}`);
        
        const trials = await medicalAPI.clinicalTrials.searchTrialsByCondition(condition, { limit });
        
        res.json({
            success: trials.length > 0,
            condition: condition,
            trials: trials,
            recruiting: trials.filter(t => t.status === 'Recruiting'),
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Clinical trials search error:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// NEW: Health information endpoint
app.post('/api/health-info', async (req, res) => {
    try {
        const { topic } = req.body;
        
        if (!topic) {
            return res.json({
                success: false,
                error: 'Health topic is required'
            });
        }
        
        console.log(`📚 Health information search: ${topic}`);
        
        const healthInfo = await medicalAPI.medlinePlus.searchHealthTopics(topic);
        
        res.json({
            success: healthInfo.length > 0,
            topic: topic,
            information: healthInfo,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Health information search error:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Keep existing endpoints
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
                'POST /api/medication-lookup',
                'POST /api/clinical-trials', 
                'POST /api/health-info',
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
        console.log(`🏥 Enhanced Healthcare Chatbot running on http://localhost:${PORT}`);
        console.log('✅ ENHANCED FEATURES:');
        console.log('   💬 AI Chat - Uses 5 medical databases for context');
        console.log('   📋 Smart Symptom Tracker - Multi-database analysis');
        console.log('   💊 RxNorm Integration - Comprehensive drug database');
        console.log('   🏥 FHIR Integration - Healthcare standards compliance');
        console.log('   🔬 Clinical Trials - Research opportunities');
        console.log('   📚 MedlinePlus - Health education resources');
        console.log('   ⚠️  OpenFDA - Drug safety and adverse events');
        console.log('   🚨 Emergency Detection - Advanced pattern matching');
        console.log('   🧪 Comprehensive Testing - All API endpoints');
        console.log(`🔑 Claude API: ${process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Missing'}`);
        console.log(`🌐 Access: http://localhost:${PORT}`);
        console.log(`🧪 Test Enhanced APIs: POST http://localhost:${PORT}/api/test-medical-apis`);
        console.log(`💊 Medication Lookup: POST http://localhost:${PORT}/api/medication-lookup`);
        console.log(`🔬 Clinical Trials: POST http://localhost:${PORT}/api/clinical-trials`);
        console.log(`📚 Health Info: POST http://localhost:${PORT}/api/health-info`);
    });
}

startServer().catch(error => {
    console.error('Failed to start enhanced server:', error);
    process.exit(1);
});

module.exports = app;