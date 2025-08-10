// backend/services/medical-apis/rxnorm-service.js
// RxNorm Drug Database Integration Service

const fetch = require('node-fetch');
const apiConfig = require('../../config/api-endpoints').rxnorm;
const cacheConfig = require('../../config/cache-config');

class RxNormService {
    constructor(cacheManager) {
        this.baseUrl = apiConfig.baseUrl;
        this.endpoints = apiConfig.endpoints;
        this.cache = cacheManager;
        this.timeout = apiConfig.timeout;
        this.lastRequestTime = 0;
        this.requestDelay = 60000 / apiConfig.rateLimit.requests; // Rate limiting
    }

    // ===== MAIN SEARCH METHODS =====

    async searchDrugs(drugName, options = {}) {
        const cacheKey = `${cacheConfig.keyPrefixes.rxnorm}search_${drugName}`;
        
        // Check cache first
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            const url = `${this.baseUrl}${this.endpoints.drugs}?name=${encodeURIComponent(drugName)}`;
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`RxNorm API error: ${response.status}`);
            }
            
            const data = await response.json();
            const formattedResults = this.formatDrugResults(data);
            
            // Cache the results
            await this.cache.set(cacheKey, formattedResults, cacheConfig.timeouts.rxnorm);
            
            return formattedResults;
            
        } catch (error) {
            console.error('RxNorm drug search error:', error);
            throw new Error(`Failed to search drugs: ${error.message}`);
        }
    }

    async getDrugProperties(rxcui, options = {}) {
        const cacheKey = `${cacheConfig.keyPrefixes.rxnorm}props_${rxcui}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            const url = `${this.baseUrl}/rxcui/${rxcui}/properties.json`;
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`RxNorm properties error: ${response.status}`);
            }
            
            const data = await response.json();
            const properties = data.properties || {};
            
            await this.cache.set(cacheKey, properties, cacheConfig.timeouts.rxnorm);
            
            return properties;
            
        } catch (error) {
            console.error('RxNorm properties error:', error);
            return {};
        }
    }

    async getDrugInteractions(rxcui, options = {}) {
        const cacheKey = `${cacheConfig.keyPrefixes.rxnorm}interactions_${rxcui}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            const url = `${this.baseUrl}${this.endpoints.interactions}?rxcui=${rxcui}`;
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`RxNorm interactions error: ${response.status}`);
            }
            
            const data = await response.json();
            const interactions = this.formatInteractions(data);
            
            await this.cache.set(cacheKey, interactions, cacheConfig.timeouts.rxnorm);
            
            return interactions;
            
        } catch (error) {
            console.error('RxNorm interactions error:', error);
            return [];
        }
    }

    // ===== SPECIALIZED SEARCH METHODS =====

    async searchByIndication(indication) {
        // Search for drugs commonly used for a specific indication
        const searchTerms = [
            `${indication} treatment`,
            `${indication} medication`,
            indication
        ];

        const allResults = [];
        for (const term of searchTerms) {
            try {
                const results = await this.searchDrugs(term);
                allResults.push(...results);
            } catch (error) {
                console.warn(`Failed to search for ${term}:`, error.message);
            }
        }

        // Remove duplicates and limit results
        const uniqueResults = this.removeDuplicates(allResults, 'rxcui');
        return uniqueResults.slice(0, 10);
    }

    async getRelatedDrugs(rxcui) {
        const cacheKey = `${cacheConfig.keyPrefixes.rxnorm}related_${rxcui}`;
        
        const cached = await this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            await this.enforceRateLimit();
            
            const url = `${this.baseUrl}/rxcui/${rxcui}/related.json`;
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                throw new Error(`RxNorm related drugs error: ${response.status}`);
            }
            
            const data = await response.json();
            const related = this.formatRelatedDrugs(data);
            
            await this.cache.set(cacheKey, related, cacheConfig.timeouts.rxnorm);
            
            return related;
            
        } catch (error) {
            console.error('RxNorm related drugs error:', error);
            return [];
        }
    }

    // ===== FORMATTING METHODS =====

    formatDrugResults(data) {
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
                            termType: concept.tty,
                            language: concept.language || 'ENG',
                            suppressed: concept.suppress === 'Y',
                            source: 'RxNorm'
                        });
                    }
                }
            }
        }
        
        return results;
    }

    formatInteractions(data) {
        const interactions = [];
        
        if (data.interactionTypeGroup) {
            for (const typeGroup of data.interactionTypeGroup) {
                if (typeGroup.interactionType) {
                    for (const interaction of typeGroup.interactionType) {
                        if (interaction.interactionPair) {
                            for (const pair of interaction.interactionPair) {
                                interactions.push({
                                    severity: pair.severity || 'unknown',
                                    description: pair.description || 'Interaction noted',
                                    interactingDrug: {
                                        name: pair.interactionConcept?.[1]?.minConceptItem?.name || 'Unknown',
                                        rxcui: pair.interactionConcept?.[1]?.minConceptItem?.rxcui
                                    },
                                    source: 'RxNorm'
                                });
                            }
                        }
                    }
                }
            }
        }
        
        return interactions;
    }

    formatRelatedDrugs(data) {
        const related = [];
        
        if (data.relatedGroup && data.relatedGroup.conceptGroup) {
            for (const group of data.relatedGroup.conceptGroup) {
                if (group.conceptProperties) {
                    for (const concept of group.conceptProperties) {
                        related.push({
                            rxcui: concept.rxcui,
                            name: concept.name,
                            relationship: group.tty || 'related',
                            source: 'RxNorm'
                        });
                    }
                }
            }
        }
        
        return related;
    }

    // ===== UTILITY METHODS =====

    async makeRequest(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
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

    // ===== HEALTH CHECK =====

    async healthCheck() {
        try {
            const start = Date.now();
            const testResult = await this.searchDrugs('aspirin', { skipCache: true });
            const responseTime = Date.now() - start;
            
            return {
                service: 'RxNorm',
                status: 'healthy',
                responseTime: responseTime,
                resultsFound: testResult.length,
                lastChecked: new Date().toISOString()
            };
        } catch (error) {
            return {
                service: 'RxNorm',
                status: 'error',
                error: error.message,
                lastChecked: new Date().toISOString()
            };
        }
    }

    // ===== PUBLIC INTERFACE =====

    async comprehensiveDrugLookup(drugName) {
        try {
            // Main drug search
            const drugs = await this.searchDrugs(drugName);
            
            if (drugs.length === 0) {
                return {
                    drugName,
                    found: false,
                    message: 'No drugs found with that name'
                };
            }

            // Get detailed info for the first result
            const primaryDrug = drugs[0];
            const [properties, interactions, related] = await Promise.all([
                this.getDrugProperties(primaryDrug.rxcui),
                this.getDrugInteractions(primaryDrug.rxcui),
                this.getRelatedDrugs(primaryDrug.rxcui)
            ]);

            return {
                drugName,
                found: true,
                primaryDrug,
                allMatches: drugs,
                properties,
                interactions,
                relatedDrugs: related,
                timestamp: new Date().toISOString(),
                source: 'RxNorm'
            };

        } catch (error) {
            console.error('Comprehensive drug lookup error:', error);
            return {
                drugName,
                found: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = RxNormService;