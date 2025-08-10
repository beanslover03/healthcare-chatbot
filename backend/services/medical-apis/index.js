// backend/services/medical-apis/index.js
// Main Medical API Service - Coordinates all medical database services

const RxNormService = require('./rxnorm-service');
const FHIRService = require('./fhir-service');
const CacheManager = require('../utils/cache-manager');
const medicalMappings = require('../../config/medical-mappings');

class MedicalAPIService {
    constructor() {
        // Initialize cache manager
        this.cache = new CacheManager();
        
        // Initialize individual services
        this.rxnorm = new RxNormService(this.cache);
        this.fhir = new FHIRService(this.cache);
        
        // Service status tracking
        this.serviceStatus = {
            rxnorm: 'unknown',
            fhir: 'unknown',
            lastHealthCheck: null
        };
        
        console.log('🏥 Medical API Service initialized with cache management');
    }

    // ===== MAIN PUBLIC METHODS =====

    async analyzeSymptoms(symptoms, userMessage) {
        console.log('🔍 Starting comprehensive symptom analysis...');
        
        const analysis = {
            userMessage,
            symptoms: await this.identifyAndEnrichSymptoms(userMessage),
            conditions: [],
            medications: [],
            emergencyFactors: [],
            recommendations: {},
            apiSources: [],
            confidence: 'medium',
            timestamp: new Date().toISOString()
        };

        try {
            // 1. Enrich identified symptoms with medical database data
            for (const symptom of analysis.symptoms) {
                console.log(`📋 Enriching symptom: ${symptom.name}`);
                
                // Get related conditions from FHIR
                const fhirConditions = await this.fhir.searchConditions(symptom.name);
                if (fhirConditions.length > 0) {
                    analysis.conditions.push(...fhirConditions.slice(0, 3));
                    analysis.apiSources.push('FHIR-Conditions');
                }
                
                // Get medication recommendations
                const medications = await this.getMedicationRecommendations(symptom);
                if (medications.length > 0) {
                    analysis.medications.push(...medications);
                    analysis.apiSources.push('RxNorm-Medications');
                }
            }

            // 2. Emergency assessment
            analysis.emergencyFactors = this.assessEmergencyFactors(analysis.symptoms, userMessage);
            
            // 3. Generate recommendations
            analysis.recommendations = await this.generateRecommendations(analysis);
            
            // 4. Calculate confidence
            analysis.confidence = this.calculateConfidence(analysis);
            
            // Remove duplicates and limit results
            analysis.conditions = this.removeDuplicates(analysis.conditions, 'id').slice(0, 5);
            analysis.medications = this.removeDuplicates(analysis.medications, 'name').slice(0, 8);
            analysis.apiSources = [...new Set(analysis.apiSources)];
            
            console.log(`✅ Analysis complete. Found ${analysis.symptoms.length} symptoms, ${analysis.conditions.length} conditions, ${analysis.medications.length} medications`);
            
        } catch (error) {
            console.error('❌ Error in symptom analysis:', error);
            analysis.error = error.message;
            analysis.confidence = 'low';
        }

        return analysis;
    }

    async comprehensiveMedicationLookup(medicationName) {
        console.log(`💊 Starting comprehensive medication lookup for: ${medicationName}`);
        
        const results = {
            medication: medicationName,
            found: false,
            rxnorm: {},
            fhir: {},
            interactions: [],
            recommendations: [],
            warnings: [],
            apiSources: [],
            timestamp: new Date().toISOString()
        };

        try {
            // Search both RxNorm and FHIR in parallel
            const [rxnormData, fhirData] = await Promise.all([
                this.rxnorm.comprehensiveDrugLookup(medicationName),
                this.fhir.searchMedications(medicationName)
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

            // Generate warnings and recommendations
            if (results.found) {
                results.warnings = this.generateMedicationWarnings(medicationName, results);
                results.recommendations = this.generateMedicationRecommendations(medicationName, results);
            }

            console.log(`✅ Medication lookup complete. Found in ${results.apiSources.join(', ')}`);
            
        } catch (error) {
            console.error('❌ Error in medication lookup:', error);
            results.error = error.message;
        }

        return results;
    }

    // ===== SYMPTOM IDENTIFICATION AND ENRICHMENT =====

    async identifyAndEnrichSymptoms(message) {
        const identifiedSymptoms = [];
        const messageLower = message.toLowerCase();

        console.log('🔍 Identifying symptoms in message...');

        for (const [symptomId, mapping] of Object.entries(medicalMappings.symptoms)) {
            // Check if symptom is mentioned
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

    // ===== MEDICATION RECOMMENDATIONS =====

    async getMedicationRecommendations(symptom) {
        const recommendations = [];
        
        try {
            // Get OTC recommendations from mappings
            const otcMeds = this.getOTCRecommendations(symptom.id);
            recommendations.push(...otcMeds);
            
            // Search for prescription alternatives in databases
            const searchTerms = [
                `${symptom.name} treatment`,
                `${symptom.name} medication`
            ];
            
            for (const term of searchTerms) {
                try {
                    const rxnormResults = await this.rxnorm.searchDrugs(term);
                    for (const med of rxnormResults.slice(0, 3)) {
                        recommendations.push({
                            name: med.name,
                            type: 'prescription',
                            rxcui: med.rxcui,
                            source: 'RxNorm',
                            indication: symptom.name
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to get RxNorm data for ${term}:`, error.message);
                }
            }
            
        } catch (error) {
            console.error('Error getting medication recommendations:', error);
        }

        return recommendations;
    }

    getOTCRecommendations(symptomId) {
        const recommendations = [];
        
        // Map symptoms to medication categories
        const symptomToCategory = {
            'headache': ['pain_relievers'],
            'fever': ['pain_relievers'],
            'nausea': ['anti_nausea'],
            'cough': ['cough_suppressants'],
            'fatigue': [], // No specific OTC for fatigue
            'dizziness': [] // No specific OTC for dizziness
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

    // ===== EMERGENCY ASSESSMENT =====

    assessEmergencyFactors(symptoms, message) {
        const emergencyFactors = [];
        const messageLower = message.toLowerCase();

        console.log('🚨 Assessing emergency factors...');

        // Check for emergency patterns from mappings
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

        // Check individual symptom urgency factors
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

    // ===== RECOMMENDATION GENERATION =====

    async generateRecommendations(analysis) {
        const recommendations = {
            immediateActions: [],
            selfCare: [],
            whenToSeekCare: [],
            medications: [],
            lifestyle: []
        };

        // Emergency recommendations
        if (analysis.emergencyFactors.length > 0) {
            recommendations.immediateActions.push('Seek immediate medical attention');
            recommendations.immediateActions.push('Call 911 if symptoms are severe');
            return recommendations;
        }

        // Symptom-specific recommendations
        for (const symptom of analysis.symptoms) {
            // Self-care recommendations
            const selfCare = this.getSymptomSelfCare(symptom.id);
            recommendations.selfCare.push(...selfCare);

            // When to seek care
            const seekCare = this.getSeekCareGuidance(symptom);
            recommendations.whenToSeekCare.push(...seekCare);
        }

        // Medication recommendations (already in analysis.medications)
        recommendations.medications = analysis.medications.slice(0, 5);

        // Remove duplicates
        recommendations.selfCare = [...new Set(recommendations.selfCare)];
        recommendations.whenToSeekCare = [...new Set(recommendations.whenToSeekCare)];

        return recommendations;
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

    getSeekCareGuidance(symptom) {
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

        return guidance;
    }

    // ===== UTILITY METHODS =====

    extractSeverity(message, severityClues) {
        if (!severityClues) return 'unknown';
        
        for (const [level, clues] of Object.entries(severityClues)) {
            if (clues.some(clue => message.includes(clue))) {
                return level;
            }
        }
        
        // Look for numerical ratings
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

        // Look for specific time periods
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
        
        // Check for triggers
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

    calculateConfidence(analysis) {
        let score = 0;
        
        // Base score from number of symptoms identified
        score += analysis.symptoms.length * 20;
        
        // Bonus for detailed symptom information
        for (const symptom of analysis.symptoms) {
            if (symptom.severity !== 'unknown') score += 10;
            if (symptom.duration.type !== 'unknown') score += 10;
            if (symptom.associatedSymptoms.length > 0) score += 5;
        }
        
        // Bonus for database matches
        if (analysis.conditions.length > 0) score += 15;
        if (analysis.medications.length > 0) score += 10;
        
        // Cap at 100 and convert to confidence level
        score = Math.min(score, 100);
        
        if (score >= 80) return 'high';
        if (score >= 50) return 'medium';
        return 'low';
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

    generateMedicationWarnings(medicationName, results) {
        const warnings = [];
        
        // Check interactions
        if (results.interactions && results.interactions.length > 0) {
            warnings.push(`Has ${results.interactions.length} known drug interactions`);
        }
        
        // Generic warnings
        warnings.push('Always consult healthcare provider before starting new medications');
        warnings.push('Check with pharmacist about drug interactions');
        
        return warnings;
    }

    generateMedicationRecommendations(medicationName, results) {
        const recommendations = [];
        
        recommendations.push('Discuss with your doctor or pharmacist');
        recommendations.push('Follow prescribed dosage instructions');
        recommendations.push('Report any side effects to your healthcare provider');
        
        return recommendations;
    }

    // ===== API STATUS AND HEALTH =====

    async getAPIStatus() {
        console.log('🔍 Checking medical API status...');
        
        const status = {
            timestamp: new Date().toISOString(),
            overall: 'healthy',
            services: {},
            cache: this.cache.getStats()
        };

        // Check individual services
        const [rxnormStatus, fhirStatus] = await Promise.all([
            this.rxnorm.healthCheck(),
            this.fhir.healthCheck()
        ]);

        status.services.rxnorm = rxnormStatus;
        status.services.fhir = fhirStatus;

        // Update overall status
        if (rxnormStatus.status === 'error' && fhirStatus.status === 'error') {
            status.overall = 'degraded';
        }

        this.serviceStatus = {
            rxnorm: rxnormStatus.status,
            fhir: fhirStatus.status,
            lastHealthCheck: new Date().toISOString()
        };

        return status;
    }

    // Clear cache
    clearCache() {
        this.cache.clear();
        console.log('🧹 Medical API cache cleared');
    }

    // Get cache statistics
    getCacheStats() {
        return this.cache.getStats();
    }
}

module.exports = MedicalAPIService;