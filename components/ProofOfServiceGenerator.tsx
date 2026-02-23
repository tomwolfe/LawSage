'use client';

import { useState, useCallback, useMemo } from 'react';
import { FileDown, Check, AlertCircle, Calendar, Mail, User, Building } from 'lucide-react';
import { useProofOfService, ProofOfServiceOptions, CaseInfo, PartyInfo, ServiceInfo, autoPopulateServiceInfo, extractDocumentsFromAnalysis, validateProofOfServiceData } from '../src/utils/proof-of-service';
import { motion, AnimatePresence } from 'framer-motion';

interface ProofOfServiceGeneratorProps {
  caseInfo?: CaseInfo;
  analysisText?: string;
  onGenerateSuccess?: () => void;
}

export default function ProofOfServiceGenerator({ 
  caseInfo: propCaseInfo, 
  analysisText,
  onGenerateSuccess 
}: ProofOfServiceGeneratorProps) {
  const { isGenerating, error, downloadProofOfService, supportedForms } = useProofOfService();
  
  const [jurisdiction, setJurisdiction] = useState('California');
  const [formType, setFormType] = useState('POS-040');
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [serviceMethod, setServiceMethod] = useState<'mail' | 'personal' | 'electronic'>('mail');
  const [serverName, setServerName] = useState('');
  const [serverAddress, setServerAddress] = useState('');
  const [servedPartyName, setServedPartyName] = useState('');
  const [servedPartyAddress, setServedPartyAddress] = useState('');
  const [documents, setDocuments] = useState<string[]>([]);
  const [customDocument, setCustomDocument] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // Auto-populate from analysis text
  const handleExtractDocuments = useCallback(() => {
    if (analysisText) {
      const extracted = extractDocumentsFromAnalysis(analysisText);
      if (extracted.length > 0) {
        setDocuments(extracted);
      }
    }
  }, [analysisText]);

  // Auto-populate from case info
  const caseInfo: CaseInfo | undefined = useMemo(() => {
    if (propCaseInfo) return propCaseInfo;
    return undefined;
  }, [propCaseInfo]);

  // Add custom document
  const handleAddDocument = useCallback(() => {
    if (customDocument.trim() && !documents.includes(customDocument.trim())) {
      setDocuments(prev => [...prev, customDocument.trim()]);
      setCustomDocument('');
    }
  }, [customDocument, documents]);

  // Remove document
  const handleRemoveDocument = useCallback((doc: string) => {
    setDocuments(prev => prev.filter(d => d !== doc));
  }, []);

  // Generate Proof of Service
  const handleGenerate = async () => {
    // Build service info
    const serviceInfo: ServiceInfo = {
      serviceDate,
      serviceMethod,
      servedTo: {
        name: servedPartyName || '[PARTY NAME]',
        address: servedPartyAddress.split('\n').filter(Boolean) || ['[ADDRESS REQUIRED]']
      },
      servedBy: {
        name: serverName || '[YOUR NAME]',
        title: 'Server',
        address: serverAddress || '[ADDRESS REQUIRED]'
      }
    };

    const options: ProofOfServiceOptions = {
      jurisdiction,
      formType,
      caseInfo: caseInfo || {
        courtName: '[COURT NAME]',
        state: jurisdiction,
        caseNumber: '[CASE NUMBER]',
        plaintiff: '[PLAINTIFF]',
        defendant: '[DEFENDANT]'
      },
      servedDocuments: documents,
      serviceInfo
    };

    // Validate before generating
    const validation = validateProofOfServiceData(options);
    if (!validation.valid) {
      alert(`Please fill in required fields:\n${validation.errors.join('\n')}`);
      return;
    }

    const success = await downloadProofOfService(options);
    
    if (success) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      onGenerateSuccess?.();
    }
  };

  // Get available forms for jurisdiction
  const availableForms = supportedForms[jurisdiction] || supportedForms['Federal'];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Generate Proof of Service
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Create court-standard proof of service forms
          </p>
        </div>
        <FileDown className="w-8 h-8 text-blue-600" />
      </div>

      {/* Success Message */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-3"
          >
            <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="text-green-800 dark:text-green-200">
              Proof of Service generated successfully!
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <span className="text-red-800 dark:text-red-200">{error}</span>
        </div>
      )}

      {/* Form Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Jurisdiction */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Jurisdiction
          </label>
          <select
            value={jurisdiction}
            onChange={(e) => {
              setJurisdiction(e.target.value);
              // Reset form type when jurisdiction changes
              const forms = supportedForms[e.target.value] || supportedForms['Federal'];
              if (!forms.includes(formType)) {
                setFormType(forms[0]);
              }
            }}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
          >
            {Object.keys(supportedForms).map(j => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        </div>

        {/* Form Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Form Type
          </label>
          <select
            value={formType}
            onChange={(e) => setFormType(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
          >
            {availableForms.map(form => (
              <option key={form} value={form}>{form}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Service Information */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <Calendar className="w-4 h-4" />
          <span>Service Information</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Service Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date of Service
            </label>
            <input
              type="date"
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
            />
          </div>

          {/* Service Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Method of Service
            </label>
            <select
              value={serviceMethod}
              onChange={(e) => setServiceMethod(e.target.value as 'mail' | 'personal' | 'electronic')}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
            >
              <option value="mail">By Mail</option>
              <option value="personal">Personal Service</option>
              <option value="electronic">Electronic Service</option>
            </select>
          </div>
        </div>

        {/* Server Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
              <User className="w-4 h-4" />
              Server Name
            </label>
            <input
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="Person who served the documents"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Server Address
            </label>
            <input
              type="text"
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
              placeholder="Street address, City, State, ZIP"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Served Party Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
              <Building className="w-4 h-4" />
              Party Served
            </label>
            <input
              type="text"
              value={servedPartyName}
              onChange={(e) => setServedPartyName(e.target.value)}
              placeholder="Name of party receiving documents"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Party Address
            </label>
            <input
              type="text"
              value={servedPartyAddress}
              onChange={(e) => setServedPartyAddress(e.target.value)}
              placeholder="Street address, City, State, ZIP"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Documents Served */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <FileDown className="w-4 h-4" />
            <span>Documents Served</span>
          </div>
          {analysisText && (
            <button
              onClick={handleExtractDocuments}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Auto-fill from Analysis
            </button>
          )}
        </div>

        {/* Add Document */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customDocument}
            onChange={(e) => setCustomDocument(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddDocument()}
            placeholder="Enter document name (e.g., Motion to Dismiss)"
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
          />
          <button
            onClick={handleAddDocument}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
          >
            Add
          </button>
        </div>

        {/* Document List */}
        {documents.length > 0 && (
          <div className="space-y-2">
            {documents.map((doc, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-md px-3 py-2"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300">{doc}</span>
                <button
                  onClick={() => handleRemoveDocument(doc)}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {documents.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            No documents added yet. Add documents manually or use auto-fill.
          </p>
        )}
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || documents.length === 0}
        className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isGenerating ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <FileDown className="w-5 h-5" />
            Generate Proof of Service PDF
          </>
        )}
      </button>

      {/* Form Type Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
          Form Type Descriptions:
        </h4>
        <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
          <li><strong>POS-040:</strong> California Proof of Service by Mail (Civil)</li>
          <li><strong>FL-335:</strong> California Proof of Service by Mail (Family Law)</li>
          <li><strong>FL-330:</strong> California Proof of Personal Service (Family Law)</li>
          <li><strong>GENERIC:</strong> Universal Proof of Service (all jurisdictions)</li>
        </ul>
      </div>
    </div>
  );
}
