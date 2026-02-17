'use client';

import { useState, useEffect } from 'react';
import { X, Key, ExternalLink, CheckCircle } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: (key?: string) => void;
  existingKey?: string;
}

export default function ApiKeyModal({ isOpen, onClose, existingKey }: ApiKeyModalProps) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (existingKey) {
      setApiKeyInput(existingKey);
    } else {
      setApiKeyInput('');
    }
    setError('');
  }, [existingKey, isOpen]);

  const handleSave = () => {
    if (!apiKeyInput.trim()) {
      setError('Please enter a valid API key');
      return;
    }

    setIsValidating(true);
    setError('');

    // Basic validation - Gemini API keys start with "AIza"
    if (!apiKeyInput.startsWith('AIza')) {
      setError('Invalid API key format. Gemini API keys typically start with "AIza"');
      setIsValidating(false);
      return;
    }

    // Save the key
    localStorage.setItem('lawsage_gemini_api_key', apiKeyInput.trim());
    setIsValidating(false);
    onClose(apiKeyInput.trim());
  };

  const handleContinueWithoutKey = () => {
    // User can continue without key - server will use env var if available
    onClose(undefined);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Key className="text-indigo-600" />
            Gemini API Key
          </h2>
          <button onClick={() => onClose()} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Info Box */}
          <div className="bg-indigo-50 rounded-lg p-4 space-y-3 border border-indigo-100">
            <div className="flex items-start gap-3">
              <CheckCircle className="text-indigo-600 shrink-0 mt-0.5" size={20} />
              <div>
                <p className="text-sm font-bold text-indigo-900">Bring Your Own Key (BYOK)</p>
                <p className="text-sm text-indigo-800 mt-1">
                  LawSage uses Google's Gemini AI for legal analysis. You can provide your own free API key 
                  or continue without one (server may have a shared key configured).
                </p>
              </div>
            </div>
          </div>

          {/* Get API Key Link */}
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
            <div className="flex items-start gap-3">
              <ExternalLink className="text-amber-600 shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-900 mb-2">Don't have an API key?</p>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
                >
                  <ExternalLink size={16} />
                  Get Your Free Gemini API Key
                </a>
                <p className="text-xs text-amber-700 mt-2">
                  It's free and takes less than 2 minutes. You'll need a Google account.
                </p>
              </div>
            </div>
          </div>

          {/* API Key Input */}
          <div>
            <label htmlFor="api-key" className="block text-sm font-semibold text-slate-700 mb-2">
              Your Gemini API Key
            </label>
            <input
              id="api-key"
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono text-sm"
              autoComplete="off"
            />
            {error && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                <span>{error}</span>
              </p>
            )}
          </div>

          {/* Privacy Note */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="text-xs text-slate-600">
              <strong>Privacy:</strong> Your API key is stored only in your browser's localStorage. 
              It is never logged or stored on our servers. You can clear it anytime in Settings.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSave}
              disabled={isValidating || !apiKeyInput.trim()}
              className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:bg-indigo-300 disabled:cursor-not-allowed"
            >
              {isValidating ? 'Validating...' : 'Save API Key'}
            </button>
            <button
              onClick={handleContinueWithoutKey}
              className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
            >
              Continue Without Key
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
