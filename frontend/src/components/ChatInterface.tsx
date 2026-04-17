import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, ShieldCheck, Heart, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveSearch } from '../lib/searchHistory';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

interface ChatInterfaceProps {
  onContextUpdate: (data: any) => void;
  userUid: string;
}

export default function ChatInterface({ onContextUpdate, userUid }: ChatInterfaceProps) {
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      // Save to encrypted history
      saveSearch(userUid, 'chat', userMessage.content, data.reply);
      
      // Inject auto-detected city if the AI couldn't find one in the text
      if (data.intent?.procedure) {
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

  return (
    <div className="flex flex-col h-full card rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-teal-50/80 to-white">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-sm shadow-teal-200">
            <Heart size={18} className="text-white" fill="white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Clinivue Assistant</h2>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <p className="text-[11px] text-emerald-600 font-medium">Ready to help</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
          <ShieldCheck size={12} className="text-emerald-600" />
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Safe Mode</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 min-h-0 bg-gradient-to-b from-slate-50/50 to-white">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex items-end gap-2.5 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm ${
                message.role === 'assistant'
                  ? 'bg-gradient-to-br from-teal-500 to-emerald-500'
                  : 'bg-gradient-to-br from-indigo-500 to-violet-500'
              }`}>
                {message.role === 'assistant' ? <Bot size={15} /> : <User size={15} />}
              </div>

              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-[14px] leading-[1.7] ${
                message.role === 'user'
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-br-md shadow-sm shadow-indigo-100'
                  : 'bg-white border border-slate-100 text-slate-700 rounded-bl-md shadow-sm'
              }`}>
                <p className="whitespace-pre-line">{message.content}</p>
              </div>
            </motion.div>
          ))}

          {loading && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2.5">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-sm">
                <Bot size={15} />
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-md px-5 py-3.5 shadow-sm">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-bounce [animation-delay:0ms]"></span>
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-bounce [animation-delay:150ms]"></span>
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-bounce [animation-delay:300ms]"></span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick Prompts */}
        {messages.length <= 1 && !loading && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="pt-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Quick Start</p>
            <div className="space-y-2">
              {quickPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(prompt.text); inputRef.current?.focus(); }}
                  className="w-full text-left px-4 py-3 bg-white rounded-xl border border-slate-100 text-[13px] text-slate-600 hover:border-teal-200 hover:bg-teal-50/30 transition-all shadow-sm group"
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
      <div className="p-5 bg-white border-t border-slate-100 flex-shrink-0">
        {!userCity && (
          <div className="mb-3 flex justify-start">
            <button
              onClick={detectLocation}
              disabled={locating}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-200 rounded-full text-[11px] font-semibold text-slate-500 hover:text-teal-700 transition-colors"
            >
              {locating ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
              <span>{locating ? "Detecting location..." : "Share Location for better results"}</span>
            </button>
          </div>
        )}
        {userCity && (
          <div className="mb-3 flex justify-start">
            <span className="flex items-center space-x-1.5 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-full text-[11px] font-bold text-teal-700">
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
            className="w-full bg-slate-50 text-slate-800 placeholder:text-slate-400 border border-slate-200 rounded-2xl pl-5 pr-14 py-3.5 text-[14px] focus:outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100 transition-all"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white rounded-xl transition-all disabled:opacity-30 shadow-sm shadow-teal-200 disabled:shadow-none"
          >
            <Send size={16} />
          </button>
        </form>
        <p className="text-center text-[11px] text-slate-400 mt-2.5">
          ⚕️ Decision-support only · Not medical advice
        </p>
      </div>
    </div>
  );
}
