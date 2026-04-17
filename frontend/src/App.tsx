import { useState, useEffect } from 'react'
import ChatInterface from './components/ChatInterface'
import InsightsPanel from './components/InsightsPanel'
import ReportUploader from './components/ReportUploader'
import SearchHistory from './components/SearchHistory'
import LoginPage from './components/LoginPage'
import { onAuthChange, logOut, type User } from './lib/firebase'
import { saveSearch } from './lib/searchHistory'
import { Heart, MessageCircle, FileText, Clock, LogOut, Zap } from 'lucide-react'

type TabKey = 'copilot' | 'reports' | 'history';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [contextData, setContextData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('copilot');

  // Listen for auth changes
  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // Save searches to encrypted history
  const handleContextUpdate = (data: any) => {
    setContextData(data);
    if (user) {
      const query = [data.procedure, data.location, data.budget_inr ? `₹${data.budget_inr}` : ''].filter(Boolean).join(', ');
      saveSearch(user.uid, 'chat', query || 'Healthcare query', data);
    }
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
          <div className="p-4 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-2xl shadow-lg shadow-teal-200/50">
            <Heart className="w-8 h-8 text-white animate-pulse" fill="white" />
          </div>
          <p className="text-sm font-semibold text-slate-400">Loading Clinivue...</p>
        </div>
      </div>
    );
  }

  // Not logged in → show login page
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="h-screen flex flex-col warm-bg overflow-hidden">
      {/* ─── Navbar ─── */}
      <nav className="px-6 py-3 bg-white border-b border-slate-100">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-xl shadow-sm shadow-teal-200">
              <Heart className="w-5 h-5 text-white" fill="white" />
            </div>
            <div>
              <span className="text-lg font-extrabold text-slate-800 tracking-tight">Clinivue</span>
              <p className="text-[10px] text-teal-600 font-semibold tracking-wider uppercase -mt-0.5">Your Health Guide</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center bg-slate-50 rounded-full p-1 border border-slate-100">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center space-x-2 px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                  activeTab === tab.key
                    ? 'bg-white text-teal-700 shadow-sm border border-slate-200'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* User Profile */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-slate-50 rounded-full px-3 py-1.5 border border-slate-100">
              <img
                src={user.photoURL || ''}
                alt=""
                className="w-6 h-6 rounded-full border border-slate-200"
                referrerPolicy="no-referrer"
              />
              <span className="text-xs font-semibold text-slate-600 max-w-[100px] truncate">
                {user.displayName?.split(' ')[0] || 'User'}
              </span>
            </div>
            <button
              onClick={logOut}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* ─── Main ─── */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
        {/* Left — Chat / Reports / History */}
        <div className="lg:col-span-7 flex flex-col min-h-0">
          {activeTab === 'copilot' && <ChatInterface onContextUpdate={handleContextUpdate} userUid={user.uid} />}
          {activeTab === 'reports' && <ReportUploader userUid={user.uid} />}
          {activeTab === 'history' && <SearchHistory userUid={user.uid} />}
        </div>

        {/* Right — Insights */}
        <div className="hidden lg:flex lg:col-span-5 flex-col min-h-0">
          <div className="card rounded-3xl flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-50 rounded-xl border border-amber-100">
                  <Zap size={16} className="text-amber-500" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Smart Insights</h2>
                  <p className="text-[11px] text-slate-400">Results appear in real-time</p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-3 py-1 rounded-full border border-teal-100 uppercase tracking-wider">Live</span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {contextData ? (
                <InsightsPanel contextData={contextData} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center mb-5 border border-teal-100 animate-float">
                    <Heart className="w-8 h-8 text-teal-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-700 mb-2">How Can We Help?</h3>
                  <p className="text-slate-400 text-sm leading-relaxed max-w-[260px]">
                    Ask about any treatment, procedure, or hospital in the chat. We'll show you costs and top-rated providers here.
                  </p>
                  <div className="mt-5 px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500">
                    💡 Try: <span className="text-teal-600 font-semibold">"Angioplasty in Nagpur, budget 3 lakh"</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
