/**
 * Encrypted search history manager.
 * Stores all searches in AES-256 encrypted localStorage, keyed per user.
 */
import { encryptData, decryptData } from './encryption';

export type SearchEntry = {
  id: string;
  type: 'chat' | 'cost' | 'report';
  query: string;
  result: any;
  timestamp: string;
};

const STORAGE_KEY_PREFIX = 'clinivue_history_';

function getStorageKey(userUid: string): string {
  return STORAGE_KEY_PREFIX + userUid.slice(0, 12);
}

export function saveSearch(userUid: string, type: SearchEntry['type'], query: string, result: any): void {
  const history = getSearchHistory(userUid);
  const entry: SearchEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    query,
    result,
    timestamp: new Date().toISOString(),
  };
  history.unshift(entry);

  // Keep max 50 entries
  const trimmed = history.slice(0, 50);
  const encrypted = encryptData(trimmed, userUid);
  localStorage.setItem(getStorageKey(userUid), encrypted);
}

export function getSearchHistory(userUid: string): SearchEntry[] {
  const raw = localStorage.getItem(getStorageKey(userUid));
  if (!raw) return [];
  const data = decryptData(raw, userUid);
  return Array.isArray(data) ? data : [];
}

export function clearHistory(userUid: string): void {
  localStorage.removeItem(getStorageKey(userUid));
}
