// debug-api-calls.js
// This file helps debug specific API parameter combinations

async function debugAPICall(params, description) {
    console.log(`\n🔍 Testing: ${description}`);
    console.log(`📋 Parameters:`, params);
    
    const queryParams = new URLSearchParams();
    
    // Build query parameters exactly as the API expects
    if (params.condition) queryParams.append('query.cond', params.condition);
    if (params.intervention) queryParams.append('query.intr', params.intervention);
    if (params.title) queryParams.append('query.titles', params.title);
    if (params.term) queryParams.append('query.term', params.term);
    if (params.location) queryParams.append('query.locn', params.location);
    if (params.status) queryParams.append('query.recrs', params.status);
    if (params.studyType) queryParams.append('query.type', params.studyType);
    if (params.phase) queryParams.append('query.phase', params.phase);
    if (params.sponsor) queryParams.append('query.spons', params.sponsor);
    if (params.pageSize) queryParams.append('pageSize', params.pageSize);
    if (params.countTotal) queryParams.append('countTotal', params.countTotal);
    
    const url = `https://clinicaltrials.gov/api/v2/studies?${queryParams.toString()}`;
    console.log(`🌐 URL: ${url}`);
    
    try {
        const response = await fetch(url);
        console.log(`📊 Status: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
            const data = await response.json();
            console.log(`✅ Success! Found ${data.studies?.length || 0} studies`);
            
            if (data.studies && data.studies.length > 0) {
                const firstStudy = data.studies[0];
                console.log(`📄 First study: ${firstStudy.protocolSection?.identificationModule?.nctId || 'No NCT ID'}`);
                console.log(`📝 Title: ${firstStudy.protocolSection?.identificationModule?.briefTitle?.substring(0, 100) || 'No title'}...`);
            }
            
            return { success: true, data };
        } else {
            const errorText = await response.text();
            console.log(`❌ Error Response: ${errorText}`);
            return { success: false, error: errorText };
        }
    } catch (error) {
        console.log(`❌ Network Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function runDebugTests() {
    console.log('🚀 Starting API Debug Tests...\n');
    
    // Test 1: Simple condition search (this works from your log)
    await debugAPICall(
        { condition: 'diabetes', pageSize: 1 },
        'Simple diabetes search (known to work)'
    );
    
    // Test 2: Cancer search without status filter
    await debugAPICall(
        { condition: 'cancer', pageSize: 3 },
        'Cancer search without status filter'
    );
    
    // Test 3: Try different status values
    await debugAPICall(
        { condition: 'cancer', status: 'Recruiting', pageSize: 3 },
        'Cancer with "Recruiting" status (capital R)'
    );
    
    // Test 4: Try with different case
    await debugAPICall(
        { condition: 'cancer', status: 'recruiting', pageSize: 3 },
        'Cancer with "recruiting" status (lowercase)'
    );
    
    // Test 5: Alzheimer without additional parameters
    await debugAPICall(
        { condition: 'alzheimer', pageSize: 2 },
        'Simple Alzheimer search'
    );
    
    // Test 6: Alzheimer with proper disease name
    await debugAPICall(
        { condition: 'alzheimer disease', pageSize: 2 },
        'Alzheimer Disease (full name)'
    );
    
    // Test 7: Try intervention without other complex params
    await debugAPICall(
        { intervention: 'immunotherapy', pageSize: 2 },
        'Simple intervention search'
    );
    
    // Test 8: Try phase alone
    await debugAPICall(
        { phase: 'Phase 2', pageSize: 2 },
        'Phase 2 studies'
    );
    
    // Test 9: Test different phase formats
    await debugAPICall(
        { phase: 'PHASE2', pageSize: 2 },
        'PHASE2 format'
    );
    
    // Test 10: Multiple parameters (simplified)
    await debugAPICall(
        { condition: 'diabetes', intervention: 'insulin', pageSize: 2 },
        'Diabetes + insulin (simplified combination)'
    );
    
    console.log('\n🏁 Debug tests complete!');
    console.log('\n💡 Based on the results above, you can see which parameter combinations work.');
    console.log('   Use the successful patterns in your actual implementation.');
}

// Run the debug tests
runDebugTests().catch(console.error);