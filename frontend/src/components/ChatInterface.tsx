import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
};

interface ChatInterfaceProps {
  onContextUpdate: (data: any) => void;
}

export default function ChatInterface({ onContextUpdate }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello. I am Clinivue. How can I help you navigate your healthcare options today?'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage.content,
          session_id: 'demo-session-id' // Mock session for now
        })
      });

      const data = await response.json();
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply
      }]);
      
      // Pass the complete intent data back up to App to fetch insights
      if (data.intent && data.intent.procedure) {
        onContextUpdate(data.intent);
      }
      
    } catch (error) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error connecting to the intelligence core.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-800/40 rounded-3xl border border-white/5 shadow-2xl overflow-hidden glass-panel">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex items-start gap-4 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div className={`p-3 rounded-2xl flex-shrink-0 shadow-lg ${
                message.role === 'assistant' 
                  ? 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white' 
                  : 'bg-slate-700 border border-slate-600 text-slate-300'
              }`}>
                {message.role === 'assistant' ? <Bot size={20} /> : <User size={20} />}
              </div>

              {/* Message Bubble */}
              <div className={`max-w-[80%] rounded-2xl px-5 py-4 shadow-md text-[15px] leading-relaxed ${
                message.role === 'user'
                  ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white rounded-tr-none'
                  : 'bg-slate-700/80 border border-slate-600/50 text-slate-200 rounded-tl-none'
              }`}>
                <p>{message.content}</p>
              </div>
            </motion.div>
          ))}
          
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-4"
            >
              <div className="p-3 rounded-2xl flex-shrink-0 bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg">
                <Bot size={20} />
              </div>
              <div className="bg-slate-700/80 border border-slate-600/50 rounded-2xl rounded-tl-none px-5 py-4 shadow-sm flex items-center space-x-2">
                <Loader2 size={18} className="animate-spin text-teal-400" />
                <span className="text-slate-400 text-sm font-medium">Analyzing...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-slate-800/80 border-t border-slate-700 backdrop-blur-xl">
        <div className="flex flex-col gap-3">
          <form onSubmit={handleSubmit} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe your symptoms or procedure you're looking for..."
              className="w-full bg-slate-900/50 text-slate-100 placeholder:text-slate-500 border border-slate-600/50 rounded-2xl pl-5 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-all shadow-inner text-[15px]"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="absolute right-2 p-2.5 bg-teal-500 hover:bg-teal-400 text-slate-900 rounded-xl transition-colors disabled:opacity-50 disabled:hover:bg-teal-500 group shadow-md"
            >
              <Send size={18} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </form>
          
          <div className="flex items-center justify-center space-x-2 text-xs text-slate-500">
            <ShieldAlert size={12} className="text-amber-500" />
            <span>Clinivue is a decision-support tool, not professional medical advice.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
