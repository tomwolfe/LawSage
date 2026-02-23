/**
 * Case Encryption Utilities
 * 
 * Provides client-side AES-GCM encryption for sensitive case data.
 * Uses Web Crypto API for secure key derivation and encryption.
 * 
 * Security Features:
 * - PBKDF2 for key derivation from password (100,000 iterations)
 * - AES-GCM for authenticated encryption (256-bit keys)
 * - Random salt and IV for each encryption operation
 * - All encrypted data is base64-encoded for URL/localStorage storage
 * 
 * Usage:
 * ```typescript
 * // Encrypt case data
 * const encrypted = await encryptCaseData(caseData, password);
 * 
 * // Decrypt case data
 * const decrypted = await decryptCaseData(encrypted, password);
 * ```
 */

export interface EncryptedCaseData {
  /** Base64-encoded encrypted data */
  ciphertext: string;
  /** Base64-encoded salt for key derivation */
  salt: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Encryption algorithm identifier */
  algorithm: 'AES-GCM';
  /** Key derivation function */
  kdf: 'PBKDF2-SHA256';
  /** Number of PBKDF2 iterations */
  iterations: number;
}

export interface CaseData {
  userInput?: string;
  jurisdiction?: string;
  evidence?: unknown[];
  ledger?: unknown[];
  result?: unknown;
  activeTab?: string;
  [key: string]: unknown;
}

/**
 * Derive an AES key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array, iterations = 100000): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Convert ArrayBuffer to Base64 string
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
 * Convert Base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encrypt case data with a password
 * 
 * @param data - The case data to encrypt
 * @param password - The password for encryption
 * @returns Encrypted case data with metadata
 */
export async function encryptCaseData(
  data: CaseData,
  password: string
): Promise<EncryptedCaseData> {
  // Generate random salt (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Generate random IV (12 bytes for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Derive key from password
  const key = await deriveKey(password, salt);
  
  // Serialize data to JSON
  const jsonData = JSON.stringify(data);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(jsonData);
  
  // Encrypt
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer as ArrayBuffer,
    },
    key,
    dataBuffer
  );
  
  return {
    ciphertext: arrayBufferToBase64(encryptedBuffer),
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: 100000,
  };
}

/**
 * Decrypt case data with a password
 * 
 * @param encryptedData - The encrypted case data
 * @param password - The password for decryption
 * @returns Decrypted case data
 */
export async function decryptCaseData(
  encryptedData: EncryptedCaseData,
  password: string
): Promise<CaseData> {
  const { ciphertext, salt, iv, algorithm, kdf, iterations } = encryptedData;
  
  // Validate algorithm
  if (algorithm !== 'AES-GCM') {
    throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
  }
  
  if (kdf !== 'PBKDF2-SHA256') {
    throw new Error(`Unsupported key derivation function: ${kdf}`);
  }
  
  // Convert from Base64
  const saltArray = new Uint8Array(base64ToArrayBuffer(salt));
  const ivArray = new Uint8Array(base64ToArrayBuffer(iv));
  const ciphertextArray = base64ToArrayBuffer(ciphertext);
  
  // Derive key from password
  const key = await deriveKey(password, saltArray, iterations);
  
  // Decrypt
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivArray.buffer as ArrayBuffer,
    },
    key,
    ciphertextArray
  );
  
  // Parse JSON
  const decoder = new TextDecoder();
  const jsonData = decoder.decode(decryptedBuffer);
  
  return JSON.parse(jsonData) as CaseData;
}

/**
 * Generate a random password for case locking
 * 
 * @param length - Password length (default: 16)
 * @returns Random password
 */
export function generateRandomPassword(length = 16): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const values = crypto.getRandomValues(new Uint8Array(length));
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[values[i] % charset.length];
  }
  return password;
}

/**
 * Check if data is encrypted
 */
export function isEncryptedData(data: unknown): data is EncryptedCaseData {
  if (!data || typeof data !== 'object') return false;
  
  const candidate = data as Record<string, unknown>;
  return (
    typeof candidate.ciphertext === 'string' &&
    typeof candidate.salt === 'string' &&
    typeof candidate.iv === 'string' &&
    candidate.algorithm === 'AES-GCM' &&
    candidate.kdf === 'PBKDF2-SHA256' &&
    typeof candidate.iterations === 'number'
  );
}

/**
 * Hash a password for secure storage/verification
 * Uses SHA-256 (for password verification only, not encryption)
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToBase64(hashBuffer);
}
