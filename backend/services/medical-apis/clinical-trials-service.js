// backend/services/medical-apis/clinical-trials-service.js
// ClinicalTrials.gov Integration for Treatment Options

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const apiConfig = require('../../config/api-endpoints').clinicalTrials;
const cacheConfig = require('../../config/cache-config');

// Working ClinicalTrials.gov API v2 Implementation
// Based on actual API testing results

class ClinicalTrialsService{
    constructor() {
        this.baseUrl = 'https://clinicaltrials.gov/api/v2';
        this.defaultPageSize = 20;
        this.maxPageSize = 1000;
    }

    /**
     * Search for clinical trials with WORKING parameters only
     * @param {Object} params - Search parameters
     * @returns {Promise<Object>} - API response
     */
    async searchStudies(params = {}) {
        const queryParams = this.buildWorkingQueryParams(params);
        const url = `${this.baseUrl}/studies?${queryParams}`;
        
        try {
            console.log(`🔬 Searching Clinical Trials: ${url}`);
            const response = await fetch(url);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching clinical trials:', error);
            throw error;
        }
    }

    /**
     * Get a specific study by NCT ID
     * @param {string} nctId - NCT identifier (e.g., "NCT04267848")
     * @returns {Promise<Object>} - Study details
     */
    async getStudyById(nctId) {
        const url = `${this.baseUrl}/studies/${nctId}`;
        
        try {
            console.log(`🔬 Fetching study: ${nctId}`);
            const response = await fetch(url);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`Error fetching study ${nctId}:`, error);
            throw error;
        }
    }

    /**
     * Build query parameters using ONLY working parameters
     * Based on actual API testing - removes unsupported parameters
     * @param {Object} params - Parameters object
     * @returns {string} - URL encoded query string
     */
    buildWorkingQueryParams(params) {
        const queryParams = new URLSearchParams();

        // ✅ WORKING PARAMETERS (confirmed by testing)
        if (params.condition) queryParams.append('query.cond', params.condition);
        if (params.intervention) queryParams.append('query.intr', params.intervention);
        if (params.title) queryParams.append('query.titles', params.title);
        if (params.term) queryParams.append('query.term', params.term);
        if (params.location) queryParams.append('query.locn', params.location);
        
        // Pagination and formatting (these work)
        if (params.pageSize) queryParams.append('pageSize', Math.min(params.pageSize, this.maxPageSize));
        if (params.pageToken) queryParams.append('pageToken', params.pageToken);
        if (params.countTotal) queryParams.append('countTotal', params.countTotal);
        if (params.format === 'csv') queryParams.append('format', 'csv');
        
        // Specific NCT IDs
        if (params.nctIds && Array.isArray(params.nctIds)) {
            queryParams.append('filter.ids', params.nctIds.join(','));
        }

        // ❌ REMOVED NON-WORKING PARAMETERS:
        // - query.recrs (recruitment status) - returns "unknown parameter"
        // - query.phase (study phase) - returns "unknown parameter" 
        // - query.type (study type) - not tested but likely similar issue
        // - query.spons (sponsor) - not tested but likely similar issue
        // - Date filters - not tested in working combinations

        return queryParams.toString();
    }

    /**
     * Search with pagination to get all results
     * @param {Object} params - Search parameters
     * @returns {Promise<Array>} - All studies found
     */
    async searchAllStudies(params = {}) {
        let allStudies = [];
        let nextPageToken = null;
        let pageCount = 0;
        const maxPages = 10; // Reduced for safety

        do {
            const searchParams = {
                ...params,
                pageSize: this.maxPageSize,
                ...(nextPageToken && { pageToken: nextPageToken })
            };

            const response = await this.searchStudies(searchParams);
            
            if (response.studies) {
                allStudies = allStudies.concat(response.studies);
                console.log(`📄 Page ${++pageCount}: Found ${response.studies.length} studies (Total: ${allStudies.length})`);
            }

            nextPageToken = response.nextPageToken;

        } while (nextPageToken && pageCount < maxPages);

        console.log(`✅ Search complete: ${allStudies.length} total studies found`);
        return allStudies;
    }

    /**
     * Extract key information from study data
     * @param {Object} study - Study object from API response
     * @returns {Object} - Simplified study information
     */
    extractStudyInfo(study) {
        const protocol = study.protocolSection || {};
        const identification = protocol.identificationModule || {};
        const status = protocol.statusModule || {};
        const design = protocol.designModule || {};
        const eligibility = protocol.eligibilityModule || {};
        const contacts = protocol.contactsLocationsModule || {};

        return {
            nctId: identification.nctId,
            title: identification.briefTitle,
            officialTitle: identification.officialTitle,
            status: status.overallStatus,
            phase: design.phases?.[0] || 'N/A',
            studyType: design.studyType,
            conditions: protocol.conditionsModule?.conditions || [],
            interventions: protocol.armsInterventionsModule?.interventions || [],
            eligibility: {
                criteria: eligibility.eligibilityCriteria,
                gender: eligibility.sex,
                minimumAge: eligibility.minimumAge,
                maximumAge: eligibility.maximumAge
            },
            enrollment: design.enrollmentInfo?.count,
            startDate: status.startDateStruct?.date,
            completionDate: status.completionDateStruct?.date,
            sponsor: protocol.sponsorCollaboratorsModule?.leadSponsor?.name,
            locations: contacts.locations?.map(loc => ({
                facility: loc.facility,
                city: loc.city,
                state: loc.state,
                country: loc.country
            })) || []
        };
    }

    /**
     * Helper method to filter studies by status after retrieval
     * Since query.recrs doesn't work, we filter client-side
     * @param {Array} studies - Array of study objects
     * @param {string} status - Status to filter by (e.g., 'RECRUITING')
     * @returns {Array} - Filtered studies
     */
    filterByStatus(studies, status) {
        return studies.filter(study => {
            const studyStatus = study.protocolSection?.statusModule?.overallStatus;
            return studyStatus && studyStatus.toUpperCase() === status.toUpperCase();
        });
    }

    /**
     * Helper method to filter studies by phase after retrieval
     * Since query.phase doesn't work, we filter client-side
     * @param {Array} studies - Array of study objects
     * @param {string} phase - Phase to filter by (e.g., 'PHASE2')
     * @returns {Array} - Filtered studies
     */
    filterByPhase(studies, phase) {
        return studies.filter(study => {
            const phases = study.protocolSection?.designModule?.phases || [];
            return phases.some(p => p.toUpperCase() === phase.toUpperCase());
        });
    }
}