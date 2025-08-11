// backend/services/medical-apis/enhanced-medical-services.js
// FIXED VERSION - Handles actual API responses correctly

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const apiConfig = require('../../config/api-endpoints');
const cacheConfig = require('../../config/cache-config');

// ===== CLINICAL TRIALS SERVICE (FIXED) =====
class ClinicalTrialsService {
    constructor(cacheManager) {
        this.cache = cacheManager;
        this.timeout = 10000;
        this.lastRequestTime = 0;
        this.requestDelay = 4000; // 15 requests per minute
    }

    async searchTrialsByCondition(condition, options = {}) {
        const cacheKey = `clinical_trials_${condition}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            // Use the correct ClinicalTrials.gov API format
            const params = new URLSearchParams({
                'expr': condition,
                'min_rnk': '1',
                'max_rnk': options.limit || '5',
                'fmt': 'json'
            });

            // Correct API endpoint
            const url = `https://clinicaltrials.gov/api/query/full_studies?${params}`;
            console.log(`🔬 Trying Clinical Trials API: ${url}`);
            
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                console.warn(`Clinical Trials API returned ${response.status}, using fallback...`);
                return this.getFallbackTrialInfo(condition);
            }
            
            const text = await response.text();
            
            // Check if response is HTML (error page)
            if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
                console.warn('Clinical Trials API returned HTML instead of JSON, using fallback...');
                return this.getFallbackTrialInfo(condition);
            }
            
            let data;
            try {
                data = JSON.parse(text);
            } catch (parseError) {
                console.warn('Clinical Trials API returned invalid JSON, using fallback...');
                return this.getFallbackTrialInfo(condition);
            }
            
            const trials = this.formatTrialResults(data);
            
            await this.cache.set(cacheKey, trials, 2 * 60 * 60 * 1000); // 2 hours
            
            console.log(`✅ Clinical Trials: Found ${trials.length} trials for ${condition}`);
            return trials;
            
        } catch (error) {
            console.error('Clinical Trials search error:', error.message);
            return this.getFallbackTrialInfo(condition);
        }
    }

    formatTrialResults(data) {
        const trials = [];
        
        try {
            if (data.FullStudiesResponse?.FullStudies) {
                for (const study of data.FullStudiesResponse.FullStudies.slice(0, 5)) {
                    const studyData = study.Study;
                    const protocolSection = studyData?.ProtocolSection;
                    
                    if (protocolSection) {
                        trials.push({
                            id: protocolSection.IdentificationModule?.NCTId || 'NCT-unknown',
                            title: protocolSection.IdentificationModule?.BriefTitle || 'Clinical study available',
                            status: protocolSection.StatusModule?.OverallStatus || 'Status unknown',
                            phase: protocolSection.DesignModule?.PhaseList?.Phase?.[0] || 'Phase not specified',
                            condition: protocolSection.ConditionsModule?.ConditionList?.Condition?.[0] || condition,
                            intervention: protocolSection.ArmsInterventionsModule?.InterventionList?.Intervention?.[0]?.InterventionName || 'Treatment study',
                            enrollment: protocolSection.DesignModule?.EnrollmentInfo?.EnrollmentCount || 'Open enrollment',
                            lastUpdate: protocolSection.StatusModule?.LastUpdateSubmitDate || 'Recently updated',
                            source: 'ClinicalTrials.gov'
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error formatting trial results:', error);
        }
        
        return trials;
    }

    getFallbackTrialInfo(condition) {
        return [{
            id: 'fallback-trial',
            title: `Clinical trials may be available for ${condition}`,
            status: 'Visit ClinicalTrials.gov to search for current studies',
            condition: condition,
            intervention: 'Various treatments being studied',
            source: 'Fallback'
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
                throw new Error('Clinical Trials API timeout');
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
            const testResult = await this.searchTrialsByCondition('headache', { limit: 1, skipCache: true });
            const responseTime = Date.now() - start;
            
            return {
                service: 'ClinicalTrials',
                status: testResult.length > 0 && testResult[0].id !== 'fallback-trial' ? 'healthy' : 'degraded',
                responseTime: responseTime,
                note: testResult[0]?.id === 'fallback-trial' ? 'Using fallback data' : 'API responding',
                lastChecked: new Date().toISOString()
            };
        } catch (error) {
            return {
                service: 'ClinicalTrials',
                status: 'error',
                error: error.message,
                lastChecked: new Date().toISOString()
            };
        }
    }
}

// ===== MEDLINEPLUS SERVICE (FIXED) =====
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
            
            // Check if response is XML (common with NLM APIs)
            if (contentType?.includes('xml') || text.startsWith('<?xml')) {
                console.warn('MedlinePlus API returned XML instead of JSON, using fallback...');
                return this.getFallbackHealthInfo(topic);
            }
            
            // Check if response is HTML
            if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
                console.warn('MedlinePlus API returned HTML instead of JSON, using fallback...');
                return this.getFallbackHealthInfo(topic);
            }
            
            let data;
            try {
                data = JSON.parse(text);
            } catch (parseError) {
                console.warn('MedlinePlus API returned invalid JSON, using fallback...');
                return this.getFallbackHealthInfo(topic);
            }
            
            const healthInfo = this.formatHealthTopics(data);
            
            await this.cache.set(cacheKey, healthInfo, 24 * 60 * 60 * 1000); // 24 hours
            
            console.log(`✅ MedlinePlus: Found ${healthInfo.length} topics for ${topic}`);
            return healthInfo;
            
        } catch (error) {
            console.error('MedlinePlus search error:', error.message);
            return this.getFallbackHealthInfo(topic);
        }
    }

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
            console.error('Error formatting MedlinePlus results:', error);
        }
        
        return topics;
    }

    getFallbackHealthInfo(topic) {
        const fallbackDatabase = {
            'headache': {
                id: 'headache-fallback',
                title: 'Headache Information',
                summary: 'Headaches are very common. Most headaches are not dangerous, but some types can be a sign of a serious health problem. The main types of headaches are tension headaches, migraines, and cluster headaches.',
                source: 'MedlinePlus-Fallback',
                url: 'https://medlineplus.gov/headache.html'
            },
            'fever': {
                id: 'fever-fallback',
                title: 'Fever Information', 
                summary: 'A fever is a body temperature that is higher than normal. Normal body temperature is around 98.6°F (37°C). A fever is usually a sign that your body is fighting an infection.',
                source: 'MedlinePlus-Fallback',
                url: 'https://medlineplus.gov/fever.html'
            },
            'nausea': {
                id: 'nausea-fallback',
                title: 'Nausea and Vomiting',
                summary: 'Nausea is feeling an urge to vomit. It is often called being sick to your stomach. Vomiting or throwing up is forcing the contents of the stomach up through the esophagus and out of the mouth.',
                source: 'MedlinePlus-Fallback',
                url: 'https://medlineplus.gov/nauseaandvomiting.html'
            },
            'chest pain': {
                id: 'chest-pain-fallback',
                title: 'Chest Pain',
                summary: 'Chest pain can be sharp, burning, or tight. You may feel pain under your breastbone, or in your neck, arms, stomach, jaw, or upper back. Chest pain can be a sign of a serious heart problem.',
                source: 'MedlinePlus-Fallback',
                url: 'https://medlineplus.gov/chestpain.html'
            },
            'cough': {
                id: 'cough-fallback',
                title: 'Cough',
                summary: 'Coughing is a reflex that helps clear your airways of irritants. There are many causes of cough including infections, allergies, acid reflux, and medications.',
                source: 'MedlinePlus-Fallback',
                url: 'https://medlineplus.gov/cough.html'
            }
        };
        
        const info = fallbackDatabase[topic.toLowerCase()];
        return info ? [info] : [{
            id: 'general-fallback',
            title: 'Health Information',
            summary: 'For reliable health information about medical conditions, symptoms, and treatments, visit MedlinePlus.gov or consult your healthcare provider.',
            source: 'MedlinePlus-Fallback',
            url: 'https://medlineplus.gov'
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

    async healthCheck() {
        try {
            const start = Date.now();
            const testResult = await this.searchHealthTopics('headache', { skipCache: true });
            const responseTime = Date.now() - start;
            
            return {
                service: 'MedlinePlus',
                status: testResult.length > 0 && testResult[0].source !== 'MedlinePlus-Fallback' ? 'healthy' : 'degraded',
                responseTime: responseTime,
                note: testResult[0]?.source === 'MedlinePlus-Fallback' ? 'Using fallback data' : 'API responding',
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
    ClinicalTrialsService, 
    MedlinePlusService, 
    OpenFDAService 
};