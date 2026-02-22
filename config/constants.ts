/**
 * LawSage Configuration Constants
 * Centralized configuration for magic numbers and system constants
 */

// Rate Limiting Configuration
export const RATE_LIMIT = {
  WINDOW_MS: 60 * 60 * 1000, // 1 hour window
  MAX_REQUESTS: 5, // Max 5 requests per window (client-side default)
  SERVER_MAX_REQUESTS: 10, // Server-side limit (can be adjusted based on tier)
  KEY_PREFIX: 'lawsage:v1:ratelimit:client:',
  KV_KEY_PREFIX: 'lawsage:v1:ratelimit:', // Upstash Redis key prefix for shared instance
} as const;

// API Configuration
export const API = {
  GLM_BASE_URL: 'https://api.z.ai/api/paas/v4',
  GLM_MODEL: 'glm-4.7-flash',
  GLM_TEMPERATURE: 0.1,
  GLM_MAX_TOKENS: 2048,
  COURT_LISTENER_BASE: 'https://www.courtlistener.com/api/rest/v4',
  COURT_LISTENER_USER_AGENT: 'LawSage Legal Assistant (contact@lawsage.example.com)',
} as const;

// PDF Generation Configuration
export const PDF = {
  PAGE_SIZE: 'LETTER' as const,
  MARGIN_STANDARD: 72, // 1 inch in points
  MARGIN_PLEADING: 90, // 1.25 inches for pleading paper
  LINE_HEIGHT: 18,
  LINES_PER_PAGE_STANDARD: 40,
  LINES_PER_PAGE_PLEADING: 28,
  FONT_SIZE_BODY: 12,
  FONT_SIZE_HEADING: 16,
  FONT_SIZE_SUBHEADING: 14,
} as const;

// File Upload Configuration
export const FILE_UPLOAD = {
  MAX_FILE_SIZE_MB: 10,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
} as const;

// URL State Management Configuration
export const STATE_SYNC = {
  URL_HASH_MAX_LENGTH: 4096, // Browser URL length limits
  COMPRESSION_THRESHOLD: 4.5 * 1024 * 1024, // 4.5MB - localStorage limit buffer
  FALLBACK_STORAGE_KEY: 'lawsage_case_',
} as const;

// PII Redaction Configuration
export const PII_REDACTION = {
  ENABLED_IN_PRODUCTION: true,
  LOG_LEVEL: 'warn' as const,
} as const;

// Citation Verification Configuration
export const CITATION_VERIFICATION = {
  STRICT_MODE: false, // If true, never fall back to AI verification
  TIMEOUT_MS: 10000, // 10 second timeout for CourtListener
  MAX_RETRIES: 2,
} as const;

// JSON Streaming Configuration
export const JSON_STREAM = {
  CHUNK_SIZE: 1024,
  MAX_REPAIR_ATTEMPTS: 3,
  ENABLE_LLM_SELF_CORRECTION: false, // Set to true for LLM-based JSON repair
} as const;

// Session Configuration
export const SESSION = {
  COOKIE_NAME: 'lawsage_session',
  COOKIE_MAX_AGE: 24 * 60 * 60, // 24 hours
  STORAGE_KEY_PREFIX: 'lawsage_case_',
} as const;

// Content Security Policy
export const CSP = {
  ALLOWED_API_HOSTS: [
    'api.z.ai',
    'courtlistener.com',
    'www.courtlistener.com',
  ],
  CONNECT_SRC: [
    "'self'",
    'https://api.z.ai',
    'https://www.courtlistener.com',
  ],
} as const;

// Legal Data Configuration
export const LEGAL_DATA = {
  RULES_DIR: '/rules',
  LEGAL_LOOKUP_FILE: '/data/legal_lookup.json',
  STATE_CODE_ALIASES: {
    // Map common names to ISO-3166-2 codes
    'california': 'CA',
    'ca': 'CA',
    'new york': 'NY',
    'ny': 'NY',
    'texas': 'TX',
    'tx': 'TX',
    'florida': 'FL',
    'fl': 'FL',
    'illinois': 'IL',
    'il': 'IL',
    'pennsylvania': 'PA',
    'pa': 'PA',
    'ohio': 'OH',
    'georgia': 'GA',
  } as Record<string, string>,
} as const;

// Function Timeouts (Vercel)
export const FUNCTION_TIMEOUTS = {
  API_DEFAULT: 60, // seconds
  OCR: 120, // OCR may take longer
  PDF_GENERATION: 60,
  CITATION_VERIFICATION: 30,
} as const;

// Character/Token Limits
export const LIMITS = {
  PROMPT_MAX_CHARS: 1500,
  OCR_MAX_CHARS: 5000,
  CASE_LEDGER_MAX_ENTRIES: 100,
  CHAT_HISTORY_MAX_MESSAGES: 50,
} as const;
