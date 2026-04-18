import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, ShieldCheck, Heart, MapPin, PlusCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveSessionMessages, subscribeHistory, type ChatMessage } from '../lib/searchHistory';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

interface ChatInterfaceProps {
  onContextUpdate: (data: any) => void;
  userUid: string;
  sessionId: string;
  onNewChat: () => void;
}

export default function ChatInterface({ onContextUpdate, userUid, sessionId, onNewChat }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi there! 👋 I'm Clinivue, your healthcare assistant. I can help you find the right hospitals, estimate treatment costs, and understand your lab reports.\n\nWhat can I help you with today?"
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userCity, setUserCity] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore messages if this session already has history (e.g., after F5 refresh)
  useEffect(() => {
    // Reset to default greeting whenever sessionId changes
    setMessages([
      {
        id: '1',
        role: 'assistant',
        content: "Hi there! 👋 I'm Clinivue, your healthcare assistant. I can help you find the right hospitals, estimate treatment costs, and understand your lab reports.\n\nWhat can I help you with today?"
      }
    ]);

    let initialLoaded = false;
    const unsubscribe = subscribeHistory(userUid, (data) => {
      if (initialLoaded) return;
      const session = data.sessions.find(s => s.sessionId === sessionId);
      if (session && session.messages && session.messages.length > 0) {
        setMessages(session.messages.map((m, i) => ({
          id: i.toString(),
          role: m.role as 'user' | 'assistant',
          content: m.content
        })));
      }
      initialLoaded = true;
    });
    return () => unsubscribe();
  }, [userUid, sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Save the full conversation to the session whenever messages change (skip the initial greeting-only state)
  useEffect(() => {
    if (messages.length <= 1) return; // Don't save until user has sent at least one message
    const chatMessages: ChatMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: new Date().toISOString(),
    }));
    saveSessionMessages(userUid, sessionId, chatMessages);
  }, [messages, userUid, sessionId]);

  const detectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${position.coords.latitude}&lon=${position.coords.longitude}&format=json`);
          const data = await res.json();
          const city = data.address.city || data.address.town || data.address.state_district || data.address.state;
          if (city) {
            setUserCity(city);
          }
        } catch (err) {
          console.error("Reverse geocoding failed", err);
        } finally {
          setLocating(false);
        }
      },
      (error) => {
        console.error(error);
        setLocating(false);
        alert("Unable to retrieve your location");
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = { id: Date.now().toString(), role: 'user' as const, content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:8000/api/v1/chat/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content, session_id: 'demo-session-id' })
      });
      const data = await response.json();
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: data.reply }]);
      
      // Inject auto-detected city if the AI couldn't find one in the text
      if (data.intent) {
        if (!data.intent.location && userCity) {
          data.intent.location = userCity;
        }
        onContextUpdate(data.intent);
      }
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Sorry, I had trouble connecting. Please check that the server is running and try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    { emoji: '🫀', text: 'Angioplasty in Nagpur, budget 3 lakh, age 55' },
    { emoji: '🦵', text: 'Knee replacement cost in Mumbai' },
    { emoji: '👁️', text: 'Best hospitals for cataract surgery in Pune' },
  ];

  const formatMessageText = (text: string) => {
    return text.split('\n').map((line, lineIdx) => {
      if (!line.trim()) return <div key={lineIdx} className="h-2"></div>;

      const isListItem = line.trim().startsWith('- ') || line.trim().startsWith('* ');
      let content = isListItem ? line.trim().substring(2) : line;

      // Handle bold (**text**)
      const parts = content.split(/(\*\*.*?\*\*|\*.*?\*|_.*?_|\[.*?\]\(.*?\))/g);
      
      const formattedParts = parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
        }
        if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
          return <em key={i} className="italic text-slate-800">{part.slice(1, -1)}</em>;
        }
        const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/);
        if (linkMatch) {
          return <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:text-teal-700 underline underline-offset-2">{linkMatch[1]}</a>;
        }
        return <span key={i}>{part}</span>;
      });

      if (isListItem) {
        return (
          <div key={lineIdx} className="flex items-start mt-1 pl-2">
            <span className="mr-2 text-slate-400 font-bold">•</span>
            <span>{formattedParts}</span>
          </div>
        );
      }

      return <div key={lineIdx} className="mb-1">{formattedParts}</div>;
    });
  };

  return (
    <div className="flex flex-col h-full card rounded-3xl overflow-hidden transition-colors duration-300">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-teal-50/80 dark:from-teal-900/20 to-white dark:to-transparent">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm border border-slate-100 dark:border-white/10">
            <img src="/logo.png" alt="Clinivue" className="w-6 h-6 object-contain" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Clinivue Assistant</h2>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Ready to help</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
          <ShieldCheck size={12} className="text-emerald-600 dark:text-emerald-400" />
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Safe Mode</span>
        </div>
        <button
          onClick={onNewChat}
          className="flex items-center space-x-1.5 px-3 py-1.5 ml-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 hover:border-teal-200 dark:hover:border-teal-500/50 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-all shadow-sm"
          title="Start a new chat"
        >
          <PlusCircle size={14} />
          <span className="text-[11px] font-bold">New Chat</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 min-h-0 bg-gradient-to-b from-slate-50/50 dark:from-slate-900/30 to-white dark:to-transparent">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex items-end gap-2.5 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm overflow-hidden ${
                message.role === 'assistant'
                  ? 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/10'
                  : 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white'
              }`}>
                {message.role === 'assistant' ? <img src="/logo.png" className="w-5 h-5 object-contain" /> : <User size={15} />}
              </div>

              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-[14px] leading-[1.7] ${
                message.role === 'user'
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-br-md shadow-sm shadow-indigo-100 dark:shadow-none'
                  : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/5 text-slate-700 dark:text-slate-200 rounded-bl-md shadow-sm'
              }`}>
                <div className="whitespace-pre-line">{message.role === 'user' ? message.content : formatMessageText(message.content)}</div>
              </div>
            </motion.div>
          ))}

          {loading && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2.5">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-sm">
                <Bot size={15} />
              </div>
              <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/5 rounded-2xl rounded-bl-md px-5 py-3.5 shadow-sm">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-400 dark:bg-teal-500 animate-bounce [animation-delay:0ms]"></span>
                  <span className="w-2 h-2 rounded-full bg-teal-400 dark:bg-teal-500 animate-bounce [animation-delay:150ms]"></span>
                  <span className="w-2 h-2 rounded-full bg-teal-400 dark:bg-teal-500 animate-bounce [animation-delay:300ms]"></span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick Prompts */}
        {messages.length <= 1 && !loading && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="pt-3">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-1">Quick Start</p>
            <div className="space-y-2">
              {quickPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(prompt.text); inputRef.current?.focus(); }}
                  className="w-full text-left px-4 py-3 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-white/5 text-[13px] text-slate-600 dark:text-slate-300 hover:border-teal-200 dark:hover:border-teal-500/50 hover:bg-teal-50/30 dark:hover:bg-teal-900/20 transition-all shadow-sm group"
                >
                  <span className="mr-2">{prompt.emoji}</span>
                  {prompt.text}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-5 bg-white dark:bg-slate-900/50 border-t border-slate-100 dark:border-white/5 flex-shrink-0 transition-colors duration-300">
        {!userCity && (
          <div className="mb-3 flex justify-start">
            <button
              onClick={detectLocation}
              disabled={locating}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 hover:bg-teal-50 dark:hover:bg-teal-900/30 border border-slate-200 dark:border-slate-700 hover:border-teal-200 dark:hover:border-teal-500/50 rounded-full text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
            >
              {locating ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
              <span>{locating ? "Detecting location..." : "Share Location for better results"}</span>
            </button>
          </div>
        )}
        {userCity && (
          <div className="mb-3 flex justify-start">
            <span className="flex items-center space-x-1.5 px-3 py-1.5 bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/30 rounded-full text-[11px] font-bold text-teal-700 dark:text-teal-400">
              <MapPin size={12} />
              <span>Location: {userCity}</span>
            </span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about symptoms, treatments, or costs..."
            className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-2xl pl-5 pr-14 py-3.5 text-[14px] focus:outline-none focus:border-teal-300 dark:focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900/30 transition-all"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white rounded-xl transition-all disabled:opacity-30 shadow-sm shadow-teal-200 dark:shadow-none disabled:shadow-none"
          >
            <Send size={16} />
          </button>
        </form>
        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mt-2.5">
          ⚕️ Decision-support only · Not medical advice
        </p>
      </div>
    </div>
  );
}
