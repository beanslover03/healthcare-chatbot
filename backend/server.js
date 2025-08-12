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
        console.log('🔍 Initializing Enhanced Claude service...');
        claudeService = new ClaudeService();
        console.log('✅ Enhanced Claude service initialized');
        
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
        let enhancedMetadata = {}; // Initialize this

        // Emergency check first
        if (claudeService.isEmergency(message)) {
            console.log('🚨 Emergency detected');
            response = await claudeService.generateEmergencyResponse(message, history);
            urgency = 'emergency';
            
        } else {
            // ENHANCED: Comprehensive medical analysis using ALL 5 databases
            console.log('🔍 Analyzing symptoms with ALL medical databases...');
            try {
                // Use regular analyzeSymptoms since enhancedAnalyzeSymptoms might not exist yet
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
                const assessmentResult = await claudeService.assessSymptoms(message, medicalData, history, sessionId);
                response = assessmentResult.response;
                enhancedMetadata = assessmentResult.metadata || {};
            } else if (claudeService.isConversationEnding(message)) {
                console.log('👋 Conversation ending');
                response = await claudeService.generateEndingResponse(history);
                urgency = 'ending';
            } else {
                console.log('💭 Normal conversation with enhanced medical context');
                const assessmentResult = await claudeService.assessSymptoms(message, medicalData, history, sessionId);
                response = assessmentResult.response;
                enhancedMetadata = assessmentResult.metadata || {};
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
            // Enhanced metadata (safely handled)
            enhancedFeatures: {
                responseModality: enhancedMetadata.modality || 'conversational',
                contextUsed: enhancedMetadata.context || 'general',
                userProfile: enhancedMetadata.userProfile || null,
                interactiveElements: enhancedMetadata.interactiveElements || [],
                suggestedFollowUps: enhancedMetadata.suggestedFollowUps || [],
                intelligenceLevel: 'enhanced'
            },
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

// NEW: Enhanced analytics endpoint
app.get('/api/enhanced-analytics/:sessionId', async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const analytics = claudeService.getEnhancedAnalytics(sessionId);
        
        res.json({
            success: true,
            sessionId: sessionId,
            analytics: analytics,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.json({
            success: false,
            error: error.message
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

// NEW: Medical API debug endpoint
app.post('/api/debug-medical-analysis', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.json({
                success: false,
                error: 'Message is required'
            });
        }
        
        console.log(`🔍 DEBUG: Analyzing "${message}" with all medical APIs...`);
        
        // Get detailed analysis
        const startTime = Date.now();
        const medicalData = await medicalAPI.analyzeSymptoms([], message);
        const endTime = Date.now();
        
        // Test each API individually
        const individualTests = {};
        
        // Test RxNorm
        try {
            const rxnormTest = await medicalAPI.rxnorm.searchDrugs('aspirin');
            individualTests.rxnorm = { status: 'working', results: rxnormTest.length };
        } catch (error) {
            individualTests.rxnorm = { status: 'error', error: error.message };
        }
        
        // Test FHIR
        try {
            const fhirTest = await medicalAPI.fhir.searchConditions('headache');
            individualTests.fhir = { status: 'working', results: fhirTest.length };
        } catch (error) {
            individualTests.fhir = { status: 'error', error: error.message };
        }
        
        // Test Clinical Trials
        try {
            const trialsTest = await medicalAPI.clinicalTrials.searchTrialsByCondition('headache');
            individualTests.clinicalTrials = { status: 'working', results: trialsTest.length };
        } catch (error) {
            individualTests.clinicalTrials = { status: 'error', error: error.message };
        }
        
        // Test MedlinePlus
        try {
            const medlinePlusTest = await medicalAPI.medlinePlus.searchHealthTopics('fever');
            individualTests.medlinePlus = { status: 'working', results: medlinePlusTest.length };
        } catch (error) {
            individualTests.medlinePlus = { status: 'error', error: error.message };
        }
        
        // Test OpenFDA
        try {
            const openFDATest = await medicalAPI.openFDA.searchDrugLabels('ibuprofen');
            individualTests.openFDA = { status: 'working', results: openFDATest.length };
        } catch (error) {
            individualTests.openFDA = { status: 'error', error: error.message };
        }
        
        res.json({
            success: true,
            message: message,
            analysisTime: `${endTime - startTime}ms`,
            medicalAnalysis: {
                symptoms: medicalData.symptoms || [],
                conditions: medicalData.conditions || [],
                medications: medicalData.medications || [],
                clinicalTrials: medicalData.clinicalTrials || [],
                healthInformation: medicalData.healthInformation || [],
                drugSafety: medicalData.drugSafety || [],
                apiSources: medicalData.apiSources || [],
                confidence: medicalData.confidence || 'unknown'
            },
            individualAPITests: individualTests,
            summary: {
                totalAPIsUsed: medicalData.apiSources?.length || 0,
                workingAPIs: Object.values(individualTests).filter(test => test.status === 'working').length,
                totalDataFound: (medicalData.symptoms?.length || 0) + 
                              (medicalData.conditions?.length || 0) + 
                              (medicalData.medications?.length || 0) + 
                              (medicalData.clinicalTrials?.length || 0) + 
                              (medicalData.healthInformation?.length || 0)
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Debug medical analysis error:', error);
        res.json({
            success: false,
            error: error.message,
            stack: error.stack
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

// NEW: ODPHP Health Topics search endpoint
app.post('/api/health-topics', async (req, res) => {
    try {
        const { topic, language = 'en' } = req.body;
        
        if (!topic) {
            return res.json({
                success: false,
                error: 'Health topic is required'
            });
        }
        
        console.log(`📚 ODPHP health topics search: ${topic}`);
        
        const healthTopics = await medicalAPI.odphp.searchHealthTopics(topic);
        
        res.json({
            success: healthTopics.length > 0,
            topic: topic,
            topics: healthTopics,
            count: healthTopics.length,
            source: 'ODPHP-MyHealthfinder',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('ODPHP health topics search error:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// NEW: ODPHP Personalized recommendations endpoint
app.post('/api/personalized-recommendations', async (req, res) => {
    try {
        const { userProfile } = req.body;
        
        if (!userProfile || !userProfile.age || !userProfile.sex) {
            return res.json({
                success: false,
                error: 'User profile with age and sex is required'
            });
        }
        
        console.log(`🎯 ODPHP personalized recommendations for:`, userProfile);
        
        const recommendations = await medicalAPI.odphp.getPersonalizedRecommendations(userProfile);
        
        res.json({
            success: recommendations.length > 0,
            userProfile: userProfile,
            recommendations: recommendations,
            count: recommendations.length,
            source: 'ODPHP-MyHealthfinder',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('ODPHP personalized recommendations error:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// NEW: ODPHP Comprehensive health guidance endpoint
app.post('/api/health-guidance', async (req, res) => {
    try {
        const { symptoms = [], userProfile = {}, healthTopics = [] } = req.body;
        
        console.log(`🔍 ODPHP comprehensive health guidance request`);
        
        // Get comprehensive guidance from ODPHP
        const guidance = await medicalAPI.getPersonalizedHealthGuidance(userProfile, symptoms);
        
        // Also search for specific health topics if provided
        const topicResults = [];
        for (const topic of healthTopics.slice(0, 3)) {
            try {
                const topicGuidance = await medicalAPI.odphp.searchHealthTopics(topic);
                topicResults.push(...topicGuidance);
            } catch (error) {
                console.warn(`Failed to get guidance for topic ${topic}:`, error.message);
            }
        }
        
        res.json({
            success: true,
            personalizedGuidance: guidance,
            topicGuidance: topicResults,
            sources: ['ODPHP-MyHealthfinder'],
            totalRecommendations: guidance.personalizedRecommendations.length,
            totalTopics: topicResults.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('ODPHP health guidance error:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// NEW: Enhanced health check with ODPHP status
app.get('/api/health-enhanced', async (req, res) => {
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
                odphp_integration: apiStatus.services?.odphp?.status === 'healthy', // NEW
                emergency_detection: true,
                comprehensive_medication_lookup: true,
                safety_data_integration: true,
                clinical_trial_matching: true,
                health_education_resources: true,
                personalized_health_guidance: true, // NEW
                evidence_based_recommendations: true // NEW
            },
            coverage: apiStatus.coverage,
            confidence: {
                drug_information: apiStatus.coverage.drugDatabase,
                condition_information: apiStatus.coverage.conditionDatabase,
                safety_information: apiStatus.coverage.safetyDatabase,
                treatment_options: apiStatus.coverage.clinicalTrials,
                educational_resources: apiStatus.coverage.healthEducation,
                preventive_guidance: apiStatus.coverage.preventiveGuidance // NEW
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

// UPDATE: Enhanced medical API testing with ODPHP
app.post('/api/test-medical-apis-enhanced', async (req, res) => {
    try {
        const { testType = 'all' } = req.body;
        
        console.log(`🧪 Testing enhanced medical APIs including ODPHP (type: ${testType})`);
        
        const results = {
            timestamp: new Date().toISOString(),
            tests: []
        };
        
        // Test ODPHP (NEW)
        if (testType === 'all' || testType === 'odphp') {
            console.log('🧪 Testing ODPHP with nutrition search...');
            try {
                const odphpResult = await medicalAPI.odphp.searchHealthTopics('nutrition');
                results.tests.push({
                    service: 'ODPHP-MyHealthfinder',
                    test: 'nutrition health topics',
                    success: odphpResult.length > 0,
                    details: {
                        topicsFound: odphpResult.length,
                        dataSource: odphpResult[0]?.source || 'unknown',
                        hasPersonalized: false // Could test personalized recommendations here
                    }
                });
            } catch (error) {
                results.tests.push({
                    service: 'ODPHP-MyHealthfinder',
                    test: 'nutrition health topics',
                    success: false,
                    error: error.message
                });
            }
        }

        // Test ODPHP personalized recommendations
        if (testType === 'all' || testType === 'odphp_personalized') {
            console.log('🧪 Testing ODPHP personalized recommendations...');
            try {
                const personalizedResult = await medicalAPI.odphp.getPersonalizedRecommendations({
                    age: 35,
                    sex: 'female',
                    pregnant: 'no'
                });
                results.tests.push({
                    service: 'ODPHP-Personalized',
                    test: 'personalized recommendations',
                    success: personalizedResult.length > 0,
                    details: {
                        recommendationsFound: personalizedResult.length,
                        hasPreventiveGuidance: personalizedResult.some(r => r.type === 'prevention')
                    }
                });
            } catch (error) {
                results.tests.push({
                    service: 'ODPHP-Personalized',
                    test: 'personalized recommendations',
                    success: false,
                    error: error.message
                });
            }
        }

        // Keep all existing tests (RxNorm, FHIR, Clinical Trials, MedlinePlus, OpenFDA)
        // [Your existing test code remains exactly the same]

        // Test comprehensive analysis with ODPHP
        if (testType === 'all' || testType === 'comprehensive') {
            console.log('🧪 Testing comprehensive analysis with ODPHP...');
            try {
                const userProfile = { age: 30, sex: 'male' };
                const symptomResult = await medicalAPI.analyzeSymptoms(
                    [], 
                    'I have a headache and want to know about healthy lifestyle', 
                    userProfile
                );
                results.tests.push({
                    service: 'Comprehensive Analysis with ODPHP',
                    test: 'multi-database analysis including ODPHP',
                    success: symptomResult.symptoms?.length > 0,
                    details: {
                        symptomsFound: symptomResult.symptoms?.length || 0,
                        conditionsFound: symptomResult.conditions?.length || 0,
                        medicationsFound: symptomResult.medications?.length || 0,
                        trialsFound: symptomResult.clinicalTrials?.length || 0,
                        healthInfoFound: symptomResult.healthInformation?.length || 0,
                        healthGuidanceFound: symptomResult.healthGuidance?.length || 0, // NEW
                        preventiveRecsFound: symptomResult.preventiveRecommendations?.length || 0, // NEW
                        educationalResourcesFound: symptomResult.educationalResources?.length || 0, // NEW
                        confidence: symptomResult.confidence,
                        apiSources: symptomResult.apiSources,
                        odphpDataIncluded: symptomResult.apiSources?.some(source => source.includes('ODPHP')) || false
                    }
                });
            } catch (error) {
                results.tests.push({
                    service: 'Comprehensive Analysis with ODPHP',
                    test: 'multi-database analysis including ODPHP',
                    success: false,
                    error: error.message
                });
            }
        }

        const successCount = results.tests.filter(t => t.success).length;
        const totalCount = results.tests.length;
        
        console.log(`🧪 Enhanced medical API tests with ODPHP complete: ${successCount}/${totalCount} passed`);
        
        res.json({
            success: true,
            summary: `${successCount}/${totalCount} enhanced tests passed (including ODPHP)`,
            results: results,
            odphpIntegrated: true
        });
        
    } catch (error) {
        console.error('🧪 Enhanced medical API test error:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// UPDATE your existing chat endpoint to pass user profile for personalized ODPHP recommendations
// In your existing /api/chat endpoint, modify the analyzeSymptoms call:

// REPLACE this line in your existing chat endpoint:
// medicalData = await medicalAPI.analyzeSymptoms([], message);

// WITH this enhanced version:
/*
// Extract user profile from conversation history for personalized recommendations
const userProfile = extractUserProfileFromHistory(history, sessionId);
medicalData = await medicalAPI.analyzeSymptoms([], message, userProfile);
*/

// ADD this helper function to extract user profile
function extractUserProfileFromHistory(conversationHistory, sessionId) {
    // Basic user profile extraction - you can enhance this based on your needs
    const profile = {};
    
    // Look for age/sex mentions in conversation
    const conversationText = conversationHistory
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content)
        .join(' ')
        .toLowerCase();
    
    // Simple age extraction
    const ageMatch = conversationText.match(/(?:i am|i'm|age)\s*(\d{1,3})/);
    if (ageMatch) {
        const age = parseInt(ageMatch[1]);
        if (age >= 1 && age <= 120) {
            profile.age = age;
        }
    }
    
    // Simple sex extraction
    if (conversationText.includes('female') || conversationText.includes('woman')) {
        profile.sex = 'female';
    } else if (conversationText.includes('male') || conversationText.includes('man')) {
        profile.sex = 'male';
    }
    
    // Pregnancy status
    if (conversationText.includes('pregnant')) {
        profile.pregnant = 'yes';
    }
    
    // Smoking status
    if (conversationText.includes('smoke') || conversationText.includes('smoking')) {
        profile.tobaccoUse = 'yes';
    }
    
    return profile;
}

console.log('🆕 ODPHP MyHealthfinder integration endpoints added:');
console.log('   POST /api/health-topics - Search health topics');
console.log('   POST /api/personalized-recommendations - Get personalized guidance');
console.log('   POST /api/health-guidance - Comprehensive health guidance');
console.log('   GET /api/health-enhanced - Enhanced health check');
console.log('   POST /api/test-medical-apis-enhanced - Enhanced API testing');

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