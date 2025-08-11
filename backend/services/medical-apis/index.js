// backend/services/medical-apis/index.js
// Enhanced Main Medical API Service - Now with Clinical Trials, MedlinePlus, and OpenFDA

const RxNormService = require('./rxnorm-service');
const FHIRService = require('./fhir-service');
const ClinicalTrialsService = require('.clinical-trials-service');
const { MedlinePlusService, OpenFDAService } = require('./enhanced-medical-services');
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
        
        // Service status tracking
        this.serviceStatus = {
            rxnorm: 'unknown',
            fhir: 'unknown',
            clinicalTrials: 'unknown',
            medlinePlus: 'unknown',
            openFDA: 'unknown',
            lastHealthCheck: null
        };
        
        console.log('🏥 Enhanced Medical API Service initialized with 5 databases');
    }

    // ===== ENHANCED SYMPTOM ANALYSIS =====

    async analyzeSymptoms(symptoms, userMessage) {
        console.log('🔍 Starting comprehensive symptom analysis with enhanced databases...');
        
        const analysis = {
            userMessage,
            symptoms: await this.identifyAndEnrichSymptoms(userMessage),
            conditions: [],
            medications: [],
            clinicalTrials: [],
            healthInformation: [],
            drugSafety: [],
            emergencyFactors: [],
            recommendations: {},
            apiSources: [],
            confidence: 'medium',
            timestamp: new Date().toISOString()
        };

        try {
            // 1. Enrich identified symptoms with ALL medical databases
            for (const symptom of analysis.symptoms) {
                console.log(`📋 Comprehensively enriching symptom: ${symptom.name}`);
                
                // Parallel database queries for speed
                const [fhirConditions, healthInfo, trials] = await Promise.all([
                    this.fhir.searchConditions(symptom.name).catch(e => []),
                    this.medlinePlus.searchHealthTopics(symptom.name).catch(e => []),
                    this.clinicalTrials.searchTrialsByCondition(symptom.name).catch(e => [])
                ]);
                
                // Add results
                if (fhirConditions.length > 0) {
                    analysis.conditions.push(...fhirConditions.slice(0, 3));
                    analysis.apiSources.push('FHIR-Conditions');
                }
                
                if (healthInfo.length > 0) {
                    analysis.healthInformation.push(...healthInfo);
                    analysis.apiSources.push('MedlinePlus');
                }
                
                if (trials.length > 0) {
                    analysis.clinicalTrials.push(...trials.slice(0, 2));
                    analysis.apiSources.push('ClinicalTrials.gov');
                }
                
                // Get enhanced medication recommendations
                const medications = await this.getEnhancedMedicationRecommendations(symptom);
                if (medications.length > 0) {
                    analysis.medications.push(...medications);
                }
            }

            // 2. Emergency assessment (unchanged)
            analysis.emergencyFactors = this.assessEmergencyFactors(analysis.symptoms, userMessage);
            
            // 3. Enhanced recommendations with new data sources
            analysis.recommendations = await this.generateEnhancedRecommendations(analysis);
            
            // 4. Calculate enhanced confidence
            analysis.confidence = this.calculateEnhancedConfidence(analysis);
            
            // Remove duplicates and limit results
            analysis.conditions = this.removeDuplicates(analysis.conditions, 'id').slice(0, 5);
            analysis.medications = this.removeDuplicates(analysis.medications, 'name').slice(0, 8);
            analysis.healthInformation = this.removeDuplicates(analysis.healthInformation, 'title').slice(0, 3);
            analysis.clinicalTrials = this.removeDuplicates(analysis.clinicalTrials, 'id').slice(0, 3);
            analysis.apiSources = [...new Set(analysis.apiSources)];
            
            console.log(`✅ Enhanced analysis complete. Sources: ${analysis.apiSources.join(', ')}`);
            
        } catch (error) {
            console.error('❌ Error in enhanced symptom analysis:', error);
            analysis.error = error.message;
            analysis.confidence = 'low';
        }

        console.log('🔍 API USAGE SUMMARY:');
        console.log(`   📊 Total APIs called: ${analysis.apiSources.length}`);
        console.log(`   🎯 APIs used: ${analysis.apiSources.join(', ')}`);
        console.log(`   💊 Medications found: ${analysis.medications?.length || 0}`);
        console.log(`   🏥 Conditions found: ${analysis.conditions?.length || 0}`);
        console.log(`   🔬 Clinical trials: ${analysis.clinicalTrials?.length || 0}`);
        console.log(`   📚 Health info: ${analysis.healthInformation?.length || 0}`);
        console.log(`   ⚠️  Safety data: ${analysis.drugSafety?.length || 0}`);
        console.log(`   🎲 Confidence: ${analysis.confidence}`);

        return analysis;
    }

    // ===== ENHANCED MEDICATION LOOKUP =====

    async comprehensiveMedicationLookup(medicationName) {
        console.log(`💊 Starting comprehensive medication lookup for: ${medicationName}`);
        
        const results = {
            medication: medicationName,
            found: false,
            rxnorm: {},
            fhir: {},
            openFDA: {
                labels: [],
                adverseEvents: []
            },
            interactions: [],
            recommendations: [],
            warnings: [],
            safetyInfo: [],
            apiSources: [],
            timestamp: new Date().toISOString()
        };

        try {
            // Search all databases in parallel for speed
            const [rxnormData, fhirData, fdaLabels, fdaEvents] = await Promise.all([
                this.rxnorm.comprehensiveDrugLookup(medicationName),
                this.fhir.searchMedications(medicationName),
                this.openFDA.searchDrugLabels(medicationName).catch(e => []),
                this.openFDA.searchDrugEvents(medicationName).catch(e => [])
            ]);

            // Process RxNorm results
            if (rxnormData.found) {
                results.found = true;
                results.rxnorm = rxnormData;
                results.interactions = rxnormData.interactions || [];
                results.apiSources.push('RxNorm');
            }

            // Process FHIR results
            if (fhirData.length > 0) {
                results.found = true;
                results.fhir = {
                    medications: fhirData,
                    count: fhirData.length
                };
                results.apiSources.push('FHIR');
            }

            // Process OpenFDA results
            if (fdaLabels.length > 0) {
                results.found = true;
                results.openFDA.labels = fdaLabels;
                results.apiSources.push('OpenFDA-Labels');
            }

            if (fdaEvents.length > 0) {
                results.openFDA.adverseEvents = fdaEvents;
                results.apiSources.push('OpenFDA-Events');
            }

            // Generate enhanced warnings and recommendations
            if (results.found) {
                results.warnings = this.generateEnhancedMedicationWarnings(medicationName, results);
                results.recommendations = this.generateEnhancedMedicationRecommendations(medicationName, results);
                results.safetyInfo = this.compileSafetyInformation(results);
            }

            console.log(`✅ Enhanced medication lookup complete. Found in ${results.apiSources.join(', ')}`);
            
        } catch (error) {
            console.error('❌ Error in enhanced medication lookup:', error);
            results.error = error.message;
        }

        return results;
    }

    // ===== ENHANCED MEDICATION RECOMMENDATIONS =====

    async getEnhancedMedicationRecommendations(symptom) {
        const recommendations = [];
        
        try {
            // Get OTC recommendations (existing)
            const otcMeds = this.getOTCRecommendations(symptom.id);
            recommendations.push(...otcMeds);
            
            // Search for prescription alternatives with safety data
            const searchTerms = [
                `${symptom.name} treatment`,
                `${symptom.name} medication`
            ];
            
            for (const term of searchTerms) {
                try {
                    const rxnormResults = await this.rxnorm.searchDrugs(term);
                    for (const med of rxnormResults.slice(0, 2)) {
                        // Get FDA safety data for this medication
                        const safetyData = await this.openFDA.searchDrugEvents(med.name).catch(() => []);
                        
                        recommendations.push({
                            name: med.name,
                            type: 'prescription',
                            rxcui: med.rxcui,
                            source: 'RxNorm',
                            indication: symptom.name,
                            safetyProfile: safetyData.length > 0 ? 'FDA data available' : 'Limited safety data',
                            adverseEvents: safetyData.slice(0, 3)
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to get enhanced medication data for ${term}:`, error.message);
                }
            }
            
        } catch (error) {
            console.error('Error getting enhanced medication recommendations:', error);
        }

        return recommendations;
    }

    // ===== ENHANCED RECOMMENDATIONS =====

    async generateEnhancedRecommendations(analysis) {
        const recommendations = {
            immediateActions: [],
            selfCare: [],
            whenToSeekCare: [],
            medications: [],
            lifestyle: [],
            additionalResources: [],
            clinicalOptions: []
        };

        // Emergency recommendations (unchanged)
        if (analysis.emergencyFactors.length > 0) {
            recommendations.immediateActions.push('Seek immediate medical attention');
            recommendations.immediateActions.push('Call 911 if symptoms are severe');
            return recommendations;
        }

        // Enhanced recommendations using new data sources
        for (const symptom of analysis.symptoms) {
            // Self-care from existing mappings
            const selfCare = this.getSymptomSelfCare(symptom.id);
            recommendations.selfCare.push(...selfCare);

            // When to seek care (enhanced)
            const seekCare = this.getEnhancedSeekCareGuidance(symptom, analysis);
            recommendations.whenToSeekCare.push(...seekCare);
        }

        // Add MedlinePlus educational resources
        if (analysis.healthInformation.length > 0) {
            for (const info of analysis.healthInformation) {
                recommendations.additionalResources.push({
                    type: 'educational',
                    title: info.title,
                    summary: info.summary,
                    source: 'MedlinePlus'
                });
            }
        }

        // Add clinical trial options
        if (analysis.clinicalTrials.length > 0) {
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
        }

        // Medication recommendations (already enhanced)
        recommendations.medications = analysis.medications.slice(0, 5);

        // Remove duplicates
        recommendations.selfCare = [...new Set(recommendations.selfCare)];
        recommendations.whenToSeekCare = [...new Set(recommendations.whenToSeekCare)];

        return recommendations;
    }

    // ===== ENHANCED SAFETY INFORMATION =====

    compileSafetyInformation(medicationResults) {
        const safetyInfo = [];
        
        // From OpenFDA labels
        if (medicationResults.openFDA.labels.length > 0) {
            for (const label of medicationResults.openFDA.labels) {
                if (label.warnings) {
                    safetyInfo.push({
                        type: 'warning',
                        content: label.warnings,
                        source: 'FDA Label'
                    });
                }
                if (label.contraindications) {
                    safetyInfo.push({
                        type: 'contraindication',
                        content: label.contraindications,
                        source: 'FDA Label'
                    });
                }
            }
        }
        
        // From adverse events
        if (medicationResults.openFDA.adverseEvents.length > 0) {
            const commonEvents = medicationResults.openFDA.adverseEvents
                .filter(event => event.frequency === 'Common')
                .slice(0, 3);
                
            if (commonEvents.length > 0) {
                safetyInfo.push({
                    type: 'adverse_events',
                    content: `Common reported reactions: ${commonEvents.map(e => e.reaction).join(', ')}`,
                    source: 'FDA Adverse Event Reports'
                });
            }
        }
        
        return safetyInfo;
    }

    // ===== ENHANCED CONFIDENCE CALCULATION =====

    calculateEnhancedConfidence(analysis) {
        let score = 0;
        
        // Base score from number of symptoms identified
        score += analysis.symptoms.length * 20;
        
        // Bonus for detailed symptom information
        for (const symptom of analysis.symptoms) {
            if (symptom.severity !== 'unknown') score += 10;
            if (symptom.duration.type !== 'unknown') score += 10;
            if (symptom.associatedSymptoms.length > 0) score += 5;
        }
        
        // Enhanced bonus for multiple database matches
        if (analysis.conditions.length > 0) score += 15;
        if (analysis.medications.length > 0) score += 10;
        if (analysis.healthInformation.length > 0) score += 15; // NEW: MedlinePlus data
        if (analysis.clinicalTrials.length > 0) score += 10; // NEW: Clinical trials
        if (analysis.apiSources.includes('OpenFDA-Labels')) score += 12; // NEW: FDA data
        if (analysis.apiSources.includes('OpenFDA-Events')) score += 8; // NEW: Safety data
        
        // Bonus for multiple API sources (cross-validation)
        const uniqueSources = [...new Set(analysis.apiSources)];
        if (uniqueSources.length >= 3) score += 20;
        if (uniqueSources.length >= 4) score += 10;
        if (uniqueSources.length >= 5) score += 10;
        
        // Cap at 100 and convert to confidence level
        score = Math.min(score, 100);
        
        if (score >= 85) return 'very_high';
        if (score >= 70) return 'high';
        if (score >= 50) return 'medium';
        return 'low';
    }

    // ===== ENHANCED WARNING GENERATION =====

    generateEnhancedMedicationWarnings(medicationName, results) {
        const warnings = [];
        
        // From FDA labels
        if (results.openFDA.labels.length > 0) {
            for (const label of results.openFDA.labels) {
                if (label.warnings) {
                    warnings.push(`FDA Warning: ${label.warnings.substring(0, 200)}...`);
                }
            }
        }
        
        // From adverse events data
        if (results.openFDA.adverseEvents.length > 0) {
            const seriousEvents = results.openFDA.adverseEvents
                .filter(event => event.frequency === 'Common' && event.reportCount > 10);
            
            if (seriousEvents.length > 0) {
                warnings.push(`Common reported reactions include: ${seriousEvents.slice(0, 3).map(e => e.reaction).join(', ')}`);
            }
        }
        
        // Check interactions from RxNorm
        if (results.interactions && results.interactions.length > 0) {
            warnings.push(`Has ${results.interactions.length} known drug interactions`);
        }
        
        // Generic warnings
        warnings.push('Always consult healthcare provider before starting new medications');
        warnings.push('Check with pharmacist about drug interactions');
        
        return warnings;
    }

    generateEnhancedMedicationRecommendations(medicationName, results) {
        const recommendations = [];
        
        // From FDA label data
        if (results.openFDA.labels.length > 0) {
            const label = results.openFDA.labels[0];
            if (label.dosageAndAdministration) {
                recommendations.push(`Dosage guidance available in FDA labeling`);
            }
        }
        
        recommendations.push('Discuss with your doctor or pharmacist');
        recommendations.push('Follow prescribed dosage instructions');
        recommendations.push('Report any side effects to your healthcare provider');
        recommendations.push('Monitor for the reported adverse reactions');
        
        return recommendations;
    }

    // ===== ENHANCED SEEK CARE GUIDANCE =====

    getEnhancedSeekCareGuidance(symptom, analysis) {
        const guidance = [];
        
        if (symptom.severity === 'severe') {
            guidance.push('Seek medical attention for severe symptoms');
        }
        
        if (symptom.duration && symptom.duration.type === 'chronic') {
            guidance.push('Consult healthcare provider for persistent symptoms');
        }
        
        if (symptom.urgencyFactors && symptom.urgencyFactors.length > 0) {
            guidance.push('Contact healthcare provider due to concerning features');
        }
        
        // Enhanced guidance based on available clinical trials
        if (analysis.clinicalTrials.length > 0) {
            const recruitingTrials = analysis.clinicalTrials.filter(t => t.status === 'Recruiting');
            if (recruitingTrials.length > 0) {
                guidance.push('Clinical trials may be available for your condition');
            }
        }
        
        // Enhanced guidance based on health information
        if (analysis.healthInformation.length > 0) {
            guidance.push('Educational resources available from MedlinePlus');
        }

        return guidance;
    }

    // ===== ENHANCED API STATUS =====

    async getAPIStatus() {
        console.log('🔍 Checking enhanced medical API status...');
        
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
                healthEducation: 0
            }
        };

        // Check all services in parallel
        const [rxnormStatus, fhirStatus, clinicalTrialsStatus, medlinePlusStatus, openFDAStatus] = await Promise.all([
            this.rxnorm.healthCheck(),
            this.fhir.healthCheck(),
            this.clinicalTrials.healthCheck(),
            this.medlinePlus.healthCheck(),
            this.openFDA.healthCheck()
        ]);

        status.services.rxnorm = rxnormStatus;
        status.services.fhir = fhirStatus;
        status.services.clinicalTrials = clinicalTrialsStatus;
        status.services.medlinePlus = medlinePlusStatus;
        status.services.openFDA = openFDAStatus;

        // Calculate coverage scores
        status.coverage.drugDatabase = this.calculateCoverage([rxnormStatus, fhirStatus]);
        status.coverage.conditionDatabase = this.calculateCoverage([fhirStatus, medlinePlusStatus]);
        status.coverage.safetyDatabase = this.calculateCoverage([openFDAStatus]);
        status.coverage.clinicalTrials = this.calculateCoverage([clinicalTrialsStatus]);
        status.coverage.healthEducation = this.calculateCoverage([medlinePlusStatus]);

        // Update overall status
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

        this.serviceStatus = {
            rxnorm: rxnormStatus.status,
            fhir: fhirStatus.status,
            clinicalTrials: clinicalTrialsStatus.status,
            medlinePlus: medlinePlusStatus.status,
            openFDA: openFDAStatus.status,
            lastHealthCheck: new Date().toISOString()
        };

        return status;
    }

    calculateCoverage(serviceStatuses) {
        const healthyCount = serviceStatuses.filter(s => s.status === 'healthy').length;
        return Math.round((healthyCount / serviceStatuses.length) * 100);
    }

    // ===== UTILITY METHODS (Inherited from original) =====

    async identifyAndEnrichSymptoms(message) {
        // Keep existing implementation
        const identifiedSymptoms = [];
        const messageLower = message.toLowerCase();

        console.log('🔍 Identifying symptoms in message...');

        for (const [symptomId, mapping] of Object.entries(medicalMappings.symptoms)) {
            const mentioned = mapping.keywords.some(keyword => messageLower.includes(keyword)) ||
                            messageLower.includes(symptomId.replace('_', ' '));

            if (mentioned) {
                console.log(`📍 Found symptom: ${symptomId}`);
                
                const enrichedSymptom = {
                    id: symptomId,
                    name: symptomId.replace('_', ' '),
                    icd10: mapping.icd10,
                    snomedCT: mapping.snomedCT,
                    severity: this.extractSeverity(messageLower, mapping.severityClues),
                    duration: this.extractDuration(messageLower),
                    associatedSymptoms: this.findAssociatedSymptoms(messageLower, mapping.associatedSymptoms),
                    context: this.extractSymptomContext(messageLower, symptomId),
                    urgencyFactors: this.checkUrgencyFactors(messageLower, mapping.urgencyFactors),
                    relatedConditions: mapping.relatedConditions
                };
                
                identifiedSymptoms.push(enrichedSymptom);
            }
        }

        return identifiedSymptoms;
    }

    getOTCRecommendations(symptomId) {
        const recommendations = [];
        
        const symptomToCategory = {
            'headache': ['pain_relievers'],
            'fever': ['pain_relievers'],
            'nausea': ['anti_nausea'],
            'cough': ['cough_suppressants'],
            'fatigue': [],
            'dizziness': []
        };

        const categories = symptomToCategory[symptomId] || [];
        
        for (const category of categories) {
            const medications = medicalMappings.medicationCategories[category];
            if (medications) {
                for (const med of medications.medications) {
                    recommendations.push({
                        name: med.name,
                        type: 'otc',
                        activeIngredient: med.activeIngredient,
                        dosage: med.dosage,
                        warnings: med.warnings,
                        contraindications: med.contraindications,
                        source: 'OTC-Database',
                        indication: symptomId.replace('_', ' ')
                    });
                }
            }
        }

        return recommendations;
    }

    assessEmergencyFactors(symptoms, message) {
        const emergencyFactors = [];
        const messageLower = message.toLowerCase();

        console.log('🚨 Assessing emergency factors...');

        for (const [conditionId, pattern] of Object.entries(medicalMappings.emergencyPatterns)) {
            const hasKeywords = pattern.keywords.some(keyword => messageLower.includes(keyword));
            const hasSymptoms = pattern.symptoms.some(symptom => 
                symptoms.some(s => s.id === symptom || messageLower.includes(symptom))
            );
            const hasRedFlags = pattern.redFlags.some(flag => messageLower.includes(flag));

            if (hasKeywords || (hasSymptoms && hasRedFlags)) {
                emergencyFactors.push({
                    condition: conditionId,
                    factor: pattern.keywords[0],
                    priority: 'critical',
                    evidence: { hasKeywords, hasSymptoms, hasRedFlags }
                });
                console.log(`🚨 Emergency factor detected: ${conditionId}`);
            }
        }

        for (const symptom of symptoms) {
            if (symptom.urgencyFactors && symptom.urgencyFactors.length > 0) {
                emergencyFactors.push({
                    condition: `${symptom.name}_urgent`,
                    factor: `Urgent ${symptom.name} presentation`,
                    priority: 'high',
                    evidence: { urgencyFactors: symptom.urgencyFactors }
                });
            }
        }

        return emergencyFactors;
    }

    getSymptomSelfCare(symptomId) {
        const selfCareMap = {
            'headache': [
                'Rest in a quiet, dark room',
                'Apply cold or warm compress',
                'Stay hydrated',
                'Practice relaxation techniques'
            ],
            'fever': [
                'Get plenty of rest',
                'Drink lots of fluids',
                'Dress lightly',
                'Monitor temperature regularly'
            ],
            'nausea': [
                'Eat small, frequent meals',
                'Avoid strong odors',
                'Try ginger or peppermint',
                'Stay hydrated with small sips'
            ],
            'cough': [
                'Stay hydrated',
                'Use humidifier or steam',
                'Avoid irritants like smoke',
                'Try throat lozenges'
            ]
        };

        return selfCareMap[symptomId] || ['Monitor symptoms and rest'];
    }

    extractSeverity(message, severityClues) {
        if (!severityClues) return 'unknown';
        
        for (const [level, clues] of Object.entries(severityClues)) {
            if (clues.some(clue => message.includes(clue))) {
                return level;
            }
        }
        
        const ratingMatch = message.match(/(\d+)\s*(?:out of|\/)\s*10/);
        if (ratingMatch) {
            const rating = parseInt(ratingMatch[1]);
            if (rating <= 3) return 'mild';
            if (rating <= 6) return 'moderate';
            return 'severe';
        }

        return 'unknown';
    }

    extractDuration(message) {
        for (const [type, patterns] of Object.entries(medicalMappings.durationPatterns)) {
            if (patterns.some(pattern => message.includes(pattern))) {
                return { type };
            }
        }

        const timePatterns = [
            { pattern: /(\d+)\s*(hour|hr)s?/i, unit: 'hours' },
            { pattern: /(\d+)\s*(day)s?/i, unit: 'days' },
            { pattern: /(\d+)\s*(week)s?/i, unit: 'weeks' }
        ];

        for (const timePattern of timePatterns) {
            const match = message.match(timePattern.pattern);
            if (match) {
                return {
                    value: parseInt(match[1]),
                    unit: timePattern.unit,
                    type: timePattern.unit === 'hours' ? 'acute' : 'subacute'
                };
            }
        }

        return { type: 'unknown' };
    }

    findAssociatedSymptoms(message, possibleAssociatedSymptoms) {
        const found = [];
        
        for (const symptom of possibleAssociatedSymptoms) {
            if (message.includes(symptom)) {
                found.push(symptom);
            }
        }
        
        return found;
    }

    extractSymptomContext(message, symptomId) {
        const context = {};
        
        const triggers = {
            'stress': /stress|anxiety|worry/i,
            'activity': /exercise|activity|movement/i,
            'food': /eating|food|meal/i
        };
        
        for (const [trigger, pattern] of Object.entries(triggers)) {
            if (pattern.test(message)) {
                context.triggers = context.triggers || [];
                context.triggers.push(trigger);
            }
        }
        
        return context;
    }

    checkUrgencyFactors(message, urgencyFactors) {
        const found = [];
        
        for (const factor of urgencyFactors) {
            if (message.includes(factor)) {
                found.push(factor);
            }
        }
        
        return found;
    }

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

    // Clear cache
    clearCache() {
        this.cache.clear();
        console.log('🧹 Enhanced Medical API cache cleared');
    }

    // Get cache statistics
    getCacheStats() {
        return this.cache.getStats();
    }

    // Add to end of existing MedicalAPIService class in index.js

    // Initialize enhanced systems connection
    initializeEnhancedSystems(claudeService) {
        if (claudeService && claudeService.setMedicalAPIService) {
            claudeService.setMedicalAPIService(this);
            console.log('🔗 Enhanced systems connected to medical APIs');
        }
    }

    // Enhanced symptom analysis with adaptive querying
    async enhancedAnalyzeSymptoms(symptoms, userMessage, sessionId = 'default') {
        console.log('🧠 Starting enhanced symptom analysis...');
        
        // Use existing analysis as base
        const baseAnalysis = await this.analyzeSymptoms(symptoms, userMessage);
        
        // Enhance with adaptive intelligence if available
        if (this.adaptiveQuery) {
            try {
                const adaptiveResults = await this.adaptiveQuery.intelligentSymptomAnalysis(
                    userMessage, 
                    [] // conversation history would come from session
                );
                
                // Merge results
                baseAnalysis.adaptiveInsights = adaptiveResults.synthesized;
                baseAnalysis.queryStrategy = adaptiveResults.metadata.queryStrategy;
                
            } catch (error) {
                console.warn('⚠️ Adaptive query enhancement failed:', error.message);
            }
        }
        
        return baseAnalysis;
    }
}

module.exports = MedicalAPIService;