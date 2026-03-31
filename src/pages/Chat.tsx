import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import Sidebar from '../components/Sidebar';
import { Paperclip, Send, PanelRightClose, PanelRightOpen, FileText, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { cn } from '../components/Sidebar';

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
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('flash');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
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
    fetchModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const fetchModels = async () => {
    const { data } = await supabase.from('models').select('*').eq('is_enabled', true).order('sort_order');
    if (data) {
      // Filter out 'lite' model as requested
      const filteredModels = data.filter(m => !m.api_model_id.includes('lite'));
      setModels(filteredModels);
    }
  };

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
    if (!convId) {
      const { data } = await supabase
        .from('conversations')
        .insert({ user_id: user?.id, title: input.substring(0, 50) })
        .select()
        .single();
      if (data) {
        convId = data.id;
        navigate(`/chat/${convId}`, { replace: true });
      }
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
          model_id: selectedModel
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
                  model_used: selectedModel
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
              model_used: selectedModel
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
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
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
            
            {/* Model Selector Dropdown */}
            <div className="relative ml-2">
              <button 
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded-md hover:bg-bg-hover"
              >
                <div className="w-2 h-2 rounded-full bg-accent-gold"></div>
                {models.find(m => m.id === selectedModel)?.display_name || 'Select Model'}
                <ChevronDown size={14} className="ml-0.5 opacity-70" />
              </button>
              
              <AnimatePresence>
                {modelDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 mt-1 w-48 bg-bg-secondary border border-border-default rounded-lg shadow-lg overflow-hidden z-50 py-1"
                  >
                    {models.map(m => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedModel(m.id);
                          setModelDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2.5",
                          selectedModel === m.id 
                            ? "bg-bg-hover text-text-primary" 
                            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                        )}
                      >
                        <div className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          selectedModel === m.id ? "bg-accent-gold" : "bg-transparent border border-text-tertiary"
                        )}></div>
                        <span className="truncate">{m.display_name}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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
          {!id && messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="mb-8"
              >
                <h1 className="text-6xl font-sans font-bold text-text-primary mb-2">◉ Cortex AI</h1>
                <p className="text-text-tertiary font-sans font-medium tracking-widest uppercase text-xl">RAG Agent</p>
              </motion.div>
              <h2 className="text-2xl font-sans font-bold text-text-secondary mb-8">What would you like to explore today?</h2>
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
                        : "text-text-primary markdown-body"
                    )}
                  >
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    )}
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
                  <div className="max-w-[80%] rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed text-text-primary markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
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
              <span className="text-[10px] text-text-tertiary font-mono">Cmd+Enter to send</span>
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
