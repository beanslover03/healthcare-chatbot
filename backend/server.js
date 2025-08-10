// server.js - Updated for unified interface
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import services
const ClaudeService = require('./services/claude-service');
const MedicalAPIService = require('./services/medical-api');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const claudeService = new ClaudeService();
const medicalAPI = new MedicalAPIService();

// Middleware
app.use(cors());
app.use(express.json());

// Serve the unified interface instead of the old one
app.use(express.static(path.join(__dirname, '../frontend')));

// Override the main route to serve our unified interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'unified-interface.html'));
});

// Simple conversation storage
const conversationSessions = new Map();

// Enhanced chat endpoint that handles both chat and symptom tracker requests
app.post('/api/chat', async (req, res) => {
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

        // Handle different sources
        if (source === 'symptom_tracker') {
            // For symptom tracker, provide more structured analysis
            response = await handleSymptomTrackerAnalysis(message, history);
            urgency = determineUrgencyFromResponse(response);
        } else {
            // Regular chat flow
            if (claudeService.isEmergency(message)) {
                console.log('🚨 Emergency detected');
                response = await claudeService.generateEmergencyResponse(message, history);
                urgency = 'emergency';
                
            } else if (claudeService.isConversationEnding(message)) {
                console.log('👋 Conversation ending');
                response = await claudeService.generateEndingResponse(history);
                urgency = 'ending';
                
            } else {
                console.log('💭 Normal conversation');
                response = await claudeService.getChatResponse(
                    `User said: "${message}". Respond naturally and helpfully as a medical assistant.`,
                    history
                );
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

        console.log(`🤖 Response: "${response}"`);

        res.json({
            success: true,
            response: response,
            urgency: urgency,
            sessionId: sessionId,
            source: source,
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

// Enhanced symptom tracker analysis
async function handleSymptomTrackerAnalysis(message, history) {
    try {
        // Use Claude to provide structured medical analysis
        const prompt = `The user has described their symptoms: "${message}"

Please provide a helpful medical assessment that includes:
1. A brief acknowledgment of their symptoms
2. Urgency level assessment (low, medium, or high priority)
3. Recommended immediate actions
4. When to seek medical care
5. Self-care suggestions if appropriate

Keep the response conversational but informative, and always remind them that this is guidance, not a diagnosis.`;

        const response = await claudeService.getChatResponse(prompt, history);
        return response;
        
    } catch (error) {
        console.error('Symptom tracker analysis error:', error);
        return "I'm having trouble analyzing your symptoms right now. Please consider contacting a healthcare professional, especially if your symptoms are severe or concerning.";
    }
}

// Determine urgency from Claude's response
function determineUrgencyFromResponse(response) {
    const responseLower = response.toLowerCase();
    
    if (responseLower.includes('emergency') || 
        responseLower.includes('call 911') || 
        responseLower.includes('immediate medical attention')) {
        return 'emergency';
    }
    
    if (responseLower.includes('see a doctor') || 
        responseLower.includes('healthcare provider') || 
        responseLower.includes('urgent care') ||
        responseLower.includes('contact your doctor')) {
        return 'high';
    }
    
    if (responseLower.includes('monitor') || 
        responseLower.includes('watch for') || 
        responseLower.includes('if symptoms worsen')) {
        return 'medium';
    }
    
    return 'low';
}

// New endpoint for getting user service preferences
app.get('/api/user-preferences/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    const history = conversationSessions.get(sessionId) || [];
    
    // Analyze user's interaction pattern to suggest the best service
    let suggestedService = 'chat';
    let reason = 'Great for detailed conversations about your symptoms';
    
    if (history.length === 0) {
        // New user - suggest based on typical use cases
        suggestedService = 'chat';
        reason = 'Start with our chat assistant for personalized guidance';
    } else {
        // Analyze conversation history
        const recentMessages = history.slice(-6);
        const hasMultipleSymptoms = recentMessages.some(msg => 
            (msg.content.match(/and|also|plus|,/g) || []).length > 2
        );
        
        if (hasMultipleSymptoms) {
            suggestedService = 'tracker';
            reason = 'The symptom tracker might help organize multiple symptoms better';
        }
    }
    
    res.json({
        sessionId,
        suggestedService,
        reason,
        conversationLength: history.length
    });
});

// Enhanced session management
app.get('/api/session/:sessionId/context', (req, res) => {
    const sessionId = req.params.sessionId;
    const history = conversationSessions.get(sessionId) || [];
    
    // Extract symptoms mentioned in conversation
    const symptoms = [];
    const urgencyKeywords = [];
    
    history.forEach(msg => {
        if (msg.role === 'user') {
            // Simple symptom extraction
            const content = msg.content.toLowerCase();
            if (content.includes('headache') || content.includes('head')) symptoms.push('headache');
            if (content.includes('fever') || content.includes('hot')) symptoms.push('fever');
            if (content.includes('nausea') || content.includes('sick')) symptoms.push('nausea');
            if (content.includes('chest') || content.includes('heart')) symptoms.push('chest_pain');
            if (content.includes('cough')) symptoms.push('cough');
            if (content.includes('tired') || content.includes('fatigue')) symptoms.push('fatigue');
            
            // Urgency indicators
            if (content.includes('severe') || content.includes('terrible')) urgencyKeywords.push('severe');
            if (content.includes('emergency') || content.includes('911')) urgencyKeywords.push('emergency');
        }
    });
    
    res.json({
        sessionId: sessionId,
        messageCount: history.length,
        symptoms: [...new Set(symptoms)],
        urgencyIndicators: [...new Set(urgencyKeywords)],
        lastMessages: history.slice(-4),
        summary: generateSessionSummary(history)
    });
});

function generateSessionSummary(history) {
    if (history.length === 0) {
        return "No conversation yet";
    }
    
    const userMessages = history.filter(msg => msg.role === 'user').length;
    const hasSymptoms = history.some(msg => 
        msg.content.toLowerCase().match(/(pain|hurt|sick|fever|headache|nausea|cough)/g)
    );
    
    if (userMessages === 1) {
        return hasSymptoms ? "Discussed initial symptoms" : "Started conversation";
    } else if (userMessages < 5) {
        return hasSymptoms ? "Exploring symptoms in detail" : "Having initial discussion";
    } else {
        return "Detailed conversation about health concerns";
    }
}

// Service usage analytics
app.get('/api/analytics/service-usage', (req, res) => {
    // This would track which services users prefer
    // For now, return sample data
    res.json({
        totalSessions: conversationSessions.size,
        services: {
            chat: {
                usage: 75,
                avgSessionLength: 8.5,
                userSatisfaction: 4.2
            },
            symptomTracker: {
                usage: 25,
                avgSessionLength: 3.2,
                userSatisfaction: 4.0
            }
        },
        recommendations: [
            "Most users start with chat for initial guidance",
            "Symptom tracker is preferred for multiple symptoms",
            "Users switch between services during complex consultations"
        ]
    });
});

// Clear session
app.delete('/api/session/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    conversationSessions.delete(sessionId);
    
    res.json({ 
        message: `Session ${sessionId} cleared. You can start fresh with either service.`,
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const claudeHealth = await claudeService.healthCheck();
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                claude: claudeHealth,
                unified_interface: true,
                active_sessions: conversationSessions.size
            },
            features: {
                chat_assistant: true,
                symptom_tracker: true,
                service_switching: true,
                session_management: true
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

// Emergency contacts
app.get('/api/emergency-contacts', (req, res) => {
    res.json({
        emergency: {
            number: '911',
            description: 'Life-threatening emergencies'
        },
        urgent_care: {
            description: 'Non-life-threatening urgent symptoms',
            finder: 'Search "urgent care near me"'
        },
        telehealth: {
            description: 'Virtual consultations',
            note: 'Many insurance plans cover telehealth visits'
        },
        poison_control: {
            number: '1-800-222-1222',
            description: 'Poison emergencies'
        }
    });
});

// Serve the unified interface file
app.get('/unified', (req, res) => {
    res.sendFile(path.join(__dirname, 'unified-interface.html'));
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
                'GET /api/session/:id/context', 
                'DELETE /api/session/:id',
                'GET /api/health',
                'GET /api/emergency-contacts'
            ]
        });
    } else {
        // Serve the unified interface for any non-API route
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    }
});

app.listen(PORT, () => {
    console.log(`🏥 Medical Chatbot (UNIFIED) running on http://localhost:${PORT}`);
    console.log('✅ FEATURES:');
    console.log('   📱 Unified Interface - Chat + Symptom Tracker');
    console.log('   🔄 Service Switching - Users choose their preferred method');
    console.log('   💬 Enhanced Chat - Natural conversation flow');
    console.log('   📋 Smart Symptom Tracker - Structured symptom analysis');
    console.log('   📊 Session Analytics - Track user preferences');
    console.log('   🎯 Contextual Responses - Different analysis for each service');
    console.log(`🔑 Claude API: ${process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Missing'}`);
    console.log(`🌐 Access at: http://localhost:${PORT}`);
});

module.exports = app;