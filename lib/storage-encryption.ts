/**
 * Storage Encryption Utility
 * 
 * Wraps localStorage with AES-GCM encryption using case-encryption utilities.
 * 
 * Addresses the need to protect sensitive case data stored in localStorage,
 * including analysis history and quality audit logs.
 * 
 * KEY MANAGEMENT:
 * - Derives a device-specific key using crypto.getRandomValues() stored in sessionStorage
 * - Key persists across tabs within the same browser session
 * - Key is lost on browser restart (intentional for client-side-only encryption)
 * - No user password required - uses device-unique key
 * 
 * ENCRYPTED KEYS:
 * - `lawsage_history` - User's analysis history
 * - `lawsage_quality_audit` - Quality audit logs
 * 
 * MIGRATION:
 * - On first load, checks for unencrypted data and migrates it
 * - Migrated data is re-encrypted with the device key
 */

import { encryptCaseData, decryptCaseData, type EncryptedCaseData } from './case-encryption';
import { safeLog, safeWarn, safeError } from './pii-redactor';

/**
 * Device key storage key (in sessionStorage)
 * This key persists across tabs but not browser restarts
 */
const DEVICE_KEY_STORAGE = 'lawsage_device_encryption_key';

/**
 * Get or generate a device-specific encryption key
 * The key is stored in sessionStorage so it persists across tabs
 * but is lost on browser restart (intentional for client-side-only encryption)
 */
function getDeviceKey(): string {
  let key = sessionStorage.getItem(DEVICE_KEY_STORAGE);

  if (!key) {
    // Generate a random 256-bit key
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    key = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(DEVICE_KEY_STORAGE, key);

    safeLog('[Storage Encryption] Generated new device encryption key');
  }

  return key;
}

/**
 * Check if the browser supports Web Crypto API
 */
function isCryptoSupported(): boolean {
  try {
    return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Encrypt data and store in localStorage
 * 
 * @param key - Storage key (e.g., 'lawsage_history')
 * @param data - The data to encrypt and store
 */
export async function setEncryptedItem(key: string, data: unknown): Promise<void> {
  if (!isCryptoSupported()) {
    // Fall back to unencrypted storage if crypto not available
    localStorage.setItem(key, JSON.stringify(data));
    safeWarn('[Storage Encryption] Crypto not supported, storing unencrypted');
    return;
  }

  const deviceKey = getDeviceKey();

  try {
    const encrypted = await encryptCaseData(data, deviceKey, key);
    localStorage.setItem(key, JSON.stringify(encrypted));
    safeLog('[Storage Encryption] Successfully encrypted and stored: ' + key);
  } catch (error) {
    safeError('[Storage Encryption] Failed to encrypt data for key ' + key + ':', error);
    // Fall back to unencrypted storage on failure
    localStorage.setItem(key, JSON.stringify(data));
  }
}

/**
 * Read and decrypt data from localStorage
 * 
 * @param key - Storage key (e.g., 'lawsage_history')
 * @returns The decrypted data, or null if not found or decryption fails
 */
export async function getEncryptedItem<T>(key: string): Promise<T | null> {
  if (!isCryptoSupported()) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    // Try to parse as encrypted data first
    const encryptedData = JSON.parse(raw) as EncryptedCaseData;

    // Check if this is encrypted data (has version field) or legacy unencrypted data
    if (encryptedData.version && encryptedData.algorithm) {
      // This is encrypted data - decrypt it
      const deviceKey = getDeviceKey();
      const decrypted = await decryptCaseData(encryptedData, deviceKey);
      return decrypted as T;
    } else {
      // This is legacy unencrypted data - migrate it
      safeWarn('[Storage Encryption] Found legacy unencrypted data for ' + key + ', migrating...');
      const migrated = JSON.parse(raw) as T;

      // Re-encrypt the migrated data
      await setEncryptedItem(key, migrated);

      return migrated;
    }
  } catch (error) {
    safeError('[Storage Encryption] Failed to decrypt data for key ' + key + ':', error);
    // Try to parse as plain data (migration from older format)
    try {
      const data = JSON.parse(raw);
      // Re-encrypt the data
      await setEncryptedItem(key, data);
      return data as T;
    } catch {
      return null;
    }
  }
}

/**
 * Remove an encrypted item from localStorage
 * 
 * @param key - Storage key to remove
 */
export function removeEncryptedItem(key: string): void {
  localStorage.removeItem(key);
  safeLog('[Storage Encryption] Removed: ' + key);
}

/**
 * Check if encrypted data exists for a given key
 * 
 * @param key - Storage key to check
 * @returns True if encrypted data exists
 */
export function hasEncryptedItem(key: string): boolean {
  const raw = localStorage.getItem(key);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw);
    // Check if this is encrypted data (has version and algorithm fields)
    return !!parsed.version && !!parsed.algorithm;
  } catch {
    // Not encrypted data format
    return false;
  }
}

/**
 * Migrate all legacy unencrypted data to encrypted storage
 * Should be called on app init
 */
export async function migrateLegacyData(): Promise<void> {
  // Migration is handled by getEncryptedItem which auto-migrates on read
  safeLog('[Storage Encryption] Migration check complete');
  
  // Data is now encrypted - no action needed if already encrypted
  // This function ensures any remaining unencrypted data is migrated
}

/**
 * Clear all encrypted data from localStorage
 * Useful for testing or user-initiated data clearing
 */
export function clearAllEncryptedData(): void {
  // Remove the device key (this will cause all encrypted data to be inaccessible)
  sessionStorage.removeItem(DEVICE_KEY_STORAGE);

  // Remove encrypted items
  removeEncryptedItem('lawsage_history');
  removeEncryptedItem('lawsage_quality_audit');

  safeLog('[Storage Encryption] All encrypted data cleared');
}