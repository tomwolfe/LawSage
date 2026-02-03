// utils/hybrid-router.ts
// Hybrid routing utility to handle GLM-4.7 vs Gemini routing based on settings

export type ModelChoice = 'gemini' | 'glm' | 'hybrid';

interface RoutingConfig {
  enabled: boolean;
  model: ModelChoice;
  apiKey: string | null;
}

export async function getHybridConfig(): Promise<RoutingConfig> {
  const storedEnabled = localStorage.getItem('GLM_HYBRID_MODE');
  const storedKey = localStorage.getItem('GLM_API_KEY');

  return {
    enabled: storedEnabled === 'true',
    model: storedEnabled === 'true' ? 'glm' : 'gemini',
    apiKey: storedEnabled === 'true' ? storedKey : null
  };
}

export async function shouldRouteToGLM(): Promise<boolean> {
  const config = await getHybridConfig();
  return config.enabled && config.model === 'glm' && config.apiKey !== null;
}

export async function shouldRouteToGemini(): Promise<boolean> {
  const config = await getHybridConfig();
  return config.model === 'gemini';
}

export function isHybridMode(): boolean {
  const storedEnabled = localStorage.getItem('GLM_HYBRID_MODE');
  return storedEnabled === 'true';
}

export function getGLMAPIKey(): string | null {
  return localStorage.getItem('GLM_API_KEY');
}

export function saveHybridConfig(enabled: boolean, apiKey: string | null): void {
  localStorage.setItem('GLM_HYBRID_MODE', enabled ? 'true' : 'false');
  if (apiKey) {
    localStorage.setItem('GLM_API_KEY', apiKey);
  } else {
    localStorage.removeItem('GLM_API_KEY');
  }
}

export function clearGLMConfig(): void {
  localStorage.removeItem('GLM_HYBRID_MODE');
  localStorage.removeItem('GLM_API_KEY');
}
