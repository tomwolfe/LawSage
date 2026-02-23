'use client';

import { Shield, ShieldCheck, ShieldAlert, ShieldX, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StrengthMeterProps {
  documents?: string[];
  citations?: Array<{ text: string; is_verified?: boolean }>;
  roadmapLength?: number;
  hasAdversarialStrategy?: boolean;
  jurisdiction?: string;
}

/**
 * Case Strength Meter
 * 
 * Visual indicator showing the "winnability" score based on:
 * - Evidence documents (OCR-extracted)
 * - Verified citations
 * - Roadmap completeness
 * - Red-team analysis presence
 */
export function StrengthMeter({
  documents = [],
  citations = [],
  roadmapLength = 0,
  hasAdversarialStrategy = false,
}: StrengthMeterProps) {
  // Calculate strength score (0-100)
  let score = 50; // Base score
  const breakdown: Array<{ label: string; points: number; icon: 'check' | 'warn' | 'fail' }> = [];

  // Evidence documents (max +20 points)
  if (documents.length === 0) {
    breakdown.push({ label: 'No evidence documents', points: 0, icon: 'fail' });
  } else if (documents.length === 1) {
    score += 10;
    breakdown.push({ label: '1 evidence document', points: 10, icon: 'check' });
  } else if (documents.length >= 2) {
    score += 20;
    breakdown.push({ label: `${documents.length} evidence documents`, points: 20, icon: 'check' });
  }

  // Verified citations (max +15 points)
  const verifiedCitations = citations.filter(c => c.is_verified).length;
  const unverifiedCitations = citations.length - verifiedCitations;
  
  if (citations.length === 0) {
    breakdown.push({ label: 'No citations', points: 0, icon: 'fail' });
  } else if (verifiedCitations > 0) {
    const citationPoints = Math.min(15, verifiedCitations * 5);
    score += citationPoints;
    breakdown.push({ label: `${verifiedCitations} verified citation${verifiedCitations > 1 ? 's' : ''}`, points: citationPoints, icon: 'check' });
    
    if (unverifiedCitations > 0) {
      breakdown.push({ label: `${unverifiedCitations} unverified citation${unverifiedCitations > 1 ? 's' : ''}`, points: 0, icon: 'warn' });
    }
  } else {
    breakdown.push({ label: `${citations.length} unverified citation${citations.length > 1 ? 's' : ''}`, points: 0, icon: 'warn' });
  }

  // Roadmap completeness (max +10 points)
  if (roadmapLength === 0) {
    breakdown.push({ label: 'No roadmap', points: 0, icon: 'fail' });
  } else if (roadmapLength < 3) {
    score += 5;
    breakdown.push({ label: `Incomplete roadmap (${roadmapLength} steps)`, points: 5, icon: 'warn' });
  } else {
    score += 10;
    breakdown.push({ label: `Complete roadmap (${roadmapLength} steps)`, points: 10, icon: 'check' });
  }

  // Adversarial strategy (max +5 points)
  if (hasAdversarialStrategy) {
    score += 5;
    breakdown.push({ label: 'Red-team analysis included', points: 5, icon: 'check' });
  } else {
    breakdown.push({ label: 'No red-team analysis', points: 0, icon: 'warn' });
  }

  // Cap score at 100
  score = Math.min(100, score);

  // Determine strength level and styling
  const getStrengthLevel = (s: number) => {
    if (s >= 80) return { 
      label: 'Strong Case', 
      color: 'text-green-700', 
      bgColor: 'bg-green-50', 
      borderColor: 'border-green-300',
      progressBar: 'bg-green-500',
      icon: ShieldCheck 
    };
    if (s >= 60) return { 
      label: 'Moderate Case', 
      color: 'text-blue-700', 
      bgColor: 'bg-blue-50', 
      borderColor: 'border-blue-300',
      progressBar: 'bg-blue-500',
      icon: Shield 
    };
    if (s >= 40) return { 
      label: 'Weak Case', 
      color: 'text-amber-700', 
      bgColor: 'bg-amber-50', 
      borderColor: 'border-amber-300',
      progressBar: 'bg-amber-500',
      icon: ShieldAlert 
    };
    return { 
      label: 'Very Weak Case', 
      color: 'text-red-700', 
      bgColor: 'bg-red-50', 
      borderColor: 'border-red-300',
      progressBar: 'bg-red-500',
      icon: ShieldX 
    };
  };

  const level = getStrengthLevel(score);
  const IconComponent = level.icon;

  return (
    <div className={cn(
      "rounded-xl border-2 p-6 mb-6 transition-all",
      level.bgColor,
      level.borderColor
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <IconComponent className={cn("w-8 h-8", level.color)} />
          <div>
            <h3 className={cn("text-lg font-bold", level.color)}>
              {level.label}
            </h3>
            <p className="text-sm text-slate-600">
              Strength Score: <span className="font-bold">{score}/100</span>
            </p>
          </div>
        </div>
        
        {/* Circular progress indicator */}
        <div className="relative w-16 h-16">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-slate-200"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeDasharray={2 * Math.PI * 28}
              strokeDashoffset={2 * Math.PI * 28 * (1 - score / 100)}
              className={cn("transition-all duration-500", level.progressBar)}
              strokeLinecap="round"
            />
          </svg>
          <span className={cn(
            "absolute inset-0 flex items-center justify-center text-sm font-bold",
            level.color
          )}>
            {score}%
          </span>
        </div>
      </div>

      {/* Strength breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {breakdown.map((item, index) => (
          <div
            key={index}
            className={cn(
              "flex items-center gap-2 text-sm px-3 py-2 rounded-lg",
              item.icon === 'check' ? 'bg-green-100 text-green-800' :
              item.icon === 'warn' ? 'bg-amber-100 text-amber-800' :
              'bg-red-100 text-red-800'
            )}
          >
            {item.icon === 'check' ? (
              <CheckCircle size={16} />
            ) : item.icon === 'warn' ? (
              <AlertTriangle size={16} />
            ) : (
              <XCircle size={16} />
            )}
            <span className="font-medium">{item.label}</span>
            {item.points > 0 && (
              <span className="ml-auto text-xs font-bold">+{item.points}</span>
            )}
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <div className="mt-4 pt-4 border-t border-slate-300">
        <p className="text-xs text-slate-600 flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>Disclaimer:</strong> This strength meter is an AI-generated estimate based on available evidence and citations. 
            It does not guarantee case outcomes. Always consult with a qualified attorney for professional legal assessment.
          </span>
        </p>
      </div>
    </div>
  );
}
