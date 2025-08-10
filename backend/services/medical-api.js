// services/medical-api.js
const fetch = require('node-fetch');

class MedicalAPIService {
    constructor() {
        this.apis = {
            // RxNorm - Free NIH Drug Database
            rxnorm: {
                baseUrl: 'https://rxnav.nlm.nih.gov/REST',
                endpoints: {
                    drugs: '/drugs.json',
                    rxcui: '/rxcui.json',
                    properties: '/rxcui/{rxcui}/properties.json',
                    interactions: '/interaction/interaction.json'
                }
            },
            
            // FHIR Test Server (Public)
            fhir: {
                baseUrl: 'https://hapi.fhir.org/baseR4',
                headers: {
                    'Accept': 'application/fhir+json',
                    'Content-Type': 'application/fhir+json'
                }
            }
        };
        
        // Fallback data
        this.fallbackData = {
            symptoms: require('../data/symptoms.json'),
            conditions: require('../data/conditions.json'),
            medications: require('../data/otc-medications.json')
        };
    }

    // ===== RXNORM INTEGRATION =====

    // Search for drugs in RxNorm
    async searchDrugs(drugName) {
        try {
            const url = `${this.apis.rxnorm.baseUrl}${this.apis.rxnorm.endpoints.drugs}?name=${encodeURIComponent(drugName)}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`RxNorm API error: ${response.status}`);
            }
            
            const data = await response.json();
            return this.formatRxNormResults(data);
        } catch (error) {
            console.error('RxNorm search error:', error);
            return this.getFallbackDrugInfo(drugName);
        }
    }

    // Get drug properties by RxCUI
    async getDrugProperties(rxcui) {
        try {
            const url = `${this.apis.rxnorm.baseUrl}/rxcui/${rxcui}/properties.json`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`RxNorm properties error: ${response.status}`);
            }
            
            const data = await response.json();
            return data.properties || {};
        } catch (error) {
            console.error('RxNorm properties error:', error);
            return {};
        }
    }

    // Get drug interactions
    async getDrugInteractions(rxcui) {
        try {
            const url = `${this.apis.rxnorm.baseUrl}/interaction/interaction.json?rxcui=${rxcui}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`RxNorm interactions error: ${response.status}`);
            }
            
            const data = await response.json();
            return data.interactionTypeGroup || [];
        } catch (error) {
            console.error('RxNorm interactions error:', error);
            return [];
        }
    }

    // Format RxNorm results
    formatRxNormResults(data) {
        const results = [];
        const drugGroup = data.drugGroup;
        
        if (drugGroup && drugGroup.conceptGroup) {
            for (const group of drugGroup.conceptGroup) {
                if (group.conceptProperties) {
                    for (const concept of group.conceptProperties) {
                        results.push({
                            rxcui: concept.rxcui,
                            name: concept.name,
                            synonym: concept.synonym || '',
                            tty: concept.tty, // Term type
                            language: concept.language || 'ENG',
                            suppress: concept.suppress || 'N'
                        });
                    }
                }
            }
        }
        
        return results;
    }

    // ===== FHIR INTEGRATION =====

    // Search for medications in FHIR
    async searchFHIRMedications(medicationName) {
        try {
            const url = `${this.apis.fhir.baseUrl}/Medication?_text=${encodeURIComponent(medicationName)}&_count=10`;
            const response = await fetch(url, {
                headers: this.apis.fhir.headers
            });
            
            if (!response.ok) {
                throw new Error(`FHIR API error: ${response.status}`);
            }
            
            const data = await response.json();
            return this.formatFHIRMedications(data);
        } catch (error) {
            console.error('FHIR medications search error:', error);
            return [];
        }
    }

    // Search for conditions in FHIR
    async searchFHIRConditions(conditionName) {
        try {
            const url = `${this.apis.fhir.baseUrl}/Condition?_text=${encodeURIComponent(conditionName)}&_count=10`;
            const response = await fetch(url, {
                headers: this.apis.fhir.headers
            });
            
            if (!response.ok) {
                throw new Error(`FHIR conditions error: ${response.status}`);
            }
            
            const data = await response.json();
            return this.formatFHIRConditions(data);
        } catch (error) {
            console.error('FHIR conditions search error:', error);
            return [];
        }
    }

    // Format FHIR medication results
    formatFHIRMedications(data) {
        const medications = [];
        
        if (data.entry) {
            for (const entry of data.entry) {
                const medication = entry.resource;
                if (medication.resourceType === 'Medication') {
                    medications.push({
                        id: medication.id,
                        name: medication.code?.coding?.[0]?.display || 'Unknown medication',
                        code: medication.code?.coding?.[0]?.code,
                        system: medication.code?.coding?.[0]?.system,
                        form: medication.form?.coding?.[0]?.display || 'Unknown form',
                        ingredients: medication.ingredient?.map(ing => ({
                            name: ing.itemCodeableConcept?.coding?.[0]?.display || 'Unknown ingredient',
                            strength: ing.strength?.numerator?.value + ' ' + ing.strength?.numerator?.unit || 'Unknown strength'
                        })) || []
                    });
                }
            }
        }
        
        return medications;
    }

    // Format FHIR condition results
    formatFHIRConditions(data) {
        const conditions = [];
        
        if (data.entry) {
            for (const entry of data.entry) {
                const condition = entry.resource;
                if (condition.resourceType === 'Condition') {
                    conditions.push({
                        id: condition.id,
                        name: condition.code?.coding?.[0]?.display || 'Unknown condition',
                        code: condition.code?.coding?.[0]?.code,
                        system: condition.code?.coding?.[0]?.system,
                        category: condition.category?.[0]?.coding?.[0]?.display || 'Unknown category',
                        severity: condition.severity?.coding?.[0]?.display || 'Unknown severity',
                        clinicalStatus: condition.clinicalStatus?.coding?.[0]?.code || 'Unknown status'
                    });
                }
            }
        }
        
        return conditions;
    }

    // ===== COMPREHENSIVE MEDICATION LOOKUP =====

    async comprehensiveMedicationLookup(medicationName) {
        const results = {
            medication: medicationName,
            rxnorm: [],
            fhir: [],
            otc: [],
            interactions: [],
            timestamp: new Date().toISOString()
        };

        try {
            // Search RxNorm
            results.rxnorm = await this.searchDrugs(medicationName);
            
            // Search FHIR
            results.fhir = await this.searchFHIRMedications(medicationName);
            
            // Get OTC recommendations if applicable
            results.otc = this.getOTCRecommendations([medicationName]);
            
            // Get interactions for first RxNorm result
            if (results.rxnorm.length > 0) {
                const rxcui = results.rxnorm[0].rxcui;
                results.interactions = await this.getDrugInteractions(rxcui);
            }
            
        } catch (error) {
            console.error('Comprehensive medication lookup error:', error);
        }

        return results;
    }

    // ===== SYMPTOM ANALYSIS WITH FHIR =====

    async analyzeSymptoms(symptoms, userMessage) {
        const analysis = {
            symptoms: this.identifySymptoms(userMessage),
            conditions: [],
            medications: [],
            fhirData: [],
            urgency: 'unknown',
            source: 'comprehensive_analysis',
            timestamp: new Date().toISOString()
        };

        try {
            // Use fallback symptom identification
            const identifiedSymptoms = this.identifySymptoms(userMessage);
            analysis.symptoms = identifiedSymptoms;

            // Get potential conditions from fallback data
            analysis.conditions = this.findPotentialConditions(identifiedSymptoms);
            
            // Get medication recommendations
            analysis.medications = await this.getOTCRecommendations(identifiedSymptoms);
            
            // Search FHIR for related conditions
            for (const symptom of identifiedSymptoms) {
                const fhirConditions = await this.searchFHIRConditions(symptom);
                analysis.fhirData.push(...fhirConditions);
            }
            
            // Assess urgency
            analysis.urgency = this.assessUrgency(identifiedSymptoms, userMessage);
            
        } catch (error) {
            console.error('Symptom analysis error:', error);
            analysis.error = error.message;
        }

        return analysis;
    }

    // ===== UTILITY FUNCTIONS =====

    // Identify symptoms from user message
    identifySymptoms(message) {
        const identifiedSymptoms = [];
        const messageLower = message.toLowerCase();
        
        const symptomKeywords = {
            'headache': ['headache', 'head pain', 'head hurt', 'migraine', 'head ache'],
            'fever': ['fever', 'temperature', 'hot', 'chills', 'feverish'],
            'chest_pain': ['chest pain', 'chest hurt', 'chest pressure', 'heart pain'],
            'nausea': ['nausea', 'nauseous', 'sick', 'queasy', 'throw up', 'vomit'],
            'cough': ['cough', 'coughing', 'hacking', 'phlegm', 'mucus'],
            'fatigue': ['tired', 'exhausted', 'fatigue', 'weak', 'energy'],
            'dizziness': ['dizzy', 'lightheaded', 'vertigo', 'spinning'],
            'shortness_of_breath': ['short of breath', 'can\'t breathe', 'breathing trouble']
        };

        for (const [symptomId, keywords] of Object.entries(symptomKeywords)) {
            if (keywords.some(keyword => messageLower.includes(keyword))) {
                identifiedSymptoms.push(symptomId);
            }
        }

        return identifiedSymptoms;
    }

    // Find potential conditions from symptoms
    findPotentialConditions(symptoms) {
        const conditions = [];
        const conditionsData = this.fallbackData.conditions.conditions;
        
        for (const [conditionId, condition] of Object.entries(conditionsData)) {
            let matchCount = 0;
            for (const symptom of symptoms) {
                if (condition.symptoms.includes(symptom)) {
                    matchCount++;
                }
            }
            
            if (matchCount > 0) {
                conditions.push({
                    id: conditionId,
                    name: condition.name,
                    matchScore: matchCount,
                    probability: (matchCount / condition.symptoms.length) * 100,
                    urgency: condition.urgency
                });
            }
        }
        
        return conditions.sort((a, b) => b.matchScore - a.matchScore);
    }

    // Get OTC recommendations
    getOTCRecommendations(symptoms) {
        const recommendations = [];
        const medications = this.fallbackData.medications;
        
        const symptomMappings = {
            'headache': ['pain_relievers'],
            'fever': ['fever_reducers'],
            'nausea': ['anti_nausea'],
            'cough': ['cough_suppressants', 'expectorants'],
            'chest_pain': [], // No OTC recommendations for chest pain
            'fatigue': [], // No specific OTC for fatigue
            'dizziness': [] // No specific OTC for dizziness
        };

        for (const symptom of symptoms) {
            const categories = symptomMappings[symptom];
            if (categories) {
                for (const category of categories) {
                    if (medications[category]) {
                        recommendations.push(...medications[category]);
                    }
                }
            }
        }

        return [...new Map(recommendations.map(item => [item.name, item])).values()];
    }

    // Assess urgency level
    assessUrgency(symptoms, message) {
        const messageLower = message.toLowerCase();
        
        // Emergency keywords
        const emergencyKeywords = [
            'crushing chest pain', 'can\'t breathe', 'difficulty breathing',
            'severe headache', 'worst headache', 'coughing blood',
            'blood in vomit', 'severe pain'
        ];
        
        if (emergencyKeywords.some(keyword => messageLower.includes(keyword))) {
            return 'emergency';
        }
        
        // High urgency symptoms
        if (symptoms.includes('chest_pain') || symptoms.includes('shortness_of_breath')) {
            return 'high';
        }
        
        // Medium urgency
        if (symptoms.includes('fever') && symptoms.length > 1) {
            return 'medium';
        }
        
        return 'low';
    }

    // Fallback drug information
    getFallbackDrugInfo(drugName) {
        const medications = this.fallbackData.medications;
        const drugLower = drugName.toLowerCase();
        
        for (const category in medications) {
            const drugs = medications[category];
            for (const drug of drugs) {
                if (drug.name.toLowerCase().includes(drugLower)) {
                    return [{
                        name: drug.name,
                        category: category,
                        uses: drug.uses,
                        warnings: drug.warnings,
                        source: 'fallback_data'
                    }];
                }
            }
        }
        
        return [];
    }

    // Check API availability
    getAPIStatus() {
        return {
            rxnorm: true, // Always available (free NIH API)
            fhir: true,   // Public test server available
            fallback: true
        };
    }
}

module.exports = MedicalAPIService;