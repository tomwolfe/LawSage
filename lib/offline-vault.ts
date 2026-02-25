/**
 * IndexedDB-Based Evidence Vault
 * 
 * Addresses Roadmap Item #6: Offline-First "Vault"
 * 
 * Replaces LocalStorage-based EvidenceVault with IndexedDB for:
 * - Gigabytes of storage (vs 5MB limit)
 * - Better performance for large documents
 * - Persistent storage across browser sessions
 * - Support for binary data (PDFs, images)
 * 
 * Uses Dexie.js for simplified IndexedDB operations.
 */

import Dexie, { type Table } from 'dexie';
import { encryptCaseData, decryptCaseData } from './case-encryption';

export interface EvidenceItem {
  id?: number;
  caseId: string;
  name: string;
  type: 'document' | 'image' | 'ocr' | 'filing';
  mimeType?: string;
  ocrText?: string;
  fileData?: Blob;
  metadata: {
    uploadDate: string;
    fileSize?: number;
    pageCount?: number;
    extractedDates?: string[];
    extractedCaseNumber?: string;
    extractedCourt?: string;
  };
  encryptionVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface CaseMetadata {
  id?: number;
  caseId: string;
  caseName?: string;
  jurisdiction?: string;
  createdAt: number;
  lastUpdated: number;
  evidenceCount: number;
}

export interface AnalysisSession {
  id?: number;
  caseId: string;
  sessionId: string;
  userInput: string;
  result?: string;
  jurisdiction: string;
  createdAt: number;
  completedAt?: number;
}

/**
 * LawSage Database - IndexedDB wrapper using Dexie
 */
export class LawSageDB extends Dexie {
  evidence!: Table<EvidenceItem, number>;
  cases!: Table<CaseMetadata, number>;
  sessions!: Table<AnalysisSession, number>;

  constructor() {
    super('LawSageDB');
    
    this.version(1).stores({
      evidence: '++id, caseId, name, type, createdAt, updatedAt',
      cases: '++id, caseId, jurisdiction, createdAt, lastUpdated',
      sessions: '++id, caseId, sessionId, createdAt, completedAt'
    });
  }
}

// Singleton instance
let dbInstance: LawSageDB | null = null;

/**
 * Get database instance
 */
export function getDatabase(): LawSageDB {
  if (!dbInstance) {
    dbInstance = new LawSageDB();
  }
  return dbInstance;
}

/**
 * Evidence Vault using IndexedDB
 * Provides offline-first storage with encryption
 */
export class OfflineEvidenceVault {
  private caseId: string;
  private encryptionKey: string;

  constructor(caseId: string, encryptionKey: string) {
    this.caseId = caseId;
    this.encryptionKey = encryptionKey;
  }

  /**
   * Add evidence to the vault
   */
  async addEvidence(item: Omit<EvidenceItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
    const db = getDatabase();
    const now = Date.now();

    const evidenceItem: EvidenceItem = {
      ...item,
      caseId: this.caseId,
      createdAt: now,
      updatedAt: now
    };

    // Encrypt OCR text if present
    if (evidenceItem.ocrText) {
      const encrypted = await encryptCaseData(
        { text: evidenceItem.ocrText },
        this.encryptionKey,
        `${this.caseId}_evidence_${now}`
      );
      evidenceItem.ocrText = JSON.stringify(encrypted);
    }

    const id = await db.evidence.add(evidenceItem);

    // Update case metadata
    await this.updateCaseMetadata();

    return id;
  }

  /**
   * Get all evidence for this case
   */
  async getAllEvidence(): Promise<EvidenceItem[]> {
    const db = getDatabase();
    const items = await db.evidence
      .where('caseId')
      .equals(this.caseId)
      .toArray();

    // Decrypt OCR text
    for (const item of items) {
      if (item.ocrText && item.ocrText.startsWith('{')) {
        try {
          const encrypted = JSON.parse(item.ocrText);
          const decrypted = await decryptCaseData(encrypted, this.encryptionKey) as { text: string };
          item.ocrText = decrypted.text;
        } catch {
          // Keep as-is if decryption fails
        }
      }
    }

    return items;
  }

  /**
   * Get evidence by ID
   */
  async getEvidenceById(id: number): Promise<EvidenceItem | undefined> {
    const db = getDatabase();
    const item = await db.evidence.get(id);

    if (item && item.ocrText && item.ocrText.startsWith('{')) {
      try {
        const encrypted = JSON.parse(item.ocrText);
        const decrypted = await decryptCaseData(encrypted, this.encryptionKey) as { text: string };
        return { ...item, ocrText: decrypted.text };
      } catch {
        return item;
      }
    }

    return item;
  }

  /**
   * Search evidence by text
   */
  async searchEvidence(query: string): Promise<EvidenceItem[]> {
    const items = await this.getAllEvidence();
    const queryLower = query.toLowerCase();

    return items.filter(item => {
      if (item.name.toLowerCase().includes(queryLower)) return true;
      if (item.ocrText?.toLowerCase().includes(queryLower)) return true;
      if (item.metadata?.extractedCaseNumber?.toLowerCase().includes(queryLower)) return true;
      return false;
    });
  }

  /**
   * Delete evidence
   */
  async deleteEvidence(id: number): Promise<void> {
    const db = getDatabase();
    await db.evidence.delete(id);
    await this.updateCaseMetadata();
  }

  /**
   * Update case metadata
   */
  private async updateCaseMetadata(): Promise<void> {
    const db = getDatabase();
    const count = await db.evidence.where('caseId').equals(this.caseId).count();

    const existing = await db.cases.where('caseId').equals(this.caseId).first();
    
    if (existing) {
      await db.cases.update(existing.id!, {
        evidenceCount: count,
        lastUpdated: Date.now()
      });
    } else {
      await db.cases.add({
        caseId: this.caseId,
        evidenceCount: count,
        createdAt: Date.now(),
        lastUpdated: Date.now()
      });
    }
  }

  /**
   * Get case metadata
   */
  async getCaseMetadata(): Promise<CaseMetadata | undefined> {
    const db = getDatabase();
    return db.cases.where('caseId').equals(this.caseId).first();
  }

  /**
   * Get total storage used
   */
  async getStorageUsed(): Promise<number> {
    const items = await this.getAllEvidence();
    let total = 0;

    for (const item of items) {
      if (item.fileData) {
        total += item.fileData.size;
      }
      if (item.ocrText) {
        total += item.ocrText.length * 2; // Approximate UTF-16 size
      }
    }

    return total;
  }
}

/**
 * Session Manager for Analysis History
 */
export class SessionManager {
  /**
   * Save analysis session
   */
  async saveSession(session: Omit<AnalysisSession, 'id' | 'createdAt'>): Promise<number> {
    const db = getDatabase();
    return db.sessions.add({
      ...session,
      createdAt: Date.now()
    });
  }

  /**
   * Update session with result
   */
  async completeSession(sessionId: string, result: string): Promise<void> {
    const db = getDatabase();
    const session = await db.sessions.where('sessionId').equals(sessionId).first();
    
    if (session) {
      await db.sessions.update(session.id!, {
        result,
        completedAt: Date.now()
      });
    }
  }

  /**
   * Get sessions for a case
   */
  async getCaseSessions(caseId: string): Promise<AnalysisSession[]> {
    const db = getDatabase();
    return db.sessions
      .where('caseId')
      .equals(caseId)
      .reverse()
      .sortBy('createdAt');
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<AnalysisSession | undefined> {
    const db = getDatabase();
    return db.sessions.where('sessionId').equals(sessionId).first();
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const db = getDatabase();
    const session = await db.sessions.where('sessionId').equals(sessionId).first();
    if (session) {
      await db.sessions.delete(session.id!);
    }
  }
}

/**
 * Database utility functions
 */
export const dbUtils = {
  /**
   * Get all cases
   */
  async getAllCases(): Promise<CaseMetadata[]> {
    const db = getDatabase();
    return db.cases.orderBy('lastUpdated').reverse().toArray();
  },

  /**
   * Delete entire case and all associated evidence
   */
  async deleteCase(caseId: string): Promise<void> {
    const db = getDatabase();
    await db.transaction('rw', [db.evidence, db.cases, db.sessions], async () => {
      await db.evidence.where('caseId').equals(caseId).delete();
      await db.cases.where('caseId').equals(caseId).delete();
      await db.sessions.where('caseId').equals(caseId).delete();
    });
  },

  /**
   * Get database storage estimate
   */
  async getStorageEstimate(): Promise<{ usage: number; quota: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }
    return { usage: 0, quota: 0 };
  },

  /**
   * Clear all data
   */
  async clearAllData(): Promise<void> {
    const db = getDatabase();
    await db.transaction('rw', [db.evidence, db.cases, db.sessions], async () => {
      await db.evidence.clear();
      await db.cases.clear();
      await db.sessions.clear();
    });
  },

  /**
   * Export case data as JSON
   */
  async exportCaseData(caseId: string): Promise<string> {
    const vault = new OfflineEvidenceVault(caseId, 'export');
    const sessions = await new SessionManager().getCaseSessions(caseId);
    const metadata = await vault.getCaseMetadata();

    return JSON.stringify({
      metadata,
      evidence: await vault.getAllEvidence(),
      sessions
    }, null, 2);
  }
};

/**
 * Hook for React integration
 */
export interface UseOfflineVaultReturn {
  vault: OfflineEvidenceVault | null;
  loading: boolean;
  error: string | null;
  evidence: EvidenceItem[];
  addEvidence: (item: Omit<EvidenceItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<number>;
  removeEvidence: (id: number) => Promise<void>;
  getEvidence: () => Promise<void>;
  storageUsed: number;
}

export function createOfflineVault(caseId: string): OfflineEvidenceVault {
  const encryptionKey = sessionStorage.getItem(`lawsage_vault_key_${caseId}`) 
    || crypto.randomUUID();
  
  sessionStorage.setItem(`lawsage_vault_key_${caseId}`, encryptionKey);
  
  return new OfflineEvidenceVault(caseId, encryptionKey);
}
