'use client';

import { useState, useEffect } from 'react';
import { Settings, X, Key, CheckCircle, XCircle, Loader } from 'lucide-react';

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface TestResult {
  status: TestStatus;
  message: string;
}

export default function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [testResult, setTestResult] = useState<TestResult>({ status: 'idle', message: '' });

  useEffect(() => {
    const savedKey = localStorage.getItem('GEMINI_API_KEY');
    if (savedKey) {
      setTimeout(() => setApiKey(savedKey), 0);
    }
  }, []);

  const validateApiKeyFormat = (key: string): { valid: boolean; error?: string } => {
    if (!key || key.trim().length === 0) {
      return { valid: false, error: 'API key cannot be empty' };
    }
    
    if (!key.startsWith('AIza')) {
      return { valid: false, error: 'Invalid key format - Gemini API keys must start with "AIza"' };
    }
    
    if (key.length < 20) {
      return { valid: false, error: 'API key is too short' };
    }
    
    return { valid: true };
  };

  const testConnection = async () => {
    // First validate format
    const formatValidation = validateApiKeyFormat(apiKey);
    if (!formatValidation.valid) {
      setTestResult({ status: 'error', message: formatValidation.error || 'Invalid API key' });
      return;
    }

    setTestResult({ status: 'testing', message: 'Testing connection...' });

    try {
      // Make a lightweight test call to the health endpoint
      const healthResponse = await fetch('/api/health', {
        method: 'GET',
        headers: {
          'X-Gemini-API-Key': apiKey,
        },
      });

      if (!healthResponse.ok) {
        throw new Error('Health check failed');
      }

      // Now make a minimal Gemini API call to verify the key works
      const testResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-API-Key': apiKey,
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: 'Hello' }]
          }],
          generationConfig: {
            maxOutputTokens: 10,
            temperature: 0,
          }
        }),
      });

      if (!testResponse.ok) {
        const errorData = await testResponse.json().catch(() => ({}));
        
        if (testResponse.status === 400) {
          setTestResult({ status: 'error', message: 'Invalid API key format' });
        } else if (testResponse.status === 403) {
          setTestResult({ status: 'error', message: 'API key is invalid or has been revoked' });
        } else if (testResponse.status === 429) {
          setTestResult({ status: 'error', message: 'Quota exceeded - API key has reached its rate limit' });
        } else {
          setTestResult({ status: 'error', message: `Connection failed: ${testResponse.status} ${errorData.error?.message || 'Unknown error'}` });
        }
        return;
      }

      setTestResult({ status: 'success', message: 'Connection successful! API key is valid.' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        setTestResult({ status: 'error', message: 'Network error - Please check your internet connection' });
      } else {
        setTestResult({ status: 'error', message: `Connection failed: ${errorMessage}` });
      }
    }
  };

  const saveKey = () => {
    // Validate before saving
    const formatValidation = validateApiKeyFormat(apiKey);
    if (!formatValidation.valid) {
      setTestResult({ status: 'error', message: formatValidation.error || 'Cannot save invalid API key' });
      return;
    }

    localStorage.setItem('GEMINI_API_KEY', apiKey);
    setTestResult({ status: 'idle', message: '' });
    setIsOpen(false);
  };

  const clearKey = () => {
    localStorage.removeItem('GEMINI_API_KEY');
    setApiKey('');
    setTestResult({ status: 'idle', message: '' });
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
      >
        <Settings size={18} />
        <span>Settings</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="text-indigo-600" />
                Configuration
              </h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Gemini API Key
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setTestResult({ status: 'idle', message: '' });
                    }}
                    placeholder="Enter your API key..."
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Your key is stored locally in your browser and never sent to our servers,
                  except to authenticate requests with Google Gemini.
                </p>
              </div>

              {/* Test Connection Section */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Test Connection</span>
                  {testResult.status === 'success' && (
                    <CheckCircle className="text-green-500" size={20} />
                  )}
                  {testResult.status === 'error' && (
                    <XCircle className="text-red-500" size={20} />
                  )}
                  {testResult.status === 'testing' && (
                    <Loader className="text-blue-500 animate-spin" size={20} />
                  )}
                </div>
                
                {testResult.message && (
                  <p className={`text-sm ${
                    testResult.status === 'success' ? 'text-green-600' :
                    testResult.status === 'error' ? 'text-red-600' :
                    'text-slate-600'
                  }`}>
                    {testResult.message}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={testConnection}
                    disabled={testResult.status === 'testing' || !apiKey}
                    className="flex-1 bg-slate-200 text-slate-700 py-2 rounded-lg font-medium hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {testResult.status === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>
                  
                  {apiKey && (
                    <button
                      onClick={clearKey}
                      className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg font-medium transition-colors text-sm"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={saveKey}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 transition-colors"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
