import { useState } from 'react'
import ChatInterface from './components/ChatInterface'
import InsightsPanel from './components/InsightsPanel'
import ReportUploader from './components/ReportUploader'
import { Activity, MessageSquare, FileText } from 'lucide-react'

type TabKey = 'copilot' | 'reports';

function App() {
  const [contextData, setContextData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('copilot');

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'copilot', label: 'Copilot', icon: <MessageSquare size={16} /> },
    { key: 'reports', label: 'Lab Reports', icon: <FileText size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-teal-500/30">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 glass-panel border-b border-white/10 bg-slate-900/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-tr from-teal-500 to-emerald-400 rounded-xl shadow-lg shadow-teal-500/20">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-300">
                Clinivue
              </span>
            </div>
            <div className="flex items-center space-x-1 bg-slate-800/60 rounded-xl p-1 border border-slate-700/50">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    activeTab === tab.key
                      ? 'bg-teal-500/20 text-teal-400 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 relative">
        {/* Decorative Background Gradients */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-500/20 rounded-full blur-[128px] pointer-events-none"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px] pointer-events-none"></div>

        {/* Left Panel — Main Interaction Area */}
        <div className="lg:col-span-7 flex flex-col h-[calc(100vh-8rem)] z-10 relative">
          {activeTab === 'copilot' && (
            <ChatInterface onContextUpdate={setContextData} />
          )}
          {activeTab === 'reports' && (
            <ReportUploader />
          )}
        </div>

        {/* Right Panel — Live Insights */}
        <div className="hidden lg:flex lg:col-span-5 flex-col space-y-6 z-10 relative">
          <div className="bg-slate-800/40 backdrop-blur-md border border-white/5 shadow-xl rounded-3xl p-6 flex-1 h-[calc(100vh-8rem)] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-6 flex items-center text-slate-200">
              <span className="w-2 h-2 rounded-full bg-teal-500 mr-3 animate-pulse"></span>
              Live Insights
            </h2>
            
            {contextData ? (
              <InsightsPanel contextData={contextData} />
            ) : (
              <div className="flex flex-col items-center justify-center h-[70%] text-center px-4">
                <div className="w-20 h-20 rounded-full bg-slate-800/80 flex items-center justify-center mb-6 ring-1 ring-white/10 shadow-inner">
                  <Activity className="w-8 h-8 text-teal-500/50" />
                </div>
                <h3 className="text-lg font-medium text-slate-300 mb-2">Awaiting Context</h3>
                <p className="text-slate-500 text-sm leading-relaxed max-w-sm">
                  Describe a symptom or procedure in the chat. Recommendations, costs, and providers will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
