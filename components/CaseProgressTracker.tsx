/**
 * Procedural State Machine for Legal Cases
 * 
 * Tracks the procedural posture of a case and provides:
 * - State-aware UI components
 * - Deadline calculations based on current state
 * - Next action recommendations
 * - Document requirements per state
 */

'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, AlertCircle, CheckCircle, FileText, Gavel, Scale, ArrowRight } from 'lucide-react';

/**
 * Legal case procedural states
 */
export type CaseState = 
  | 'pre_filing'
  | 'summons_received'
  | 'answer_filed'
  | 'discovery'
  | 'motions'
  | 'pre_trial'
  | 'trial'
  | 'judgment'
  | 'appeal'
  | 'closed';

/**
 * State transition definition
 */
interface StateTransition {
  from: CaseState;
  to: CaseState;
  trigger: string;
  requiredDocuments?: string[];
  deadlineDays?: number;
  description: string;
}

/**
 * Case state with metadata
 */
export interface CaseStateInfo {
  state: CaseState;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  typicalDuration: string;
  keyDeadlines: { name: string; days: number }[];
  requiredActions: string[];
  nextPossibleStates: CaseState[];
}

/**
 * All possible state transitions
 */
const STATE_TRANSITIONS: StateTransition[] = [
  {
    from: 'pre_filing',
    to: 'summons_received',
    trigger: 'Complaint Filed & Summons Served',
    description: 'Case initiated and defendant served'
  },
  {
    from: 'summons_received',
    to: 'answer_filed',
    trigger: 'Answer Filed',
    requiredDocuments: ['Answer to Complaint'],
    deadlineDays: 30,
    description: 'Defendant responds to complaint'
  },
  {
    from: 'answer_filed',
    to: 'discovery',
    trigger: 'Discovery Phase Started',
    description: 'Parties exchange information'
  },
  {
    from: 'discovery',
    to: 'motions',
    trigger: 'Dispositive Motions Filed',
    requiredDocuments: ['Motion for Summary Judgment'],
    description: 'Pre-trial motions submitted'
  },
  {
    from: 'discovery',
    to: 'pre_trial',
    trigger: 'Discovery Completed',
    description: 'Ready for trial preparation'
  },
  {
    from: 'motions',
    to: 'pre_trial',
    trigger: 'Motions Resolved',
    description: 'Motions decided, proceeding to trial'
  },
  {
    from: 'pre_trial',
    to: 'trial',
    trigger: 'Trial Commenced',
    description: 'Trial in progress'
  },
  {
    from: 'trial',
    to: 'judgment',
    trigger: 'Verdict/Judgment Entered',
    description: 'Court issues decision'
  },
  {
    from: 'judgment',
    to: 'appeal',
    trigger: 'Notice of Appeal Filed',
    requiredDocuments: ['Notice of Appeal'],
    deadlineDays: 30,
    description: 'Appeal initiated'
  },
  {
    from: 'judgment',
    to: 'closed',
    trigger: 'Case Closed',
    description: 'All proceedings completed'
  },
  {
    from: 'appeal',
    to: 'closed',
    trigger: 'Appeal Resolved',
    description: 'Appellate process complete'
  }
];

/**
 * State definitions with UI metadata
 */
const STATE_DEFINITIONS: Record<CaseState, CaseStateInfo> = {
  pre_filing: {
    state: 'pre_filing',
    name: 'Pre-Filing',
    description: 'Case preparation before filing',
    icon: <FileText size={20} />,
    color: 'bg-slate-100 text-slate-700',
    typicalDuration: 'Variable',
    keyDeadlines: [],
    requiredActions: [
      'Gather evidence and documentation',
      'Identify legal claims',
      'Draft complaint/petition',
      'Calculate filing fees',
      'Determine proper venue'
    ],
    nextPossibleStates: ['summons_received']
  },
  summons_received: {
    state: 'summons_received',
    name: 'Summons Received',
    description: 'Defendant has been served with summons and complaint',
    icon: <AlertCircle size={20} />,
    color: 'bg-red-100 text-red-700',
    typicalDuration: '30 days',
    keyDeadlines: [
      { name: 'Answer Due', days: 30 },
      { name: 'Motion to Dismiss', days: 21 }
    ],
    requiredActions: [
      'Review complaint carefully',
      'Calendar answer deadline',
      'Consider motion to dismiss',
      'Gather responsive documents',
      'Preserve evidence'
    ],
    nextPossibleStates: ['answer_filed']
  },
  answer_filed: {
    state: 'answer_filed',
    name: 'Answer Filed',
    description: 'Defendant has filed answer to complaint',
    icon: <FileText size={20} />,
    color: 'bg-blue-100 text-blue-700',
    typicalDuration: '2-4 weeks',
    keyDeadlines: [
      { name: 'Initial Disclosures', days: 14 },
      { name: 'Discovery Plan', days: 30 }
    ],
    requiredActions: [
      'Serve answer on all parties',
      'File initial disclosures',
      'Prepare discovery requests',
      'Schedule discovery conference',
      'Develop case strategy'
    ],
    nextPossibleStates: ['discovery']
  },
  discovery: {
    state: 'discovery',
    name: 'Discovery',
    description: 'Parties exchange information and evidence',
    icon: <Search size={20} />,
    color: 'bg-yellow-100 text-yellow-700',
    typicalDuration: '3-6 months',
    keyDeadlines: [
      { name: 'Interrogatory Responses', days: 30 },
      { name: 'Document Production', days: 30 },
      { name: 'Depositions', days: 60 },
      { name: 'Expert Disclosures', days: 90 }
    ],
    requiredActions: [
      'Serve discovery requests',
      'Respond to discovery requests',
      'Conduct depositions',
      'Review produced documents',
      'Identify expert witnesses'
    ],
    nextPossibleStates: ['motions', 'pre_trial']
  },
  motions: {
    state: 'motions',
    name: 'Motions Phase',
    description: 'Pre-trial motions being considered',
    icon: <Gavel size={20} />,
    color: 'bg-orange-100 text-orange-700',
    typicalDuration: '1-3 months',
    keyDeadlines: [
      { name: 'Opposition Brief', days: 21 },
      { name: 'Reply Brief', days: 14 },
      { name: 'Motion Hearing', days: 60 }
    ],
    requiredActions: [
      'File dispositive motions',
      'Brief legal arguments',
      'Prepare for motion hearing',
      'Request judicial notice',
      'Consider settlement'
    ],
    nextPossibleStates: ['pre_trial']
  },
  pre_trial: {
    state: 'pre_trial',
    name: 'Pre-Trial',
    description: 'Preparing for trial',
    icon: <Scale size={20} />,
    color: 'bg-purple-100 text-purple-700',
    typicalDuration: '1-2 months',
    keyDeadlines: [
      { name: 'Trial Brief', days: 30 },
      { name: 'Witness List', days: 21 },
      { name: 'Exhibit List', days: 21 },
      { name: 'Jury Instructions', days: 14 }
    ],
    requiredActions: [
      'Prepare trial brief',
      'Organize exhibits',
      'Prepare witnesses',
      'Draft jury instructions',
      'Create trial notebook'
    ],
    nextPossibleStates: ['trial']
  },
  trial: {
    state: 'trial',
    name: 'Trial',
    description: 'Trial proceedings',
    icon: <Gavel size={20} />,
    color: 'bg-red-100 text-red-700',
    typicalDuration: '1-4 weeks',
    keyDeadlines: [],
    requiredActions: [
      'Jury selection',
      'Opening statements',
      'Present evidence',
      'Cross-examine witnesses',
      'Closing arguments'
    ],
    nextPossibleStates: ['judgment']
  },
  judgment: {
    state: 'judgment',
    name: 'Judgment',
    description: 'Court has issued decision',
    icon: <Scale size={20} />,
    color: 'bg-green-100 text-green-700',
    typicalDuration: 'Variable',
    keyDeadlines: [
      { name: 'Appeal Deadline', days: 30 },
      { name: 'Post-Trial Motions', days: 28 }
    ],
    requiredActions: [
      'Review judgment',
      'Evaluate appeal options',
      'Consider post-trial motions',
      'Plan enforcement/collection',
      'Assess costs and fees'
    ],
    nextPossibleStates: ['appeal', 'closed']
  },
  appeal: {
    state: 'appeal',
    name: 'Appeal',
    description: 'Appellate proceedings',
    icon: <Scale size={20} />,
    color: 'bg-indigo-100 text-indigo-700',
    typicalDuration: '6-18 months',
    keyDeadlines: [
      { name: 'Record Preparation', days: 60 },
      { name: 'Appellant Brief', days: 40 },
      { name: 'Appellee Brief', days: 30 },
      { name: 'Oral Argument', days: 180 }
    ],
    requiredActions: [
      'File notice of appeal',
      'Order trial record',
      'Prepare appellate brief',
      'Prepare for oral argument',
      'Consider settlement'
    ],
    nextPossibleStates: ['closed']
  },
  closed: {
    state: 'closed',
    name: 'Closed',
    description: 'Case concluded',
    icon: <CheckCircle size={20} />,
    color: 'bg-gray-100 text-gray-700',
    typicalDuration: 'N/A',
    keyDeadlines: [],
    requiredActions: [
      'Archive case documents',
      'Satisfy judgment (if applicable)',
      'Close client file',
      'Update case management system'
    ],
    nextPossibleStates: []
  }
};

// Add Search icon import
import { Search } from 'lucide-react';

interface CaseProgressTrackerProps {
  currentState: CaseState;
  onStateChange?: (newState: CaseState) => void;
  caseStartDate?: Date;
}

/**
 * Case Progress Tracker Component
 * Visualizes the current state and allows state transitions
 */
export function CaseProgressTracker({
  currentState,
  onStateChange,
  caseStartDate
}: CaseProgressTrackerProps) {
  const [selectedTransition, setSelectedTransition] = useState<StateTransition | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const stateInfo = STATE_DEFINITIONS[currentState];

  // Get possible next states
  const possibleTransitions = STATE_TRANSITIONS.filter(
    t => t.from === currentState
  );

  // Update current time every minute for days elapsed calculation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Calculate days elapsed
  const daysElapsed = caseStartDate
    ? Math.floor((currentTime.getTime() - caseStartDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800">Case Progress</h2>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Clock size={16} />
          <span>Day {daysElapsed} of case</span>
        </div>
      </div>

      {/* Current State Display */}
      <div className={`rounded-lg p-4 mb-6 ${stateInfo.color}`}>
        <div className="flex items-center gap-3">
          {stateInfo.icon}
          <div>
            <h3 className="font-semibold text-lg">{stateInfo.name}</h3>
            <p className="text-sm opacity-80">{stateInfo.description}</p>
          </div>
        </div>
      </div>

      {/* Key Deadlines */}
      {stateInfo.keyDeadlines.length > 0 && (
        <div className="mb-6">
          <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Calendar size={18} />
            Key Deadlines
          </h4>
          <div className="grid gap-2">
            {stateInfo.keyDeadlines.map((deadline, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200"
              >
                <span className="text-slate-700">{deadline.name}</span>
                <span className="font-semibold text-amber-700">
                  {deadline.days} days
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Required Actions */}
      <div className="mb-6">
        <h4 className="font-semibold text-slate-700 mb-3">Required Actions</h4>
        <ul className="space-y-2">
          {stateInfo.requiredActions.map((action, index) => (
            <li key={index} className="flex items-start gap-2 text-slate-600">
              <ArrowRight size={16} className="mt-1 flex-shrink-0 text-indigo-600" />
              <span>{action}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* State Transitions */}
      {possibleTransitions.length > 0 && (
        <div>
          <h4 className="font-semibold text-slate-700 mb-3">Update Case Status</h4>
          <div className="grid gap-2">
            {possibleTransitions.map((transition, index) => (
              <button
                key={index}
                onClick={() => {
                  setSelectedTransition(transition);
                  if (onStateChange) {
                    onStateChange(transition.to);
                  }
                }}
                className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-left"
              >
                <div>
                  <div className="font-medium text-slate-700">
                    {transition.trigger}
                  </div>
                  <div className="text-sm text-slate-500">
                    {transition.description}
                  </div>
                </div>
                {transition.deadlineDays && (
                  <div className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                    {transition.deadlineDays} days
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Transition Confirmation Dialog */}
      {selectedTransition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-2">Confirm Status Change</h3>
            <p className="text-slate-600 mb-4">
              Change case status to &quot;{STATE_DEFINITIONS[selectedTransition.to].name}&quot;?
            </p>
            {selectedTransition.requiredDocuments && (
              <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="font-semibold text-amber-800 text-sm mb-2">
                  Required Documents:
                </p>
                <ul className="text-sm text-amber-700 list-disc list-inside">
                  {selectedTransition.requiredDocuments.map((doc, i) => (
                    <li key={i}>{doc}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedTransition(null)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => setSelectedTransition(null)}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Get state information by state type
 */
export function getStateInfo(state: CaseState): CaseStateInfo {
  return STATE_DEFINITIONS[state];
}

/**
 * Get all states in order
 */
export function getAllStates(): CaseStateInfo[] {
  const order: CaseState[] = [
    'pre_filing',
    'summons_received',
    'answer_filed',
    'discovery',
    'motions',
    'pre_trial',
    'trial',
    'judgment',
    'appeal',
    'closed'
  ];
  
  return order.map(state => STATE_DEFINITIONS[state]);
}

/**
 * Calculate deadline date from state
 */
export function calculateDeadline(
  startDate: Date,
  state: CaseState
): Date | null {
  const stateInfo = STATE_DEFINITIONS[state];
  if (stateInfo.keyDeadlines.length === 0) return null;
  
  const primaryDeadline = stateInfo.keyDeadlines[0];
  return new Date(startDate.getTime() + primaryDeadline.days * 24 * 60 * 60 * 1000);
}
