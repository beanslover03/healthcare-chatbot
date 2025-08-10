// backend/config/medical-mappings.js
// Medical concept mappings and classifications

module.exports = {
    // Enhanced symptom mappings to medical concepts
    symptoms: {
        'headache': {
            icd10: 'R51',
            snomedCT: '25064002',
            keywords: ['head pain', 'cephalgia', 'migraine', 'tension headache', 'head ache', 'skull pain'],
            severityClues: {
                severe: ['worst', 'severe', 'excruciating', 'unbearable', 'splitting', 'crushing'],
                moderate: ['bad', 'strong', 'intense', 'pounding', 'throbbing'],
                mild: ['slight', 'dull', 'minor', 'little', 'light']
            },
            relatedConditions: ['migraine', 'tension headache', 'cluster headache', 'sinus headache'],
            associatedSymptoms: ['nausea', 'vomiting', 'light sensitivity', 'sound sensitivity', 'neck stiffness'],
            urgencyFactors: ['sudden onset', 'worst ever', 'with fever', 'neck stiffness', 'vision changes']
        },

        'chest_pain': {
            icd10: 'R07.9',
            snomedCT: '29857009',
            keywords: ['chest discomfort', 'thoracic pain', 'angina', 'chest pressure', 'heart pain'],
            severityClues: {
                severe: ['crushing', 'stabbing', 'severe', 'sharp', 'radiating', 'tearing'],
                moderate: ['pressure', 'tight', 'heavy', 'aching', 'squeezing'],
                mild: ['slight', 'minor', 'occasional', 'mild discomfort']
            },
            relatedConditions: ['angina', 'myocardial infarction', 'costochondritis', 'acid reflux'],
            associatedSymptoms: ['shortness of breath', 'sweating', 'nausea', 'arm pain', 'jaw pain'],
            urgencyFactors: ['crushing pain', 'radiation to arm', 'shortness of breath', 'sweating', 'nausea']
        },

        'fever': {
            icd10: 'R50.9',
            snomedCT: '386661006',
            keywords: ['pyrexia', 'elevated temperature', 'hyperthermia', 'hot', 'chills', 'feverish'],
            severityClues: {
                severe: ['high fever', 'very hot', 'burning up', '103', '104'],
                moderate: ['fever', 'warm', 'elevated', '101', '102'],
                mild: ['low grade', 'slight fever', '99', '100']
            },
            relatedConditions: ['viral infection', 'bacterial infection', 'inflammatory condition'],
            associatedSymptoms: ['chills', 'sweating', 'fatigue', 'body aches', 'headache'],
            urgencyFactors: ['temperature >103°F', 'with stiff neck', 'difficulty breathing', 'severe headache']
        },

        'nausea': {
            icd10: 'R11.0',
            snomedCT: '422587007',
            keywords: ['queasiness', 'sick stomach', 'motion sickness', 'queasy', 'sick', 'nauseated'],
            severityClues: {
                severe: ['can\'t stop', 'constantly', 'severe', 'violent', 'persistent'],
                moderate: ['several times', 'often', 'repeatedly', 'significant'],
                mild: ['slight', 'little', 'occasionally', 'mild']
            },
            relatedConditions: ['gastroenteritis', 'food poisoning', 'migraine', 'pregnancy'],
            associatedSymptoms: ['vomiting', 'diarrhea', 'stomach pain', 'dizziness', 'headache'],
            urgencyFactors: ['blood in vomit', 'severe dehydration', 'severe abdominal pain', 'high fever']
        },

        'cough': {
            icd10: 'R05',
            snomedCT: '49727002',
            keywords: ['tussis', 'productive cough', 'dry cough', 'hacking', 'whooping'],
            severityClues: {
                severe: ['violent', 'persistent', 'constant', 'exhausting', 'blood'],
                moderate: ['frequent', 'bothersome', 'regular', 'productive'],
                mild: ['occasional', 'slight', 'dry', 'minor']
            },
            relatedConditions: ['bronchitis', 'pneumonia', 'asthma', 'COPD', 'viral infection'],
            associatedSymptoms: ['shortness of breath', 'chest pain', 'fever', 'fatigue', 'phlegm'],
            urgencyFactors: ['blood in sputum', 'severe breathing difficulty', 'high fever', 'chest pain']
        },

        'fatigue': {
            icd10: 'R53',
            snomedCT: '84229001',
            keywords: ['tiredness', 'exhaustion', 'weakness', 'malaise', 'lethargy', 'worn out'],
            severityClues: {
                severe: ['exhausted', 'can\'t function', 'debilitating', 'extreme'],
                moderate: ['very tired', 'significant', 'affecting daily life'],
                mild: ['tired', 'slightly worn', 'minor fatigue']
            },
            relatedConditions: ['chronic fatigue syndrome', 'anemia', 'depression', 'thyroid disorders'],
            associatedSymptoms: ['weakness', 'difficulty concentrating', 'muscle aches', 'sleep problems'],
            urgencyFactors: ['sudden onset', 'with chest pain', 'with breathing problems', 'severe weakness']
        },

        'dizziness': {
            icd10: 'R42',
            snomedCT: '404684003',
            keywords: ['vertigo', 'lightheadedness', 'unsteadiness', 'spinning', 'off balance'],
            severityClues: {
                severe: ['room spinning', 'can\'t stand', 'severe vertigo', 'falling'],
                moderate: ['noticeable', 'affecting balance', 'significant'],
                mild: ['slight', 'occasional', 'minor lightheadedness']
            },
            relatedConditions: ['vertigo', 'labyrinthitis', 'hypotension', 'dehydration'],
            associatedSymptoms: ['nausea', 'vomiting', 'hearing loss', 'headache', 'balance problems'],
            urgencyFactors: ['sudden onset', 'with headache', 'with chest pain', 'loss of consciousness']
        }
    },

    // Emergency condition patterns
    emergencyPatterns: {
        'heart_attack': {
            keywords: ['crushing chest pain', 'heart attack', 'myocardial infarction'],
            symptoms: ['chest_pain', 'shortness_of_breath', 'sweating', 'nausea'],
            redFlags: ['crushing pain', 'radiation to arm', 'radiation to jaw', 'severe sweating']
        },
        'stroke': {
            keywords: ['stroke', 'face drooping', 'arm weakness', 'speech problems'],
            symptoms: ['sudden severe headache', 'facial drooping', 'arm weakness', 'speech difficulty'],
            redFlags: ['sudden onset', 'worst headache ever', 'one-sided weakness', 'slurred speech']
        },
        'severe_allergic_reaction': {
            keywords: ['anaphylaxis', 'severe allergic reaction', 'can\'t breathe'],
            symptoms: ['difficulty breathing', 'swelling', 'widespread rash', 'rapid pulse'],
            redFlags: ['throat swelling', 'difficulty breathing', 'loss of consciousness', 'severe rash']
        }
    },

    // Medication categories for OTC recommendations
    medicationCategories: {
        'pain_relievers': {
            indications: ['headache', 'muscle_pain', 'fever'],
            medications: [
                {
                    name: 'Acetaminophen (Tylenol)',
                    activeIngredient: 'acetaminophen',
                    dosage: '325-650mg every 4-6 hours, max 3000mg/day',
                    warnings: ['liver damage risk', 'avoid alcohol'],
                    contraindications: ['liver disease']
                },
                {
                    name: 'Ibuprofen (Advil, Motrin)',
                    activeIngredient: 'ibuprofen',
                    dosage: '200-400mg every 4-6 hours, max 1200mg/day',
                    warnings: ['take with food', 'stomach irritation risk'],
                    contraindications: ['stomach ulcers', 'kidney disease']
                }
            ]
        },
        'antihistamines': {
            indications: ['allergies', 'itching', 'runny_nose'],
            medications: [
                {
                    name: 'Diphenhydramine (Benadryl)',
                    activeIngredient: 'diphenhydramine',
                    dosage: '25-50mg every 4-6 hours',
                    warnings: ['causes drowsiness', 'avoid alcohol'],
                    contraindications: ['glaucoma', 'enlarged prostate']
                },
                {
                    name: 'Loratadine (Claritin)',
                    activeIngredient: 'loratadine',
                    dosage: '10mg once daily',
                    warnings: ['non-drowsy formula'],
                    contraindications: ['liver disease']
                }
            ]
        },
        'cough_suppressants': {
            indications: ['dry_cough'],
            medications: [
                {
                    name: 'Dextromethorphan (Robitussin DM)',
                    activeIngredient: 'dextromethorphan',
                    dosage: '10-20mg every 4 hours, max 120mg/day',
                    warnings: ['for dry cough only', 'may cause drowsiness'],
                    contraindications: ['productive cough', 'asthma']
                }
            ]
        }
    },

    // Duration patterns for symptom analysis
    durationPatterns: {
        acute: ['sudden', 'suddenly', 'just started', 'this morning', 'today'],
        subacute: ['few days', 'this week', 'recent'],
        chronic: ['weeks', 'months', 'ongoing', 'persistent', 'chronic', 'long time']
    },

    // Severity indicators
    severityIndicators: {
        mild: ['slight', 'minor', 'little', 'barely noticeable', '1', '2', '3'],
        moderate: ['moderate', 'noticeable', 'significant', 'bothersome', '4', '5', '6'],
        severe: ['severe', 'terrible', 'excruciating', 'unbearable', 'worst', '7', '8', '9', '10']
    },

    // Body system classifications
    bodySystems: {
        cardiovascular: ['chest_pain', 'palpitations', 'shortness_of_breath'],
        neurological: ['headache', 'dizziness', 'weakness', 'numbness'],
        gastrointestinal: ['nausea', 'vomiting', 'stomach_pain', 'diarrhea'],
        respiratory: ['cough', 'shortness_of_breath', 'chest_pain'],
        musculoskeletal: ['muscle_pain', 'joint_pain', 'back_pain'],
        general: ['fever', 'fatigue', 'weight_loss']
    }
};