'use client';

import React, { useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { safeError } from '../lib/pii-redactor';

interface Source {
  title: string | null;
  uri: string | null;
}

interface LegalResult {
  text: string;
  sources: Source[];
}

interface CaseHistoryItem {
  id: string;
  timestamp: Date;
  jurisdiction: string;
  userInput: string;
  result: LegalResult;
}

interface HistoryActionsProps {
  history: CaseHistoryItem[];
  onImport: (newHistory: CaseHistoryItem[]) => void;
}

export default function HistoryActions({ onImport }: Omit<HistoryActionsProps, 'history'>) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const savedHistory = localStorage.getItem('lawsage_history');
    if (!savedHistory) {
      alert('No history found to export.');
      return;
    }

    const blob = new Blob([savedHistory], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    
    link.href = url;
    link.download = `lawsage_backup_${date}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedData = JSON.parse(content);

        if (!Array.isArray(importedData)) {
          throw new Error('Imported data must be an array of case history items.');
        }

        const validatedItems: CaseHistoryItem[] = [];
        for (const item of importedData) {
          if (
            item &&
            typeof item === 'object' &&
            'id' in item &&
            'timestamp' in item &&
            'jurisdiction' in item &&
            'userInput' in item &&
            'result' in item
          ) {
            validatedItems.push({
              ...item,
              timestamp: new Date(item.timestamp)
            });
          } else {
            throw new Error('Invalid item format in imported file. Each item must have id, timestamp, jurisdiction, userInput, and result.');
          }
        }

        // Merge with existing history, avoiding duplicates by id
        const existingHistoryStr = localStorage.getItem('lawsage_history');
        let existingHistory: CaseHistoryItem[] = [];
        if (existingHistoryStr) {
          try {
            existingHistory = JSON.parse(existingHistoryStr).map((item: CaseHistoryItem) => ({
              ...item,
              timestamp: new Date(item.timestamp)
            }));
          } catch (err) {
            safeError('Failed to parse existing history during merge', err);
          }
        }

        const mergedHistory = [...validatedItems];
        existingHistory.forEach(existingItem => {
          if (!mergedHistory.find(item => item.id === existingItem.id)) {
            mergedHistory.push(existingItem);
          }
        });

        // Sort by timestamp descending (newest first)
        mergedHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        localStorage.setItem('lawsage_history', JSON.stringify(mergedHistory));
        onImport(mergedHistory);
        
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        alert('History imported successfully!');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error during import';
        alert(`Failed to import history: ${message}`);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleExport}
        className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-sm font-medium"
        title="Export History"
      >
        <Download size={16} />
        Export
      </button>
      <button
        onClick={handleImportClick}
        className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-sm font-medium"
        title="Import History"
      >
        <Upload size={16} />
        Import
      </button>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        className="hidden"
      />
    </div>
  );
}
