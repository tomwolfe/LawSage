/**
 * CaseHeader Component
 * 
 * Displays the Strength Meter and critique verification status.
 * Addresses Step 1: Eliminate State Drift by showing verification progress.
 */

'use client';

import { Shield, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { StrengthMeter } from './StrengthMeter';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CritiqueMetadata {
  audit_passed?: boolean;
  confidence?: number;
  statute_issues_count?: number;
  roadmap_issues_count?: number;
  audited_at?: string;
}

interface CaseHeaderProps {
  documents?: string[];
  citations?: Array<{ text: string; is_verified?: boolean }>;
  roadmapLength?: number;
  hasAdversarialStrategy?: boolean;
  jurisdiction: string;
  critiqueMetadata?: CritiqueMetadata;
  isVerifying?: boolean;
}

/**
 * CaseHeader Component
 * 
 * Shows:
 * 1. Strength Meter (Procedural Readiness)
 * 2. Verification Status Badge (Judge Agent audit status)
 * 3. Progress indicator during background verification
 */
export function CaseHeader({
  documents,
  citations,
  roadmapLength,
  hasAdversarialStrategy,
  jurisdiction,
  critiqueMetadata,
  isVerifying = false,
}: CaseHeaderProps) {
  // Determine verification status
  const isVerified = critiqueMetadata?.audit_passed === true;
  const isFailed = critiqueMetadata?.audit_passed === false;
  const hasIssues = (critiqueMetadata?.statute_issues_count || 0) > 0 || 
                    (critiqueMetadata?.roadmap_issues_count || 0) > 0;

  return (
    <div className="space-y-4">
      {/* Verification Status Banner */}
      <div className={cn(
        "rounded-xl border-2 p-4 flex items-center justify-between transition-all",
        isVerified 
          ? "bg-green-50 border-green-300" 
          : isVerifying 
            ? "bg-blue-50 border-blue-300 animate-pulse"
            : isFailed
              ? "bg-red-50 border-red-300"
              : "bg-amber-50 border-amber-300"
      )}>
        <div className="flex items-center gap-3">
          {isVerified ? (
            <CheckCircle className="w-6 h-6 text-green-600" />
          ) : isVerifying ? (
            <Clock className="w-6 h-6 text-blue-600 animate-spin" />
          ) : isFailed ? (
            <AlertTriangle className="w-6 h-6 text-red-600" />
          ) : (
            <Shield className="w-6 h-6 text-amber-600" />
          )}
          
          <div>
            <h3 className={cn(
              "font-bold",
              isVerified ? "text-green-800" : 
              isVerifying ? "text-blue-800" :
              isFailed ? "text-red-800" : "text-amber-800"
            )}>
              {isVerified 
                ? "✓ Judge Agent Verification Passed" 
                : isVerifying
                  ? "⏳ Verifying Statutes & Procedure..."
                  : isFailed
                    ? "⚠ Verification Failed - Review Required"
                    : "⏳ Awaiting Judge Agent Audit"}
            </h3>
            <p className={cn(
              "text-sm mt-1",
              isVerified ? "text-green-700" : 
              isVerifying ? "text-blue-700" :
              isFailed ? "text-red-700" : "text-amber-700"
            )}>
              {isVerified 
                ? `All statutes verified with ${Math.round((critiqueMetadata?.confidence || 0) * 100)}% confidence`
                : isVerifying
                  ? "Running background critique loop to verify citations and procedural steps"
                  : isFailed
                    ? `Issues found: ${(critiqueMetadata?.statute_issues_count || 0)} statute, ${(critiqueMetadata?.roadmap_issues_count || 0)} roadmap`
                    : "Analysis generated - Judge Agent audit pending"}
            </p>
          </div>
        </div>

        {/* Confidence Score Display */}
        {critiqueMetadata?.confidence !== undefined && !isVerifying && (
          <div className={cn(
            "px-4 py-2 rounded-full font-bold text-sm",
            critiqueMetadata.confidence >= 0.8
              ? "bg-green-200 text-green-800"
              : critiqueMetadata.confidence >= 0.6
                ? "bg-amber-200 text-amber-800"
                : "bg-red-200 text-red-800"
          )}>
            {Math.round(critiqueMetadata.confidence * 100)}% Confidence
          </div>
        )}
      </div>

      {/* Strength Meter */}
      <StrengthMeter
        documents={documents}
        citations={citations}
        roadmapLength={roadmapLength}
        hasAdversarialStrategy={hasAdversarialStrategy}
        jurisdiction={jurisdiction}
      />

      {/* Download Restriction Notice */}
      {!isVerified && !isVerifying && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="inline mr-2" />
          <strong>Notice:</strong> Download is disabled until Judge Agent verification completes. 
          This ensures all cited statutes and procedural steps have been audited.
        </div>
      )}
    </div>
  );
}
