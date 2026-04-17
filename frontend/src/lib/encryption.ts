/**
 * AES-256 encryption for search history.
 * Each user's data is encrypted using a key derived from their Google UID.
 */
import CryptoJS from 'crypto-js';

const SALT = 'clinivue_e2e_2025';

function deriveKey(userUid: string): string {
  return CryptoJS.SHA256(userUid + SALT).toString();
}

export function encryptData(data: any, userUid: string): string {
  const key = deriveKey(userUid);
  const json = JSON.stringify(data);
  return CryptoJS.AES.encrypt(json, key).toString();
}

export function decryptData(encrypted: string, userUid: string): any {
  try {
    const key = deriveKey(userUid);
    const bytes = CryptoJS.AES.decrypt(encrypted, key);
    const json = bytes.toString(CryptoJS.enc.Utf8);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}
