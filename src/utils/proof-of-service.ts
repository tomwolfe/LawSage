/**
 * Proof of Service Client Utilities
 * 
 * React hooks and utilities for generating Proof of Service forms
 */

'use client';

import { useState, useCallback } from 'react';

export interface PartyInfo {
  name: string;
  attorney?: string;
  barNumber?: string;
  firm?: string;
  address: string[];
  phone?: string;
  email?: string;
  partyType?: 'plaintiff' | 'defendant' | 'petitioner' | 'respondent';
}

export interface CaseInfo {
  courtName: string;
  county?: string;
  state: string;
  caseNumber: string;
  plaintiff: string;
  defendant: string;
  documentTitle?: string;
}

export interface ServiceInfo {
  serviceDate: string;
  serviceMethod: 'mail' | 'personal' | 'electronic' | 'courthouse_pickup';
  servedTo: PartyInfo;
  servedBy: {
    name: string;
    title: string;
    address: string;
    phone?: string;
    email?: string;
  };
  mailingAddress?: string;
  cityStateZip?: string;
}

export interface ProofOfServiceOptions {
  jurisdiction: string;
  formType: string;
  caseInfo: CaseInfo;
  servedDocuments: string[];
  serviceInfo: ServiceInfo;
  additionalParties?: PartyInfo[];
}

export interface UseProofOfServiceReturn {
  isGenerating: boolean;
  error: string | null;
  generateProofOfService: (options: ProofOfServiceOptions) => Promise<Blob | null>;
  downloadProofOfService: (options: ProofOfServiceOptions, filename?: string) => Promise<boolean>;
  supportedForms: Record<string, string[]>;
}

/**
 * React hook for generating Proof of Service forms
 * 
 * Usage:
 * ```tsx
 * const { generateProofOfService, downloadProofOfService, isGenerating } = useProofOfService();
 * 
 * const handleGenerate = async () => {
 *   const blob = await generateProofOfService({
 *     jurisdiction: 'California',
 *     formType: 'POS-040',
 *     caseInfo: { ... },
 *     servedDocuments: ['Motion to Dismiss', 'Notice of Hearing'],
 *     serviceInfo: { ... }
 *   });
 * };
 * ```
 */
export function useProofOfService(): UseProofOfServiceReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateProofOfService = useCallback(async (
    options: ProofOfServiceOptions
  ): Promise<Blob | null> => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-proof-of-service', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to generate Proof of Service: ${response.status}`);
      }

      const blob = await response.blob();
      return blob;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const downloadProofOfService = useCallback(async (
    options: ProofOfServiceOptions,
    filename?: string
  ): Promise<boolean> => {
    const blob = await generateProofOfService(options);
    
    if (!blob) {
      return false;
    }

    // Generate default filename if not provided
    const defaultFilename = `proof_of_service_${options.caseInfo.caseNumber.replace(/[^a-z0-9]/gi, '_')}_${options.formType.toLowerCase()}.pdf`;
    const downloadFilename = filename || defaultFilename;

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    return true;
  }, [generateProofOfService]);

  // Supported forms (would ideally come from API)
  const supportedForms: Record<string, string[]> = {
    'California': ['POS-040', 'FL-335', 'FL-330', 'MC-030'],
    'Federal': ['AO-006', 'GENERIC'],
    'New York': ['GENERIC'],
    'Texas': ['GENERIC'],
    'Florida': ['GENERIC'],
  };

  return {
    isGenerating,
    error,
    generateProofOfService,
    downloadProofOfService,
    supportedForms,
  };
}

/**
 * Auto-populate service info from case data
 * 
 * Helper function to pre-fill Proof of Service form with reasonable defaults
 */
export function autoPopulateServiceInfo(
  caseInfo: CaseInfo,
  currentUser: PartyInfo,
  opposingParty: PartyInfo
): ServiceInfo {
  return {
    serviceDate: new Date().toISOString(),
    serviceMethod: 'mail',
    servedTo: {
      ...opposingParty,
      address: opposingParty.address || ['[ADDRESS REQUIRED]']
    },
    servedBy: {
      name: currentUser.name || '[YOUR NAME]',
      title: currentUser.partyType === 'plaintiff' ? 'Plaintiff' : 'Defendant',
      address: currentUser.address?.join('\n') || '[YOUR ADDRESS]',
      phone: currentUser.phone,
      email: currentUser.email
    },
    cityStateZip: '[CITY, STATE ZIP]'
  };
}

/**
 * Extract documents from legal analysis result
 * 
 * Helper to parse generated legal analysis and extract document list for service
 */
export function extractDocumentsFromAnalysis(analysisText: string): string[] {
  const documents: string[] = [];

  // Look for common document mentions
  const documentPatterns = [
    /Motion (?:to|for) [^(,\n)]+/gi,
    /Notice of [^(,\n)]+/gi,
    /Complaint/gi,
    /Answer/gi,
    /Declaration in Support/gi,
    /Memorandum of (?:Points and )?Authorities/gi,
    /Request for (?:Judicial Notice|Discovery)/gi,
    /Subpoena/gi,
  ];

  for (const pattern of documentPatterns) {
    const matches = analysisText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const normalized = match.trim();
        if (!documents.includes(normalized)) {
          documents.push(normalized);
        }
      });
    }
  }

  // Also look for checklist items
  const checklistPattern = /-\s*\[\s*\]\s*(.+)/g;
  let match;
  while ((match = checklistPattern.exec(analysisText)) !== null) {
    const docName = match[1].trim();
    if (docName.length > 5 && docName.length < 100 && !documents.includes(docName)) {
      documents.push(docName);
    }
  }

  return documents.slice(0, 20); // Limit to 20 documents
}

/**
 * Validate Proof of Service data before submission
 */
export function validateProofOfServiceData(options: ProofOfServiceOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!options.jurisdiction) {
    errors.push('Jurisdiction is required');
  }

  if (!options.formType) {
    errors.push('Form type is required');
  }

  if (!options.caseInfo) {
    errors.push('Case information is required');
  } else {
    if (!options.caseInfo.courtName) errors.push('Court name is required');
    if (!options.caseInfo.state) errors.push('State is required');
    if (!options.caseInfo.caseNumber) errors.push('Case number is required');
  }

  if (!options.serviceInfo) {
    errors.push('Service information is required');
  } else {
    if (!options.serviceInfo.serviceDate) errors.push('Service date is required');
    if (!options.serviceInfo.serviceMethod) errors.push('Service method is required');
    
    if (!options.serviceInfo.servedBy) {
      errors.push('Server information is required');
    } else {
      if (!options.serviceInfo.servedBy.name) errors.push('Server name is required');
      if (!options.serviceInfo.servedBy.address) errors.push('Server address is required');
    }

    if (!options.serviceInfo.servedTo) {
      errors.push('Party to be served is required');
    } else {
      if (!options.serviceInfo.servedTo.name) errors.push('Party name is required');
      if (!options.serviceInfo.servedTo.address || options.serviceInfo.servedTo.address.length === 0) {
        errors.push('Party address is required');
      }
    }
  }

  if (!options.servedDocuments || options.servedDocuments.length === 0) {
    errors.push('At least one document must be listed for service');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
