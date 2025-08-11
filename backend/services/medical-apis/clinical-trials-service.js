// backend/services/medical-apis/clinical-trials-service.js
// ClinicalTrials.gov Integration for Treatment Options

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const apiConfig = require('../../config/api-endpoints').clinicalTrials;
const cacheConfig = require('../../config/cache-config');

class ClinicalTrialsService {
    constructor(cacheManager) {
        this.baseUrl = apiConfig.baseUrl;
        this.endpoints = apiConfig.endpoints;
        this.cache = cacheManager;
        this.timeout = apiConfig.timeout;
        this.lastRequestTime = 0;
        this.requestDelay = 60000 / apiConfig.rateLimit.requests;
    }

    async searchTrialsByCondition(condition, options = {}) {
        const cacheKey = `${cacheConfig.keyPrefixes.clinicalTrials}condition_${condition}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            const params = new URLSearchParams({
                'expr': condition,
                'min_rnk': '1',
                'max_rnk': options.limit || '10',
                'fmt': 'json'
            });

            const url = `${this.baseUrl}${this.endpoints.fullStudies}?${params}`;
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`Clinical Trials API error: ${response.status}`);
            }
            
            const data = await response.json();
            const trials = this.formatTrialResults(data);
            
            await this.cache.set(cacheKey, trials, cacheConfig.timeouts.clinicalTrials);
            
            return trials;
            
        } catch (error) {
            console.error('Clinical Trials search error:', error);
            return this.getFallbackTrialInfo(condition);
        }
    }

    formatTrialResults(data) {
        const trials = [];
        
        if (data.FullStudiesResponse?.FullStudies) {
            for (const study of data.FullStudiesResponse.FullStudies.slice(0, 5)) {
                const studyData = study.Study;
                
                trials.push({
                    id: studyData.ProtocolSection?.IdentificationModule?.NCTId,
                    title: studyData.ProtocolSection?.IdentificationModule?.BriefTitle,
                    status: studyData.ProtocolSection?.StatusModule?.OverallStatus,
                    phase: studyData.ProtocolSection?.DesignModule?.PhaseList?.Phase?.[0],
                    condition: studyData.ProtocolSection?.ConditionsModule?.ConditionList?.Condition?.[0],
                    intervention: studyData.ProtocolSection?.ArmsInterventionsModule?.InterventionList?.Intervention?.[0]?.InterventionName,
                    enrollment: studyData.ProtocolSection?.DesignModule?.EnrollmentInfo?.EnrollmentCount,
                    lastUpdate: studyData.ProtocolSection?.StatusModule?.LastUpdateSubmitDate,
                    source: 'ClinicalTrials.gov'
                });
            }
        }
        
        return trials;
    }

    getFallbackTrialInfo(condition) {
        return [{
            id: 'fallback',
            title: `Clinical trials may be available for ${condition}`,
            status: 'See ClinicalTrials.gov for current studies',
            source: 'Fallback'
        }];
    }

    async makeRequest(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Healthcare-Chatbot/1.0' }
            });
            
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
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
            const testResult = await this.searchTrialsByCondition('headache', { limit: 1, skipCache: true });
            return {
                service: 'ClinicalTrials',
                status: testResult.length > 0 ? 'healthy' : 'degraded',
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

// backend/services/medical-apis/medlineplus-service.js
// MedlinePlus Health Information Service

class MedlinePlusService {
    constructor(cacheManager) {
        this.baseUrl = require('../../config/api-endpoints').medlinePlus.baseUrl;
        this.cache = cacheManager;
        this.timeout = 5000;
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
            
            const params = new URLSearchParams({
                'db': 'healthTopics',
                'term': topic,
                'knowledgeResponseType': 'application/json',
                'tool': 'healthcare-chatbot',
                'email': 'support@healthchatbot.com'
            });

            const url = `${this.baseUrl}?${params}`;
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`MedlinePlus API error: ${response.status}`);
            }
            
            const data = await response.json();
            const healthInfo = this.formatHealthTopics(data);
            
            await this.cache.set(cacheKey, healthInfo, 24 * 60 * 60 * 1000); // 24 hours
            
            return healthInfo;
            
        } catch (error) {
            console.error('MedlinePlus search error:', error);
            return this.getFallbackHealthInfo(topic);
        }
    }

    formatHealthTopics(data) {
        const topics = [];
        
        if (data.nlmSearchResult?.list?.document) {
            for (const doc of data.nlmSearchResult.list.document.slice(0, 3)) {
                topics.push({
                    id: doc.id,
                    title: doc.content?.title,
                    summary: doc.content?.summary || 'Health information available',
                    url: doc.content?.url,
                    lastRevised: doc.content?.lastRevised,
                    source: 'MedlinePlus'
                });
            }
        }
        
        return topics;
    }

    getFallbackHealthInfo(topic) {
        const fallbackInfo = {
            'headache': {
                title: 'Headache Information',
                summary: 'Headaches can have many causes. Most are not serious, but some require medical attention.',
                source: 'MedlinePlus-Fallback'
            },
            'fever': {
                title: 'Fever Information', 
                summary: 'Fever is often a sign that your body is fighting an infection.',
                source: 'MedlinePlus-Fallback'
            }
        };
        
        const info = fallbackInfo[topic.toLowerCase()];
        return info ? [info] : [];
    }

    async makeRequest(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Healthcare-Chatbot/1.0' }
            });
            
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
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
            const testResult = await this.searchHealthTopics('headache', { skipCache: true });
            return {
                service: 'MedlinePlus',
                status: 'healthy',
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

// backend/services/medical-apis/openfda-service.js
// OpenFDA Drug Safety and Adverse Events

class OpenFDAService {
    constructor(cacheManager) {
        this.baseUrl = require('../../config/api-endpoints').drugInteractions.openFDA.baseUrl;
        this.endpoints = require('../../config/api-endpoints').drugInteractions.openFDA.endpoints;
        this.cache = cacheManager;
        this.timeout = 8000;
        this.lastRequestTime = 0;
        this.requestDelay = 7500; // 8 requests per minute
    }

    async searchDrugEvents(drugName, options = {}) {
        const cacheKey = `openfda_events_${drugName}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            const params = new URLSearchParams({
                'search': `patient.drug.medicinalproduct:"${drugName}"`,
                'limit': options.limit || '10'
            });

            const url = `${this.baseUrl}${this.endpoints.drugs}?${params}`;
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`OpenFDA API error: ${response.status}`);
            }
            
            const data = await response.json();
            const events = this.formatDrugEvents(data);
            
            await this.cache.set(cacheKey, events, 2 * 60 * 60 * 1000); // 2 hours
            
            return events;
            
        } catch (error) {
            console.error('OpenFDA drug events search error:', error);
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
            
            const params = new URLSearchParams({
                'search': `openfda.brand_name:"${drugName}" OR openfda.generic_name:"${drugName}"`,
                'limit': options.limit || '3'
            });

            const url = `${this.baseUrl}${this.endpoints.labels}?${params}`;
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`OpenFDA Labels API error: ${response.status}`);
            }
            
            const data = await response.json();
            const labels = this.formatDrugLabels(data);
            
            await this.cache.set(cacheKey, labels, 24 * 60 * 60 * 1000); // 24 hours
            
            return labels;
            
        } catch (error) {
            console.error('OpenFDA drug labels search error:', error);
            return this.getFallbackDrugLabels(drugName);
        }
    }

    formatDrugEvents(data) {
        const events = [];
        
        if (data.results) {
            // Aggregate common adverse events
            const eventCounts = {};
            
            for (const result of data.results.slice(0, 50)) {
                if (result.patient?.reaction) {
                    for (const reaction of result.patient.reaction) {
                        const term = reaction.reactionmeddrapt;
                        eventCounts[term] = (eventCounts[term] || 0) + 1;
                    }
                }
            }
            
            // Convert to sorted array
            const sortedEvents = Object.entries(eventCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
                
            for (const [event, count] of sortedEvents) {
                events.push({
                    reaction: event,
                    reportCount: count,
                    frequency: count > 10 ? 'Common' : count > 5 ? 'Occasional' : 'Rare',
                    source: 'OpenFDA'
                });
            }
        }
        
        return events;
    }

    formatDrugLabels(data) {
        const labels = [];
        
        if (data.results) {
            for (const label of data.results.slice(0, 3)) {
                labels.push({
                    brandName: label.openfda?.brand_name?.[0],
                    genericName: label.openfda?.generic_name?.[0],
                    warnings: label.warnings?.[0]?.substring(0, 500) + '...',
                    contraindications: label.contraindications?.[0]?.substring(0, 300) + '...',
                    dosageAndAdministration: label.dosage_and_administration?.[0]?.substring(0, 300) + '...',
                    adverseReactions: label.adverse_reactions?.[0]?.substring(0, 400) + '...',
                    source: 'OpenFDA'
                });
            }
        }
        
        return labels;
    }

    getFallbackDrugSafety(drugName) {
        return [{
            reaction: 'Consult healthcare provider for safety information',
            frequency: 'Always recommended',
            source: 'OpenFDA-Fallback'
        }];
    }

    getFallbackDrugLabels(drugName) {
        return [{
            brandName: drugName,
            warnings: 'Always read medication labels and consult healthcare providers',
            source: 'OpenFDA-Fallback'
        }];
    }

    async makeRequest(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Healthcare-Chatbot/1.0' }
            });
            
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
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
            const testResult = await this.searchDrugLabels('aspirin', { limit: 1, skipCache: true });
            return {
                service: 'OpenFDA',
                status: testResult.length > 0 ? 'healthy' : 'degraded',
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

module.exports = { ClinicalTrialsService, MedlinePlusService, OpenFDAService };