import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import Sidebar from '../components/Sidebar';
import { Folder, Plus, MoreVertical, Search, FileText } from 'lucide-react';

export default function KnowledgeBases() {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchKBs();
  }, []);

  const fetchKBs = async () => {
    const { data } = await supabase
      .from('knowledge_bases')
      .select('*, documents(count)')
      .order('updated_at', { ascending: false });
    if (data) setKnowledgeBases(data);
  };

  const handleCreateKB = async () => {
    const name = prompt('Enter Knowledge Base name:');
    if (!name) return;

    const { data, error } = await supabase.from('knowledge_bases').insert({
      user_id: user?.id,
      name,
      description: 'A new knowledge base',
      system_prompt: 'You are a helpful assistant.',
      model_preference: 'flash'
    }).select().single();

    if (data) {
      setKnowledgeBases([data, ...knowledgeBases]);
    }
  };

  const filteredKBs = knowledgeBases.filter(kb => kb.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      
      <div className="flex-1 flex flex-col overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-6xl mx-auto w-full">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-sans font-bold text-text-primary mb-2">Knowledge Bases</h1>
              <p className="text-text-secondary font-sans text-sm">Manage your document collections and system prompts.</p>
            </div>
            <button
              onClick={handleCreateKB}
              className="flex items-center gap-2 bg-accent-gold text-bg-primary px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity shadow-sm"
            >
              <Plus size={18} />
              Create KB
            </button>
          </div>

          <div className="relative mb-8 max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search knowledge bases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-bg-secondary border border-border-default rounded-lg pl-10 pr-4 py-2 text-text-primary focus:outline-none focus:border-accent-gold focus:ring-1 focus:ring-accent-gold transition-all"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <button
              onClick={handleCreateKB}
              className="flex flex-col items-center justify-center h-48 rounded-xl border-2 border-dashed border-border-default hover:border-accent-gold hover:bg-bg-hover transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-bg-tertiary flex items-center justify-center mb-3 group-hover:bg-accent-gold-dim transition-colors">
                <Plus size={24} className="text-text-secondary group-hover:text-accent-gold transition-colors" />
              </div>
              <span className="text-text-primary font-medium">Create Knowledge Base</span>
            </button>

            {filteredKBs.map((kb, i) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                key={kb.id}
              >
                <Link
                  to={`/knowledge-bases/${kb.id}`}
                  className="flex flex-col h-48 p-5 rounded-xl bg-bg-secondary border border-border-default hover:border-accent-gold/50 hover:shadow-lg transition-all group relative"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-lg bg-bg-tertiary flex items-center justify-center group-hover:bg-accent-gold-dim transition-colors">
                      <Folder size={20} className="text-text-secondary group-hover:text-accent-gold transition-colors" />
                    </div>
                    <button className="p-1 text-text-tertiary hover:text-text-primary rounded-md hover:bg-bg-hover transition-colors" onClick={(e) => e.preventDefault()}>
                      <MoreVertical size={16} />
                    </button>
                  </div>
                  
                  <h3 className="text-lg font-medium text-text-primary mb-1 truncate">{kb.name}</h3>
                  <p className="text-sm text-text-secondary line-clamp-2 mb-auto">{kb.description || 'No description provided.'}</p>
                  
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border-default/50">
                    <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                      <FileText size={14} />
                      <span>{kb.documents?.[0]?.count || 0} docs</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
