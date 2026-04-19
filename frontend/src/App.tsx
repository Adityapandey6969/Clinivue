import { useState, useEffect, useMemo } from 'react'
import ChatInterface from './components/ChatInterface'
import InsightsPanel from './components/InsightsPanel'
import ReportUploader from './components/ReportUploader'
import SearchHistory from './components/SearchHistory'
import LoginPage from './components/LoginPage'
import { onAuthChange, logOut, type User } from './lib/firebase'
import { generateSessionId } from './lib/searchHistory'
import { Heart, MessageCircle, FileText, Clock, LogOut, Zap, Moon, Sun, Settings, ChevronDown } from 'lucide-react'

type TabKey = 'copilot' | 'reports' | 'history';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [contextData, setContextData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('copilot');
  const [showSettings, setShowSettings] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('clinivue_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Apply theme class to HTML root
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('clinivue_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('clinivue_theme', 'light');
    }
  }, [isDark]);

  // Generate or load a unique session ID for this tab to survive refreshes
  const [sessionId, setSessionId] = useState(() => {
    const existing = sessionStorage.getItem('clinivue_session_id');
    if (existing) return existing;
    const newId = generateSessionId();
    sessionStorage.setItem('clinivue_session_id', newId);
    return newId;
  });

  const handleNewChat = () => {
    const newId = generateSessionId();
    sessionStorage.setItem('clinivue_session_id', newId);
    setSessionId(newId);
    setContextData(null); // Clear insights panel
  };

  // Listen for auth changes
  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // Update context for right panel
  const handleContextUpdate = (data: any) => {
    setContextData(data);
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'copilot', label: 'AI Assistant', icon: <MessageCircle size={16} /> },
    { key: 'reports', label: 'Lab Reports', icon: <FileText size={16} /> },
    { key: 'history', label: 'History', icon: <Clock size={16} /> },
  ];

  // Loading state
  if (authLoading) {
    return (
      <div className="h-screen warm-bg flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-lg shadow-teal-100 dark:shadow-none border border-slate-50 dark:border-white/10 flex items-center justify-center">
            <img src="/logo.png" alt="Clinivue" className="w-10 h-10 animate-pulse object-contain" />
          </div>
          <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">Loading Clinivue...</p>
        </div>
      </div>
    );
  }

  // Not logged in → show login page
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="h-screen flex flex-col warm-bg overflow-hidden transition-colors duration-300">
      {/* ─── Navbar ─── */}
      <nav className="px-6 py-3 bg-white/80 dark:bg-slate-900/60 backdrop-blur-md border-b border-slate-100 dark:border-white/5 relative z-50">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-white/10 flex items-center justify-center">
              <img src="/logo.png" alt="Clinivue" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <span className="text-lg font-extrabold text-slate-800 dark:text-white tracking-tight">Clinivue</span>
              <p className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold tracking-wider uppercase -mt-0.5">Your Health Guide</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center bg-slate-50 dark:bg-slate-900/50 rounded-full p-1 border border-slate-100 dark:border-white/5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center space-x-2 px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                  activeTab === tab.key
                    ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-400 shadow-sm border border-slate-200 dark:border-white/10'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* User Profile & Settings */}
          <div className="relative">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full px-3 py-1.5 border border-slate-100 dark:border-white/5 transition-colors focus:outline-none"
            >
              <img
                src={user.photoURL || ''}
                alt=""
                className="w-6 h-6 rounded-full border border-slate-200 dark:border-slate-700"
                referrerPolicy="no-referrer"
              />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 max-w-[100px] truncate">
                {user.displayName?.split(' ')[0] || 'User'}
              </span>
              <ChevronDown size={14} className="text-slate-400 dark:text-slate-500" />
            </button>

            {/* Settings Dropdown */}
            {showSettings && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)}></div>
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50 animate-slide-up">
                  <div className="px-4 py-3 border-b border-slate-50 dark:border-white/5">
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Settings</p>
                  </div>
                  <div className="p-2 space-y-1">
                    <button
                      onClick={() => setIsDark(!isDark)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 text-sm font-semibold text-slate-600 dark:text-slate-300 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        {isDark ? <Sun size={16} className="text-amber-500" /> : <Moon size={16} className="text-indigo-500" />}
                        <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${isDark ? 'bg-teal-500' : 'bg-slate-200'}`}>
                        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${isDark ? 'translate-x-4' : 'translate-x-0'}`}></div>
                      </div>
                    </button>
                    <button
                      onClick={logOut}
                      className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/10 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      <LogOut size={16} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ─── Main ─── */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
        {/* Left — Chat / Reports / History */}
        <div className={`${activeTab === 'copilot' ? 'lg:col-span-7' : 'lg:col-span-12 lg:max-w-5xl lg:mx-auto lg:w-full'} flex flex-col min-h-0 transition-all duration-300`}>
          <div className={activeTab === 'copilot' ? 'h-full' : 'hidden'}>
            <ChatInterface onContextUpdate={handleContextUpdate} userUid={user.uid} sessionId={sessionId} onNewChat={handleNewChat} />
          </div>
          <div className={activeTab === 'reports' ? 'h-full' : 'hidden'}>
            <ReportUploader userUid={user.uid} />
          </div>
          <div className={activeTab === 'history' ? 'h-full' : 'hidden'}>
            <SearchHistory userUid={user.uid} />
          </div>
        </div>

        {/* Right — Insights */}
        {activeTab === 'copilot' && (
          <div className="hidden lg:flex lg:col-span-5 flex-col min-h-0">
            <div className="card rounded-3xl flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-amber-50 dark:bg-amber-500/10 rounded-xl border border-amber-100 dark:border-amber-500/20">
                      <Zap size={16} className="text-amber-500" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Smart Insights</h2>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">Results appear in real-time</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 px-3 py-1 rounded-full border border-teal-100 dark:border-teal-500/20 uppercase tracking-wider">Live</span>
                </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5">
                {contextData ? (
                  <InsightsPanel contextData={contextData} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center px-8">
                    <div className="w-20 h-20 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center mb-5 border border-slate-100 dark:border-white/10 shadow-sm animate-float">
                      <img src="/logo.png" alt="" className="w-12 h-12 object-contain" />
                    </div>
                    <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-2">How Can We Help?</h3>
                    <p className="text-slate-400 dark:text-slate-400 text-sm leading-relaxed max-w-[260px]">
                      Ask about any treatment, procedure, or hospital in the chat. We'll show you costs and top-rated providers here.
                    </p>
                    <div className="mt-5 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-white/5 text-xs text-slate-500 dark:text-slate-400">
                      💡 Try: <span className="text-teal-600 dark:text-teal-400 font-semibold">"Angioplasty in Nagpur, budget 3 lakh"</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
