'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, FileText, Calendar, Building, Users, Edit2 } from 'lucide-react';

export interface OCRResult {
  extracted_text: string;
  document_type?: string;
  case_number?: string;
  court_name?: string;
  parties?: string[];
  important_dates?: string[];
  legal_references?: string[];
  calculated_deadline?: {
    date: string;
    daysRemaining: number;
    rule: string;
  };
}

interface OCRVerificationProps {
  ocrData: OCRResult;
  onConfirm: (verifiedData: OCRResult) => void;
  onCancel: () => void;
}

interface VerifiedField {
  key: string;
  label: string;
  value: string;
  icon: React.ReactNode;
  isVerified: boolean;
  isEditable: boolean;
}

export default function OCRVerification({ ocrData, onConfirm, onCancel }: OCRVerificationProps) {
  const [editedData, setEditedData] = useState<OCRResult>(ocrData);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    setEditedData(ocrData);
  }, [ocrData]);

  const handleEdit = (key: string, currentValue: string) => {
    setEditingField(key);
    setEditValue(currentValue);
  };

  const handleSaveEdit = (key: string) => {
    const updates: Record<string, unknown> = {};
    
    switch (key) {
      case 'case_number':
        updates.case_number = editValue;
        break;
      case 'court_name':
        updates.court_name = editValue;
        break;
      case 'document_type':
        updates.document_type = editValue;
        break;
      case 'parties':
        updates.parties = editValue.split(',').map(p => p.trim());
        break;
      case 'important_dates':
        updates.important_dates = editValue.split(',').map(d => d.trim());
        break;
    }

    setEditedData(prev => ({ ...prev, ...updates }));
    setEditingField(null);
    setEditValue('');
  };

  const getConfidenceColor = (hasValue: boolean) => {
    return hasValue ? 'text-green-600' : 'text-amber-600';
  };

  const renderField = (field: VerifiedField) => {
    const isEditing = editingField === field.key;

    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <div className={`mt-0.5 ${getConfidenceColor(field.isVerified)}`}>
              {field.icon}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-slate-700">{field.label}</span>
                {field.isVerified ? (
                  <CheckCircle size={14} className="text-green-500" />
                ) : (
                  <AlertTriangle size={14} className="text-amber-500" />
                )}
              </div>
              
              {isEditing ? (
                <div className="mt-2">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full p-2 border border-indigo-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleSaveEdit(field.key)}
                      className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingField(null)}
                      className="px-3 py-1 border border-slate-300 text-slate-600 text-sm rounded-md hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-600">
                  {field.value || <span className="italic text-slate-400">Not detected</span>}
                </div>
              )}
            </div>
          </div>
          
          {field.isEditable && !isEditing && (
            <button
              onClick={() => handleEdit(field.key, field.value)}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
              title="Edit this field"
            >
              <Edit2 size={14} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const fields: VerifiedField[] = [
    {
      key: 'document_type',
      label: 'Document Type',
      value: editedData.document_type || '',
      icon: <FileText size={18} />,
      isVerified: !!editedData.document_type,
      isEditable: true
    },
    {
      key: 'case_number',
      label: 'Case Number',
      value: editedData.case_number || '',
      icon: <FileText size={18} />,
      isVerified: !!editedData.case_number,
      isEditable: true
    },
    {
      key: 'court_name',
      label: 'Court Name',
      value: editedData.court_name || '',
      icon: <Building size={18} />,
      isVerified: !!editedData.court_name,
      isEditable: true
    },
    {
      key: 'parties',
      label: 'Parties',
      value: editedData.parties?.join(', ') || '',
      icon: <Users size={18} />,
      isVerified: !!(editedData.parties && editedData.parties.length > 0),
      isEditable: true
    },
    {
      key: 'important_dates',
      label: 'Important Dates',
      value: editedData.important_dates?.join(', ') || '',
      icon: <Calendar size={18} />,
      isVerified: !!(editedData.important_dates && editedData.important_dates.length > 0),
      isEditable: true
    }
  ];

  const hasDeadline = !!editedData.calculated_deadline;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <FileText size={24} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Verify Extracted Information</h2>
              <p className="text-sm text-slate-500">Please review and confirm the AI-detected information</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-600 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800">Human Verification Required</p>
                <p className="text-sm text-amber-700 mt-1">
                  AI may misread dates, case numbers, or other details. Please verify each field before proceeding.
                </p>
              </div>
            </div>
          </div>

          {fields.map(field => renderField(field))}

          {hasDeadline && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Calendar size={20} className="text-red-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-800">Critical Deadline Detected</p>
                  <p className="text-sm text-red-700 mt-1">
                    {editedData.calculated_deadline?.rule}: Due {editedData.calculated_deadline?.date} 
                    ({editedData.calculated_deadline?.daysRemaining} days remaining)
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-600 mb-2">Extracted Text Preview:</p>
            <p className="text-sm text-slate-700 max-h-32 overflow-y-auto font-mono">
              {editedData.extracted_text?.substring(0, 500)}
              {editedData.extracted_text && editedData.extracted_text.length > 500 && '...'}
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <XCircle size={18} />
            Cancel
          </button>
          <button
            onClick={() => onConfirm(editedData)}
            className="px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <CheckCircle size={18} />
            Confirm & Continue
          </button>
        </div>
      </div>
    </div>
  );
}
