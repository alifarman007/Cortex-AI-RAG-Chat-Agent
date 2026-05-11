import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import Sidebar from '../components/Sidebar';
import { Paperclip, Send, PanelRightClose, PanelRightOpen, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../components/Sidebar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const md = {
  h1: (p: any) => <h1 className="text-2xl font-bold mt-4 mb-2 text-text-primary" {...p} />,
  h2: (p: any) => <h2 className="text-xl font-bold mt-4 mb-2 text-text-primary" {...p} />,
  h3: (p: any) => <h3 className="text-lg font-semibold mt-3 mb-1.5 text-text-primary" {...p} />,
  h4: (p: any) => <h4 className="text-base font-semibold mt-3 mb-1 text-text-primary" {...p} />,
  p:  (p: any) => <p className="mb-3 last:mb-0 leading-relaxed" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-6 mb-3 space-y-1" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-6 mb-3 space-y-1" {...p} />,
  li: (p: any) => <li className="leading-relaxed" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-text-primary" {...p} />,
  em: (p: any) => <em className="italic" {...p} />,
  a: (p: any) => <a className="text-accent-gold underline hover:opacity-80" target="_blank" rel="noopener noreferrer" {...p} />,
  code: ({ inline, className, children, ...rest }: any) =>
    inline
      ? <code className="px-1.5 py-0.5 rounded bg-bg-tertiary border border-border-default text-[13px] font-mono" {...rest}>{children}</code>
      : <code className={cn("block p-3 rounded-md bg-bg-tertiary border border-border-default text-[13px] font-mono overflow-x-auto", className)} {...rest}>{children}</code>,
  pre: (p: any) => <pre className="mb-3 overflow-x-auto" {...p} />,
  blockquote: (p: any) => <blockquote className="border-l-2 border-accent-gold pl-4 italic text-text-secondary my-3" {...p} />,
  hr: () => <hr className="my-4 border-border-default" />,
  table: (p: any) => <div className="overflow-x-auto my-3"><table className="min-w-full border-collapse text-sm" {...p} /></div>,
  th: (p: any) => <th className="border border-border-default px-3 py-1.5 bg-bg-tertiary text-left font-medium" {...p} />,
  td: (p: any) => <td className="border border-border-default px-3 py-1.5" {...p} />,
};

export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentKb, setCurrentKb] = useState<any>(null);
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      fetchConversation();
    } else {
      setMessages([]);
      setCurrentKb(null);
    }
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const fetchConversation = async () => {
    const { data: conv } = await supabase
      .from('conversations')
      .select('*, knowledge_bases(*)')
      .eq('id', id)
      .single();
    
    if (conv) {
      setCurrentKb(conv.knowledge_bases);
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });
      if (msgs) setMessages(msgs);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    let convId = id;
    const firstMessageTitle = input.substring(0, 50);
    if (!convId) {
      const { data } = await supabase
        .from('conversations')
        .insert({ user_id: user?.id, title: firstMessageTitle })
        .select()
        .single();
      if (data) {
        convId = data.id;
        navigate(`/chat/${convId}`, { replace: true });
      }
    } else if (messages.length === 0) {
      await supabase
        .from('conversations')
        .update({ title: firstMessageTitle })
        .eq('id', convId)
        .eq('title', 'New Chat');
    }

    const userMessage = {
      conversation_id: convId,
      role: 'user',
      content: input,
    };

    // Optimistic UI
    setMessages(prev => [...prev, { ...userMessage, id: 'temp-user' }]);
    setInput('');
    setLoading(true);
    setStreamingText('');

    try {
      // Save user message
      await supabase.from('messages').insert(userMessage);

      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession();

      // Call API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          message: input,
          conversation_id: convId,
          knowledge_base_id: currentKb?.id,
          model_id: localStorage.getItem('extra_mode') === 'true' ? 'pro' : 'flash'
        })
      });

      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          // If not JSON, try text
          try {
            const textData = await response.text();
            if (textData) errorMsg = textData;
          } catch (e2) {}
        }
        throw new Error(errorMsg);
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let finalCitations = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                fullResponse += data.text;
                setStreamingText(fullResponse);
              }
              if (data.done) {
                finalCitations = data.citations || [];
                // Save assistant message
                const { data: savedMsg } = await supabase.from('messages').insert({
                  conversation_id: convId,
                  role: 'assistant',
                  content: data.fullText,
                  citations: finalCitations,
                  model_used: localStorage.getItem('extra_mode') === 'true' ? 'pro' : 'flash'
                }).select().single();
                
                if (savedMsg) {
                  setMessages(prev => [...prev.filter(m => m.id !== 'temp-user'), { ...userMessage }, savedMsg]);
                }
                setStreamingText('');
              }
              if (data.error) {
                console.error(data.error);
                setMessages(prev => [...prev.filter(m => m.id !== 'temp-user'), { ...userMessage }, {
                  id: `error-${Date.now()}`,
                  role: 'assistant',
                  content: `Error: ${data.error}`
                }]);
                setStreamingText('');
              }
            } catch (e) {
              console.error('Failed to parse SSE chunk:', line, e);
            }
          }
        }
      }

      if (buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6));
          if (data.text) {
            fullResponse += data.text;
            setStreamingText(fullResponse);
          }
          if (data.done) {
            finalCitations = data.citations || [];
            const { data: savedMsg } = await supabase.from('messages').insert({
              conversation_id: convId,
              role: 'assistant',
              content: data.fullText,
              citations: finalCitations,
              model_used: localStorage.getItem('extra_mode') === 'true' ? 'pro' : 'flash'
            }).select().single();
            if (savedMsg) {
              setMessages(prev => [...prev.filter(m => m.id !== 'temp-user'), { ...userMessage }, savedMsg]);
            }
            setStreamingText('');
          }
          if (data.error) {
            setMessages(prev => [...prev.filter(m => m.id !== 'temp-user'), { ...userMessage }, {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: `Error: ${data.error}`
            }]);
            setStreamingText('');
          }
        } catch (e) {
          console.error('Failed to parse final SSE chunk:', buffer, e);
        }
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev.filter(m => m.id !== 'temp-user'), { ...userMessage }, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${error.message || 'An unexpected error occurred.'}`
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      
      <div className="flex-1 flex flex-col min-w-[480px] relative">
        {/* Top Bar */}
        <div className="h-14 border-b border-border-default flex items-center justify-between px-4 bg-bg-secondary/50 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <span className="font-sans font-bold text-lg text-text-primary">
              {currentKb ? currentKb.name : 'Cortex AI'}
            </span>
            <span className="text-base font-medium text-text-tertiary font-sans uppercase tracking-widest">RAG Agent</span>
          </div>
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors"
          >
            {rightPanelOpen ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {messages.length === 0 && !streamingText ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="mb-8"
              >
                <h1 className="text-6xl font-sans font-bold text-text-primary mb-2">◉ Cortex AI</h1>
                <p className="text-text-tertiary font-sans font-medium tracking-widest uppercase text-xl">RAG Agent</p>
              </motion.div>
              <h2 className="text-2xl font-sans font-bold text-text-secondary mb-2">
                {id ? 'Ready when you are.' : 'What would you like to explore today?'}
              </h2>
              <p className="text-text-tertiary text-sm mb-8">
                {id
                  ? 'Type a message below to start this conversation.'
                  : 'Pick a prompt or just start typing.'}
              </p>
              {!id && (
                <div className="flex gap-4">
                  {['Summarize a doc', 'Compare two files', 'Extract key points'].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => setInput(chip)}
                      className="px-4 py-2 rounded-full border border-border-default text-text-secondary hover:text-text-primary hover:border-accent-gold transition-colors text-sm"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 pb-24">
              {messages.map((msg, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id || i}
                  className={cn(
                    "flex gap-4",
                    msg.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center shrink-0 border border-border-default">
                      <span className="text-xs">◉</span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed",
                      msg.role === 'user'
                        ? "bg-accent-gold-dim text-text-primary border border-accent-gold/20"
                        : "text-text-primary"
                    )}
                  >
                    {msg.role === 'assistant'
                      ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{msg.content}</ReactMarkdown>
                      : msg.content}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border-default/50">
                        <div className="flex items-center gap-2 text-xs text-text-tertiary mb-2">
                          <Paperclip size={12} />
                          <span>{msg.citations.length} sources cited</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citations.map((c: any, idx: number) => (
                            <span key={idx} className="px-1.5 py-0.5 rounded bg-bg-tertiary border border-border-default text-[10px] font-mono text-text-secondary hover:text-text-primary cursor-pointer transition-colors">
                              [{idx + 1}] {c.web?.title || 'Source'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              
              {streamingText && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-4 justify-start"
                >
                  <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center shrink-0 border border-border-default">
                    <span className="text-xs">◉</span>
                  </div>
                  <div className="max-w-[80%] rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed text-text-primary">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{streamingText}</ReactMarkdown>
                    <motion.span
                      animate={{ opacity: [1, 0] }}
                      transition={{ duration: 0.53, repeat: Infinity }}
                      className="inline-block w-2 h-4 bg-accent-gold ml-1 align-middle"
                    />
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-bg-primary via-bg-primary to-transparent pt-12">
          <div className="max-w-3xl mx-auto relative">
            <div className="flex items-end gap-2 bg-bg-tertiary border border-border-default rounded-xl p-2 focus-within:border-accent-gold focus-within:ring-1 focus-within:ring-accent-gold/50 transition-all shadow-sm">
              <button className="p-2 text-text-tertiary hover:text-text-primary transition-colors rounded-lg hover:bg-bg-hover shrink-0">
                <Paperclip size={20} />
              </button>
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your documents..."
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[40px] py-2 text-text-primary placeholder:text-text-tertiary text-[15px] custom-scrollbar"
                rows={1}
                style={{ height: 'auto' }}
              />
              
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="p-2 bg-accent-gold text-bg-primary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0 self-end mb-0.5"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2 px-2">
              <span className="text-[10px] text-text-tertiary font-mono">Enter to send · Shift+Enter for newline</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <AnimatePresence>
        {rightPanelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="h-screen bg-bg-secondary border-l border-border-default shrink-0 overflow-hidden flex flex-col"
          >
            <div className="flex border-b border-border-default">
              <button className="flex-1 py-3 text-sm font-medium text-text-primary border-b-2 border-accent-gold">Sources</button>
              <button className="flex-1 py-3 text-sm font-medium text-text-tertiary hover:text-text-secondary transition-colors">Documents</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <div className="text-center text-text-tertiary text-sm mt-10">
                <FileText size={32} className="mx-auto mb-3 opacity-50" />
                <p>No sources cited yet.</p>
                <p className="text-xs mt-1">Ask a question to see references.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
