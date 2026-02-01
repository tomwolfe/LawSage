import React, { useState } from 'react';

interface VerificationChecklistProps {
  jurisdiction: string;
  onAuditComplete?: (isValid: boolean) => void;
}

const VerificationChecklist: React.FC<VerificationChecklistProps> = ({ jurisdiction, onAuditComplete }) => {
  const [checks, setChecks] = useState({
    jurisdiction: false,
    irac: false,
    bias: false,
    citations: false,
    timeline: false,
    disclaimer: false,
    adversarial: false,
    procedural: false,
    sourceReliability: false,
    humanReview: false
  });

  const handleCheckChange = (field: keyof typeof checks) => {
    setChecks(prev => {
      const newChecks = { ...prev, [field]: !prev[field] };
      
      // Check if all items are checked
      const allChecked = Object.values(newChecks).every(value => value);
      if (onAuditComplete) {
        onAuditComplete(allChecked);
      }
      
      return newChecks;
    });
  };

  return (
    <div className="bg-amber-50 border border-amber-200 p-6 rounded-xl">
      <h3 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2">
        📋 Human-in-the-Loop Verification Checklist
      </h3>
      <p className="text-sm text-amber-700 mb-4">
        Please review and verify each item before exporting your document:
      </p>
      
      <div className="space-y-3">
        <div className="flex items-start">
          <input 
            type="checkbox" 
            id="jurisdiction-check" 
            className="mt-1 mr-2" 
            checked={checks.jurisdiction}
            onChange={() => handleCheckChange('jurisdiction')}
          />
          <label htmlFor="jurisdiction-check" className="text-sm text-amber-700 flex-1">
            <strong>Jurisdiction:</strong> All legal advice is specific to {jurisdiction} law and complies with local rules
          </label>
        </div>
        
        <div className="flex items-start">
          <input 
            type="checkbox" 
            id="irac-check" 
            className="mt-1 mr-2" 
            checked={checks.irac}
            onChange={() => handleCheckChange('irac')}
          />
          <label htmlFor="irac-check" className="text-sm text-amber-700 flex-1">
            <strong>IRAC/CRAC Framework:</strong> Issue, Rule, Application, Conclusion methodology properly applied
          </label>
        </div>
        
        <div className="flex items-start">
          <input 
            type="checkbox" 
            id="bias-check" 
            className="mt-1 mr-2" 
            checked={checks.bias}
            onChange={() => handleCheckChange('bias')}
          />
          <label htmlFor="bias-check" className="text-sm text-amber-700 flex-1">
            <strong>Bias Detection:</strong> Potential bias in legal interpretation has been identified and addressed
          </label>
        </div>
        
        <div className="flex items-start">
          <input 
            type="checkbox" 
            id="citations-check" 
            className="mt-1 mr-2" 
            checked={checks.citations}
            onChange={() => handleCheckChange('citations')}
          />
          <label htmlFor="citations-check" className="text-sm text-amber-700 flex-1">
            <strong>Citation Verification:</strong> All legal citations have been verified against current law
          </label>
        </div>
        
        <div className="flex items-start">
          <input 
            type="checkbox" 
            id="timeline-check" 
            className="mt-1 mr-2" 
            checked={checks.timeline}
            onChange={() => handleCheckChange('timeline')}
          />
          <label htmlFor="timeline-check" className="text-sm text-amber-700 flex-1">
            <strong>Timeline Accuracy:</strong> All deadlines and procedural requirements have been verified
          </label>
        </div>
        
        <div className="flex items-start">
          <input 
            type="checkbox" 
            id="disclaimer-check" 
            className="mt-1 mr-2" 
            checked={checks.disclaimer}
            onChange={() => handleCheckChange('disclaimer')}
          />
          <label htmlFor="disclaimer-check" className="text-sm text-amber-700 flex-1">
            <strong>Disclaimer:</strong> Proper legal disclaimer included (information, not advice)
          </label>
        </div>
        
        <div className="flex items-start">
          <input 
            type="checkbox" 
            id="adversarial-check" 
            className="mt-1 mr-2" 
            checked={checks.adversarial}
            onChange={() => handleCheckChange('adversarial')}
          />
          <label htmlFor="adversarial-check" className="text-sm text-amber-700 flex-1">
            <strong>Adversarial Analysis:</strong> Opposition strategies and potential counterarguments considered
          </label>
        </div>
        
        <div className="flex items-start">
          <input 
            type="checkbox" 
            id="procedural-check" 
            className="mt-1 mr-2" 
            checked={checks.procedural}
            onChange={() => handleCheckChange('procedural')}
          />
          <label htmlFor="procedural-check" className="text-sm text-amber-700 flex-1">
            <strong>Procedural Compliance:</strong> All local rules and court procedures have been followed
          </label>
        </div>
        
        <div className="flex items-start">
          <input 
            type="checkbox" 
            id="source-check" 
            className="mt-1 mr-2" 
            checked={checks.sourceReliability}
            onChange={() => handleCheckChange('sourceReliability')}
          />
          <label htmlFor="source-check" className="text-sm text-amber-700 flex-1">
            <strong>Source Reliability:</strong> All sources are from official legal databases and verified
          </label>
        </div>
        
        <div className="flex items-start">
          <input 
            type="checkbox" 
            id="human-review" 
            className="mt-1 mr-2" 
            checked={checks.humanReview}
            onChange={() => handleCheckChange('humanReview')}
          />
          <label htmlFor="human-review" className="text-sm text-amber-700 flex-1">
            <strong>Human Review:</strong> Document has been reviewed by a qualified legal professional (recommended)
          </label>
        </div>
      </div>
      
      <div className="mt-4 p-3 bg-amber-100 rounded-lg border border-amber-300">
        <p className="text-xs text-amber-800">
          <strong>Note:</strong> This verification checklist ensures compliance with legal standards. 
          All items should be verified before using this information in any legal proceedings.
        </p>
      </div>
    </div>
  );
};

export default VerificationChecklist;