// backend/config/cache-config.js
// Cache management configuration

module.exports = {
    // Cache timeouts (in milliseconds)
    timeouts: {
        rxnorm: 3600000,        // 1 hour - drug info doesn't change often
        fhir: 1800000,          // 30 minutes - test server data
        clinicalTrials: 7200000, // 2 hours - trial data updates slowly
        umls: 86400000,         // 24 hours - terminology is stable
        icd: 86400000,          // 24 hours - classification codes stable
        symptoms: 1800000       // 30 minutes - symptom analysis
    },

    // Maximum cache sizes (number of items)
    maxSizes: {
        rxnorm: 1000,
        fhir: 500,
        clinicalTrials: 200,
        umls: 800,
        symptoms: 300
    },

    // Cache key prefixes
    keyPrefixes: {
        rxnorm: 'rx_',
        fhir: 'fhir_',
        clinicalTrials: 'ct_',
        umls: 'umls_',
        icd: 'icd_',
        symptoms: 'symp_'
    },

    // Items that should never be cached (real-time data)
    noCachePatterns: [
        'emergency',
        'urgent',
        'patient_specific'
    ],

    // Cleanup intervals
    cleanup: {
        interval: 1800000,      // Clean up every 30 minutes
        maxAge: 86400000        // Remove items older than 24 hours
    }
};