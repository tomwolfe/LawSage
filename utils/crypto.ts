import CryptoJS from 'crypto-js';

const SECRET_KEY = process.env.NEXT_PUBLIC_VAULT_KEY || 'lawsage-default-vault-key-change-in-prod';

export class Vault {
  /**
   * Encrypts any data object using AES-256.
   */
  static encrypt(data: any): string {
    const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(data), SECRET_KEY).toString();
    return ciphertext;
  }

  /**
   * Decrypts an AES-256 encrypted string back to its original object.
   */
  static decrypt(ciphertext: string): any {
    try {
      const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
      const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
      return decryptedData;
    } catch (e) {
      console.error('Decryption failed:', e);
      return null;
    }
  }
}
