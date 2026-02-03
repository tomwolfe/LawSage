// tests/unit/hybrid-strategy.test.ts
// Tests for hybrid routing logic (GLM vs Gemini)

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
import {
  getHybridConfig,
  shouldRouteToGLM,
  shouldRouteToGemini,
  isHybridMode,
  getGLMAPIKey,
  saveHybridConfig,
  clearGLMConfig
} from '../src/utils/hybrid-router';

// Mock localStorage for Node environment
let localStorageMock = {};

// Mock the global localStorage object
global.localStorage = {
  getItem: (key: string) => localStorageMock[key] || null,
  setItem: (key: string, value: string) => {
    localStorageMock[key] = value.toString();
  },
  removeItem: (key: string) => {
    delete localStorageMock[key];
  },
  clear: () => {
    localStorageMock = {};
  },
  get length() {
    return Object.keys(localStorageMock).length;
  },
  key: (index: number) => {
    const keys = Object.keys(localStorageMock);
    return index < keys.length ? keys[index] : null;
  }
};

describe('Hybrid Strategy', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    // Clear localStorage after each test
    localStorage.clear();
  });

  describe('getHybridConfig', () => {
    it('should return default config when nothing is set', async () => {
      const config = await getHybridConfig();
      expect(config.enabled).toBe(false);
      expect(config.model).toBe('gemini');
      expect(config.apiKey).toBeNull();
    });

    it('should return GLM config when hybrid mode is enabled', async () => {
      localStorage.setItem('GLM_HYBRID_MODE', 'true');
      localStorage.setItem('GLM_API_KEY', 'test-api-key-123');
      
      const config = await getHybridConfig();
      expect(config.enabled).toBe(true);
      expect(config.model).toBe('glm');
      expect(config.apiKey).toBe('test-api-key-123');
    });

    it('should return Gemini config when hybrid mode is disabled', async () => {
      localStorage.setItem('GLM_HYBRID_MODE', 'false');
      localStorage.setItem('GLM_API_KEY', 'test-api-key-123');
      
      const config = await getHybridConfig();
      expect(config.enabled).toBe(false);
      expect(config.model).toBe('gemini');
      expect(config.apiKey).toBeNull();
    });
  });

  describe('shouldRouteToGLM', () => {
    it('should return false when hybrid mode is disabled', async () => {
      const shouldRoute = await shouldRouteToGLM();
      expect(shouldRoute).toBe(false);
    });

    it('should return true when hybrid mode is enabled with API key', async () => {
      localStorage.setItem('GLM_HYBRID_MODE', 'true');
      localStorage.setItem('GLM_API_KEY', 'test-api-key-123');
      
      const shouldRoute = await shouldRouteToGLM();
      expect(shouldRoute).toBe(true);
    });

    it('should return false when hybrid mode is enabled but no API key', async () => {
      localStorage.setItem('GLM_HYBRID_MODE', 'true');
      localStorage.removeItem('GLM_API_KEY');
      
      const shouldRoute = await shouldRouteToGLM();
      expect(shouldRoute).toBe(false);
    });
  });

  describe('shouldRouteToGemini', () => {
    it('should return true when using Gemini mode', async () => {
      const shouldRoute = await shouldRouteToGemini();
      expect(shouldRoute).toBe(true);
    });

    it('should return false when using GLM mode', async () => {
      localStorage.setItem('GLM_HYBRID_MODE', 'true');
      localStorage.setItem('GLM_API_KEY', 'test-api-key-123');
      
      const shouldRoute = await shouldRouteToGemini();
      expect(shouldRoute).toBe(false);
    });
  });

  describe('isHybridMode', () => {
    it('should return false when hybrid mode is disabled', () => {
      const isHybrid = isHybridMode();
      expect(isHybrid).toBe(false);
    });

    it('should return true when hybrid mode is enabled', () => {
      localStorage.setItem('GLM_HYBRID_MODE', 'true');
      
      const isHybrid = isHybridMode();
      expect(isHybrid).toBe(true);
    });
  });

  describe('getGLMAPIKey', () => {
    it('should return API key when set', () => {
      localStorage.setItem('GLM_API_KEY', 'test-api-key-123');
      
      const apiKey = getGLMAPIKey();
      expect(apiKey).toBe('test-api-key-123');
    });

    it('should return null when no API key is set', () => {
      const apiKey = getGLMAPIKey();
      expect(apiKey).toBeNull();
    });
  });

  describe('saveHybridConfig', () => {
    it('should save enabled state and API key', () => {
      saveHybridConfig(true, 'test-api-key-123');
      
      expect(localStorage.getItem('GLM_HYBRID_MODE')).toBe('true');
      expect(localStorage.getItem('GLM_API_KEY')).toBe('test-api-key-123');
    });

    it('should save disabled state with null API key', () => {
      saveHybridConfig(false, null);
      
      expect(localStorage.getItem('GLM_HYBRID_MODE')).toBe('false');
      expect(localStorage.getItem('GLM_API_KEY')).toBeNull();
    });

    it('should save disabled state with empty API key', () => {
      saveHybridConfig(false, '');
      
      expect(localStorage.getItem('GLM_HYBRID_MODE')).toBe('false');
      expect(localStorage.getItem('GLM_API_KEY')).toBeNull();
    });
  });

  describe('clearGLMConfig', () => {
    it('should clear all GLM configuration', () => {
      localStorage.setItem('GLM_HYBRID_MODE', 'true');
      localStorage.setItem('GLM_API_KEY', 'test-api-key-123');
      
      clearGLMConfig();
      
      expect(localStorage.getItem('GLM_HYBRID_MODE')).toBeNull();
      expect(localStorage.getItem('GLM_API_KEY')).toBeNull();
    });
  });

  describe('Integration Test', () => {
    it('should complete full workflow: enable GLM, route to GLM, then disable', async () => {
      // Start with default config
      let config = await getHybridConfig();
      expect(config.enabled).toBe(false);
      expect(config.model).toBe('gemini');

      // Enable GLM mode
      saveHybridConfig(true, 'test-key');
      
      config = await getHybridConfig();
      expect(config.enabled).toBe(true);
      expect(config.model).toBe('glm');
      expect(config.apiKey).toBe('test-key');

      // Verify routing decisions
      expect(await shouldRouteToGLM()).toBe(true);
      expect(await shouldRouteToGemini()).toBe(false);

      // Disable GLM mode
      saveHybridConfig(false, null);
      
      config = await getHybridConfig();
      expect(config.enabled).toBe(false);
      expect(config.model).toBe('gemini');
      expect(config.apiKey).toBeNull();

      // Verify routing decisions
      expect(await shouldRouteToGLM()).toBe(false);
      expect(await shouldRouteToGemini()).toBe(true);
    });
  });
});
