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
 * Procedural Readiness Meter (formerly "Strength Meter")
 *
 * UPL COMPLIANCE: Renamed from "Strength Score" to "Procedural Readiness Score"
 * to avoid implying legal advice about case "winnability".
 * 
 * This meter now measures:
 * - Procedural compliance (documents, citations, roadmap completeness)
 * - NOT likelihood of winning
 * - NOT legal advice
 * 
 * Visual indicator showing procedural readiness based on:
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
  // Calculate procedural readiness score (0-100)
  // NOTE: This measures compliance/readiness, NOT case "strength" or "winnability"
  let score = 50; // Base score for having initiated the process
  const breakdown: Array<{ label: string; points: number; icon: 'check' | 'warn' | 'fail' }> = [];

  // Evidence documents (max +20 points)
  if (documents.length === 0) {
    breakdown.push({ label: 'No evidence documents uploaded', points: 0, icon: 'fail' });
  } else if (documents.length === 1) {
    score += 10;
    breakdown.push({ label: '1 evidence document uploaded', points: 10, icon: 'check' });
  } else if (documents.length >= 2) {
    score += 20;
    breakdown.push({ label: `${documents.length} evidence documents uploaded`, points: 20, icon: 'check' });
  }

  // Verified citations (max +15 points)
  const verifiedCitations = citations.filter(c => c.is_verified).length;
  const unverifiedCitations = citations.length - verifiedCitations;

  if (citations.length === 0) {
    breakdown.push({ label: 'No legal citations identified', points: 0, icon: 'fail' });
  } else if (verifiedCitations > 0) {
    const citationPoints = Math.min(15, verifiedCitations * 5);
    score += citationPoints;
    breakdown.push({ label: `${verifiedCitations} verified citation${verifiedCitations > 1 ? 's' : ''}`, points: citationPoints, icon: 'check' });

    if (unverifiedCitations > 0) {
      breakdown.push({ label: `${unverifiedCitations} unverified citation${unverifiedCitations > 1 ? 's' : ''} (needs review)`, points: 0, icon: 'warn' });
    }
  } else {
    breakdown.push({ label: `${citations.length} unverified citation${citations.length > 1 ? 's' : ''} (needs review)`, points: 0, icon: 'warn' });
  }

  // Roadmap completeness (max +10 points)
  if (roadmapLength === 0) {
    breakdown.push({ label: 'No procedural roadmap', points: 0, icon: 'fail' });
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
    breakdown.push({ label: 'Red-team analysis completed', points: 5, icon: 'check' });
  } else {
    breakdown.push({ label: 'No red-team analysis', points: 0, icon: 'warn' });
  }

  // Cap score at 100
  score = Math.min(100, score);

  // Determine readiness level and styling
  // NOTE: Labels changed from "Strong Case" to "High Readiness" etc.
  const getReadinessLevel = (s: number) => {
    if (s >= 80) return {
      label: 'High Procedural Readiness',
      sublabel: 'You have most required documents and citations',
      color: 'text-green-700',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-300',
      progressBar: 'bg-green-500',
      icon: ShieldCheck
    };
    if (s >= 60) return {
      label: 'Moderate Procedural Readiness',
      sublabel: 'You have a good foundation, some items pending',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-300',
      progressBar: 'bg-blue-500',
      icon: Shield
    };
    if (s >= 40) return {
      label: 'Low Procedural Readiness',
      sublabel: 'Missing key documents or citations',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-300',
      progressBar: 'bg-amber-500',
      icon: ShieldAlert
    };
    return {
      label: 'Very Low Procedural Readiness',
      sublabel: 'Start by uploading evidence documents',
      color: 'text-red-700',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-300',
      progressBar: 'bg-red-500',
      icon: ShieldX
    };
  };

  const level = getReadinessLevel(score);
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
              Procedural Readiness Score: <span className="font-bold">{score}/100</span>
            </p>
            {level.sublabel && (
              <p className="text-xs text-slate-500 mt-1">{level.sublabel}</p>
            )}
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

      {/* Readiness breakdown */}
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

      {/* UPL Compliance Disclaimer */}
      <div className="mt-4 pt-4 border-t border-slate-300">
        <p className="text-xs text-slate-600 flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>Important Notice:</strong> This Procedural Readiness Score is an AI-generated assessment of document 
            completeness and citation verification. It measures procedural compliance, NOT the likelihood of case success. 
            This is NOT legal advice and does not guarantee any particular outcome. Always consult with a qualified attorney 
            for professional legal assessment of your specific situation.
          </span>
        </p>
      </div>
    </div>
  );
}
