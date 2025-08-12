// backend/config/api-endpoints.js
// UPDATED: Centralized configuration for all medical API endpoints including ODPHP

module.exports = {
    // RxNorm - Comprehensive Drug Database (NIH)
    rxnorm: {
        baseUrl: 'https://rxnav.nlm.nih.gov/REST',
        endpoints: {
            drugs: '/drugs.json',
            rxcui: '/rxcui.json',
            properties: '/rxcui/{rxcui}/properties.json',
            interactions: '/interaction/interaction.json',
            allergy: '/rxcui/{rxcui}/allergy.json',
            related: '/rxcui/{rxcui}/related.json'
        },
        rateLimit: {
            requests: 20,
            perMinute: 1
        },
        timeout: 5000
    },

    // FHIR R4 Test Server (HAPI)
    fhir: {
        baseUrl: 'https://hapi.fhir.org/baseR4',
        headers: {
            'Accept': 'application/fhir+json',
            'Content-Type': 'application/fhir+json'
        },
        endpoints: {
            medication: '/Medication',
            condition: '/Condition',
            patient: '/Patient',
            observation: '/Observation'
        },
        rateLimit: {
            requests: 10,
            perMinute: 1
        },
        timeout: 8000
    },

    // Updated clinicalTrial API
    clinicalTrials: {
        baseUrl: 'https://clinicaltrials.gov/api/v2',
        endpoints: {
            studies: '/studies',
            studyById: '/studies/{nctId}'
        },
        workingParams: ['query.cond', 'query.intr', 'query.titles', 'query.term', 'query.locn'],
        rateLimit: {
            requests: 15,
            perMinute: 1
        },
        timeout: 10000
    },

    // UMLS Terminology Services (NIH)
    umls: {
        baseUrl: 'https://uts-ws.nlm.nih.gov/rest',
        endpoints: {
            search: '/search/current',
            content: '/content/current'
        },
        requiresAuth: true,
        rateLimit: {
            requests: 5,
            perMinute: 1
        },
        timeout: 6000
    },

    // MedlinePlus Health Topics
    medlinePlus: {
        baseUrl: 'https://wsearch.nlm.nih.gov/ws/query',
        endpoints: {
            healthTopics: '/health_topics'
        },
        rateLimit: {
            requests: 10,
            perMinute: 1
        },
        timeout: 5000
    },

    // NEW: ODPHP MyHealthfinder API Configuration
    odphp: {
        baseUrl: 'https://odphp.health.gov/myhealthfinder/api/v4',
        endpoints: {
            topics: '/itemlist.json',
            topicDetails: '/topicsearch.json',
            personalizedRecommendations: '/myhealthfinder.json'
        },
        parameters: {
            // Available parameters for personalized recommendations
            demographics: ['age', 'sex'],
            lifestyle: ['pregnant', 'sexuallyActive', 'tobaccoUse'],
            language: ['Lang'], // 'es' for Spanish
            filters: ['Type', 'TopicId']
        },
        rateLimit: {
            requests: 20, // No official rate limit, being conservative
            perMinute: 1
        },
        timeout: 8000,
        requiresAuth: false,
        description: 'ODPHP MyHealthfinder provides evidence-based health recommendations and preventive care guidance'
    },

    // Drug Interaction APIs
    drugInteractions: {
        // OpenFDA API
        openFDA: {
            baseUrl: 'https://api.fda.gov',
            endpoints: {
                drugs: '/drug/event.json',
                labels: '/drug/label.json'
            },
            rateLimit: {
                requests: 8,
                perMinute: 1
            }
        }
    },

    // ICD-10/11 Classifications
    icd: {
        // WHO ICD API (requires registration for full access)
        who: {
            baseUrl: 'https://id.who.int/icd',
            endpoints: {
                search: '/release/11/2019-04/mms/search',
                entity: '/release/11/2019-04/mms'
            },
            requiresAuth: true
        },
        // Alternative ICD lookup services
        alternative: {
            baseUrl: 'https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search',
            timeout: 3000
        }
    }
};