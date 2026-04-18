import { useState, useEffect } from 'react';
import { Clock, MessageCircle, IndianRupee, FileText, Trash2, ChevronRight, ChevronDown, Search, Lock, Bot, User } from 'lucide-react';
import { subscribeHistory, clearHistory, type HistoryData, type ChatSession, type SearchEntry } from '../lib/searchHistory';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchHistoryProps {
  userUid: string;
}

export default function SearchHistory({ userUid }: SearchHistoryProps) {
  const [historyData, setHistoryData] = useState<HistoryData>({ sessions: [], searches: [] });
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [expandedSearchId, setExpandedSearchId] = useState<string | null>(null);
  const [view, setView] = useState<'sessions' | 'searches'>('sessions');

  useEffect(() => {
    const unsubscribe = subscribeHistory(userUid, (data) => {
      setHistoryData(data);
    });
    return () => unsubscribe();
  }, [userUid]);

  const handleClear = async () => {
    if (confirm('Clear all history? This cannot be undone.')) {
      await clearHistory(userUid);
      setHistoryData({ sessions: [], searches: [] });
    }
  };

  const totalItems = historyData.sessions.length + historyData.searches.length;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatFullDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const typeBadge: Record<string, string> = {
    chat: 'bg-teal-50 text-teal-700 border-teal-200',
    cost: 'bg-amber-50 text-amber-700 border-amber-200',
    report: 'bg-violet-50 text-violet-700 border-violet-200',
  };

  return (
    <div className="flex flex-col h-full card rounded-3xl overflow-hidden transition-colors duration-300">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between flex-shrink-0 bg-white/50 dark:bg-transparent">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl shadow-sm">
            <Clock size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">History</h2>
            <div className="flex items-center space-x-1 mt-0.5">
              <Lock size={10} className="text-emerald-500 dark:text-emerald-400" />
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">End-to-end encrypted</p>
            </div>
          </div>
        </div>
        {totalItems > 0 && (
          <button onClick={handleClear} className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg border border-red-100 dark:border-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors">
            <Trash2 size={12} />
            <span>Clear All</span>
          </button>
        )}
      </div>

      {/* View Tabs */}
      <div className="px-5 py-3 border-b border-slate-50 dark:border-white/5 flex items-center space-x-2 bg-white/30 dark:bg-transparent">
        <button
          onClick={() => setView('sessions')}
          className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
            view === 'sessions' ? 'bg-slate-800 dark:bg-teal-500/20 text-white dark:text-teal-400 dark:border-teal-500/30 border border-transparent' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 border border-slate-100 dark:border-white/5'
          }`}
        >
          💬 Chat Sessions ({historyData.sessions.length})
        </button>
        <button
          onClick={() => setView('searches')}
          className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
            view === 'searches' ? 'bg-slate-800 dark:bg-teal-500/20 text-white dark:text-teal-400 dark:border-teal-500/30 border border-transparent' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 border border-slate-100 dark:border-white/5'
          }`}
        >
          🔍 Searches ({historyData.searches.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0 bg-slate-50/30 dark:bg-transparent">
        {view === 'sessions' ? (
          historyData.sessions.length === 0 ? (
            <EmptyState icon={<MessageCircle className="w-7 h-7 text-slate-300 dark:text-slate-600" />} title="No chat sessions yet" desc="Your conversations with Clinivue will appear here, grouped by session." />
          ) : (
            <AnimatePresence initial={false}>
              {historyData.sessions.map((session) => (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  expanded={expandedSessionId === session.sessionId}
                  onToggle={() => setExpandedSessionId(expandedSessionId === session.sessionId ? null : session.sessionId)}
                  formatDate={formatDate}
                  formatFullDate={formatFullDate}
                />
              ))}
            </AnimatePresence>
          )
        ) : (
          historyData.searches.length === 0 ? (
            <EmptyState icon={<Search className="w-7 h-7 text-slate-300 dark:text-slate-600" />} title="No searches yet" desc="Cost estimates and lab report analyses will appear here." />
          ) : (
            <AnimatePresence initial={false}>
              {historyData.searches.map((entry) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-white/5 overflow-hidden hover:border-slate-200 dark:hover:border-white/10 transition-all dark:backdrop-blur-md"
                >
                  <button
                    onClick={() => setExpandedSearchId(expandedSearchId === entry.id ? null : entry.id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-white/10 shrink-0">
                        {entry.type === 'cost' ? <IndianRupee size={14} className="text-amber-500 dark:text-amber-400" /> : <FileText size={14} className="text-violet-500 dark:text-violet-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 truncate">{entry.query}</p>
                        <div className="flex items-center space-x-2 mt-0.5">
                          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${typeBadge[entry.type]}`}>
                            {entry.type}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatDate(entry.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={14} className={`text-slate-300 dark:text-slate-600 transition-transform ${expandedSearchId === entry.id ? 'rotate-90' : ''}`} />
                  </button>

                  {expandedSearchId === entry.id && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="px-4 pb-3 border-t border-slate-50 dark:border-white/5 bg-slate-50/30 dark:bg-transparent">
                      <pre className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 rounded-lg p-3 mt-2 overflow-x-auto max-h-48 whitespace-pre-wrap border border-slate-100 dark:border-white/5">
                        {typeof entry.result === 'string' ? entry.result : JSON.stringify(entry.result, null, 2)}
                      </pre>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )
        )}
      </div>
    </div>
  );
}

// ─── Session Card Component ───
function SessionCard({ session, expanded, onToggle, formatDate, formatFullDate }: {
  session: ChatSession;
  expanded: boolean;
  onToggle: () => void;
  formatDate: (iso: string) => string;
  formatFullDate: (iso: string) => string;
}) {
  const messageCount = session.messages.length;
  const userMessages = session.messages.filter(m => m.role === 'user').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-white/5 overflow-hidden hover:border-teal-200 dark:hover:border-teal-500/50 transition-all dark:backdrop-blur-md"
    >
      {/* Session Header */}
      <button onClick={onToggle} className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="p-2 bg-gradient-to-br from-teal-50 dark:from-teal-900/30 to-emerald-50 dark:to-emerald-900/20 rounded-lg border border-teal-100 dark:border-teal-500/20 shrink-0">
            <MessageCircle size={15} className="text-teal-600 dark:text-teal-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 truncate">{session.title}</p>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatDate(session.startedAt)}</span>
              <span className="text-[10px] text-slate-300 dark:text-slate-600">•</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">{userMessages} {userMessages === 1 ? 'message' : 'messages'}</span>
            </div>
          </div>
        </div>
        {expanded
          ? <ChevronDown size={14} className="text-teal-500 dark:text-teal-400 shrink-0" />
          : <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 shrink-0" />
        }
      </button>

      {/* Expanded: Full Conversation */}
      {expanded && (
        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="border-t border-slate-50 dark:border-white/5">
          <div className="px-4 py-2 bg-slate-50/50 dark:bg-slate-800/30">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Started: {formatFullDate(session.startedAt)}</p>
          </div>
          <div className="px-4 py-3 space-y-3 max-h-[400px] overflow-y-auto bg-white/50 dark:bg-transparent">
            {session.messages.map((msg, idx) => (
              <div key={idx} className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                  msg.role === 'assistant'
                    ? 'bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-500/30'
                    : 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white'
                }`}>
                  {msg.role === 'assistant' ? <Bot size={12} className="text-teal-600 dark:text-teal-400" /> : <User size={11} />}
                </div>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-[12px] leading-[1.6] ${
                  msg.role === 'user'
                    ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-200 border border-indigo-100 dark:border-indigo-500/30'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-white/5'
                }`}>
                  <p className="whitespace-pre-line">{msg.content}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Empty State Component ───
function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center mb-4 border border-slate-100 dark:border-white/5">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">{title}</h3>
      <p className="text-xs text-slate-400 dark:text-slate-500 max-w-[240px]">{desc}</p>
    </div>
  );
}
