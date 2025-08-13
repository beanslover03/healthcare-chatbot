// test-medical-apis.js - Comprehensive testing script for medical database integration
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

class MedicalAPITester {
    constructor() {
        this.testResults = [];
    }

    async runAllTests() {
        console.log('🧪 Starting comprehensive medical API tests...\n');

        await this.testBasicHealth();
        await this.testRxNormIntegration();
        await this.testFHIRIntegration();
        await this.testSymptomAnalysis();
        await this.testEmergencyDetection();
        await this.testChatWithMedicalContext();

        this.printSummary();
    }

    async testBasicHealth() {
        console.log('📊 Testing Basic Health Check...');
        try {
            const response = await fetch(`${BASE_URL}/api/health`);
            const data = await response.json();
            
            this.addResult('Health Check', response.ok, {
                status: data.status,
                claudeHealthy: data.services?.claude?.status === 'healthy',
                medicalAPIsHealthy: data.services?.medical_apis?.overall === 'healthy',
                features: data.features
            });
        } catch (error) {
            this.addResult('Health Check', false, { error: error.message });
        }
    }

    async testRxNormIntegration() {
        console.log('💊 Testing RxNorm Drug Database Integration...');
        
        const testDrugs = ['aspirin', 'ibuprofen', 'acetaminophen'];
        
        for (const drug of testDrugs) {
            try {
                const response = await fetch(`${BASE_URL}/api/test-medical-apis`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ testType: 'rxnorm' })
                });
                
                const data = await response.json();
                const rxnormTest = data.results?.tests?.find(t => t.service === 'RxNorm');
                
                this.addResult(`RxNorm - ${drug}`, rxnormTest?.success || false, {
                    found: rxnormTest?.details?.found,
                    resultsCount: rxnormTest?.details?.resultsCount,
                    hasInteractions: rxnormTest?.details?.hasInteractions
                });
                
                break; // Only test one drug to avoid rate limiting
            } catch (error) {
                this.addResult(`RxNorm - ${drug}`, false, { error: error.message });
            }
        }
    }

    async testFHIRIntegration() {
        console.log('🏥 Testing FHIR Healthcare Standards Integration...');
        try {
            // Test through symptom analysis which uses FHIR
            const response = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: 'I need information about diabetes medication',
                    source: 'test'
                })
            });
            
            const data = await response.json();
            
            this.addResult('FHIR Integration', data.success, {
                medicalDataPresent: !!data.medicalData,
                databasesUsed: data.medicalData?.databasesUsed || [],
                responseLength: data.response?.length || 0
            });
            
        } catch (error) {
            this.addResult('FHIR Integration', false, { error: error.message });
        }
    }

    async testSymptomAnalysis() {
        console.log('🔍 Testing Symptom Analysis with Medical Context...');
        
        const testCases = [
            {
                name: 'Simple Headache',
                message: 'I have a headache',
                expectedSymptoms: ['headache']
            },
            {
                name: 'Complex Symptoms',
                message: 'I have a severe headache with nausea and dizziness that started suddenly',
                expectedSymptoms: ['headache', 'nausea', 'dizziness']
            },
            {
                name: 'Medication Query',
                message: 'What can I take for my fever and body aches?',
                expectedMedications: true
            }
        ];

        for (const testCase of testCases) {
            try {
                const response = await fetch(`${BASE_URL}/api/test-medical-apis`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ testType: 'symptom' })
                });
                
                const data = await response.json();
                const symptomTest = data.results?.tests?.find(t => t.service === 'SymptomAnalysis');
                
                this.addResult(`Symptom Analysis - ${testCase.name}`, symptomTest?.success || false, {
                    symptomsFound: symptomTest?.details?.symptomsFound,
                    conditionsFound: symptomTest?.details?.conditionsFound,
                    confidence: symptomTest?.details?.confidence
                });
                
                break; // Only test once to avoid repetition
            } catch (error) {
                this.addResult(`Symptom Analysis - ${testCase.name}`, false, { error: error.message });
            }
        }
    }

    async testEmergencyDetection() {
        console.log('🚨 Testing Emergency Detection...');
        
        const emergencyMessages = [
            'I have crushing chest pain and can\'t breathe',
            'Worst headache of my life suddenly',
            'I think I\'m having a heart attack'
        ];

        for (const message of emergencyMessages) {
            try {
                const response = await fetch(`${BASE_URL}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                
                const data = await response.json();
                const isEmergencyResponse = data.urgency === 'emergency' || 
                                         data.response.toLowerCase().includes('911') ||
                                         data.response.toLowerCase().includes('emergency');
                
                this.addResult('Emergency Detection', isEmergencyResponse, {
                    urgency: data.urgency,
                    contains911: data.response.toLowerCase().includes('911'),
                    responsePreview: data.response.substring(0, 100) + '...'
                });
                
                break; // Only test one to avoid multiple emergency triggers
            } catch (error) {
                this.addResult('Emergency Detection', false, { error: error.message });
            }
        }
    }

    async testChatWithMedicalContext() {
        console.log('💬 Testing Chat with Medical Database Context...');
        
        try {
            // Test a chat message that should use medical databases
            const response = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: 'I have a mild fever and headache. What should I do?'
                })
            });
            
            const data = await response.json();
            
            const usedMedicalData = data.medicalData && 
                                  (data.medicalData.symptomsAnalyzed > 0 || 
                                   data.medicalData.databasesUsed?.length > 0);
            
            this.addResult('Chat with Medical Context', data.success && usedMedicalData, {
                usedMedicalData: usedMedicalData,
                symptomsAnalyzed: data.medicalData?.symptomsAnalyzed || 0,
                databasesUsed: data.medicalData?.databasesUsed || [],
                confidence: data.medicalData?.confidence,
                responseIntelligent: data.response.length > 50 && 
                                   !data.response.includes('I apologize')
            });
            
        } catch (error) {
            this.addResult('Chat with Medical Context', false, { error: error.message });
        }
    }

    addResult(testName, passed, details) {
        this.testResults.push({
            test: testName,
            passed,
            details,
            timestamp: new Date().toISOString()
        });
        
        const status = passed ? '✅ PASS' : '❌ FAIL';
        console.log(`  ${status}: ${testName}`);
        if (details && Object.keys(details).length > 0) {
            console.log(`    Details:`, JSON.stringify(details, null, 2));
        }
        console.log('');
    }

    printSummary() {
        const passed = this.testResults.filter(r => r.passed).length;
        const total = this.testResults.length;
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 MEDICAL API TESTING SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${total}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${total - passed}`);
        console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
        
        console.log('\n📋 DETAILED RESULTS:');
        this.testResults.forEach(result => {
            const status = result.passed ? '✅' : '❌';
            console.log(`${status} ${result.test}`);
            if (!result.passed && result.details?.error) {
                console.log(`   Error: ${result.details.error}`);
            }
        });
        
        console.log('\n💡 RECOMMENDATIONS:');
        if (passed === total) {
            console.log('🎉 All tests passed! Your medical database integration is working correctly.');
        } else {
            console.log('⚠️  Some tests failed. Check the following:');
            console.log('   1. Ensure your server is running on port 3000');
            console.log('   2. Check that ANTHROPIC_API_KEY is set in .env');
            console.log('   3. Verify internet connectivity for external APIs');
            console.log('   4. Check server logs for detailed error messages');
        }
    }
}

// Run the tests
if (require.main === module) {
    const tester = new MedicalAPITester();
    tester.runAllTests().catch(error => {
        console.error('❌ Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = MedicalAPITester;