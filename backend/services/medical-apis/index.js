// backend/services/medical-apis/index.js
// UPDATED: Main Medical API Service with ODPHP MyHealthfinder Integration

const RxNormService = require('./rxnorm-service');
const FHIRService = require('./fhir-service');
const ClinicalTrialsService = require('./clinical-trials-service');
const { MedlinePlusService } = require('./enhanced-medical-services');
const OpenFDAService = require('./openfda-service');
const ODPHPService = require('./odphp-service'); // NEW: ODPHP Integration
const CacheManager = require('../utils/cache-manager');
const medicalMappings = require('../../config/medical-mappings');

class MedicalAPIService {
    constructor() {
        // Initialize cache manager
        this.cache = new CacheManager();
        
        // Initialize all medical services including ODPHP
        this.rxnorm = new RxNormService(this.cache);
        this.fhir = new FHIRService(this.cache);
        this.clinicalTrials = new ClinicalTrialsService(this.cache);
        this.medlinePlus = new MedlinePlusService(this.cache);
        this.openFDA = new OpenFDAService(this.cache);
        this.odphp = new ODPHPService(this.cache); // NEW: ODPHP Service
        
        // Service status tracking (updated)
        this.serviceStatus = {
            rxnorm: 'unknown',
            fhir: 'unknown',
            clinicalTrials: 'unknown',
            medlinePlus: 'unknown',
            openFDA: 'unknown',
            odphp: 'unknown', // NEW
            lastHealthCheck: null
        };
        
        console.log('🏥 Medical API Service initialized with ENHANCED architecture:');
        console.log('   ✅ RxNorm Service (rxnorm-service.js)');
        console.log('   ✅ FHIR Service (fhir-service.js)');
        console.log('   ✅ Clinical Trials Service (clinical-trials-service.js)');
        console.log('   ✅ MedlinePlus Service (enhanced-medical-services.js)');
        console.log('   ✅ OpenFDA Service (openfda-service.js)');
        console.log('   🆕 ODPHP MyHealthfinder Service (odphp-service.js)'); // NEW
    }

    // ===== ENHANCED SYMPTOM ANALYSIS WITH ODPHP =====
    async analyzeSymptoms(symptoms, userMessage, userProfile = {}) {
        console.log('🔍 Starting comprehensive symptom analysis with ODPHP...');
        
        const analysis = {
            userMessage,
            symptoms: await this.identifyAndEnrichSymptoms(userMessage),
            conditions: [],
            medications: [],
            clinicalTrials: [],
            healthInformation: [],
            drugSafety: [],
            healthGuidance: [], // NEW: ODPHP health guidance
            preventiveRecommendations: [], // NEW: ODPHP personalized recommendations
            educationalResources: [], // NEW: ODPHP educational content
            emergencyFactors: [],
            recommendations: {},
            apiSources: [],
            confidence: 'medium',
            timestamp: new Date().toISOString()
        };

        try {
            // Get ODPHP-specific information early for comprehensive guidance
            console.log('📋 Getting ODPHP health guidance...');
            const odphpInfo = await this.odphp.getChatbotRelevantInfo(
                analysis.symptoms, 
                userMessage, 
                userProfile
            );

            // Add ODPHP data to analysis
            if (odphpInfo.healthTopics.length > 0) {
                analysis.healthGuidance.push(...odphpInfo.healthTopics);
                analysis.apiSources.push('ODPHP-HealthTopics');
            }

            if (odphpInfo.personalizedRecommendations.length > 0) {
                analysis.preventiveRecommendations.push(...odphpInfo.personalizedRecommendations);
                analysis.apiSources.push('ODPHP-Personalized');
            }

            if (odphpInfo.educationalResources.length > 0) {
                analysis.educationalResources.push(...odphpInfo.educationalResources);
                analysis.apiSources.push('ODPHP-Education');
            }

            // Continue with existing medical database enrichment
            for (const symptom of analysis.symptoms) {
                console.log(`📋 Enriching symptom: ${symptom.name}`);
                
                // Parallel database queries for speed (existing + ODPHP)
                const [fhirConditions, healthInfo, trials, odphpGuidance] = await Promise.all([
                    this.fhir.searchConditions(symptom.name).catch(e => []),
                    this.medlinePlus.searchHealthTopics(symptom.name).catch(e => []),
                    this.clinicalTrials.searchTrialsByCondition(symptom.name).catch(e => []),
                    this.odphp.searchHealthTopics(symptom.name).catch(e => []) // NEW: ODPHP search
                ]);
                
                // Add results (existing logic)
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

                // NEW: Add ODPHP health guidance
                if (odphpGuidance.length > 0) {
                    analysis.healthGuidance.push(...odphpGuidance.slice(0, 2));
                    if (!analysis.apiSources.includes('ODPHP-HealthTopics')) {
                        analysis.apiSources.push('ODPHP-HealthTopics');
                    }
                }
                
                // Get medication recommendations (existing)
                const medications = await this.getEnhancedMedicationRecommendations(symptom);
                if (medications.length > 0) {
                    analysis.medications.push(...medications);
                }
            }

            // Emergency assessment (existing)
            analysis.emergencyFactors = this.assessEmergencyFactors(analysis.symptoms, userMessage);
            
            // Enhanced recommendations with ODPHP integration
            analysis.recommendations = await this.generateEnhancedRecommendationsWithODPHP(analysis);
            
            // Calculate confidence with ODPHP data
            analysis.confidence = this.calculateEnhancedConfidenceWithODPHP(analysis);
            
            // Remove duplicates and limit results (updated limits)
            analysis.conditions = this.removeDuplicates(analysis.conditions, 'id').slice(0, 5);
            analysis.medications = this.removeDuplicates(analysis.medications, 'name').slice(0, 8);
            analysis.healthInformation = this.removeDuplicates(analysis.healthInformation, 'title').slice(0, 3);
            analysis.clinicalTrials = this.removeDuplicates(analysis.clinicalTrials, 'id').slice(0, 3);
            analysis.healthGuidance = this.removeDuplicates(analysis.healthGuidance, 'id').slice(0, 4); // NEW
            analysis.preventiveRecommendations = this.removeDuplicates(analysis.preventiveRecommendations, 'id').slice(0, 3); // NEW
            analysis.educationalResources = this.removeDuplicates(analysis.educationalResources, 'symptom').slice(0, 5); // NEW
            analysis.apiSources = [...new Set(analysis.apiSources)];
            
            console.log(`✅ Enhanced analysis complete with ODPHP. Sources: ${analysis.apiSources.join(', ')}`);
            
        } catch (error) {
            console.error('❌ Error in enhanced symptom analysis:', error);
            analysis.error = error.message;
            analysis.confidence = 'low';
        }

        return analysis;
    }

    // ===== NEW: ENHANCED RECOMMENDATIONS WITH ODPHP =====
    async generateEnhancedRecommendationsWithODPHP(analysis) {
        const recommendations = {
            immediateActions: [],
            selfCare: [],
            whenToSeekCare: [],
            medications: [],
            lifestyle: [],
            additionalResources: [],
            clinicalOptions: [],
            preventiveActions: [] // NEW: From ODPHP
        };

        // Emergency recommendations (existing)
        if (analysis.emergencyFactors.length > 0) {
            recommendations.immediateActions.push('Seek immediate medical attention');
            recommendations.immediateActions.push('Call 911 if symptoms are severe');
            return recommendations;
        }

        // Enhanced recommendations using all data sources including ODPHP
        for (const symptom of analysis.symptoms) {
            // Self-care from existing mappings
            const selfCare = this.getSymptomSelfCare(symptom.id);
            recommendations.selfCare.push(...selfCare);

            // When to seek care (enhanced)
            const seekCare = this.getEnhancedSeekCareGuidance(symptom, analysis);
            recommendations.whenToSeekCare.push(...seekCare);
        }

        // Add MedlinePlus educational resources (existing)
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

        // NEW: Add ODPHP health guidance
        if (analysis.healthGuidance.length > 0) {
            for (const guidance of analysis.healthGuidance) {
                recommendations.additionalResources.push({
                    type: 'health_guidance',
                    title: guidance.title,
                    summary: guidance.summary,
                    source: 'MyHealthfinder'
                });
            }
        }

        // NEW: Add ODPHP preventive recommendations
        if (analysis.preventiveRecommendations.length > 0) {
            for (const prevRec of analysis.preventiveRecommendations) {
                recommendations.preventiveActions.push({
                    type: 'preventive',
                    title: prevRec.title,
                    summary: prevRec.summary,
                    categories: prevRec.categories,
                    source: 'MyHealthfinder'
                });
            }
        }

        // NEW: Add ODPHP educational resources
        if (analysis.educationalResources.length > 0) {
            for (const eduResource of analysis.educationalResources) {
                if (eduResource.information) {
                    recommendations.additionalResources.push({
                        type: 'symptom_education',
                        title: eduResource.information.title,
                        summary: eduResource.information.summary,
                        symptom: eduResource.symptom,
                        source: 'MyHealthfinder'
                    });
                }
            }
        }

        // Add clinical trial options (existing)
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

        // Medication recommendations (existing)
        recommendations.medications = analysis.medications.slice(0, 5);

        // Remove duplicates (enhanced)
        recommendations.selfCare = [...new Set(recommendations.selfCare)];
        recommendations.whenToSeekCare = [...new Set(recommendations.whenToSeekCare)];
        recommendations.additionalResources = this.removeDuplicates(recommendations.additionalResources, 'title');
        recommendations.preventiveActions = this.removeDuplicates(recommendations.preventiveActions, 'title');

        return recommendations;
    }

    // ===== NEW: ENHANCED CONFIDENCE WITH ODPHP =====
    calculateEnhancedConfidenceWithODPHP(analysis) {
        let score = 0;
        
        // Base score from number of symptoms identified
        score += analysis.symptoms.length * 20;
        
        // Bonus for detailed symptom information
        for (const symptom of analysis.symptoms) {
            if (symptom.severity !== 'unknown') score += 10;
            if (symptom.duration.type !== 'unknown') score += 10;
            if (symptom.associatedSymptoms.length > 0) score += 5;
        }
        
        // Enhanced bonus for multiple database matches (including ODPHP)
        if (analysis.conditions.length > 0) score += 15;
        if (analysis.medications.length > 0) score += 10;
        if (analysis.healthInformation.length > 0) score += 15;
        if (analysis.clinicalTrials.length > 0) score += 10;
        if (analysis.healthGuidance.length > 0) score += 18; // NEW: ODPHP health guidance
        if (analysis.preventiveRecommendations.length > 0) score += 12; // NEW: ODPHP personalized
        if (analysis.educationalResources.length > 0) score += 8; // NEW: ODPHP education
        if (analysis.apiSources.includes('OpenFDA-Labels')) score += 12;
        if (analysis.apiSources.includes('OpenFDA-Events')) score += 8;
        
        // NEW: ODPHP-specific bonuses
        if (analysis.apiSources.includes('ODPHP-HealthTopics')) score += 15;
        if (analysis.apiSources.includes('ODPHP-Personalized')) score += 20; // High value for personalized recs
        if (analysis.apiSources.includes('ODPHP-Education')) score += 10;
        
        // Bonus for multiple API sources (cross-validation) - Updated for 6 services
        const uniqueSources = [...new Set(analysis.apiSources)];
        if (uniqueSources.length >= 4) score += 20;
        if (uniqueSources.length >= 5) score += 15;
        if (uniqueSources.length >= 6) score += 15; // All 6 services
        
        // Cap at 100 and convert to confidence level
        score = Math.min(score, 100);
        
        if (score >= 85) return 'very_high';
        if (score >= 70) return 'high';
        if (score >= 50) return 'medium';
        return 'low';
    }

    // ===== UPDATED API STATUS WITH ODPHP =====
    async getAPIStatus() {
        console.log('🔍 Checking medical API status (including ODPHP)...');
        
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
                preventiveGuidance: 0 // NEW: ODPHP coverage
            }
        };

        // Check all services in parallel (including ODPHP)
        const [rxnormStatus, fhirStatus, clinicalTrialsStatus, medlinePlusStatus, openFDAStatus, odphpStatus] = await Promise.all([
            this.rxnorm.healthCheck(),
            this.fhir.healthCheck(),
            this.clinicalTrials.healthCheck(),
            this.medlinePlus.healthCheck(),
            this.openFDA.healthCheck(),
            this.odphp.healthCheck() // NEW: ODPHP health check
        ]);

        status.services.rxnorm = rxnormStatus;
        status.services.fhir = fhirStatus;
        status.services.clinicalTrials = clinicalTrialsStatus;
        status.services.medlinePlus = medlinePlusStatus;
        status.services.openFDA = openFDAStatus;
        status.services.odphp = odphpStatus; // NEW

        // Calculate coverage scores (updated)
        status.coverage.drugDatabase = this.calculateCoverage([rxnormStatus, fhirStatus]);
        status.coverage.conditionDatabase = this.calculateCoverage([fhirStatus, medlinePlusStatus]);
        status.coverage.safetyDatabase = this.calculateCoverage([openFDAStatus]);
        status.coverage.clinicalTrials = this.calculateCoverage([clinicalTrialsStatus]);
        status.coverage.healthEducation = this.calculateCoverage([medlinePlusStatus, odphpStatus]); // Updated
        status.coverage.preventiveGuidance = this.calculateCoverage([odphpStatus]); // NEW

        // Update overall status (updated for 6 services)
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
            odphp: odphpStatus.status, // NEW
            lastHealthCheck: new Date().toISOString()
        };

        return status;
    }

    // ===== NEW: ODPHP-SPECIFIC METHODS =====
    async getPersonalizedHealthGuidance(userProfile, symptoms = []) {
        try {
            console.log('🎯 Getting personalized health guidance from ODPHP...');
            
            const guidance = await this.odphp.getPersonalizedRecommendations(userProfile);
            const symptomGuidance = symptoms.length > 0 ? 
                await this.odphp.getSymptomGuidance(symptoms, userProfile) : [];
            
            return {
                personalizedRecommendations: guidance,
                symptomSpecificGuidance: symptomGuidance,
                source: 'ODPHP-MyHealthfinder'
            };
        } catch (error) {
            console.error('Error getting personalized health guidance:', error);
            return {
                personalizedRecommendations: [],
                symptomSpecificGuidance: [],
                error: error.message
            };
        }
    }

    async searchHealthTopicsForChatbot(query, userProfile = {}) {
        try {
            console.log(`🔍 Searching health topics for: ${query}`);
            
            // Search both MedlinePlus and ODPHP for comprehensive results
            const [medlinePlusResults, odphpResults] = await Promise.all([
                this.medlinePlus.searchHealthTopics(query).catch(e => []),
                this.odphp.searchHealthTopics(query).catch(e => [])
            ]);

            return {
                medlinePlus: medlinePlusResults,
                odphp: odphpResults,
                combined: [...medlinePlusResults, ...odphpResults],
                totalSources: 2
            };
        } catch (error) {
            console.error('Error searching health topics:', error);
            return {
                medlinePlus: [],
                odphp: [],
                combined: [],
                error: error.message
            };
        }
    }

    // ===== EXISTING METHODS (keeping all your current functionality) =====
    
    // Keep all your existing methods unchanged:
    // - comprehensiveMedicationLookup
    // - getEnhancedMedicationRecommendations  
    // - compileSafetyInformation
    // - generateEnhancedMedicationWarnings
    // - generateEnhancedMedicationRecommendations
    // - getEnhancedSeekCareGuidance
    // - identifyAndEnrichSymptoms
    // - getOTCRecommendations
    // - assessEmergencyFactors
    // - getSymptomSelfCare
    // - extractSeverity
    // - extractDuration
    // - findAssociatedSymptoms
    // - extractSymptomContext
    // - checkUrgencyFactors
    // - removeDuplicates
    // - clearCache
    // - getCacheStats
    
    // [All existing methods remain exactly the same - just adding ODPHP integration]

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
            // Search all databases in parallel
            const [rxnormData, fhirData, fdaLabels, fdaEvents] = await Promise.all([
                this.rxnorm.comprehensiveDrugLookup(medicationName),
                this.fhir.searchMedications(medicationName),
                this.openFDA.searchDrugLabels(medicationName).catch(e => []),
                this.openFDA.searchDrugEvents(medicationName).catch(e => [])
            ]);

            // Process results (existing logic)
            if (rxnormData.found) {
                results.found = true;
                results.rxnorm = rxnormData;
                results.interactions = rxnormData.interactions || [];
                results.apiSources.push('RxNorm');
            }

            if (fhirData.length > 0) {
                results.found = true;
                results.fhir = {
                    medications: fhirData,
                    count: fhirData.length
                };
                results.apiSources.push('FHIR');
            }

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

    // [Continue with all other existing methods...]
    // I'm keeping the structure but won't repeat all the existing code for brevity
    
    calculateCoverage(serviceStatuses) {
        const healthyCount = serviceStatuses.filter(s => s.status === 'healthy').length;
        return Math.round((healthyCount / serviceStatuses.length) * 100);
    }

    // Keep all utility methods
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

    clearCache() {
        this.cache.clear();
        console.log('🧹 Medical API cache cleared');
    }

    getCacheStats() {
        return this.cache.getStats();
    }
}

module.exports = MedicalAPIService;