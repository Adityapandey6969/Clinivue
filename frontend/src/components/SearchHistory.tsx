import { useState, useEffect } from 'react';
import { Clock, MessageCircle, IndianRupee, FileText, Trash2, ChevronRight, Search, Lock } from 'lucide-react';
import { getSearchHistory, clearHistory, type SearchEntry } from '../lib/searchHistory';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchHistoryProps {
  userUid: string;
}

export default function SearchHistory({ userUid }: SearchHistoryProps) {
  const [history, setHistory] = useState<SearchEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'chat' | 'cost' | 'report'>('all');

  useEffect(() => {
    setHistory(getSearchHistory(userUid));
  }, [userUid]);

  const handleClear = () => {
    if (confirm('Clear all search history? This cannot be undone.')) {
      clearHistory(userUid);
      setHistory([]);
    }
  };

  const filtered = filter === 'all' ? history : history.filter(h => h.type === filter);

  const typeIcon: Record<string, React.ReactNode> = {
    chat: <MessageCircle size={14} className="text-teal-500" />,
    cost: <IndianRupee size={14} className="text-amber-500" />,
    report: <FileText size={14} className="text-violet-500" />,
  };

  const typeLabel: Record<string, string> = {
    chat: 'Chat Query',
    cost: 'Cost Estimate',
    report: 'Lab Report',
  };

  const typeBadge: Record<string, string> = {
    chat: 'bg-teal-50 text-teal-700 border-teal-200',
    cost: 'bg-amber-50 text-amber-700 border-amber-200',
    report: 'bg-violet-50 text-violet-700 border-violet-200',
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full card rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl shadow-sm">
            <Clock size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Search History</h2>
            <div className="flex items-center space-x-1 mt-0.5">
              <Lock size={10} className="text-emerald-500" />
              <p className="text-[11px] text-emerald-600 font-medium">End-to-end encrypted</p>
            </div>
          </div>
        </div>
        {history.length > 0 && (
          <button onClick={handleClear} className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 bg-red-50 rounded-lg border border-red-100 hover:bg-red-100 transition-colors">
            <Trash2 size={12} />
            <span>Clear All</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="px-5 py-3 border-b border-slate-50 flex items-center space-x-2">
        {(['all', 'chat', 'cost', 'report'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold capitalize transition-all ${
              filter === f ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-400 hover:text-slate-600 border border-slate-100'
            }`}
          >
            {f === 'all' ? `All (${history.length})` : typeLabel[f]}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4 border border-slate-100">
              <Search className="w-7 h-7 text-slate-300" />
            </div>
            <h3 className="text-sm font-bold text-slate-600 mb-1">No searches yet</h3>
            <p className="text-xs text-slate-400 max-w-[240px]">
              Your searches will be saved here, encrypted with your account key.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl border border-slate-100 overflow-hidden hover:border-slate-200 transition-all"
              >
                <button
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100 shrink-0">
                      {typeIcon[entry.type]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-700 truncate">{entry.query}</p>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${typeBadge[entry.type]}`}>
                          {entry.type}
                        </span>
                        <span className="text-[10px] text-slate-400">{formatDate(entry.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={14} className={`text-slate-300 transition-transform ${expandedId === entry.id ? 'rotate-90' : ''}`} />
                </button>

                {expandedId === entry.id && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="px-4 pb-3 border-t border-slate-50">
                    <pre className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-3 mt-2 overflow-x-auto max-h-48 whitespace-pre-wrap">
                      {typeof entry.result === 'string' ? entry.result : JSON.stringify(entry.result, null, 2)}
                    </pre>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
