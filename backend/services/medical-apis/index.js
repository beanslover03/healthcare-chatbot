// backend/services/medical-apis/index.js
// UPDATED: Enhanced with dynamic API calls for any user input

const RxNormService = require('./rxnorm-service');
const FHIRService = require('./fhir-service');
const ClinicalTrialsService = require('./clinical-trials-service');
const { MedlinePlusService } = require('./enhanced-medical-services');
const OpenFDAService = require('./openfda-service');
const ODPHPService = require('./odphp-service');
const CacheManager = require('../utils/cache-manager');
const medicalMappings = require('../../config/medical-mappings');

class MedicalAPIService {
    constructor() {
        // Initialize cache manager
        this.cache = new CacheManager();
        
        // Initialize all medical services
        this.rxnorm = new RxNormService(this.cache);
        this.fhir = new FHIRService(this.cache);
        this.clinicalTrials = new ClinicalTrialsService(this.cache);
        this.medlinePlus = new MedlinePlusService(this.cache);
        this.openFDA = new OpenFDAService(this.cache);
        this.odphp = new ODPHPService(this.cache);
        
        // NEW: Enhanced text processor for dynamic term extraction
        this.textProcessor = new MedicalTextProcessor();
        
        console.log('🏥 Enhanced Medical API Service initialized with DYNAMIC analysis capability');
    }

    // ===== ENHANCED DYNAMIC SYMPTOM ANALYSIS =====
    async analyzeSymptoms(symptoms, userMessage, userProfile = {}) {
        console.log('🔍 Starting ENHANCED dynamic symptom analysis...');
        
        const analysis = {
            userMessage,
            extractedTerms: [],
            symptoms: [],
            conditions: [],
            medications: [],
            clinicalTrials: [],
            healthInformation: [],
            drugSafety: [],
            healthGuidance: [],
            preventiveRecommendations: [],
            educationalResources: [],
            emergencyFactors: [],
            recommendations: {},
            apiSources: [],
            confidence: 'medium',
            searchAttempts: 0,
            successfulSearches: 0,
            timestamp: new Date().toISOString()
        };

        try {
            // STEP 1: Extract ALL possible medical terms from user input
            analysis.extractedTerms = this.textProcessor.extractMedicalTerms(userMessage);
            console.log(`📝 Extracted ${analysis.extractedTerms.length} medical terms: ${analysis.extractedTerms.join(', ')}`);

            // STEP 2: Generate comprehensive search terms
            const searchTerms = this.generateComprehensiveSearchTerms(userMessage, analysis.extractedTerms);
            console.log(`🔍 Generated ${searchTerms.length} search variations`);

            // STEP 3: Enrich symptoms (both predefined and dynamic)
            analysis.symptoms = await this.identifyAndEnrichAllSymptoms(userMessage, analysis.extractedTerms);

            // STEP 4: AGGRESSIVE PARALLEL API SEARCHES
            const searchResults = await this.performAggressiveAPISearches(searchTerms, userMessage);
            
            // STEP 5: Process all search results
            this.processAllSearchResults(searchResults, analysis);

            // STEP 6: Get personalized ODPHP data if profile available
            if (userProfile.age && userProfile.sex) {
                try {
                    const personalizedData = await this.odphp.getPersonalizedRecommendations(userProfile);
                    if (personalizedData.length > 0) {
                        analysis.preventiveRecommendations.push(...personalizedData);
                        analysis.apiSources.push('ODPHP-Personalized');
                        analysis.successfulSearches++;
                    }
                } catch (error) {
                    console.warn('ODPHP personalized recommendations failed:', error.message);
                }
            }

            // STEP 7: Emergency assessment
            analysis.emergencyFactors = this.assessEmergencyFactors(analysis.symptoms, userMessage);
            
            // STEP 8: Generate comprehensive recommendations
            analysis.recommendations = await this.generateEnhancedRecommendationsWithODPHP(analysis);
            
            // STEP 9: Calculate confidence based on search success
            analysis.confidence = this.calculateEnhancedConfidence(analysis);
            
            console.log(`✅ ENHANCED analysis complete!`);
            console.log(`   📊 Search attempts: ${analysis.searchAttempts}`);
            console.log(`   ✅ Successful searches: ${analysis.successfulSearches}`);
            console.log(`   🎯 API sources used: ${analysis.apiSources.join(', ')}`);
            console.log(`   🧠 Confidence: ${analysis.confidence}`);
            
        } catch (error) {
            console.error('❌ Error in enhanced dynamic analysis:', error);
            analysis.error = error.message;
            analysis.confidence = 'low';
        }

        return analysis;
    }

    // ===== NEW: GENERATE COMPREHENSIVE SEARCH TERMS =====
    generateComprehensiveSearchTerms(userMessage, extractedTerms) {
        const searchTerms = new Set();
        
        // Add original extracted terms
        extractedTerms.forEach(term => searchTerms.add(term));
        
        // Add variations from text processor
        const variations = this.textProcessor.generateSearchVariations(userMessage);
        variations.forEach(variation => searchTerms.add(variation));
        
        // Add medical synonyms and related terms
        const synonymMap = {
            'pain': ['ache', 'hurt', 'discomfort', 'soreness'],
            'nausea': ['sick', 'queasy', 'nauseated'],
            'fever': ['temperature', 'pyrexia', 'hyperthermia'],
            'headache': ['head pain', 'cephalgia', 'migraine'],
            'stomach': ['abdominal', 'gastric', 'belly'],
            'chest': ['thoracic', 'cardiac'],
            'dizzy': ['dizziness', 'vertigo', 'lightheaded'],
            'tired': ['fatigue', 'exhaustion', 'lethargy'],
            'cough': ['coughing', 'tussis'],
            'rash': ['skin irritation', 'dermatitis'],
            'anxiety': ['anxious', 'stress', 'worry']
        };
        
        for (const term of extractedTerms) {
            const termLower = term.toLowerCase();
            if (synonymMap[termLower]) {
                synonymMap[termLower].forEach(synonym => searchTerms.add(synonym));
            }
        }
        
        // Add compound terms (common medical phrases)
        const messageLower = userMessage.toLowerCase();
        const compoundTerms = [
            'chest pain', 'stomach pain', 'back pain', 'head pain',
            'sore throat', 'runny nose', 'stuffy nose',
            'muscle ache', 'joint pain', 'neck pain',
            'upset stomach', 'food poisoning', 'motion sickness'
        ];
        
        for (const compound of compoundTerms) {
            if (messageLower.includes(compound)) {
                searchTerms.add(compound);
                // Also add individual words
                compound.split(' ').forEach(word => searchTerms.add(word));
            }
        }
        
        // Limit to reasonable number for performance
        return Array.from(searchTerms).slice(0, 12);
    }

    // ===== NEW: AGGRESSIVE PARALLEL API SEARCHES =====
    async performAggressiveAPISearches(searchTerms, userMessage) {
        const searchPromises = [];
        let searchAttempts = 0;
        
        console.log(`🚀 Starting aggressive searches for ${searchTerms.length} terms...`);
        
        // Search each term across ALL APIs
        for (const term of searchTerms) {
            // RxNorm searches
            searchPromises.push(
                this.createSearchPromise('RxNorm-Drugs', () => this.rxnorm.searchDrugs(term), term)
            );
            searchAttempts++;
            
            // FHIR searches
            searchPromises.push(
                this.createSearchPromise('FHIR-Conditions', () => this.fhir.searchConditions(term), term)
            );
            searchAttempts++;
            
            searchPromises.push(
                this.createSearchPromise('FHIR-Medications', () => this.fhir.searchMedications(term), term)
            );
            searchAttempts++;
            
            // Clinical Trials
            searchPromises.push(
                this.createSearchPromise('ClinicalTrials', () => this.clinicalTrials.searchTrialsByCondition(term), term)
            );
            searchAttempts++;
            
            // MedlinePlus
            searchPromises.push(
                this.createSearchPromise('MedlinePlus', () => this.medlinePlus.searchHealthTopics(term), term)
            );
            searchAttempts++;
            
            // OpenFDA
            searchPromises.push(
                this.createSearchPromise('OpenFDA-Labels', () => this.openFDA.searchDrugLabels(term), term)
            );
            searchAttempts++;
            
            searchPromises.push(
                this.createSearchPromise('OpenFDA-Events', () => this.openFDA.searchDrugEvents(term), term)
            );
            searchAttempts++;
            
            // ODPHP
            searchPromises.push(
                this.createSearchPromise('ODPHP', () => this.odphp.searchHealthTopics(term), term)
            );
            searchAttempts++;
        }
        
        console.log(`📡 Executing ${searchPromises.length} parallel API calls...`);
        
        // Execute all searches in parallel with timeout
        const results = await Promise.allSettled(searchPromises);
        
        console.log(`🏁 Completed ${results.length} API calls`);
        
        return { results, searchAttempts };
    }

    // ===== NEW: CREATE SEARCH PROMISE WITH METADATA =====
    createSearchPromise(apiName, searchFunction, term) {
        return searchFunction()
            .then(results => ({
                success: true,
                apiName,
                term,
                results: results || [],
                resultCount: (results || []).length
            }))
            .catch(error => ({
                success: false,
                apiName,
                term,
                error: error.message,
                results: []
            }));
    }

    // ===== NEW: PROCESS ALL SEARCH RESULTS =====
    processAllSearchResults(searchData, analysis) {
        const { results, searchAttempts } = searchData;
        analysis.searchAttempts = searchAttempts;
        
        const successfulAPIs = new Set();
        let successfulSearches = 0;
        
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.success && result.value.results.length > 0) {
                const { apiName, results: apiResults } = result.value;
                
                successfulAPIs.add(apiName);
                successfulSearches++;
                
                // Categorize results based on API name
                if (apiName.includes('RxNorm') || apiName.includes('FHIR-Medications')) {
                    analysis.medications.push(...apiResults.slice(0, 3));
                } else if (apiName.includes('FHIR-Conditions')) {
                    analysis.conditions.push(...apiResults.slice(0, 3));
                } else if (apiName.includes('ClinicalTrials')) {
                    analysis.clinicalTrials.push(...apiResults.slice(0, 2));
                } else if (apiName.includes('MedlinePlus')) {
                    analysis.healthInformation.push(...apiResults.slice(0, 2));
                } else if (apiName.includes('OpenFDA')) {
                    analysis.drugSafety.push(...apiResults.slice(0, 2));
                } else if (apiName.includes('ODPHP')) {
                    analysis.healthGuidance.push(...apiResults.slice(0, 2));
                }
            }
        }
        
        analysis.apiSources = Array.from(successfulAPIs);
        analysis.successfulSearches = successfulSearches;
        
        // Remove duplicates
        analysis.medications = this.removeDuplicates(analysis.medications, 'name');
        analysis.conditions = this.removeDuplicates(analysis.conditions, 'name');
        analysis.clinicalTrials = this.removeDuplicates(analysis.clinicalTrials, 'id');
        analysis.healthInformation = this.removeDuplicates(analysis.healthInformation, 'title');
        analysis.drugSafety = this.removeDuplicates(analysis.drugSafety, 'brandName');
        analysis.healthGuidance = this.removeDuplicates(analysis.healthGuidance, 'title');
    }

    // ===== NEW: ENHANCED SYMPTOM IDENTIFICATION =====
    async identifyAndEnrichAllSymptoms(userMessage, extractedTerms) {
        const symptoms = [];
        
        // First, check predefined symptoms (your existing logic)
        const predefinedSymptoms = this.identifyPredefinedSymptoms(userMessage);
        symptoms.push(...predefinedSymptoms);

        // Then, create dynamic symptoms for extracted terms
        for (const term of extractedTerms) {
            // Skip if we already have this as a predefined symptom
            if (!symptoms.some(s => s.name.toLowerCase().includes(term.toLowerCase()))) {
                const dynamicSymptom = this.createDynamicSymptom(term, userMessage);
                if (dynamicSymptom) {
                    symptoms.push(dynamicSymptom);
                }
            }
        }

        return symptoms;
    }

    // ===== NEW: CREATE DYNAMIC SYMPTOMS =====
    createDynamicSymptom(term, userMessage) {
        return {
            id: term.toLowerCase().replace(/\s+/g, '_'),
            name: term,
            severity: this.extractSeverity(userMessage, term),
            duration: this.extractDuration(userMessage, term),
            associatedSymptoms: this.findAssociatedSymptoms(userMessage, term),
            context: this.extractSymptomContext(userMessage, term),
            urgencyFactors: this.checkUrgencyFactors(userMessage, term),
            source: 'dynamic_extraction'
        };
    }

    // ===== NEW: IDENTIFY PREDEFINED SYMPTOMS (Enhanced) =====
    identifyPredefinedSymptoms(userMessage) {
        const symptoms = [];
        const messageLower = userMessage.toLowerCase();
        
        // Check against your existing symptom mappings
        for (const [symptomId, symptomData] of Object.entries(medicalMappings.symptoms)) {
            const hasKeyword = symptomData.keywords.some(keyword => 
                messageLower.includes(keyword.toLowerCase())
            );
            
            if (hasKeyword) {
                symptoms.push({
                    id: symptomId,
                    name: symptomData.name || symptomId.replace('_', ' '),
                    severity: this.extractSeverity(userMessage),
                    duration: this.extractDuration(userMessage),
                    associatedSymptoms: this.findAssociatedSymptoms(userMessage, symptomId),
                    context: this.extractSymptomContext(userMessage),
                    urgencyFactors: this.checkUrgencyFactors(userMessage),
                    relatedConditions: symptomData.relatedConditions || [],
                    source: 'predefined'
                });
            }
        }
        
        return symptoms;
    }

    // ===== ENHANCED CONFIDENCE CALCULATION =====
    calculateEnhancedConfidence(analysis) {
        let score = 0;
        
        // Base score from extracted terms
        score += Math.min(analysis.extractedTerms.length * 10, 40);
        
        // Search success rate
        if (analysis.searchAttempts > 0) {
            const successRate = analysis.successfulSearches / analysis.searchAttempts;
            score += successRate * 25;
        }
        
        // API diversity bonus
        const uniqueAPIs = new Set(analysis.apiSources.map(source => source.split('-')[0]));
        score += uniqueAPIs.size * 8; // Up to 48 points for all 6 API types
        
        // Data richness bonus
        if (analysis.medications.length > 0) score += 8;
        if (analysis.conditions.length > 0) score += 10;
        if (analysis.clinicalTrials.length > 0) score += 6;
        if (analysis.healthInformation.length > 0) score += 8;
        if (analysis.drugSafety.length > 0) score += 6;
        if (analysis.healthGuidance.length > 0) score += 8;
        if (analysis.preventiveRecommendations.length > 0) score += 10;
        
        // Symptom identification bonus
        score += Math.min(analysis.symptoms.length * 5, 15);
        
        // Emergency detection
        if (analysis.emergencyFactors.length > 0) score += 5;
        
        // Cap at 100
        score = Math.min(score, 100);
        
        if (score >= 85) return 'very_high';
        if (score >= 70) return 'high';
        if (score >= 50) return 'medium';
        return 'low';
    }

    // ===== KEEP ALL YOUR EXISTING METHODS =====
    
    // Extract severity from text
    extractSeverity(userMessage, specificTerm = '') {
        const severityIndicators = medicalMappings.severityIndicators;
        const messageLower = userMessage.toLowerCase();
        
        // Look for severity words near the specific term if provided
        let searchText = messageLower;
        if (specificTerm) {
            const termIndex = messageLower.indexOf(specificTerm.toLowerCase());
            if (termIndex !== -1) {
                // Look in a window around the term
                const start = Math.max(0, termIndex - 50);
                const end = Math.min(messageLower.length, termIndex + 50);
                searchText = messageLower.substring(start, end);
            }
        }
        
        for (const [level, indicators] of Object.entries(severityIndicators)) {
            if (indicators.some(indicator => searchText.includes(indicator))) {
                return level;
            }
        }
        
        return 'unknown';
    }
    
    // Extract duration from text
    extractDuration(userMessage, specificTerm = '') {
        const durationPatterns = medicalMappings.durationPatterns;
        const messageLower = userMessage.toLowerCase();
        
        for (const [type, patterns] of Object.entries(durationPatterns)) {
            if (patterns.some(pattern => messageLower.includes(pattern))) {
                return { type, value: null };
            }
        }
        
        // Look for specific time mentions
        const timeMatches = userMessage.match(/(\d+)\s*(day|week|month|hour|minute)s?/i);
        if (timeMatches) {
            return {
                type: 'specific',
                value: parseInt(timeMatches[1]),
                unit: timeMatches[2].toLowerCase()
            };
        }
        
        return { type: 'unknown', value: null };
    }
    
    // Find associated symptoms
    findAssociatedSymptoms(userMessage, primarySymptom) {
        const associated = [];
        const messageLower = userMessage.toLowerCase();
        
        // Look for conjunction patterns
        const patterns = [
            /(?:with|and|plus|along with|accompanied by)\s+([^.!?]+)/gi,
            /(?:also|additionally|plus)\s+([^.!?]+)/gi
        ];
        
        for (const pattern of patterns) {
            const matches = messageLower.matchAll(pattern);
            for (const match of matches) {
                if (match[1]) {
                    const extracted = this.textProcessor.extractMedicalTerms(match[1]);
                    associated.push(...extracted);
                }
            }
        }
        
        return [...new Set(associated)];
    }
    
    // Extract symptom context
    extractSymptomContext(userMessage, specificTerm = '') {
        const context = {};
        const messageLower = userMessage.toLowerCase();
        
        // Time of day
        if (messageLower.includes('morning')) context.timeOfDay = 'morning';
        else if (messageLower.includes('evening') || messageLower.includes('night')) context.timeOfDay = 'evening';
        else if (messageLower.includes('afternoon')) context.timeOfDay = 'afternoon';
        
        // Triggers
        if (messageLower.includes('after eating')) context.trigger = 'food';
        else if (messageLower.includes('when i move')) context.trigger = 'movement';
        else if (messageLower.includes('stressed')) context.trigger = 'stress';
        
        // Location
        if (messageLower.includes('at work')) context.location = 'work';
        else if (messageLower.includes('at home')) context.location = 'home';
        
        return context;
    }
    
    // Check urgency factors
    checkUrgencyFactors(userMessage, specificTerm = '') {
        const urgencyFactors = [];
        const messageLower = userMessage.toLowerCase();
        
        const urgentIndicators = [
            'severe', 'excruciating', 'unbearable', 'worst ever',
            'can\'t breathe', 'chest pain', 'crushing',
            'sudden', 'immediately', 'emergency',
            'blood', 'bleeding', 'vomiting blood',
            'high fever', 'difficulty breathing'
        ];
        
        for (const indicator of urgentIndicators) {
            if (messageLower.includes(indicator)) {
                urgencyFactors.push(indicator);
            }
        }
        
        return urgencyFactors;
    }
    
    // Assess emergency factors
    assessEmergencyFactors(symptoms, userMessage) {
        const emergencyFactors = [];
        const messageLower = userMessage.toLowerCase();
        
        // Check against emergency patterns
        for (const [conditionId, pattern] of Object.entries(medicalMappings.emergencyPatterns)) {
            const hasKeywords = pattern.keywords.some(keyword => 
                messageLower.includes(keyword.toLowerCase())
            );
            
            if (hasKeywords) {
                emergencyFactors.push({
                    condition: conditionId,
                    keywords: pattern.keywords,
                    urgency: 'emergency'
                });
            }
        }
        
        return emergencyFactors;
    }

    // Keep all your existing methods for recommendations, OTC medications, etc.
    async generateEnhancedRecommendationsWithODPHP(analysis) {
        const recommendations = {
            immediateActions: [],
            selfCare: [],
            whenToSeekCare: [],
            medications: [],
            lifestyle: [],
            additionalResources: [],
            clinicalOptions: [],
            preventiveActions: []
        };

        // Emergency recommendations
        if (analysis.emergencyFactors.length > 0) {
            recommendations.immediateActions.push('Seek immediate medical attention');
            recommendations.immediateActions.push('Call 911 if symptoms are severe');
            return recommendations;
        }

        // Add medication recommendations
        recommendations.medications = analysis.medications.slice(0, 5);

        // Add health information as resources
        for (const info of analysis.healthInformation) {
            recommendations.additionalResources.push({
                type: 'educational',
                title: info.title,
                summary: info.summary,
                source: 'MedlinePlus'
            });
        }

        // Add ODPHP guidance
        for (const guidance of analysis.healthGuidance) {
            recommendations.additionalResources.push({
                type: 'health_guidance',
                title: guidance.title,
                summary: guidance.summary,
                source: 'MyHealthfinder'
            });
        }

        // Add preventive recommendations
        for (const prevRec of analysis.preventiveRecommendations) {
            recommendations.preventiveActions.push({
                type: 'preventive',
                title: prevRec.title,
                summary: prevRec.summary,
                source: 'MyHealthfinder'
            });
        }

        // Add clinical trials
        for (const trial of analysis.clinicalTrials) {
            if (trial.status === 'Recruiting') {
                recommendations.clinicalOptions.push({
                    type: 'clinical_trial',
                    title: trial.title,
                    phase: trial.phase,
                    condition: trial.condition,
                    source: 'ClinicalTrials.gov'
                });
            }
        }

        return recommendations;
    }

    // Utility method to remove duplicates
    removeDuplicates(array, key) {
        const seen = new Set();
        return array.filter(item => {
            const keyValue = item[key];
            if (seen.has(keyValue)) {
                return false;
            }
            seen.add(keyValue);
            return true;
        });
    }

    // Keep all your other existing methods...
    async getAPIStatus() {
        // Your existing implementation
        console.log('🔍 Checking medical API status...');
        
        const status = {
            timestamp: new Date().toISOString(),
            overall: 'healthy',
            services: {},
            cache: this.cache.getStats(),
            coverage: {
                drugDatabase: 0,
                conditionDatabase: 0,
                safetyDatabase: 0,
                clinicalTrials: 0,
                healthEducation: 0,
                preventiveGuidance: 0
            }
        };

        const [rxnormStatus, fhirStatus, clinicalTrialsStatus, medlinePlusStatus, openFDAStatus, odphpStatus] = await Promise.all([
            this.rxnorm.healthCheck(),
            this.fhir.healthCheck(),
            this.clinicalTrials.healthCheck(),
            this.medlinePlus.healthCheck(),
            this.openFDA.healthCheck(),
            this.odphp.healthCheck()
        ]);

        status.services = {
            rxnorm: rxnormStatus,
            fhir: fhirStatus,
            clinicalTrials: clinicalTrialsStatus,
            medlinePlus: medlinePlusStatus,
            openFDA: openFDAStatus,
            odphp: odphpStatus
        };

        // Calculate overall status
        const healthyServices = Object.values(status.services).filter(s => s.status === 'healthy').length;
        const totalServices = Object.keys(status.services).length;
        
        if (healthyServices === totalServices) {
            status.overall = 'excellent';
        } else if (healthyServices >= totalServices * 0.8) {
            status.overall = 'good';
        } else if (healthyServices >= totalServices * 0.6) {
            status.overall = 'fair';
        } else {
            status.overall = 'degraded';
        }

        return status;
    }

    clearCache() {
        this.cache.clear();
        console.log('🧹 Medical API cache cleared');
    }

    getCacheStats() {
        return this.cache.getStats();
    }
}

// ===== ENHANCED TEXT PROCESSOR =====
class MedicalTextProcessor {
    constructor() {
        // Comprehensive medical terminology database
        this.medicalTerms = [
            // Body parts
            'head', 'brain', 'skull', 'neck', 'throat', 'chest', 'heart', 'lung', 'lungs', 'stomach', 'abdomen',
            'back', 'spine', 'arm', 'arms', 'leg', 'legs', 'knee', 'knees', 'shoulder', 'shoulders', 'hip', 'hips',
            'ankle', 'ankles', 'wrist', 'wrists', 'hand', 'hands', 'foot', 'feet', 'finger', 'fingers', 'toe', 'toes',
            'eye', 'eyes', 'ear', 'ears', 'nose', 'mouth', 'tooth', 'teeth', 'jaw', 'skin', 'muscle', 'muscles',
            'joint', 'joints', 'bone', 'bones', 'liver', 'kidney', 'kidneys', 'bladder',
            
            // Symptoms and conditions
            'pain', 'ache', 'aches', 'hurt', 'hurts', 'sore', 'tender', 'swollen', 'swelling', 'inflammation', 'infection',
            'fever', 'temperature', 'chills', 'sweating', 'hot', 'cold', 'shivering',
            'nausea', 'vomiting', 'sick', 'queasy', 'throw up', 'throwing up', 'diarrhea', 'constipation',
            'headache', 'headaches', 'migraine', 'migraines', 'dizziness', 'dizzy', 'lightheaded', 'vertigo',
            'cough', 'coughing', 'sneeze', 'sneezing', 'congestion', 'runny nose', 'stuffy', 'sinus', 'sinuses',
            'fatigue', 'tired', 'exhausted', 'weakness', 'weak', 'energy', 'lethargy',
            'rash', 'itchy', 'itch', 'scratch', 'scratching', 'bumps', 'spots', 'bruise', 'bruises',
            'anxiety', 'anxious', 'stress', 'stressed', 'depression', 'depressed', 'mood', 'sleep', 'insomnia',
            'bleeding', 'blood', 'pressure', 'circulation', 'palpitations',
            'cramps', 'cramping', 'spasms', 'twitching', 'numbness', 'tingling',
            
            // Descriptors
            'sharp', 'dull', 'throbbing', 'pulsing', 'burning', 'tingling', 'numb', 'shooting',
            'mild', 'moderate', 'severe', 'intense', 'chronic', 'acute', 'persistent',
            'sudden', 'gradual', 'constant', 'intermittent', 'occasional', 'frequent',
            
            // Medical conditions
            'diabetes', 'diabetic', 'hypertension', 'asthma', 'allergies', 'allergic', 'arthritis',
            'pneumonia', 'bronchitis', 'flu', 'influenza', 'cold', 'covid', 'coronavirus',
            'cancer', 'tumor', 'infection', 'virus', 'viral', 'bacteria', 'bacterial',
            'stroke', 'seizure', 'epilepsy', 'migraine', 'concussion',
            
            // Medications and treatments
            'medication', 'medications', 'medicine', 'medicines', 'pills', 'pill', 'prescription',
            'treatment', 'therapy', 'surgery', 'procedure', 'injection', 'vaccine', 'vaccination'
        ];

        // Medical phrase patterns for extraction
        this.medicalPhrases = [
            // Pain patterns
            /(?:pain|ache|hurt|sore|tender)\s+(?:in|on|around|near)\s+(?:my\s+)?(\w+(?:\s+\w+)?)/gi,
            /(?:my\s+)?(\w+(?:\s+\w+)?)\s+(?:pain|ache|hurt|hurts|aches)/gi,
            
            // Symptom patterns
            /(?:i\s+have|experiencing|feeling|suffer from)\s+(?:a\s+|an\s+)?(\w+(?:\s+\w+)?)/gi,
            /(?:my\s+)?(\w+)\s+(?:is|are|feels?)\s+(\w+)/gi,
            
            // Condition patterns
            /(?:diagnosed with|have|suffering from)\s+(\w+(?:\s+\w+)?)/gi,
            
            // Medication patterns
            /(?:taking|prescribed|on)\s+(\w+(?:\s+\w+)?)/gi
        ];
    }

    extractMedicalTerms(text) {
        const extractedTerms = new Set();
        const textLower = text.toLowerCase();

        // Extract individual medical terms
        for (const term of this.medicalTerms) {
            if (textLower.includes(term)) {
                extractedTerms.add(term);
            }
        }

        // Extract medical phrases using patterns
        for (const pattern of this.medicalPhrases) {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                if (match[1] && match[1].length > 2) {
                    extractedTerms.add(match[1].trim());
                }
                if (match[2] && match[2].length > 2) {
                    extractedTerms.add(match[2].trim());
                }
            }
        }

        // Extract compound symptoms
        const compoundPatterns = [
            /(\w+\s+\w+)\s+(?:and|with|plus)\s+(\w+(?:\s+\w+)?)/gi,
            /(\w+)\s+(?:and|with|accompanied by)\s+(\w+(?:\s+\w+)?)/gi
        ];

        for (const pattern of compoundPatterns) {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                if (match[1] && match[1].length > 2) extractedTerms.add(match[1].trim());
                if (match[2] && match[2].length > 2) extractedTerms.add(match[2].trim());
            }
        }

        // Filter out common words and very short terms
        const commonWords = [
            'the', 'and', 'but', 'for', 'are', 'with', 'have', 'this', 'that', 'not', 'you', 'all',
            'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his',
            'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its',
            'let', 'put', 'say', 'she', 'too', 'use', 'very', 'when', 'will', 'any', 'may', 'much'
        ];

        const filtered = Array.from(extractedTerms).filter(term => 
            term.length >= 3 && 
            !commonWords.includes(term.toLowerCase()) &&
            !/^\d+$/.test(term) // Exclude pure numbers
        );

        return filtered;
    }

    generateSearchVariations(text) {
        const variations = new Set();
        const terms = this.extractMedicalTerms(text);

        // Add original terms
        terms.forEach(term => variations.add(term));

        // Generate singular/plural variations
        for (const term of terms) {
            if (term.endsWith('s') && term.length > 3) {
                variations.add(term.slice(0, -1)); // Remove 's'
            } else {
                variations.add(term + 's'); // Add 's'
            }
            
            if (term.endsWith('ies')) {
                variations.add(term.slice(0, -3) + 'y'); // allergies -> allergy
            }
            
            if (term.endsWith('es')) {
                variations.add(term.slice(0, -2)); // aches -> ache
            }
        }

        // Generate medical synonyms
        const synonymMap = {
            'pain': ['ache', 'hurt', 'discomfort', 'soreness'],
            'nausea': ['sick', 'queasy', 'nauseated'],
            'fever': ['temperature', 'pyrexia', 'hyperthermia'],
            'headache': ['head pain', 'cephalgia', 'migraine'],
            'stomach': ['abdominal', 'gastric', 'belly', 'tummy'],
            'chest': ['thoracic', 'cardiac'],
            'dizzy': ['dizziness', 'vertigo', 'lightheaded'],
            'tired': ['fatigue', 'exhaustion', 'lethargy'],
            'cough': ['coughing', 'tussis'],
            'rash': ['skin irritation', 'dermatitis'],
            'anxiety': ['anxious', 'stress', 'worry', 'nervous'],
            'depression': ['depressed', 'sad', 'down'],
            'diarrhea': ['loose stool', 'loose bowel movement'],
            'constipation': ['blocked', 'backed up']
        };

        for (const term of terms) {
            const termLower = term.toLowerCase();
            if (synonymMap[termLower]) {
                synonymMap[termLower].forEach(synonym => variations.add(synonym));
            }
        }

        return Array.from(variations);
    }
}

module.exports = MedicalAPIService;