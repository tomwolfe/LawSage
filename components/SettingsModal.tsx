'use client';

import { useState, useEffect } from 'react';
import { Settings, X, Key } from 'lucide-react';
import { getHybridConfig, saveHybridConfig, clearGLMConfig } from '../src/utils/hybrid-router';

export default function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [geminiKey, setGeminiKey] = useState('');
  const [glmEnabled, setGlmEnabled] = useState(false);
  const [glmKey, setGlmKey] = useState('');
  const [showGLMKey, setShowGLMKey] = useState(false);

  useEffect(() => {
    const savedGeminiKey = localStorage.getItem('GEMINI_API_KEY');
    
    if (savedGeminiKey) {
      setTimeout(() => setGeminiKey(savedGeminiKey), 0);
    }
    
    const initHybrid = async () => {
      const hybridConfig = await getHybridConfig();
      setGlmEnabled(hybridConfig.enabled);
      if (hybridConfig.apiKey) {
        setGlmKey(hybridConfig.apiKey);
      }
    };
    
    initHybrid();
  }, []);

  const saveGeminiKey = () => {
    localStorage.setItem('GEMINI_API_KEY', geminiKey);
    setIsOpen(false);
  };

  const handleHybridToggle = () => {
    if (glmEnabled) {
      if (glmKey) {
        saveHybridConfig(true, glmKey);
      } else {
        alert('Please enter a GLM API key to enable hybrid mode');
      }
    } else {
      saveHybridConfig(false, null);
    }
    setIsOpen(false);
  };

  const clearGLMSettings = () => {
    clearGLMConfig();
    setGlmEnabled(false);
    setGlmKey('');
    setIsOpen(false);
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="text-indigo-600" />
                Configuration
              </h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Gemini API Key
                  </label>
                  <button 
                    onClick={() => localStorage.removeItem('GEMINI_API_KEY')}
                    className="text-xs text-red-600 hover:text-red-700 underline"
                  >
                    Clear
                  </button>
                </div>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="Enter your Gemini API key..."
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Your key is stored locally in your browser and never sent to our servers, 
                  except to authenticate requests with Google Gemini.
                </p>
              </div>
              
              <hr className="border-slate-200" />
              
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700 flex items-center gap-2">
                    Enable GLM-4.7 Hybrid Mode
                  </label>
                  <div 
                    className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${
                      glmEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                    onClick={handleHybridToggle}
                  >
                    <div 
                      className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${
                        glmEnabled ? 'translate-x-6' : ''
                      }`}
                    />
                  </div>
                </div>
                
                {glmEnabled && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        GLM-4.7 API Key
                      </label>
                      <div className="relative">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                          type={showGLMKey ? 'text' : 'password'}
                          value={glmKey}
                          onChange={(e) => setGlmKey(e.target.value)}
                          placeholder="Enter your GLM API key..."
                          className="w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <button 
                          onClick={() => setShowGLMKey(!showGLMKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showGLMKey ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-slate-500">
                          GLM will handle OCR cleaning and initial drafting
                        </p>
                        <button 
                          onClick={clearGLMSettings}
                          className="text-xs text-red-600 hover:text-red-700 underline"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                      <p className="text-xs text-indigo-800">
                        <strong>Benefits:</strong> Reduced API costs, faster processing, client-side OCR with Tesseract.js
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={saveGeminiKey}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 transition-colors"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
