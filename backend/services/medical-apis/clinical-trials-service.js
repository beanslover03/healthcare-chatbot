// backend/services/medical-apis/clinical-trials-service.js
// CORRECTED VERSION - Uses proper ClinicalTrials.gov API v2

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const apiConfig = require('../../config/api-endpoints').clinicalTrials;
const cacheConfig = require('../../config/cache-config');

class ClinicalTrialsService {
    constructor(cacheManager) {
        this.cache = cacheManager;
        this.baseUrl = apiConfig.baseUrl; // https://clinicaltrials.gov/api/v2
        this.endpoints = apiConfig.endpoints;
        this.workingParams = apiConfig.workingParams;
        this.timeout = apiConfig.timeout || 10000;
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
            
            // ✅ CORRECT: Use API v2 format with working parameters
            const params = new URLSearchParams({
                'query.cond': condition,
                'pageSize': options.limit || 10,
                'countTotal': true,
                'format': 'json'
            });

            // ✅ CORRECT: Use the right endpoint
            const url = `${this.baseUrl}${this.endpoints.studies}?${params}`;
            console.log(`🔬 Clinical Trials API v2: ${url}`);
            
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                console.warn(`Clinical Trials API returned ${response.status}, using fallback...`);
                return this.getFallbackTrialInfo(condition);
            }
            
            const data = await response.json();
            
            // ✅ CORRECT: Handle API v2 response format
            const trials = this.formatAPIv2Results(data, condition);
            
            await this.cache.set(cacheKey, trials, 2 * 60 * 60 * 1000); // 2 hours
            
            console.log(`✅ Clinical Trials: Found ${trials.length} trials for ${condition}`);
            return trials;
            
        } catch (error) {
            console.error('Clinical Trials search error:', error.message);
            return this.getFallbackTrialInfo(condition);
        }
    }

    // ✅ CORRECT: Format API v2 response (different structure than v1)
    formatAPIv2Results(data, condition) {
        const trials = [];
        
        try {
            // API v2 has different structure than v1
            if (data.studies) {
                for (const study of data.studies.slice(0, 10)) {
                    const protocolSection = study.protocolSection;
                    
                    if (protocolSection) {
                        const identification = protocolSection.identificationModule || {};
                        const status = protocolSection.statusModule || {};
                        const design = protocolSection.designModule || {};
                        
                        trials.push({
                            id: identification.nctId || 'NCT-unknown',
                            title: identification.briefTitle || 'Clinical study available',
                            officialTitle: identification.officialTitle,
                            status: status.overallStatus || 'Status unknown',
                            phase: design.phases?.[0] || 'Phase not specified',
                            condition: condition,
                            studyType: design.studyType || 'Interventional',
                            enrollment: design.enrollmentInfo?.count || 'Open enrollment',
                            startDate: status.startDateStruct?.date || 'Start date TBD',
                            lastUpdate: status.lastUpdateSubmitDate || 'Recently updated',
                            source: 'ClinicalTrials.gov'
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error formatting API v2 trial results:', error);
        }
        
        return trials;
    }

    getFallbackTrialInfo(condition) {
        return [{
            id: 'fallback-trial',
            title: `Clinical trials may be available for ${condition}`,
            status: 'Visit ClinicalTrials.gov to search for current studies',
            condition: condition,
            phase: 'Various phases available',
            studyType: 'Various study types',
            enrollment: 'Check eligibility requirements',
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
                endpoint: this.baseUrl,
                note: testResult[0]?.id === 'fallback-trial' ? 'Using fallback data' : 'API responding',
                lastChecked: new Date().toISOString()
            };
        } catch (error) {
            return {
                service: 'ClinicalTrials',
                status: 'error',
                error: error.message,
                endpoint: this.baseUrl,
                lastChecked: new Date().toISOString()
            };
        }
    }
}

module.exports = ClinicalTrialsService;