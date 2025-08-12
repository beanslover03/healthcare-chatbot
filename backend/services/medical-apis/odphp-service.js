// backend/services/medical-apis/odphp-service.js
// ODPHP MyHealthfinder API Service for Healthcare Chatbot

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class ODPHPService {
    constructor(cacheManager) {
        this.baseUrl = 'https://odphp.health.gov/myhealthfinder/api/v4';
        this.cache = cacheManager;
        this.timeout = 8000;
        this.lastRequestTime = 0;
        this.requestDelay = 3000; // 20 requests per minute
    }

    // ===== HEALTH TOPICS SEARCH =====
    async searchHealthTopics(topic, options = {}) {
        const cacheKey = `odphp_topics_${topic}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            const url = `${this.baseUrl}/itemlist.json?Type=topic`;
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`ODPHP API error: ${response.status}`);
            }
            
            const data = await response.json();
            const filteredTopics = this.filterTopicsByKeyword(data, topic);
            
            // Get detailed information for relevant topics
            const detailedTopics = await this.getDetailedTopics(filteredTopics.slice(0, 3));
            
            await this.cache.set(cacheKey, detailedTopics, 24 * 60 * 60 * 1000); // 24 hours
            
            console.log(`✅ ODPHP: Found ${detailedTopics.length} health topics for "${topic}"`);
            return detailedTopics;
            
        } catch (error) {
            console.error('ODPHP health topics search error:', error);
            return this.getFallbackHealthTopics(topic);
        }
    }

    // ===== PERSONALIZED RECOMMENDATIONS =====
    async getPersonalizedRecommendations(userProfile, options = {}) {
        const cacheKey = `odphp_recommendations_${JSON.stringify(userProfile)}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            // Build URL with user parameters
            let url = `${this.baseUrl}/myhealthfinder.json?`;
            const params = new URLSearchParams();
            
            if (userProfile.age) params.append('age', userProfile.age);
            if (userProfile.sex) params.append('sex', userProfile.sex);
            if (userProfile.pregnant) params.append('pregnant', userProfile.pregnant);
            if (userProfile.sexuallyActive) params.append('sexuallyActive', userProfile.sexuallyActive);
            if (userProfile.tobaccoUse) params.append('tobaccoUse', userProfile.tobaccoUse);
            if (userProfile.language === 'es') params.append('Lang', 'es');
            
            url += params.toString();
            
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`ODPHP recommendations error: ${response.status}`);
            }
            
            const data = await response.json();
            const recommendations = this.formatRecommendations(data);
            
            await this.cache.set(cacheKey, recommendations, 2 * 60 * 60 * 1000); // 2 hours
            
            console.log(`✅ ODPHP: Found ${recommendations.length} personalized recommendations`);
            return recommendations;
            
        } catch (error) {
            console.error('ODPHP personalized recommendations error:', error);
            return this.getFallbackRecommendations(userProfile);
        }
    }

    // ===== TOPIC DETAILS =====
    async getTopicDetails(topicId, language = 'en') {
        const cacheKey = `odphp_topic_${topicId}_${language}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            let url = `${this.baseUrl}/topicsearch.json?TopicId=${topicId}`;
            if (language === 'es') url += '&Lang=es';
            
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`ODPHP topic details error: ${response.status}`);
            }
            
            const data = await response.json();
            const topicDetails = this.formatTopicDetails(data);
            
            await this.cache.set(cacheKey, topicDetails, 24 * 60 * 60 * 1000); // 24 hours
            
            return topicDetails;
            
        } catch (error) {
            console.error('ODPHP topic details error:', error);
            return null;
        }
    }

    // ===== SYMPTOM-BASED HEALTH GUIDANCE =====
    async getSymptomGuidance(symptoms, userProfile = {}) {
        const guidance = [];
        
        // Map symptoms to health topics
        const topicMappings = {
            'headache': ['headaches', 'stress management', 'sleep'],
            'fever': ['fever', 'flu', 'immune system'],
            'chest_pain': ['heart health', 'cardiovascular disease'],
            'nausea': ['digestive health', 'food safety'],
            'cough': ['respiratory health', 'asthma', 'allergies'],
            'fatigue': ['sleep', 'nutrition', 'exercise'],
            'dizziness': ['blood pressure', 'balance problems'],
            'stomach_pain': ['digestive health', 'nutrition']
        };

        try {
            for (const symptom of symptoms) {
                const topics = topicMappings[symptom.id] || [symptom.name];
                
                for (const topic of topics.slice(0, 2)) { // Limit to 2 topics per symptom
                    const healthInfo = await this.searchHealthTopics(topic);
                    if (healthInfo.length > 0) {
                        guidance.push({
                            symptom: symptom.name,
                            topic: topic,
                            information: healthInfo[0],
                            source: 'ODPHP-MyHealthfinder'
                        });
                    }
                }
            }

            // Get personalized recommendations if user profile available
            if (userProfile.age && userProfile.sex) {
                const personalizedRecs = await this.getPersonalizedRecommendations(userProfile);
                guidance.push(...personalizedRecs.slice(0, 3).map(rec => ({
                    type: 'personalized_recommendation',
                    recommendation: rec,
                    source: 'ODPHP-MyHealthfinder'
                })));
            }

        } catch (error) {
            console.error('Error getting symptom guidance:', error);
        }

        return guidance;
    }

    // ===== FORMATTING METHODS =====
    filterTopicsByKeyword(data, keyword) {
        const topics = [];
        const keywordLower = keyword.toLowerCase();
        
        if (data.Result && data.Result.Resources && data.Result.Resources.Resource) {
            for (const resource of data.Result.Resources.Resource) {
                const title = resource.Title?.toLowerCase() || '';
                const categories = resource.Categories?.Category || [];
                
                // Check if keyword matches title or categories
                const matchesTitle = title.includes(keywordLower);
                const matchesCategory = categories.some(cat => 
                    cat.Name?.toLowerCase().includes(keywordLower)
                );
                
                if (matchesTitle || matchesCategory) {
                    topics.push({
                        id: resource.Id,
                        title: resource.Title,
                        categories: categories.map(cat => cat.Name),
                        lastUpdate: resource.LastUpdate,
                        relevanceScore: matchesTitle ? 2 : 1
                    });
                }
            }
        }
        
        // Sort by relevance score
        return topics.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    async getDetailedTopics(topics) {
        const detailed = [];
        
        for (const topic of topics) {
            try {
                const details = await this.getTopicDetails(topic.id);
                if (details) {
                    detailed.push({
                        ...topic,
                        ...details
                    });
                }
            } catch (error) {
                console.warn(`Failed to get details for topic ${topic.id}:`, error.message);
                // Include basic topic info even if details fail
                detailed.push(topic);
            }
        }
        
        return detailed;
    }

    formatTopicDetails(data) {
        try {
            if (data.Result && data.Result.Resources && data.Result.Resources.Resource[0]) {
                const resource = data.Result.Resources.Resource[0];
                const sections = resource.Sections?.section || [];
                
                return {
                    title: resource.Title,
                    summary: this.extractSummary(sections),
                    sections: this.formatSections(sections),
                    lastUpdate: resource.LastUpdate,
                    categories: resource.Categories?.Category?.map(cat => cat.Name) || [],
                    source: 'MyHealthfinder'
                };
            }
        } catch (error) {
            console.error('Error formatting topic details:', error);
        }
        
        return null;
    }

    formatRecommendations(data) {
        const recommendations = [];
        
        try {
            if (data.Result && data.Result.Resources && data.Result.Resources.Resource) {
                for (const resource of data.Result.Resources.Resource) {
                    recommendations.push({
                        id: resource.Id,
                        title: resource.Title,
                        type: resource.Type,
                        categories: resource.Categories?.Category?.map(cat => cat.Name) || [],
                        summary: this.extractSummary(resource.Sections?.section || []),
                        lastUpdate: resource.LastUpdate,
                        source: 'MyHealthfinder'
                    });
                }
            }
        } catch (error) {
            console.error('Error formatting recommendations:', error);
        }
        
        return recommendations;
    }

    extractSummary(sections) {
        for (const section of sections) {
            if (section.Title && section.Description) {
                // Return first meaningful description
                return section.Description.substring(0, 300) + (section.Description.length > 300 ? '...' : '');
            }
        }
        return 'Health information available';
    }

    formatSections(sections) {
        return sections.map(section => ({
            title: section.Title,
            description: section.Description,
            type: section.Title?.toLowerCase().includes('what you can do') ? 'actionable' : 'informational'
        }));
    }

    // ===== FALLBACK METHODS =====
    getFallbackHealthTopics(topic) {
        const fallbackTopics = {
            'headache': {
                id: 'headache-fallback',
                title: 'Managing Headaches',
                summary: 'Learn about different types of headaches and when to seek medical care. Most headaches can be managed with rest, hydration, and appropriate pain relief.',
                source: 'MyHealthfinder-Fallback'
            },
            'fever': {
                id: 'fever-fallback',
                title: 'Understanding Fever',
                summary: 'Fever is your body\'s natural response to infection. Learn when fever requires medical attention and how to manage it safely.',
                source: 'MyHealthfinder-Fallback'
            },
            'nutrition': {
                id: 'nutrition-fallback',
                title: 'Healthy Eating Guidelines',
                summary: 'Follow the Dietary Guidelines for Americans to maintain a healthy diet with plenty of fruits, vegetables, whole grains, and lean proteins.',
                source: 'MyHealthfinder-Fallback'
            }
        };

        const fallback = fallbackTopics[topic.toLowerCase()];
        return fallback ? [fallback] : [{
            id: 'general-fallback',
            title: `Health Information: ${topic}`,
            summary: `For reliable information about ${topic}, consult with your healthcare provider or visit MyHealthfinder.gov`,
            source: 'MyHealthfinder-Fallback'
        }];
    }

    getFallbackRecommendations(userProfile) {
        return [{
            id: 'general-rec',
            title: 'General Health Recommendations',
            summary: 'Maintain a healthy lifestyle with regular exercise, balanced nutrition, adequate sleep, and routine healthcare visits.',
            type: 'general',
            categories: ['Prevention'],
            source: 'MyHealthfinder-Fallback'
        }];
    }

    // ===== UTILITY METHODS =====
    async makeRequest(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 
                    'User-Agent': 'Healthcare-Chatbot/1.0',
                    'Accept': 'application/json'
                }
            });
            
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('ODPHP API timeout');
            }
            throw error;
        }
    }

    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.requestDelay) {
            const waitTime = this.requestDelay - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
    }

    async healthCheck() {
        try {
            const start = Date.now();
            const testResult = await this.searchHealthTopics('nutrition', { skipCache: true });
            const responseTime = Date.now() - start;
            
            return {
                service: 'ODPHP-MyHealthfinder',
                status: testResult.length > 0 && testResult[0].source !== 'MyHealthfinder-Fallback' ? 'healthy' : 'degraded',
                responseTime: responseTime,
                dataFound: testResult.length,
                dataSource: testResult[0]?.source || 'unknown',
                lastChecked: new Date().toISOString()
            };
        } catch (error) {
            return {
                service: 'ODPHP-MyHealthfinder',
                status: 'error',
                error: error.message,
                lastChecked: new Date().toISOString()
            };
        }
    }

    // ===== INTEGRATION WITH CHATBOT =====
    async getChatbotRelevantInfo(symptoms, userMessage, userProfile = {}) {
        const relevantInfo = {
            healthTopics: [],
            personalizedRecommendations: [],
            preventiveGuidance: [],
            educationalResources: []
        };

        try {
            // Extract key health topics from user message
            const healthKeywords = this.extractHealthKeywords(userMessage);
            
            // Get health topic information
            for (const keyword of healthKeywords.slice(0, 2)) {
                const topics = await this.searchHealthTopics(keyword);
                relevantInfo.healthTopics.push(...topics.slice(0, 2));
            }

            // Get symptom-specific guidance
            if (symptoms.length > 0) {
                const symptomGuidance = await this.getSymptomGuidance(symptoms, userProfile);
                relevantInfo.educationalResources.push(...symptomGuidance);
            }

            // Get personalized recommendations if we have user profile
            if (userProfile.age && userProfile.sex) {
                const personalizedRecs = await this.getPersonalizedRecommendations(userProfile);
                relevantInfo.personalizedRecommendations = personalizedRecs.slice(0, 3);
            }

        } catch (error) {
            console.error('Error getting chatbot relevant info:', error);
        }

        return relevantInfo;
    }

    extractHealthKeywords(message) {
        const healthKeywords = [
            'nutrition', 'diet', 'exercise', 'sleep', 'stress', 'mental health',
            'heart health', 'diabetes', 'blood pressure', 'cholesterol',
            'weight', 'obesity', 'smoking', 'alcohol', 'prevention',
            'vaccine', 'screening', 'checkup', 'wellness'
        ];

        const messageLower = message.toLowerCase();
        return healthKeywords.filter(keyword => messageLower.includes(keyword));
    }
}

module.exports = ODPHPService;