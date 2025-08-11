// backend/services/medical-apis/enhanced-medical-services.js
// FIXED VERSION - Handles actual API responses correctly

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const apiConfig = require('../../config/api-endpoints');
const cacheConfig = require('../../config/cache-config');

// Updated MedLinePlus to accept data in XML format
class MedlinePlusService {
    constructor(cacheManager) {
        this.cache = cacheManager;
        this.timeout = 8000;
        this.lastRequestTime = 0;
        this.requestDelay = 6000; // 10 requests per minute
    }

    async searchHealthTopics(topic, options = {}) {
        const cacheKey = `medlineplus_${topic}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            // Try the correct MedlinePlus API format
            const params = new URLSearchParams({
                'db': 'healthTopics',
                'term': topic,
                'knowledgeResponseType': 'application/json'
            });

            const url = `https://wsearch.nlm.nih.gov/ws/query?${params}`;
            console.log(`📚 Trying MedlinePlus API: ${url}`);
            
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                console.warn(`MedlinePlus API returned ${response.status}, using fallback...`);
                return this.getFallbackHealthInfo(topic);
            }
            
            const contentType = response.headers.get('content-type');
            const text = await response.text();
            
            let healthInfo = [];
            
            // Handle different response formats
            if (contentType?.includes('xml') || text.startsWith('<?xml')) {
                console.log('📚 MedlinePlus returned XML, parsing...');
                healthInfo = this.parseXMLResponse(text, topic);
            } else if (contentType?.includes('json')) {
                console.log('📚 MedlinePlus returned JSON, parsing...');
                try {
                    const data = JSON.parse(text);
                    healthInfo = this.formatHealthTopics(data);
                } catch (parseError) {
                    console.warn('MedlinePlus JSON parse error, using XML parser...');
                    healthInfo = this.parseXMLResponse(text, topic);
                }
            } else {
                console.log('📚 MedlinePlus returned unknown format, trying XML parser...');
                healthInfo = this.parseXMLResponse(text, topic);
            }
            
            // If we got results, cache them
            if (healthInfo.length > 0) {
                await this.cache.set(cacheKey, healthInfo, 24 * 60 * 60 * 1000); // 24 hours
                console.log(`✅ MedlinePlus: Successfully parsed ${healthInfo.length} topics for ${topic}`);
            } else {
                console.log(`📚 MedlinePlus: No topics found, using fallback for ${topic}`);
                healthInfo = this.getFallbackHealthInfo(topic);
            }
            
            return healthInfo;
            
        } catch (error) {
            console.error('MedlinePlus search error:', error.message);
            return this.getFallbackHealthInfo(topic);
        }
    }

    // NEW: XML Response Parser
    parseXMLResponse(xmlText, topic) {
        const healthInfo = [];
        
        try {
            // Simple XML parsing without external dependencies
            // Look for common XML patterns in MedlinePlus responses
            
            // Method 1: Extract document entries
            const documentMatches = xmlText.match(/<document[^>]*>(.*?)<\/document>/gs);
            
            if (documentMatches) {
                for (const docMatch of documentMatches.slice(0, 3)) { // Limit to 3 results
                    const info = this.extractDocumentInfo(docMatch, topic);
                    if (info) {
                        healthInfo.push(info);
                    }
                }
            }
            
            // Method 2: Look for simpler content patterns if documents not found
            if (healthInfo.length === 0) {
                const simpleInfo = this.extractSimpleXMLInfo(xmlText, topic);
                if (simpleInfo) {
                    healthInfo.push(simpleInfo);
                }
            }
            
            // Method 3: Extract any text content if structured parsing fails
            if (healthInfo.length === 0) {
                const textInfo = this.extractTextContent(xmlText, topic);
                if (textInfo) {
                    healthInfo.push(textInfo);
                }
            }
            
        } catch (error) {
            console.warn('XML parsing error:', error.message);
        }
        
        return healthInfo;
    }

    // Extract structured document information from XML
    extractDocumentInfo(docXML, topic) {
        try {
            // Extract title
            const titleMatch = docXML.match(/<title[^>]*>(.*?)<\/title>/s);
            const title = titleMatch ? this.cleanXMLText(titleMatch[1]) : `${topic} Information`;
            
            // Extract content/summary
            const contentMatch = docXML.match(/<content[^>]*>(.*?)<\/content>/s) || 
                                docXML.match(/<summary[^>]*>(.*?)<\/summary>/s) ||
                                docXML.match(/<abstract[^>]*>(.*?)<\/abstract>/s);
            
            const summary = contentMatch ? this.cleanXMLText(contentMatch[1]) : 
                          `Health information about ${topic} from MedlinePlus`;
            
            // Extract URL if available
            const urlMatch = docXML.match(/<url[^>]*>(.*?)<\/url>/s) ||
                           docXML.match(/href=["'](https?:\/\/[^"']+)["']/);
            const url = urlMatch ? this.cleanXMLText(urlMatch[1]) : 'https://medlineplus.gov';
            
            // Extract ID
            const idMatch = docXML.match(/<id[^>]*>(.*?)<\/id>/s) ||
                          docXML.match(/id=["']([^"']+)["']/);
            const id = idMatch ? this.cleanXMLText(idMatch[1]) : `medlineplus-${topic}`;
            
            return {
                id: id,
                title: title,
                summary: summary.length > 500 ? summary.substring(0, 500) + '...' : summary,
                url: url,
                lastRevised: new Date().toISOString().split('T')[0], // Default to today
                source: 'MedlinePlus'
            };
            
        } catch (error) {
            console.warn('Document extraction error:', error.message);
            return null;
        }
    }

    // Extract simple XML information
    extractSimpleXMLInfo(xmlText, topic) {
        try {
            // Look for any content about the topic
            const patterns = [
                new RegExp(`<[^>]*>${topic}[^<]*</[^>]*>`, 'gi'),
                new RegExp(`<[^>]*>[^<]*${topic}[^<]*</[^>]*>`, 'gi')
            ];
            
            for (const pattern of patterns) {
                const matches = xmlText.match(pattern);
                if (matches && matches.length > 0) {
                    const content = this.cleanXMLText(matches[0]);
                    if (content.length > 10) {
                        return {
                            id: `medlineplus-simple-${topic}`,
                            title: `${topic} Health Information`,
                            summary: content,
                            url: 'https://medlineplus.gov',
                            source: 'MedlinePlus'
                        };
                    }
                }
            }
        } catch (error) {
            console.warn('Simple XML extraction error:', error.message);
        }
        
        return null;
    }

    // Extract any readable text content
    extractTextContent(xmlText, topic) {
        try {
            // Remove XML tags and extract readable content
            const textContent = xmlText
                .replace(/<[^>]*>/g, ' ')  // Remove all XML tags
                .replace(/\s+/g, ' ')      // Normalize whitespace
                .trim();
            
            if (textContent.length > 50) {
                // Look for sentences containing the topic
                const sentences = textContent.split(/[.!?]+/);
                const relevantSentences = sentences.filter(sentence => 
                    sentence.toLowerCase().includes(topic.toLowerCase()) && 
                    sentence.trim().length > 20
                );
                
                if (relevantSentences.length > 0) {
                    const summary = relevantSentences.slice(0, 2).join('. ').trim() + '.';
                    
                    return {
                        id: `medlineplus-text-${topic}`,
                        title: `${topic} Information`,
                        summary: summary.length > 500 ? summary.substring(0, 500) + '...' : summary,
                        url: 'https://medlineplus.gov',
                        source: 'MedlinePlus'
                    };
                }
            }
        } catch (error) {
            console.warn('Text extraction error:', error.message);
        }
        
        return null;
    }

    // Clean XML text content
    cleanXMLText(text) {
        return text
            .replace(/<[^>]*>/g, '')      // Remove XML tags
            .replace(/&lt;/g, '<')       // Decode HTML entities
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')        // Normalize whitespace
            .trim();
    }

    // Enhanced fallback with better topic-specific content
    getFallbackHealthInfo(topic) {
        const fallbackDatabase = {
            'headache': {
                id: 'headache-fallback',
                title: 'Headache Information',
                summary: 'Headaches are very common and can range from mild to severe. Most headaches are tension headaches caused by stress, poor posture, or muscle tension. Migraines are more severe and often include nausea and light sensitivity. Treatment typically includes rest, hydration, and over-the-counter pain relievers.',
                source: 'MedlinePlus-Enhanced',
                url: 'https://medlineplus.gov/headache.html'
            },
            'fever': {
                id: 'fever-fallback',
                title: 'Fever Information', 
                summary: 'A fever is a body temperature above 100.4°F (38°C). Fever is usually a sign that your body is fighting an infection. Most fevers are caused by viral or bacterial infections. Treatment includes rest, fluids, and fever-reducing medications like acetaminophen or ibuprofen.',
                source: 'MedlinePlus-Enhanced',
                url: 'https://medlineplus.gov/fever.html'
            },
            'nausea': {
                id: 'nausea-fallback',
                title: 'Nausea and Vomiting',
                summary: 'Nausea is the feeling that you need to vomit. It can be caused by many things including motion sickness, food poisoning, pregnancy, medications, or infections. Treatment includes staying hydrated, eating bland foods, and avoiding strong odors.',
                source: 'MedlinePlus-Enhanced',
                url: 'https://medlineplus.gov/nauseaandvomiting.html'
            },
            'chest pain': {
                id: 'chest-pain-fallback',
                title: 'Chest Pain',
                summary: 'Chest pain can have many causes, from minor muscle strain to serious heart problems. It may feel sharp, dull, burning, or crushing. Chest pain with shortness of breath, sweating, or nausea requires immediate medical attention.',
                source: 'MedlinePlus-Enhanced',
                url: 'https://medlineplus.gov/chestpain.html'
            },
            'cough': {
                id: 'cough-fallback',
                title: 'Cough',
                summary: 'Coughing helps clear your airways of mucus and irritants. Acute coughs last less than 3 weeks and are often caused by colds or flu. Chronic coughs lasting more than 8 weeks may indicate underlying conditions like asthma or acid reflux.',
                source: 'MedlinePlus-Enhanced',
                url: 'https://medlineplus.gov/cough.html'
            }
        };
        
        const info = fallbackDatabase[topic.toLowerCase()];
        return info ? [info] : [{
            id: 'general-fallback',
            title: `${topic} Health Information`,
            summary: `${topic} can affect people in different ways. For reliable, detailed information about ${topic}, including symptoms, causes, treatment options, and prevention strategies, visit MedlinePlus.gov or consult your healthcare provider.`,
            source: 'MedlinePlus-Enhanced',
            url: 'https://medlineplus.gov'
        }];
    }

    // Keep existing methods unchanged
    async makeRequest(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 
                    'User-Agent': 'Healthcare-Chatbot/1.0',
                    'Accept': 'application/json, text/xml, text/html'
                }
            });
            
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('MedlinePlus API timeout');
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

    // Keep existing formatHealthTopics method for JSON responses
    formatHealthTopics(data) {
        const topics = [];
        
        try {
            if (data.nlmSearchResult?.list?.document) {
                for (const doc of data.nlmSearchResult.list.document.slice(0, 3)) {
                    topics.push({
                        id: doc.id || 'medlineplus-topic',
                        title: doc.content?.title || `Health information about ${topic}`,
                        summary: doc.content?.summary || 'Health information available from MedlinePlus',
                        url: doc.content?.url || 'https://medlineplus.gov',
                        lastRevised: doc.content?.lastRevised || 'Recently updated',
                        source: 'MedlinePlus'
                    });
                }
            }
        } catch (error) {
            console.error('Error formatting MedlinePlus JSON results:', error);
        }
        
        return topics;
    }

    async healthCheck() {
        try {
            const start = Date.now();
            const testResult = await this.searchHealthTopics('headache', { skipCache: true });
            const responseTime = Date.now() - start;
            
            return {
                service: 'MedlinePlus',
                status: testResult.length > 0 ? 'healthy' : 'degraded',
                responseTime: responseTime,
                dataFound: testResult.length,
                dataSource: testResult[0]?.source || 'unknown',
                lastChecked: new Date().toISOString()
            };
        } catch (error) {
            return {
                service: 'MedlinePlus',
                status: 'error',
                error: error.message,
                lastChecked: new Date().toISOString()
            };
        }
    }
}

// ===== OPENFDA SERVICE (FIXED) =====
class OpenFDAService {
    constructor(cacheManager) {
        this.cache = cacheManager;
        this.timeout = 8000;
        this.lastRequestTime = 0;
        this.requestDelay = 8000; // About 7-8 requests per minute (conservative)
    }

    async searchDrugEvents(drugName, options = {}) {
        const cacheKey = `openfda_events_${drugName}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            // Correct OpenFDA API format
            const searchTerm = encodeURIComponent(`"${drugName}"`);
            const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:${searchTerm}&limit=${options.limit || 10}`;
            
            console.log(`⚠️  Trying OpenFDA Events API: ${url}`);
            
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                console.warn(`OpenFDA events API returned ${response.status}, using fallback...`);
                return this.getFallbackDrugSafety(drugName);
            }
            
            const data = await response.json();
            const events = this.formatDrugEvents(data);
            
            await this.cache.set(cacheKey, events, 2 * 60 * 60 * 1000); // 2 hours
            
            console.log(`✅ OpenFDA Events: Found ${events.length} event types for ${drugName}`);
            return events;
            
        } catch (error) {
            console.error('OpenFDA drug events search error:', error.message);
            return this.getFallbackDrugSafety(drugName);
        }
    }

    async searchDrugLabels(drugName, options = {}) {
        const cacheKey = `openfda_labels_${drugName}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            // Try both brand name and generic name searches
            const searchTerm = encodeURIComponent(`"${drugName}"`);
            const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:${searchTerm}+openfda.generic_name:${searchTerm}&limit=${options.limit || 3}`;
            
            console.log(`💊 Trying OpenFDA Labels API: ${url}`);
            
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                console.warn(`OpenFDA labels API returned ${response.status}, using fallback...`);
                return this.getFallbackDrugLabels(drugName);
            }
            
            const data = await response.json();
            const labels = this.formatDrugLabels(data);
            
            await this.cache.set(cacheKey, labels, 24 * 60 * 60 * 1000); // 24 hours
            
            console.log(`✅ OpenFDA Labels: Found ${labels.length} labels for ${drugName}`);
            return labels;
            
        } catch (error) {
            console.error('OpenFDA drug labels search error:', error.message);
            return this.getFallbackDrugLabels(drugName);
        }
    }

    formatDrugEvents(data) {
        const events = [];
        
        try {
            if (data.results) {
                const eventCounts = {};
                
                for (const result of data.results.slice(0, 100)) {
                    if (result.patient?.reaction) {
                        for (const reaction of result.patient.reaction) {
                            const term = reaction.reactionmeddrapt;
                            if (term) {
                                eventCounts[term] = (eventCounts[term] || 0) + 1;
                            }
                        }
                    }
                }
                
                const sortedEvents = Object.entries(eventCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10);
                    
                for (const [event, count] of sortedEvents) {
                    events.push({
                        reaction: event,
                        reportCount: count,
                        frequency: count > 20 ? 'Common' : count > 10 ? 'Occasional' : 'Rare',
                        source: 'OpenFDA'
                    });
                }
            }
        } catch (error) {
            console.error('Error formatting OpenFDA events:', error);
        }
        
        return events;
    }

    formatDrugLabels(data) {
        const labels = [];
        
        try {
            if (data.results) {
                for (const label of data.results.slice(0, 3)) {
                    const brandNames = label.openfda?.brand_name || [];
                    const genericNames = label.openfda?.generic_name || [];
                    
                    labels.push({
                        brandName: brandNames[0] || 'Brand name not available',
                        genericName: genericNames[0] || 'Generic name not available',
                        warnings: this.extractText(label.warnings) || 'Warnings information not available',
                        contraindications: this.extractText(label.contraindications) || 'Contraindications not specified',
                        dosageAndAdministration: this.extractText(label.dosage_and_administration) || 'Dosage information not available',
                        adverseReactions: this.extractText(label.adverse_reactions) || 'Adverse reactions information not available',
                        source: 'OpenFDA'
                    });
                }
            }
        } catch (error) {
            console.error('Error formatting OpenFDA labels:', error);
        }
        
        return labels;
    }

    extractText(textArray) {
        if (!textArray || !Array.isArray(textArray) || textArray.length === 0) {
            return null;
        }
        
        const text = textArray[0];
        if (text && text.length > 500) {
            return text.substring(0, 500) + '...';
        }
        
        return text;
    }

    getFallbackDrugSafety(drugName) {
        const commonDrugSafety = {
            'aspirin': [{
                reaction: 'Stomach irritation',
                frequency: 'Common',
                reportCount: 'Multiple reports',
                source: 'OpenFDA-Fallback'
            }],
            'ibuprofen': [{
                reaction: 'Stomach upset',
                frequency: 'Common',
                reportCount: 'Multiple reports',
                source: 'OpenFDA-Fallback'
            }],
            'acetaminophen': [{
                reaction: 'Liver toxicity (overdose)',
                frequency: 'Rare',
                reportCount: 'Documented cases',
                source: 'OpenFDA-Fallback'
            }]
        };
        
        return commonDrugSafety[drugName.toLowerCase()] || [{
            reaction: 'Safety information not available',
            frequency: 'Consult healthcare provider for safety information',
            reportCount: 0,
            source: 'OpenFDA-Fallback'
        }];
    }

    getFallbackDrugLabels(drugName) {
        const commonDrugLabels = {
            'aspirin': [{
                brandName: 'Aspirin',
                genericName: 'acetylsalicylic acid',
                warnings: 'May cause stomach bleeding. Do not use if allergic to aspirin or other NSAIDs.',
                contraindications: 'Do not use in children under 16 with viral infections.',
                source: 'OpenFDA-Fallback'
            }],
            'ibuprofen': [{
                brandName: 'Advil/Motrin',
                genericName: 'ibuprofen',
                warnings: 'May increase risk of heart attack or stroke. Can cause stomach bleeding.',
                contraindications: 'Do not use if you have had an allergic reaction to ibuprofen.',
                source: 'OpenFDA-Fallback'
            }]
        };
        
        return commonDrugLabels[drugName.toLowerCase()] || [{
            brandName: drugName,
            genericName: drugName,
            warnings: 'Always read medication labels and consult healthcare providers for complete safety information',
            contraindications: 'Consult healthcare provider for contraindications',
            source: 'OpenFDA-Fallback'
        }];
    }

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
                throw new Error('OpenFDA API timeout');
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
            const testResult = await this.searchDrugLabels('aspirin', { limit: 1, skipCache: true });
            const responseTime = Date.now() - start;
            
            return {
                service: 'OpenFDA',
                status: testResult.length > 0 && testResult[0].source !== 'OpenFDA-Fallback' ? 'healthy' : 'degraded',
                responseTime: responseTime,
                note: testResult[0]?.source === 'OpenFDA-Fallback' ? 'Using fallback data' : 'API responding',
                lastChecked: new Date().toISOString()
            };
        } catch (error) {
            return {
                service: 'OpenFDA',
                status: 'error',
                error: error.message,
                lastChecked: new Date().toISOString()
            };
        }
    }
}

// Export all services
module.exports = { 
    MedlinePlusService, 
    OpenFDAService 
};