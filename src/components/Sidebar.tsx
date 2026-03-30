import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import {
  MessageSquare,
  Search,
  Plus,
  Folder,
  Settings,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Trash2,
  Edit2
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
}

export default function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [conversations, setConversations] = useState<any[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchData();
    
    const convSub = supabase
      .channel('conversations_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, fetchData)
      .subscribe();

    const kbSub = supabase
      .channel('kb_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'knowledge_bases' }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(convSub);
      supabase.removeChannel(kbSub);
    };
  }, [user]);

  const fetchData = async () => {
    const [convs, kbs] = await Promise.all([
      supabase.from('conversations').select(`*, knowledge_bases(name)`).order('updated_at', { ascending: false }),
      supabase.from('knowledge_bases').select('*').order('name', { ascending: true })
    ]);
    
    if (convs.data) setConversations(convs.data);
    if (kbs.data) setKnowledgeBases(kbs.data);
  };

  const handleNewChat = async () => {
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user?.id, title: 'New Chat' })
      .select()
      .single();
    
    if (data) navigate(`/chat/${data.id}`);
  };

  const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    await supabase.from('conversations').delete().eq('id', id);
    
    if (location.pathname === `/chat/${id}`) {
      navigate('/');
    }
    setActiveDropdown(null);
  };

  const filteredConvs = conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <motion.div
      initial={false}
      animate={{ width: collapsed ? 60 : 260 }}
      className="h-screen flex flex-col bg-bg-secondary border-r border-border-default overflow-hidden shrink-0 transition-all duration-300"
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between shrink-0">
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col"
            >
              <h1 className="font-sans font-bold text-xl text-text-primary tracking-tight">◉ Cortex AI</h1>
              <span className="text-base font-medium uppercase tracking-widest text-text-tertiary font-sans">RAG Agent</span>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* New Chat Button */}
      <div className="px-3 mb-4 shrink-0">
        <button
          onClick={handleNewChat}
          className={cn(
            "flex items-center justify-center gap-2 bg-accent-gold text-bg-primary font-medium rounded-lg hover:opacity-90 transition-all w-full",
            collapsed ? "p-2 aspect-square" : "py-2.5 px-4"
          )}
        >
          <Plus size={18} />
          {!collapsed && <span>New Chat</span>}
        </button>
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-3 mb-4 shrink-0 relative">
          <Search size={14} className="absolute left-6 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-bg-tertiary text-text-primary text-sm rounded-md pl-9 pr-3 py-1.5 border border-transparent focus:border-border-default focus:outline-none transition-colors placeholder:text-text-tertiary"
          />
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {/* Conversations */}
        <div className="px-2 mb-6">
          {!collapsed && <h3 className="px-2 text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Conversations</h3>}
          <div className="space-y-0.5">
            {filteredConvs.map((conv) => {
              const isActive = location.pathname === `/chat/${conv.id}`;
              return (
                <Link
                  key={conv.id}
                  to={`/chat/${conv.id}`}
                  className={cn(
                    "flex items-center gap-3 px-2 py-2 rounded-md transition-colors group relative",
                    isActive ? "bg-bg-active text-text-primary" : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
                    collapsed && "justify-center"
                  )}
                >
                  {isActive && !collapsed && <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-accent-gold rounded-r-full" />}
                  <MessageSquare size={16} className="shrink-0" />
                  {!collapsed && (
                    <>
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="text-sm truncate">{conv.title}</div>
                        {conv.knowledge_bases && (
                          <div className="text-[10px] text-text-tertiary truncate">{conv.knowledge_bases.name}</div>
                        )}
                      </div>
                      
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveDropdown(activeDropdown === conv.id ? null : conv.id);
                          }}
                          className="p-1 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded-md"
                        >
                          <MoreVertical size={14} />
                        </button>
                        
                        {activeDropdown === conv.id && (
                          <div className="absolute right-0 top-full mt-1 w-32 bg-bg-secondary border border-border-default rounded-md shadow-lg z-50 py-1">
                            <button
                              onClick={(e) => handleDeleteChat(e, conv.id)}
                              className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-bg-tertiary hover:text-red-300 flex items-center gap-2"
                            >
                              <Trash2 size={14} />
                              Delete Chat
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Knowledge Bases */}
        <div className="px-2 pb-4">
          {!collapsed && <h3 className="px-2 text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Knowledge Bases</h3>}
          <div className="space-y-0.5">
            {knowledgeBases.map((kb) => (
              <Link
                key={kb.id}
                to={`/knowledge-bases/${kb.id}`}
                className={cn(
                  "flex items-center gap-3 px-2 py-2 rounded-md transition-colors text-text-secondary hover:bg-bg-hover hover:text-text-primary",
                  collapsed && "justify-center"
                )}
              >
                <Folder size={16} className="shrink-0" />
                {!collapsed && <div className="text-sm truncate flex-1">{kb.name}</div>}
              </Link>
            ))}
            {!collapsed && (
              <Link
                to="/knowledge-bases"
                className="flex items-center gap-2 px-2 py-2 mt-2 text-sm text-text-tertiary hover:text-text-primary border border-dashed border-border-default rounded-md hover:border-text-secondary transition-colors justify-center"
              >
                <Plus size={14} />
                <span>New KB</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border-default shrink-0">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-accent-gold-dim flex items-center justify-center text-accent-gold font-medium shrink-0">
                {user?.email?.[0].toUpperCase()}
              </div>
              <div className="text-sm text-text-primary truncate">{user?.email}</div>
            </div>
          )}
          <Link
            to="/settings"
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors shrink-0"
          >
            <Settings size={18} />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
