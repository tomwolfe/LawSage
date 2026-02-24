/**
 * ProceduralRoadmap Component
 * 
 * Displays the procedural roadmap with checklist functionality.
 * Integrates with CaseLedger for persistence.
 */

'use client';

import { useState } from 'react';
import { CheckCircle, FileText, Info, Clock } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StrategyItem {
  step: number;
  title: string;
  description: string;
  estimated_time?: string;
  required_documents?: string[];
  counter_measure?: string;
}

interface CaseLedgerEntry {
  eventType: string;
  description: string;
  dueDate?: Date;
  timestamp?: number;
}

interface ProceduralRoadmapProps {
  roadmap: StrategyItem[];
  addToCaseLedger: (eventType: 'complaint_filed' | 'answer_due' | 'motion_submitted' | 'discovery_served' | 'trial_date_set' | 'other', description: string, dueDate?: Date) => void;
  caseLedger: CaseLedgerEntry[];
}

/**
 * ProceduralRoadmap Component
 * 
 * Features:
 * 1. Interactive checklist with case ledger integration
 * 2. Deadline calculation and display
 * 3. Counter-measure display (adversarial preparation)
 * 4. Progress tracking
 */
export function ProceduralRoadmap({
  roadmap,
  addToCaseLedger,
  caseLedger,
}: ProceduralRoadmapProps) {
  const [copyStatus, setCopyStatus] = useState<{[key: string]: boolean}>({});

  // Check if a step is completed in the case ledger
  const isStepCompleted = (stepNumber: number, title: string) => {
    return (caseLedger || []).some((entry: CaseLedgerEntry) =>
      entry.description && entry.description.includes(`Step [${stepNumber}] Completed: ${title}`)
    );
  };

  // Calculate deadline from roadmap
  const calculateDeadline = () => {
    if (!roadmap || roadmap.length === 0) return null;

    const answerStep = roadmap.find(step =>
      step?.title?.toLowerCase()?.includes('answer') ||
      step?.description?.toLowerCase()?.includes('answer') ||
      step?.title?.toLowerCase()?.includes('deadline')
    );

    if (!answerStep || !answerStep.estimated_time) return null;

    const timeMatch = answerStep.estimated_time.match(/(\d+)\s*(day|week|month)s?/i);
    if (!timeMatch) return null;

    const value = parseInt(timeMatch[1], 10);
    const unit = timeMatch[2].toLowerCase();

    const now = new Date();
    let daysToAdd = value;

    if (unit === 'week') {
      daysToAdd = value * 7;
    } else if (unit === 'month') {
      daysToAdd = value * 30;
    }

    const dueDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    return { answerDue: dueDate, daysRemaining: daysToAdd };
  };

  const deadlineInfo = calculateDeadline();

  if (!roadmap || roadmap.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
        <p className="text-slate-500">No roadmap data available for this case.</p>
      </div>
    );
  }

  const completedCount = roadmap.filter((item) => 
    isStepCompleted(item.step, item.title)
  ).length;

  const progressPercentage = roadmap.length > 0 ? (completedCount / roadmap.length) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header with Progress */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Your Legal Roadmap</h2>
          <p className="text-sm text-slate-500 mt-1">
            {completedCount} of {roadmap.length} steps completed ({Math.round(progressPercentage)}%)
          </p>
        </div>
        <div className="text-sm text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-full">
          {roadmap.length} Steps Total
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
        <motion.div
          className="bg-indigo-600 h-full rounded-full transition-all duration-500"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercentage}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Deadline Alert */}
      {deadlineInfo && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-xl p-6">
          <h3 className="font-bold text-lg text-red-800 mb-4 flex items-center gap-2">
            <Clock size={20} />
            Critical Deadline
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-red-100">
              <div className="text-sm text-slate-500 font-medium">Days Remaining</div>
              <div className={cn(
                "text-3xl font-bold",
                deadlineInfo.daysRemaining <= 7 ? 'text-red-600 animate-pulse' : 'text-slate-800'
              )}>
                {deadlineInfo.daysRemaining}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {deadlineInfo.daysRemaining <= 3 ? 'URGENT: Act now!' : 
                 deadlineInfo.daysRemaining <= 7 ? 'Time is critical' : 'Still time to prepare'}
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-red-100">
              <div className="text-sm text-slate-500 font-medium">Estimated Due Date</div>
              <div className="text-lg font-bold text-slate-800">
                {deadlineInfo.answerDue?.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Based on roadmap analysis
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-red-100">
              <div className="text-sm text-slate-500 font-medium">Action Required</div>
              <div className="text-sm font-semibold text-slate-700">
                File your Answer before the deadline
              </div>
              <button
                onClick={() => {
                  if (deadlineInfo.answerDue) {
                    addToCaseLedger('answer_due', `Answer due by ${deadlineInfo.answerDue?.toLocaleDateString()}`, deadlineInfo.answerDue);
                  }
                }}
                className="mt-2 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700 transition-colors"
              >
                Add to Case Ledger
              </button>
            </div>
          </div>

          {deadlineInfo.daysRemaining <= 7 && (
            <div className="mt-4 bg-red-100 border border-red-300 rounded-lg p-3">
              <p className="text-sm text-red-800 font-semibold flex items-center gap-2">
                <CheckCircle size={16} />
                WARNING: You have less than a week! Consider filing an Ex Parte application if the deadline is within 3 days.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tip Box */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-700">
        <p className="flex items-center gap-2">
          <Info size={16} />
          <strong>Tip:</strong> Checking an item below will automatically add a corresponding entry to your <strong>Case Ledger</strong> in the history section.
        </p>
      </div>

      {/* Roadmap Steps */}
      <div className="space-y-4">
        <AnimatePresence>
          {roadmap.map((item, index) => {
            const completed = isStepCompleted(item.step, item.title);
            
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                className={cn(
                  "group flex gap-4 p-5 bg-white border rounded-xl shadow-sm transition-all cursor-default",
                  completed 
                    ? "border-green-200 bg-green-50/30" 
                    : "border-slate-200 hover:border-indigo-300 hover:shadow-md"
                )}
              >
                <div className="flex-shrink-0 mt-1">
                  <button
                    onClick={() => {
                      const stepTitle = `Step [${item.step}] Completed: ${item.title}`;
                      if (!isStepCompleted(item.step, item.title)) {
                        addToCaseLedger('other', stepTitle);
                      }
                      setCopyStatus(prev => ({ ...prev, [`step-${index}`]: true }));
                      setTimeout(() => setCopyStatus(prev => ({ ...prev, [`step-${index}`]: false })), 2000);
                    }}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all",
                      completed || copyStatus[`step-${index}`]
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-slate-300 text-slate-300 hover:border-indigo-500 hover:text-indigo-500"
                    )}
                  >
                    {completed || copyStatus[`step-${index}`] ? (
                      <CheckCircle size={18} />
                    ) : (
                      <span className="text-sm font-bold">{item.step}</span>
                    )}
                  </button>
                </div>

                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h3 className={cn(
                      "text-lg font-bold transition-colors",
                      completed ? "text-green-600 line-through opacity-70" : "text-slate-800 group-hover:text-indigo-600"
                    )}>
                      {item.title}
                    </h3>
                    {item.estimated_time && (
                      <span className="text-xs font-semibold bg-slate-100 text-slate-500 py-1 px-2 rounded-lg">
                        {item.estimated_time}
                      </span>
                    )}
                  </div>

                  <p className={cn(
                    "mt-2 text-sm leading-relaxed",
                    completed ? "text-slate-400" : "text-slate-600"
                  )}>
                    {item.description}
                  </p>

                  {item.required_documents && item.required_documents.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">Required:</span>
                      {item.required_documents.map((doc, docIdx) => (
                        <span key={docIdx} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md border border-indigo-100 flex items-center gap-1">
                          <FileText size={10} />
                          {doc}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.counter_measure && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs font-bold text-amber-800 mb-1">
                        Expected Opposition:
                      </p>
                      <p className="text-xs text-amber-700">
                        {item.counter_measure}
                      </p>
                    </div>
                  )}

                  {completed && (
                    <div className="mt-2 text-xs font-bold text-green-600 flex items-center gap-1 animate-in fade-in slide-in-from-left-2">
                      <CheckCircle size={12} />
                      Recorded in Case Ledger
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
