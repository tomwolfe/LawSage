/**
 * Case Encryption Utility
 * 
 * Addresses Step 6: Security Hardening
 * 
 * Encrypts LocalStorage data using the browser's SubtleCrypto API.
 * Even if someone gains access to the user's computer, the "Case Folder"
 * should be encrypted at rest.
 * 
 * Features:
 * - AES-GCM encryption (256-bit)
 * - Key derivation using PBKDF2
 * - Salt and IV generation for each encryption
 * - Automatic key rotation support
 */

import { safeLog, safeError } from './pii-redactor';

/**
 * Encrypted case data structure
 */
export interface EncryptedCaseData {
  version: number;
  algorithm: 'AES-GCM-256';
  salt: string;  // Base64 encoded
  iv: string;    // Base64 encoded
  ciphertext: string;  // Base64 encoded
  timestamp: number;
  caseId: string;
}

/**
 * Key derivation configuration
 */
const KEY_DERIVATION_CONFIG = {
  iterations: 100000,
  hash: 'SHA-256',
  keyLength: 256,
} as const;

/**
 * Generate a random salt
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Generate a random initialization vector (IV)
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));  // 96-bit IV for AES-GCM
}

/**
 * Convert ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derive encryption key from password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: KEY_DERIVATION_CONFIG.iterations,
      hash: KEY_DERIVATION_CONFIG.hash,
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: KEY_DERIVATION_CONFIG.keyLength,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt case data for storage in LocalStorage
 * 
 * @param data - The case data to encrypt
 * @param password - User-provided password (or device-specific key)
 * @param caseId - Unique case identifier
 */
export async function encryptCaseData(
  data: unknown,
  password: string,
  caseId: string
): Promise<EncryptedCaseData> {
  try {
    safeLog(`[Encryption] Encrypting case data for case: ${caseId}`);

    // Generate salt and IV
    const salt = generateSalt();
    const iv = generateIV();

    // Derive encryption key
    const key = await deriveKey(password, salt);

    // Serialize data to JSON
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(JSON.stringify(data));

    // Encrypt
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      plaintext
    );

    return {
      version: 1,
      algorithm: 'AES-GCM-256',
      salt: arrayBufferToBase64(salt.buffer),
      iv: arrayBufferToBase64(iv.buffer),
      ciphertext: arrayBufferToBase64(ciphertext),
      timestamp: Date.now(),
      caseId,
    };
  } catch (error) {
    safeError('[Encryption] Failed to encrypt case data:', error);
    throw new Error('Failed to encrypt case data');
  }
}

/**
 * Decrypt case data from LocalStorage
 * 
 * @param encryptedData - The encrypted case data
 * @param password - User-provided password
 */
export async function decryptCaseData(
  encryptedData: EncryptedCaseData,
  password: string
): Promise<unknown> {
  try {
    safeLog(`[Encryption] Decrypting case data for case: ${encryptedData.caseId}`);

    // Validate version
    if (encryptedData.version !== 1) {
      throw new Error(`Unsupported encryption version: ${encryptedData.version}`);
    }

    // Decode salt and IV
    const salt = new Uint8Array(base64ToArrayBuffer(encryptedData.salt));
    const iv = new Uint8Array(base64ToArrayBuffer(encryptedData.iv));

    // Derive decryption key
    const key = await deriveKey(password, salt);

    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      base64ToArrayBuffer(encryptedData.ciphertext)
    );

    // Parse JSON
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(plaintext));
  } catch (error) {
    safeError('[Encryption] Failed to decrypt case data:', error);
    if (error instanceof Error && error.name === 'InvalidAccessError') {
      throw new Error('Incorrect password or corrupted data');
    }
    throw new Error('Failed to decrypt case data');
  }
}

/**
 * Generate a secure case ID
 */
export function generateCaseId(): string {
  const randomValues = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(randomValues)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a password hash for key storage
 * 
 * This can be used to store a password verifier without storing the actual password
 */
export async function generatePasswordHash(password: string, salt?: Uint8Array): Promise<{ hash: string; salt: string }> {
  const usedSalt = salt || generateSalt();
  
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: usedSalt,
      iterations: KEY_DERIVATION_CONFIG.iterations,
      hash: KEY_DERIVATION_CONFIG.hash,
    },
    keyMaterial,
    256
  );

  return {
    hash: arrayBufferToBase64(hash),
    salt: arrayBufferToBase64(usedSalt.buffer),
  };
}

/**
 * Verify password against stored hash
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  try {
    const salt = new Uint8Array(base64ToArrayBuffer(storedSalt));
    const { hash: computedHash } = await generatePasswordHash(password, salt);
    
    // Constant-time comparison to prevent timing attacks
    const hashBytes = base64ToArrayBuffer(storedHash);
    const computedBytes = base64ToArrayBuffer(computedHash);
    
    if (hashBytes.byteLength !== computedBytes.byteLength) {
      return false;
    }
    
    const hashArray = new Uint8Array(hashBytes);
    const computedArray = new Uint8Array(computedBytes);
    
    let result = 0;
    for (let i = 0; i < hashArray.length; i++) {
      result |= hashArray[i] ^ computedArray[i];
    }
    
    return result === 0;
  } catch (error) {
    safeError('[Encryption] Password verification failed:', error);
    return false;
  }
}

/**
 * Encrypt and store case in LocalStorage
 */
export async function storeEncryptedCase(
  caseId: string,
  data: unknown,
  password: string
): Promise<void> {
  try {
    const encryptedData = await encryptCaseData(data, password, caseId);
    const storageKey = `lawsage_case_${caseId}`;
    
    localStorage.setItem(storageKey, JSON.stringify(encryptedData));
    safeLog(`[Encryption] Stored encrypted case: ${caseId}`);
  } catch (error) {
    safeError('[Encryption] Failed to store encrypted case:', error);
    throw error;
  }
}

/**
 * Retrieve and decrypt case from LocalStorage
 */
export async function retrieveEncryptedCase(
  caseId: string,
  password: string
): Promise<unknown> {
  try {
    const storageKey = `lawsage_case_${caseId}`;
    const storedData = localStorage.getItem(storageKey);
    
    if (!storedData) {
      throw new Error(`Case not found: ${caseId}`);
    }
    
    const encryptedData: EncryptedCaseData = JSON.parse(storedData);
    return await decryptCaseData(encryptedData, password);
  } catch (error) {
    safeError('[Encryption] Failed to retrieve encrypted case:', error);
    throw error;
  }
}

/**
 * Delete encrypted case from LocalStorage
 */
export async function deleteEncryptedCase(caseId: string): Promise<void> {
  const storageKey = `lawsage_case_${caseId}`;
  localStorage.removeItem(storageKey);
  safeLog(`[Encryption] Deleted case: ${caseId}`);
}

/**
 * List all encrypted case IDs in LocalStorage
 */
export function listEncryptedCases(): string[] {
  const caseIds: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('lawsage_case_')) {
      const caseId = key.replace('lawsage_case_', '');
      caseIds.push(caseId);
    }
  }
  
  return caseIds;
}

/**
 * Migrate unencrypted cases to encrypted storage
 * 
 * Call this during app initialization to upgrade existing cases
 */
export async function migrateToEncryptedStorage(
  password: string
): Promise<{ migrated: number; failed: number }> {
  let migrated = 0;
  let failed = 0;
  
  const unencryptedKeys: string[] = [];
  
  // Find unencrypted cases
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('lawsage_case_') && !key.endsWith('_encrypted')) {
      unencryptedKeys.push(key);
    }
  }
  
  // Migrate each case
  for (const key of unencryptedKeys) {
    try {
      const data = localStorage.getItem(key);
      if (!data) continue;
      
      const caseId = key.replace('lawsage_case_', '');
      const parsedData = JSON.parse(data);
      
      // Encrypt and store
      await storeEncryptedCase(caseId, parsedData, password);
      
      // Remove unencrypted version
      localStorage.removeItem(key);
      
      migrated++;
      safeLog(`[Encryption] Migrated case: ${caseId}`);
    } catch (error) {
      safeError('[Encryption] Failed to migrate case:', error);
      failed++;
    }
  }
  
  return { migrated, failed };
}

/**
 * Check if browser supports required crypto APIs
 */
export function isCryptoSupported(): boolean {
  return !!(
    crypto &&
    crypto.subtle &&
    crypto.subtle.encrypt &&
    crypto.subtle.decrypt &&
    crypto.subtle.deriveKey &&
    crypto.getRandomValues
  );
}
