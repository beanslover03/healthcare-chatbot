// backend/services/medical-apis/pure-api-driven-service.js
// PURE API-DRIVEN SYSTEM - No hardcoding, relies entirely on API responses
const CacheManager = require('../utils/cache-manager');
const RxNormService = require('../medical-apis/rxnorm-service');
const FHIRService = require('../medical-apis/fhir-service');
const ClinicalTrialsService = require('../medical-apis/clinical-trials-service');
const {MedlinePlusService} = require('../medical-apis/medlineplus-service');
const OpenFDAService = require('../medical-apis/openfda-service');
const ODPHPService = require('../medical-apis/odphp-service');


class PureAPIDrivenMedicalService {
    constructor() {
        this.cache = new CacheManager();
        
        // Initialize API services - no hardcoded data
        this.rxnorm = new RxNormService(this.cache);
        this.fhir = new FHIRService(this.cache);
        this.clinicalTrials = new ClinicalTrialsService(this.cache);
        this.medlinePlus = new MedlinePlusService(this.cache);
        this.openFDA = new OpenFDAService(this.cache);
        this.odphp = new ODPHPService(this.cache);
        
        // Pure text processor - no medical term lists
        this.textProcessor = new PureTextProcessor();
        
        console.log('🚀 Pure API-Driven Medical Service - NO hardcoded medical knowledge');
    }

    // ===== PURE API-DRIVEN ANALYSIS =====
    async analyzeSymptoms(symptoms, userMessage, userProfile = {}) {
        console.log('🔍 Starting PURE API-driven analysis...');
        
        const analysis = {
            userMessage,
            extractedWords: [],
            apiResults: {
                rxnorm: [],
                fhir: [],
                clinicalTrials: [],
                medlinePlus: [],
                openFDA: [],
                odphp: []
            },
            consolidatedData: {
                medications: [],
                conditions: [],
                clinicalTrials: [],
                healthInformation: [],
                drugSafety: [],
                healthGuidance: [],
                preventiveRecommendations: []
            },
            apiSources: [],
            searchAttempts: 0,
            successfulSearches: 0,
            confidence: 'medium',
            timestamp: new Date().toISOString()
        };

        try {
            // STEP 1: Extract ALL meaningful words (no medical filtering)
            analysis.extractedWords = this.textProcessor.extractAllMeaningfulWords(userMessage);
            console.log(`📝 Extracted ${analysis.extractedWords.length} words: ${analysis.extractedWords.join(', ')}`);

            // STEP 2: Try EVERY word across ALL APIs and let APIs decide relevance
            const searchResults = await this.searchAllAPIsForAllWords(analysis.extractedWords);
            analysis.searchAttempts = searchResults.totalAttempts;
            analysis.successfulSearches = searchResults.successfulSearches;

            // STEP 3: Let APIs tell us what's medical vs non-medical based on their responses
            analysis.apiResults = searchResults.results;
            analysis.consolidatedData = this.consolidateAPIResponses(searchResults.results);
            analysis.apiSources = this.getSuccessfulAPISources(searchResults.results);

            // STEP 4: Get personalized recommendations if profile provided
            if (userProfile.age && userProfile.sex) {
                try {
                    const personalizedRecs = await this.odphp.getPersonalizedRecommendations(userProfile);
                    if (personalizedRecs.length > 0) {
                        analysis.consolidatedData.preventiveRecommendations = personalizedRecs;
                        analysis.apiSources.push('ODPHP-Personalized');
                        analysis.successfulSearches++;
                    }
                } catch (error) {
                    console.log('ODPHP personalized recommendations not available');
                }
            }

            // STEP 5: Calculate confidence based purely on API response quality
            analysis.confidence = this.calculateAPIBasedConfidence(analysis);
            
            console.log(`✅ Pure API analysis complete!`);
            console.log(`   📊 Words searched: ${analysis.extractedWords.length}`);
            console.log(`   🔍 API attempts: ${analysis.searchAttempts}`);
            console.log(`   ✅ Successful API calls: ${analysis.successfulSearches}`);
            console.log(`   🎯 APIs with data: ${analysis.apiSources.join(', ')}`);
            console.log(`   🧠 Confidence: ${analysis.confidence}`);
            
        } catch (error) {
            console.error('❌ Error in pure API analysis:', error);
            analysis.error = error.message;
            analysis.confidence = 'low';
        }

        return analysis;
    }

    // ===== SEARCH ALL APIS FOR ALL WORDS =====
    async searchAllAPIsForAllWords(words) {
        const results = {
            rxnorm: [],
            fhir: [],
            clinicalTrials: [],
            medlinePlus: [],
            openFDA: [],
            odphp: []
        };
        
        let totalAttempts = 0;
        let successfulSearches = 0;

        console.log(`🚀 Searching ALL APIs for ${words.length} words...`);

        // Search each word across all APIs simultaneously
        const allPromises = [];
        
        for (const word of words.slice(0, 10)) { // Limit to 10 words for performance
            // RxNorm
            allPromises.push(
                this.createAPIPromise('rxnorm', () => this.rxnorm.searchDrugs(word), word)
            );
            totalAttempts++;

            // FHIR - Conditions
            allPromises.push(
                this.createAPIPromise('fhir-conditions', () => this.fhir.searchConditions(word), word)
            );
            totalAttempts++;

            // FHIR - Medications  
            allPromises.push(
                this.createAPIPromise('fhir-medications', () => this.fhir.searchMedications(word), word)
            );
            totalAttempts++;

            // Clinical Trials
            allPromises.push(
                this.createAPIPromise('clinicalTrials', () => this.clinicalTrials.searchTrialsByCondition(word), word)
            );
            totalAttempts++;

            // MedlinePlus
            allPromises.push(
                this.createAPIPromise('medlinePlus', () => this.medlinePlus.searchHealthTopics(word), word)
            );
            totalAttempts++;

            // OpenFDA - Labels
            allPromises.push(
                this.createAPIPromise('openFDA-labels', () => this.openFDA.searchDrugLabels(word), word)
            );
            totalAttempts++;

            // OpenFDA - Events
            allPromises.push(
                this.createAPIPromise('openFDA-events', () => this.openFDA.searchDrugEvents(word), word)
            );
            totalAttempts++;

            // ODPHP
            allPromises.push(
                this.createAPIPromise('odphp', () => this.odphp.searchHealthTopics(word), word)
            );
            totalAttempts++;
        }

        // Execute all API calls in parallel
        console.log(`📡 Executing ${allPromises.length} parallel API calls...`);
        const apiResponses = await Promise.allSettled(allPromises);

        // Process responses and let APIs determine what's relevant
        for (const response of apiResponses) {
            if (response.status === 'fulfilled' && response.value.success && response.value.data.length > 0) {
                const { apiName, data, searchTerm } = response.value;
                
                // Categorize based on API type
                if (apiName === 'rxnorm') {
                    results.rxnorm.push(...data);
                } else if (apiName.startsWith('fhir')) {
                    results.fhir.push(...data);
                } else if (apiName === 'clinicalTrials') {
                    results.clinicalTrials.push(...data);
                } else if (apiName === 'medlinePlus') {
                    results.medlinePlus.push(...data);
                } else if (apiName.startsWith('openFDA')) {
                    results.openFDA.push(...data);
                } else if (apiName === 'odphp') {
                    results.odphp.push(...data);
                }
                
                successfulSearches++;
                console.log(`✅ ${apiName}: Found ${data.length} results for "${searchTerm}"`);
            }
        }

        return {
            results,
            totalAttempts,
            successfulSearches
        };
    }

    // ===== CREATE API PROMISE WRAPPER =====
    createAPIPromise(apiName, searchFunction, searchTerm) {
        return searchFunction()
            .then(data => ({
                success: true,
                apiName,
                searchTerm,
                data: data || []
            }))
            .catch(error => ({
                success: false,
                apiName,
                searchTerm,
                error: error.message,
                data: []
            }));
    }

    // ===== CONSOLIDATE API RESPONSES =====
    consolidateAPIResponses(apiResults) {
        const consolidated = {
            medications: [],
            conditions: [],
            clinicalTrials: [],
            healthInformation: [],
            drugSafety: [],
            healthGuidance: [],
            preventiveRecommendations: []
        };

        // Medications from RxNorm and FHIR
        consolidated.medications.push(...apiResults.rxnorm);
        consolidated.medications.push(...apiResults.fhir.filter(item => 
            item.resourceType === 'Medication' || item.source === 'RxNorm' || item.name
        ));

        // Conditions from FHIR
        consolidated.conditions.push(...apiResults.fhir.filter(item => 
            item.resourceType === 'Condition' || item.category === 'condition' || item.code
        ));

        // Clinical trials
        consolidated.clinicalTrials.push(...apiResults.clinicalTrials);

        // Health information from MedlinePlus
        consolidated.healthInformation.push(...apiResults.medlinePlus);

        // Drug safety from OpenFDA
        consolidated.drugSafety.push(...apiResults.openFDA);

        // Health guidance from ODPHP
        consolidated.healthGuidance.push(...apiResults.odphp);

        // Remove duplicates based on API responses (not hardcoded logic)
        consolidated.medications = this.removeDuplicatesByAPIResponse(consolidated.medications);
        consolidated.conditions = this.removeDuplicatesByAPIResponse(consolidated.conditions);
        consolidated.clinicalTrials = this.removeDuplicatesByAPIResponse(consolidated.clinicalTrials);
        consolidated.healthInformation = this.removeDuplicatesByAPIResponse(consolidated.healthInformation);
        consolidated.drugSafety = this.removeDuplicatesByAPIResponse(consolidated.drugSafety);
        consolidated.healthGuidance = this.removeDuplicatesByAPIResponse(consolidated.healthGuidance);

        return consolidated;
    }

    // ===== REMOVE DUPLICATES BASED ON API RESPONSE STRUCTURE =====
    removeDuplicatesByAPIResponse(items) {
        const seen = new Set();
        return items.filter(item => {
            // Use whatever unique identifier the API provides
            const key = item.id || item.rxcui || item.nctId || item.title || item.name || item.reaction || JSON.stringify(item);
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    // ===== GET SUCCESSFUL API SOURCES =====
    getSuccessfulAPISources(apiResults) {
        const sources = [];
        
        if (apiResults.rxnorm.length > 0) sources.push('RxNorm');
        if (apiResults.fhir.length > 0) sources.push('FHIR');
        if (apiResults.clinicalTrials.length > 0) sources.push('ClinicalTrials.gov');
        if (apiResults.medlinePlus.length > 0) sources.push('MedlinePlus');
        if (apiResults.openFDA.length > 0) sources.push('OpenFDA');
        if (apiResults.odphp.length > 0) sources.push('ODPHP-MyHealthfinder');
        
        return sources;
    }

    // ===== CALCULATE CONFIDENCE BASED ON API RESPONSES =====
    calculateAPIBasedConfidence(analysis) {
        let score = 0;
        
        // Base score from successful API calls
        const successRate = analysis.searchAttempts > 0 ? 
            (analysis.successfulSearches / analysis.searchAttempts) : 0;
        score += successRate * 40;
        
        // Score based on data richness from APIs
        const consolidated = analysis.consolidatedData;
        if (consolidated.medications.length > 0) score += 15;
        if (consolidated.conditions.length > 0) score += 15;
        if (consolidated.clinicalTrials.length > 0) score += 10;
        if (consolidated.healthInformation.length > 0) score += 10;
        if (consolidated.drugSafety.length > 0) score += 5;
        if (consolidated.healthGuidance.length > 0) score += 10;
        if (consolidated.preventiveRecommendations.length > 0) score += 15;
        
        // Bonus for multiple API sources (cross-validation)
        score += Math.min(analysis.apiSources.length * 8, 32);
        
        // Bonus for high search success rate
        if (successRate > 0.5) score += 10;
        if (successRate > 0.7) score += 5;
        
        score = Math.min(score, 100);
        
        if (score >= 80) return 'very_high';
        if (score >= 65) return 'high';
        if (score >= 45) return 'medium';
        return 'low';
    }

    // ===== API STATUS (NO HARDCODED DEPENDENCIES) =====
    async getAPIStatus() {
        console.log('🔍 Checking pure API status...');
        
        const status = {
            timestamp: new Date().toISOString(),
            overall: 'unknown',
            services: {},
            cache: this.cache.getStats(),
            approach: 'pure_api_driven'
        };

        // Test each API with a simple, universal term
        const testTerm = 'health';
        
        const [rxnormStatus, fhirStatus, clinicalTrialsStatus, medlinePlusStatus, openFDAStatus, odphpStatus] = await Promise.allSettled([
            this.testAPIWithTerm(this.rxnorm, 'RxNorm', (api) => api.searchDrugs(testTerm)),
            this.testAPIWithTerm(this.fhir, 'FHIR', (api) => api.searchConditions(testTerm)),
            this.testAPIWithTerm(this.clinicalTrials, 'ClinicalTrials', (api) => api.searchTrialsByCondition(testTerm)),
            this.testAPIWithTerm(this.medlinePlus, 'MedlinePlus', (api) => api.searchHealthTopics(testTerm)),
            this.testAPIWithTerm(this.openFDA, 'OpenFDA', (api) => api.searchDrugLabels(testTerm)),
            this.testAPIWithTerm(this.odphp, 'ODPHP', (api) => api.searchHealthTopics(testTerm))
        ]);

        // Collect results
        const results = [rxnormStatus, fhirStatus, clinicalTrialsStatus, medlinePlusStatus, openFDAStatus, odphpStatus];
        let healthyCount = 0;
        
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                status.services[result.value.name] = result.value;
                if (result.value.status === 'healthy' || result.value.status === 'responding') {
                    healthyCount++;
                }
            }
        }

        // Determine overall status based on API responses
        const totalAPIs = results.length;
        if (healthyCount === totalAPIs) {
            status.overall = 'excellent';
        } else if (healthyCount >= totalAPIs * 0.8) {
            status.overall = 'good';
        } else if (healthyCount >= totalAPIs * 0.5) {
            status.overall = 'fair';
        } else {
            status.overall = 'degraded';
        }

        return status;
    }

    // ===== TEST API WITH TERM =====
    async testAPIWithTerm(api, name, testFunction) {
        try {
            const start = Date.now();
            const result = await testFunction(api);
            const responseTime = Date.now() - start;
            
            return {
                name,
                status: result && result.length >= 0 ? 'responding' : 'no_data',
                responseTime,
                dataReturned: result ? result.length : 0,
                lastChecked: new Date().toISOString()
            };
        } catch (error) {
            return {
                name,
                status: 'error',
                error: error.message,
                lastChecked: new Date().toISOString()
            };
        }
    }

    // ===== UTILITY METHODS =====
    clearCache() {
        this.cache.clear();
        console.log('🧹 Pure API cache cleared');
    }

    getCacheStats() {
        return this.cache.getStats();
    }
}

// ===== PURE TEXT PROCESSOR (NO MEDICAL HARDCODING) =====
class PureTextProcessor {
    constructor() {
        // NO hardcoded medical terms - let APIs decide what's medical
        this.stopWords = new Set([
            'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
            'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'ours', 'theirs',
            'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having',
            'do', 'does', 'did', 'doing', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
            'this', 'that', 'these', 'those', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
            'can', 'get', 'go', 'come', 'see', 'know', 'think', 'say', 'tell', 'ask', 'give', 'take',
            'very', 'really', 'quite', 'just', 'only', 'also', 'even', 'still', 'already', 'yet'
        ]);
    }

    extractAllMeaningfulWords(text) {
        console.log('📝 Extracting ALL meaningful words (no medical filtering)...');
        
        // Clean and split text
        const words = text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ') // Remove punctuation
            .split(/\s+/)
            .filter(word => 
                word.length >= 3 && // Minimum length
                !this.stopWords.has(word) && // Not a stop word
                !/^\d+$/.test(word) // Not just numbers
            );

        // Remove duplicates and limit
        const uniqueWords = [...new Set(words)].slice(0, 15);
        
        console.log(`📝 Extracted ${uniqueWords.length} words for API testing: ${uniqueWords.join(', ')}`);
        return uniqueWords;
    }

    // NO synonym generation - let APIs handle variations
    generateSearchVariations(text) {
        return this.extractAllMeaningfulWords(text);
    }
}

module.exports = { PureAPIDrivenMedicalService, PureTextProcessor };