import { encryptData, decryptData } from './encryption';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

export type ChatSession = {
  sessionId: string;
  title: string;
  startedAt: string;
  lastMessageAt: string;
  messages: ChatMessage[];
};

export type SearchEntry = {
  id: string;
  type: 'chat' | 'cost' | 'report';
  query: string;
  result: any;
  timestamp: string;
};

export type HistoryData = {
  sessions: ChatSession[];
  searches: SearchEntry[];
};

const API_BASE = 'http://localhost:8000/api/v1/history';

const historyListeners = new Set<(data: HistoryData) => void>();

function notifyListeners(data: HistoryData) {
  historyListeners.forEach(l => l(data));
}

async function loadHistory(userUid: string): Promise<HistoryData> {
  try {
    const res = await fetch(`${API_BASE}/${userUid}`);
    const data = await res.json();
    if (data.encryptedData) {
      const decrypted = decryptData(data.encryptedData, userUid);
      if (decrypted && typeof decrypted === 'object') {
        // Handle migration from old format (array of SearchEntry)
        if (Array.isArray(decrypted)) {
          return { sessions: [], searches: decrypted };
        }
        return {
          sessions: decrypted.sessions || [],
          searches: decrypted.searches || [],
        };
      }
    }
  } catch (error) {
    console.error("Failed to load history", error);
  }
  return { sessions: [], searches: [] };
}

async function persistHistory(userUid: string, historyData: HistoryData): Promise<void> {
  const encrypted = encryptData(historyData, userUid);
  try {
    await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_uid: userUid, encrypted_data: encrypted })
    });
  } catch (err) {
    console.error("Failed to save history", err);
  }
}

// ─── Session Management ───

export async function saveSessionMessages(
  userUid: string,
  sessionId: string,
  messages: ChatMessage[],
  title?: string
): Promise<void> {
  const data = await loadHistory(userUid);

  const existingIdx = data.sessions.findIndex(s => s.sessionId === sessionId);
  const now = new Date().toISOString();
  const sessionTitle = title || messages.find(m => m.role === 'user')?.content.slice(0, 60) || 'New Chat';

  if (existingIdx >= 0) {
    data.sessions[existingIdx].messages = messages;
    data.sessions[existingIdx].lastMessageAt = now;
    data.sessions[existingIdx].title = sessionTitle;
  } else {
    data.sessions.unshift({
      sessionId,
      title: sessionTitle,
      startedAt: now,
      lastMessageAt: now,
      messages,
    });
  }

  // Keep only the last 30 sessions
  data.sessions = data.sessions.slice(0, 30);

  await persistHistory(userUid, data);
  notifyListeners(data);
}

// ─── Legacy Search Entries (reports, cost lookups) ───

export async function saveSearch(
  userUid: string,
  type: SearchEntry['type'],
  query: string,
  result: any
): Promise<void> {
  const data = await loadHistory(userUid);

  const entry: SearchEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    query,
    result,
    timestamp: new Date().toISOString(),
  };
  data.searches.unshift(entry);
  data.searches = data.searches.slice(0, 50);

  await persistHistory(userUid, data);
  notifyListeners(data);
}

// ─── Subscribe / Read ───

export function subscribeHistory(
  userUid: string,
  callback: (data: HistoryData) => void
): () => void {
  historyListeners.add(callback);

  // Initial fetch
  loadHistory(userUid).then(callback);

  // Poll every 5s for cross-tab sync
  const interval = setInterval(() => {
    loadHistory(userUid).then(callback);
  }, 5000);

  return () => {
    historyListeners.delete(callback);
    clearInterval(interval);
  };
}

// ─── Clear ───

export async function clearHistory(userUid: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/${userUid}`, { method: 'DELETE' });
    notifyListeners({ sessions: [], searches: [] });
  } catch (error) {
    console.error("Error clearing history", error);
  }
}

// ─── Generate Session ID ───

export function generateSessionId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
