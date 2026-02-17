/**
 * Case File Management Utilities
 * Handles export/import of case files to bypass URL length limits
 */

import * as LZString from 'lz-string';
import type { CaseLedgerEntry, LegalResult } from '../../components/LegalInterface';

export interface CaseHistoryItem {
  id: string;
  timestamp: Date;
  jurisdiction: string;
  userInput: string;
  result: LegalResult;
}

export interface CaseFile {
  version: string;
  exportedAt: string;
  caseFolder: {
    userInput: string;
    jurisdiction: string;
    activeTab: string;
    history: CaseHistoryItem[];
    selectedHistoryItem: string | null;
    backendUnreachable: boolean;
  };
  analysisResult?: LegalResult;
  ledger: CaseLedgerEntry[];
}

/**
 * Exports case data to a .lawsage file
 */
export function exportCaseFile(caseFolder: CaseFile['caseFolder'], analysisResult?: LegalResult, ledger?: CaseLedgerEntry[]): void {
  const caseFile: CaseFile = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    caseFolder,
    analysisResult,
    ledger: ledger || []
  };

  // Compress the case file
  const jsonString = JSON.stringify(caseFile, null, 2);
  const compressed = LZString.compressToBase64(jsonString);

  // Create blob and download
  const blob = new Blob([compressed], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  
  // Generate filename with timestamp
  const timestamp = new Date().toISOString().slice(0, 10);
  const jurisdiction = caseFolder.jurisdiction.toLowerCase().replace(/\s+/g, '_');
  a.href = url;
  a.download = `lawsage_${jurisdiction}_${timestamp}.lawsage`;
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Imports case data from a .lawsage file
 */
export async function importCaseFile(file: File): Promise<CaseFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        
        if (!content) {
          reject(new Error('Empty file'));
          return;
        }
        
        // Decompress the file
        const decompressed = LZString.decompressFromBase64(content);
        
        if (!decompressed) {
          reject(new Error('Failed to decompress file. File may be corrupted.'));
          return;
        }
        
        // Parse JSON
        const caseFile: CaseFile = JSON.parse(decompressed);
        
        // Validate structure
        if (!caseFile.version || !caseFile.caseFolder) {
          reject(new Error('Invalid case file format'));
          return;
        }
        
        // Convert timestamp strings back to Date objects
        const convertDates = (obj: unknown): unknown => {
          if (typeof obj !== 'object' || obj === null) return obj;
          
          if (Array.isArray(obj)) {
            return obj.map(convertDates);
          }
          
          const result = { ...obj };
          for (const [key, value] of Object.entries(result)) {
            if (key === 'timestamp' || key === 'dueDate') {
              (result as Record<string, unknown>)[key] = new Date(value as string);
            } else if (typeof value === 'object' && value !== null) {
              (result as Record<string, unknown>)[key] = convertDates(value);
            }
          }
          
          return result;
        };
        
        const caseFileWithDates = {
          ...caseFile,
          caseFolder: convertDates(caseFile.caseFolder) as CaseFile['caseFolder'],
          ledger: convertDates(caseFile.ledger) as CaseLedgerEntry[]
        };
        
        if (caseFileWithDates.analysisResult) {
          // Don't modify the analysisResult, just keep it as is
        }
        
        resolve(caseFileWithDates);
      } catch (error) {
        reject(new Error(`Failed to parse case file: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Saves case data to localStorage (for heavy data that shouldn't go in URL)
 */
export function saveCaseToLocalStorage(
  caseFolder: CaseFile['caseFolder'],
  analysisResult?: LegalResult,
  ledger?: CaseLedgerEntry[]
): void {
  try {
    const storageKey = `lawsage_case_${caseFolder.jurisdiction.toLowerCase().replace(/\s+/g, '_')}`;
    
    const dataToSave = {
      caseFolder,
      analysisResult,
      ledger: ledger || [],
      savedAt: new Date().toISOString()
    };
    
    localStorage.setItem(storageKey, JSON.stringify(dataToSave));
  } catch (error) {
    console.error('Failed to save case to localStorage:', error);
  }
}

/**
 * Loads case data from localStorage
 */
export function loadCaseFromLocalStorage(jurisdiction: string): {
  caseFolder?: CaseFile['caseFolder'];
  analysisResult?: LegalResult;
  ledger?: CaseLedgerEntry[];
} | null {
  try {
    const storageKey = `lawsage_case_${jurisdiction.toLowerCase().replace(/\s+/g, '_')}`;
    const stored = localStorage.getItem(storageKey);
    
    if (!stored) {
      return null;
    }
    
    const data: unknown = JSON.parse(stored);
    
    // Convert timestamp strings back to Date objects
    const convertDatesInObject = (obj: unknown): unknown => {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(convertDatesInObject);
      }
      
      const result = { ...obj };
      for (const [key, value] of Object.entries(result)) {
        if (key === 'timestamp' || key === 'dueDate') {
          (result as Record<string, unknown>)[key] = new Date(value as string);
        } else if (typeof value === 'object' && value !== null) {
          (result as Record<string, unknown>)[key] = convertDatesInObject(value);
        }
      }
      
      return result;
    };
    
    const typedData = data as { 
      caseFolder: CaseFile['caseFolder'];
      analysisResult?: LegalResult;
      ledger: CaseLedgerEntry[];
    };
    
    return {
      caseFolder: convertDatesInObject(typedData.caseFolder) as CaseFile['caseFolder'],
      analysisResult: typedData.analysisResult,
      ledger: convertDatesInObject(typedData.ledger) as CaseLedgerEntry[]
    };
  } catch (error) {
    console.error('Failed to load case from localStorage:', error);
    return null;
  }
}

/**
 * Clears case data from localStorage
 */
export function clearCaseFromLocalStorage(jurisdiction: string): void {
  const storageKey = `lawsage_case_${jurisdiction.toLowerCase().replace(/\s+/g, '_')}`;
  localStorage.removeItem(storageKey);
}
