// backend/services/medical-apis/fhir-service.js
// FHIR (Fast Healthcare Interoperability Resources) Service

const fetch = require('node-fetch');
const apiConfig = require('../../config/api-endpoints').fhir;
const cacheConfig = require('../../config/cache-config');

class FHIRService {
    constructor(cacheManager) {
        this.baseUrl = apiConfig.baseUrl;
        this.headers = apiConfig.headers;
        this.endpoints = apiConfig.endpoints;
        this.cache = cacheManager;
        this.timeout = apiConfig.timeout;
        this.lastRequestTime = 0;
        this.requestDelay = 60000 / apiConfig.rateLimit.requests;
    }

    // ===== MEDICATION SEARCHES =====

    async searchMedications(medicationName, options = {}) {
        const cacheKey = `${cacheConfig.keyPrefixes.fhir}med_${medicationName}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            const searchParams = new URLSearchParams({
                '_text': medicationName,
                '_count': options.limit || 10,
                '_sort': 'name'
            });

            const url = `${this.baseUrl}${this.endpoints.medication}?${searchParams}`;
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`FHIR Medication API error: ${response.status}`);
            }
            
            const data = await response.json();
            const medications = this.formatMedications(data);
            
            await this.cache.set(cacheKey, medications, cacheConfig.timeouts.fhir);
            
            return medications;
            
        } catch (error) {
            console.error('FHIR medication search error:', error);
            return [];
        }
    }

    // ===== CONDITION SEARCHES =====

    async searchConditions(conditionName, options = {}) {
        const cacheKey = `${cacheConfig.keyPrefixes.fhir}cond_${conditionName}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            const searchParams = new URLSearchParams({
                '_text': conditionName,
                '_count': options.limit || 10,
                'clinical-status': 'active'
            });

            const url = `${this.baseUrl}${this.endpoints.condition}?${searchParams}`;
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`FHIR Condition API error: ${response.status}`);
            }
            
            const data = await response.json();
            const conditions = this.formatConditions(data);
            
            await this.cache.set(cacheKey, conditions, cacheConfig.timeouts.fhir);
            
            return conditions;
            
        } catch (error) {
            console.error('FHIR condition search error:', error);
            return [];
        }
    }

    // ===== OBSERVATION SEARCHES =====

    async searchObservations(observationCode, options = {}) {
        const cacheKey = `${cacheConfig.keyPrefixes.fhir}obs_${observationCode}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            const searchParams = new URLSearchParams({
                'code': observationCode,
                '_count': options.limit || 5,
                '_sort': '-date'
            });

            const url = `${this.baseUrl}${this.endpoints.observation}?${searchParams}`;
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`FHIR Observation API error: ${response.status}`);
            }
            
            const data = await response.json();
            const observations = this.formatObservations(data);
            
            await this.cache.set(cacheKey, observations, cacheConfig.timeouts.fhir);
            
            return observations;
            
        } catch (error) {
            console.error('FHIR observation search error:', error);
            return [];
        }
    }

    // ===== FORMATTING METHODS =====

    formatMedications(fhirBundle) {
        const medications = [];
        
        if (fhirBundle.entry) {
            for (const entry of fhirBundle.entry) {
                const medication = entry.resource;
                if (medication.resourceType === 'Medication') {
                    medications.push({
                        id: medication.id,
                        name: this.extractDisplayName(medication.code),
                        code: this.extractCode(medication.code),
                        system: this.extractCodeSystem(medication.code),
                        form: this.extractDisplayName(medication.form),
                        ingredients: this.extractIngredients(medication.ingredient),
                        status: medication.status || 'unknown',
                        manufacturer: medication.manufacturer?.display || 'Unknown',
                        source: 'FHIR',
                        lastUpdated: medication.meta?.lastUpdated
                    });
                }
            }
        }
        
        return medications;
    }

    formatConditions(fhirBundle) {
        const conditions = [];
        
        if (fhirBundle.entry) {
            for (const entry of fhirBundle.entry) {
                const condition = entry.resource;
                if (condition.resourceType === 'Condition') {
                    conditions.push({
                        id: condition.id,
                        name: this.extractDisplayName(condition.code),
                        code: this.extractCode(condition.code),
                        system: this.extractCodeSystem(condition.code),
                        category: this.extractDisplayName(condition.category?.[0]),
                        severity: this.extractDisplayName(condition.severity),
                        clinicalStatus: condition.clinicalStatus?.coding?.[0]?.code || 'unknown',
                        verificationStatus: condition.verificationStatus?.coding?.[0]?.code || 'unknown',
                        onsetDate: condition.onsetDateTime || condition.onsetString,
                        source: 'FHIR',
                        lastUpdated: condition.meta?.lastUpdated
                    });
                }
            }
        }
        
        return conditions;
    }

    formatObservations(fhirBundle) {
        const observations = [];
        
        if (fhirBundle.entry) {
            for (const entry of fhirBundle.entry) {
                const observation = entry.resource;
                if (observation.resourceType === 'Observation') {
                    observations.push({
                        id: observation.id,
                        name: this.extractDisplayName(observation.code),
                        code: this.extractCode(observation.code),
                        value: this.extractValue(observation),
                        unit: this.extractUnit(observation),
                        status: observation.status,
                        category: this.extractDisplayName(observation.category?.[0]),
                        effectiveDate: observation.effectiveDateTime || observation.effectivePeriod?.start,
                        source: 'FHIR',
                        lastUpdated: observation.meta?.lastUpdated
                    });
                }
            }
        }
        
        return observations;
    }

    // ===== UTILITY METHODS =====

    extractDisplayName(codeableConcept) {
        if (!codeableConcept) return 'Unknown';
        
        // Try display first, then text, then first coding display
        return codeableConcept.text || 
               codeableConcept.coding?.[0]?.display || 
               codeableConcept.coding?.[0]?.code || 
               'Unknown';
    }

    extractCode(codeableConcept) {
        if (!codeableConcept?.coding?.[0]) return null;
        return codeableConcept.coding[0].code;
    }

    extractCodeSystem(codeableConcept) {
        if (!codeableConcept?.coding?.[0]) return null;
        return codeableConcept.coding[0].system;
    }

    extractIngredients(ingredients) {
        if (!ingredients) return [];
        
        return ingredients.map(ingredient => ({
            name: this.extractDisplayName(ingredient.itemCodeableConcept),
            strength: ingredient.strength ? 
                `${ingredient.strength.numerator?.value || ''} ${ingredient.strength.numerator?.unit || ''}` : 
                'Unknown strength'
        }));
    }

    extractValue(observation) {
        if (observation.valueQuantity) {
            return observation.valueQuantity.value;
        }
        if (observation.valueString) {
            return observation.valueString;
        }
        if (observation.valueBoolean !== undefined) {
            return observation.valueBoolean;
        }
        if (observation.valueCodeableConcept) {
            return this.extractDisplayName(observation.valueCodeableConcept);
        }
        return 'No value';
    }

    extractUnit(observation) {
        if (observation.valueQuantity?.unit) {
            return observation.valueQuantity.unit;
        }
        return null;
    }

    async makeRequest(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    ...this.headers,
                    'User-Agent': 'Healthcare-Chatbot/1.0'
                }
            });
            
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
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

    // ===== HEALTH CHECK =====

    async healthCheck() {
        try {
            const start = Date.now();
            
            // Simple test search
            const searchParams = new URLSearchParams({
                '_count': 1
            });
            const url = `${this.baseUrl}${this.endpoints.medication}?${searchParams}`;
            
            const response = await this.makeRequest(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            await response.json();
            const responseTime = Date.now() - start;
            
            return {
                service: 'FHIR',
                status: 'healthy',
                responseTime: responseTime,
                endpoint: this.baseUrl,
                lastChecked: new Date().toISOString()
            };
        } catch (error) {
            return {
                service: 'FHIR',
                status: 'error',
                error: error.message,
                endpoint: this.baseUrl,
                lastChecked: new Date().toISOString()
            };
        }
    }

    // ===== PUBLIC INTERFACE =====

    async comprehensiveSearch(searchTerm, type = 'all') {
        const results = {
            searchTerm,
            type,
            medications: [],
            conditions: [],
            observations: [],
            timestamp: new Date().toISOString(),
            source: 'FHIR'
        };

        try {
            const searches = [];
            
            if (type === 'all' || type === 'medications') {
                searches.push(
                    this.searchMedications(searchTerm).then(meds => {
                        results.medications = meds;
                    })
                );
            }
            
            if (type === 'all' || type === 'conditions') {
                searches.push(
                    this.searchConditions(searchTerm).then(conditions => {
                        results.conditions = conditions;
                    })
                );
            }
            
            // Only search observations if we have a specific code
            if (type === 'observations' && searchTerm.match(/^\d+/)) {
                searches.push(
                    this.searchObservations(searchTerm).then(obs => {
                        results.observations = obs;
                    })
                );
            }
            
            await Promise.all(searches);
            
        } catch (error) {
            console.error('FHIR comprehensive search error:', error);
            results.error = error.message;
        }

        return results;
    }
}

module.exports = FHIRService;