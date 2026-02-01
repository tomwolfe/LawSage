import { ReliabilityLayer } from '../src/lib/reliability/ReliabilityLayer';

describe('ReliabilityLayer', () => {
  describe('validate', () => {
    it('should validate a complete legal analysis output', () => {
      const validOutput = {
        disclaimer: "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se...",
        strategy: "Your legal strategy here",
        adversarial_strategy: "Opposition arguments and 'red-team' analysis",
        procedural_roadmap: [
          {
            step: 1,
            title: "First step",
            description: "Detailed description",
            status: "pending"
          }
        ],
        filing_template: "Actual legal filing template here",
        citations: [
          {
            text: "12 U.S.C. § 345",
            source: "federal statute",
            is_verified: false
          },
          {
            text: "Cal. Civ. Code § 1708",
            source: "state code",
            is_verified: false
          },
          {
            text: "Rule 12(b)(6)",
            source: "court rule",
            is_verified: false
          }
        ],
        sources: ["Additional sources"],
        local_logistics: {
          courthouse_address: "123 Main St, City, State",
          filing_fees: "$435"
        },
        procedural_checks: ["Results of procedural technicality checks"]
      };

      const result = ReliabilityLayer.validate(JSON.stringify(validOutput));
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when citations are missing', () => {
      const invalidOutput = {
        disclaimer: "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se...",
        strategy: "Your legal strategy here",
        adversarial_strategy: "Opposition arguments and 'red-team' analysis",
        procedural_roadmap: [
          {
            step: 1,
            title: "First step",
            description: "Detailed description",
            status: "pending"
          }
        ],
        filing_template: "Actual legal filing template here",
        // citations missing
        sources: ["Additional sources"],
        local_logistics: {
          courthouse_address: "123 Main St, City, State",
          filing_fees: "$435"
        },
        procedural_checks: ["Results of procedural technicality checks"]
      };

      const result = ReliabilityLayer.validate(JSON.stringify(invalidOutput));
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Citations array is missing or not an array');
    });

    it('should fail validation when citations are less than 3', () => {
      const invalidOutput = {
        disclaimer: "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se...",
        strategy: "Your legal strategy here",
        adversarial_strategy: "Opposition arguments and 'red-team' analysis",
        procedural_roadmap: [
          {
            step: 1,
            title: "First step",
            description: "Detailed description",
            status: "pending"
          }
        ],
        filing_template: "Actual legal filing template here",
        citations: [  // Only 2 citations, need at least 3
          {
            text: "12 U.S.C. § 345",
            source: "federal statute",
            is_verified: false
          },
          {
            text: "Cal. Civ. Code § 1708",
            source: "state code",
            is_verified: false
          }
        ],
        sources: ["Additional sources"],
        local_logistics: {
          courthouse_address: "123 Main St, City, State",
          filing_fees: "$435"
        },
        procedural_checks: ["Results of procedural technicality checks"]
      };

      const result = ReliabilityLayer.validate(JSON.stringify(invalidOutput));
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Minimum 3 citations required, found 2');
    });

    it('should fail validation when procedural roadmap is missing', () => {
      const invalidOutput = {
        disclaimer: "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se...",
        strategy: "Your legal strategy here",
        adversarial_strategy: "Opposition arguments and 'red-team' analysis",
        // procedural_roadmap missing
        filing_template: "Actual legal filing template here",
        citations: [
          {
            text: "12 U.S.C. § 345",
            source: "federal statute",
            is_verified: false
          },
          {
            text: "Cal. Civ. Code § 1708",
            source: "state code",
            is_verified: false
          },
          {
            text: "Rule 12(b)(6)",
            source: "court rule",
            is_verified: false
          }
        ],
        sources: ["Additional sources"],
        local_logistics: {
          courthouse_address: "123 Main St, City, State",
          filing_fees: "$435"
        },
        procedural_checks: ["Results of procedural technicality checks"]
      };

      const result = ReliabilityLayer.validate(JSON.stringify(invalidOutput));
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Procedural roadmap array is missing or not an array');
    });

    it('should fail validation when adversarial strategy is missing', () => {
      const invalidOutput = {
        disclaimer: "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se...",
        strategy: "Your legal strategy here",
        // adversarial_strategy missing
        procedural_roadmap: [
          {
            step: 1,
            title: "First step",
            description: "Detailed description",
            status: "pending"
          }
        ],
        filing_template: "Actual legal filing template here",
        citations: [
          {
            text: "12 U.S.C. § 345",
            source: "federal statute",
            is_verified: false
          },
          {
            text: "Cal. Civ. Code § 1708",
            source: "state code",
            is_verified: false
          },
          {
            text: "Rule 12(b)(6)",
            source: "court rule",
            is_verified: false
          }
        ],
        sources: ["Additional sources"],
        local_logistics: {
          courthouse_address: "123 Main St, City, State",
          filing_fees: "$435"
        },
        procedural_checks: ["Results of procedural technicality checks"]
      };

      const result = ReliabilityLayer.validate(JSON.stringify(invalidOutput));
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Adversarial strategy is missing or not a string');
    });

    it('should fail validation when local logistics is missing', () => {
      const invalidOutput = {
        disclaimer: "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se...",
        strategy: "Your legal strategy here",
        adversarial_strategy: "Opposition arguments and 'red-team' analysis",
        procedural_roadmap: [
          {
            step: 1,
            title: "First step",
            description: "Detailed description",
            status: "pending"
          }
        ],
        filing_template: "Actual legal filing template here",
        citations: [
          {
            text: "12 U.S.C. § 345",
            source: "federal statute",
            is_verified: false
          },
          {
            text: "Cal. Civ. Code § 1708",
            source: "state code",
            is_verified: false
          },
          {
            text: "Rule 12(b)(6)",
            source: "court rule",
            is_verified: false
          }
        ],
        sources: ["Additional sources"],
        // local_logistics missing
        procedural_checks: ["Results of procedural technicality checks"]
      };

      const result = ReliabilityLayer.validate(JSON.stringify(invalidOutput));
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Local logistics object is missing or not an object');
    });
  });

  describe('structuralHardening', () => {
    it('should return true for a properly formatted output with all required elements', () => {
      const validOutput = `
        LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice.
        
        Here is your legal strategy...
        
        ADVERSARIAL STRATEGY:
        Potential opposition arguments...
        
        PROCEDURAL ROADMAP:
        Step 1: File initial complaint
        Step 2: Serve defendant
        
        CITATIONS:
        - 12 U.S.C. § 345
        - Cal. Civ. Code § 1708
        - Rule 12(b)(6)
        
        LOCAL LOGISTICS:
        Courthouse Address: 123 Main St, City, State
        Filing Fees: $435
      `;

      const result = ReliabilityLayer.structuralHardening(validOutput);
      
      expect(result).toBe(true);
    });

    it('should return false when citations are less than 3', () => {
      const invalidOutput = `
        LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice.

        Here is your legal strategy...

        ADVERSARIAL STRATEGY:
        Potential opposition arguments...

        PROCEDURAL ROADMAP:
        Step 1: File initial complaint
        Step 2: Serve defendant

        CITATIONS:
        - 12 U.S.C. § 345
        - Cal. Civ. Code § 1708

        LOCAL LOGISTICS:
        Courthouse Address: 123 Main St, City, State
        Filing Fees: $435
      `;

      const result = ReliabilityLayer.structuralHardening(invalidOutput);

      expect(result).toBe(false);
    });

    it('should return false when disclaimer is missing', () => {
      const invalidOutput = `
        Here is your legal strategy...
        
        ADVERSARIAL STRATEGY:
        Potential opposition arguments...
        
        PROCEDURAL ROADMAP:
        Step 1: File initial complaint
        Step 2: Serve defendant
        
        CITATIONS:
        - 12 U.S.C. § 345
        - Cal. Civ. Code § 1708
        - Rule 12(b)(6)
        
        LOCAL LOGISTICS:
        Courthouse Address: 123 Main St, City, State
        Filing Fees: $435
      `;

      const result = ReliabilityLayer.structuralHardening(invalidOutput);
      
      expect(result).toBe(false);
    });
  });

  describe('validateAndFix', () => {
    it('should fix an incomplete output to meet requirements', () => {
      const incompleteOutput = {
        // Missing most fields
        strategy: "Basic strategy"
      };

      const result = ReliabilityLayer.validateAndFix(JSON.stringify(incompleteOutput));
      
      // Should have all required fields now
      expect(result.disclaimer).toBeDefined();
      expect(result.citations).toBeDefined();
      expect(result.citations.length).toBeGreaterThanOrEqual(3);
      expect(result.procedural_roadmap).toBeDefined();
      expect(result.adversarial_strategy).toBeDefined();
      expect(result.local_logistics).toBeDefined();
    });
  });

  describe('comprehensiveValidation', () => {
    it('should validate using both schema and structural checks', () => {
      const validOutput = `{
        "disclaimer": "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice. Always consult with a qualified attorney.",
        "strategy": "Your legal strategy here",
        "adversarial_strategy": "Opposition arguments and 'red-team' analysis of the user's case",
        "procedural_roadmap": [
          {
            "step": 1,
            "title": "First step title",
            "description": "Detailed description of what to do",
            "estimated_time": "Timeframe for completion",
            "required_documents": ["List of documents needed"],
            "status": "pending"
          }
        ],
        "filing_template": "Actual legal filing template here",
        "citations": [
          {
            "text": "12 U.S.C. § 345",
            "source": "federal statute",
            "url": "optional URL to citation source",
            "is_verified": false,
            "verification_source": "optional source used to verify"
          },
          {
            "text": "Cal. Civ. Code § 1708",
            "source": "state code",
            "url": "optional URL to citation source",
            "is_verified": false,
            "verification_source": "optional source used to verify"
          },
          {
            "text": "Rule 12(b)(6)",
            "source": "court rule",
            "url": "optional URL to citation source",
            "is_verified": false,
            "verification_source": "optional source used to verify"
          }
        ],
        "sources": ["Additional sources referenced in the response"],
        "local_logistics": {
          "courthouse_address": "Complete address of the courthouse",
          "filing_fees": "Specific filing fees for this case type",
          "dress_code": "Courthouse dress code requirements",
          "parking_info": "Parking information near courthouse",
          "hours_of_operation": "Courthouse hours of operation",
          "local_rules_url": "URL to local rules of court"
        },
        "procedural_checks": ["Results of procedural technicality checks against Local Rules of Court"]
      }`;

      const result = ReliabilityLayer.comprehensiveValidation(validOutput);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});