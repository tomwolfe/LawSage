/**
 * State Versioning System
 * Prevents "State Drift" vulnerability by ensuring audit results
 * are matched to the correct version of the case state.
 */

/**
 * Unique state version identifier (UUID v4 format)
 * Generated on every state update
 */
export interface StateVersion {
  /** Unique identifier for this state snapshot */
  stateId: string;
  /** Timestamp when this state was created */
  timestamp: number;
  /** Hash of the state content for integrity verification */
  stateHash: string;
}

/**
 * Generate a unique state version ID (UUID v4-like)
 */
export function generateStateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  const randomPart2 = Math.random().toString(36).substring(2, 15);
  return `state_${timestamp}_${randomPart}${randomPart2}`;
}

/**
 * Create a simple hash of a string for state integrity verification
 */
export async function hashStateContent(content: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback for environments without crypto.subtle
    return btoa(content).substring(0, 32);
  }
}

/**
 * Create a state version from the current state object
 */
export async function createStateVersion(state: unknown): Promise<StateVersion> {
  const stateId = generateStateId();
  const timestamp = Date.now();
  const stateHash = await hashStateContent(JSON.stringify(state));
  
  return {
    stateId,
    timestamp,
    stateHash
  };
}

/**
 * Audit request with state version tracking
 */
export interface AuditRequestWithVersion {
  analysis: string;
  jurisdiction: string;
  researchContext?: string;
  /** State version ID to prevent drift */
  stateId: string;
  /** Hash of the state content for integrity verification */
  stateHash: string;
}

/**
 * Audit response with state version tracking
 */
export interface AuditResponseWithVersion {
  audit_passed: boolean;
  confidence: number;
  statute_issues_count: number;
  roadmap_issues_count: number;
  audited_at: string;
  recommended_actions: string[];
  statute_issues: Array<{
    statute: string;
    isVerified: boolean;
    confidence?: number;
    issue?: string;
    suggestion?: string;
  }>;
  roadmap_issues: Array<{
    step: number;
    title: string;
    isVerified: boolean;
    confidence?: number;
    issue?: string;
    suggestion?: string;
  }>;
  correction_applied: boolean;
  corrected_output?: string;
  /** State version this audit was performed on */
  stateId: string;
  stateHash: string;
}
