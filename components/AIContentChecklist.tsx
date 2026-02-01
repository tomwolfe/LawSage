import React from 'react';

interface AIContentChecklistProps {
  jurisdiction: string;
}

const AIContentChecklist: React.FC<AIContentChecklistProps> = ({ jurisdiction }) => {
  return (
    <div className="bg-blue-50 border border-blue-200 p-6 rounded-xl">
      <h3 className="text-lg font-bold text-blue-800 mb-4">10-Step AI Content Checklist</h3>
      <div className="space-y-3">
        <div className="flex items-start">
          <input type="checkbox" id="jurisdiction-check" className="mt-1 mr-2" />
          <label htmlFor="jurisdiction-check" className="text-sm text-blue-700">
            <strong>Jurisdiction:</strong> All legal advice is specific to {jurisdiction} law
          </label>
        </div>
        
        <div className="flex items-start">
          <input type="checkbox" id="irac-check" className="mt-1 mr-2" />
          <label htmlFor="irac-check" className="text-sm text-blue-700">
            <strong>IRAC/CRAC Framework:</strong> Issue, Rule, Application, Conclusion methodology applied
          </label>
        </div>
        
        <div className="flex items-start">
          <input type="checkbox" id="citation-check" className="mt-1 mr-2" />
          <label htmlFor="citation-check" className="text-sm text-blue-700">
            <strong>Citation Verification:</strong> All legal citations verified against current law
          </label>
        </div>
        
        <div className="flex items-start">
          <input type="checkbox" id="timeline-check" className="mt-1 mr-2" />
          <label htmlFor="timeline-check" className="text-sm text-blue-700">
            <strong>Timeline Accuracy:</strong> All deadlines and procedural requirements verified
          </label>
        </div>
        
        <div className="flex items-start">
          <input type="checkbox" id="bias-check" className="mt-1 mr-2" />
          <label htmlFor="bias-check" className="text-sm text-blue-700">
            <strong>Bias Detection:</strong> Potential bias in legal interpretation identified
          </label>
        </div>
        
        <div className="flex items-start">
          <input type="checkbox" id="disclaimer-check" className="mt-1 mr-2" />
          <label htmlFor="disclaimer-check" className="text-sm text-blue-700">
            <strong>Disclaimer:</strong> Proper legal disclaimer included (information, not advice)
          </label>
        </div>
        
        <div className="flex items-start">
          <input type="checkbox" id="adversarial-check" className="mt-1 mr-2" />
          <label htmlFor="adversarial-check" className="text-sm text-blue-700">
            <strong>Adversarial Analysis:</strong> Opposition strategies considered
          </label>
        </div>
        
        <div className="flex items-start">
          <input type="checkbox" id="procedural-check" className="mt-1 mr-2" />
          <label htmlFor="procedural-check" className="text-sm text-blue-700">
            <strong>Procedural Compliance:</strong> Local rules and court procedures followed
          </label>
        </div>
        
        <div className="flex items-start">
          <input type="checkbox" id="source-check" className="mt-1 mr-2" />
          <label htmlFor="source-check" className="text-sm text-blue-700">
            <strong>Source Reliability:</strong> All sources are from official legal databases
          </label>
        </div>
        
        <div className="flex items-start">
          <input type="checkbox" id="human-review" className="mt-1 mr-2" />
          <label htmlFor="human-review" className="text-sm text-blue-700">
            <strong>Human Review:</strong> Final review by qualified legal professional recommended
          </label>
        </div>
      </div>
      
      <div className="mt-4 p-3 bg-blue-100 rounded-lg">
        <p className="text-xs text-blue-800 italic">
          Note: This checklist is for informational purposes only. Always consult with a qualified attorney for legal advice.
        </p>
      </div>
    </div>
  );
};

export default AIContentChecklist;