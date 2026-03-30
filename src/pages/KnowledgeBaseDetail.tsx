import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import Sidebar from '../components/Sidebar';
import { ArrowLeft, UploadCloud, File, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function KnowledgeBaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [kb, setKb] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchData();

    const docSub = supabase
      .channel('docs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `knowledge_base_id=eq.${id}` }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(docSub);
    };
  }, [id]);

  const fetchData = async () => {
    const [kbRes, docsRes] = await Promise.all([
      supabase.from('knowledge_bases').select('*').eq('id', id).single(),
      supabase.from('documents').select('*').eq('knowledge_base_id', id).order('created_at', { ascending: false })
    ]);
    
    if (kbRes.data) setKb(kbRes.data);
    if (docsRes.data) setDocuments(docsRes.data);
    setLoading(false);
  };

  const handleUpdate = async (field: string, value: string) => {
    await supabase.from('knowledge_bases').update({ [field]: value }).eq('id', id);
    setKb({ ...kb, [field]: value });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      alert('File size exceeds 100MB limit.');
      return;
    }

    setUploading(true);

    try {
      // 1. Create document row
      const { data: doc, error: dbError } = await supabase.from('documents').insert({
        knowledge_base_id: id,
        user_id: user?.id,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || 'application/octet-stream',
        status: 'uploading'
      }).select().single();

      if (dbError) throw dbError;

      // 2. Upload to API
      const formData = new FormData();
      formData.append('file', file);
      formData.append('knowledge_base_id', id!);
      formData.append('document_id', doc.id);

      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: formData
      });

      if (!response.ok) {
        let errorMsg = 'Upload failed';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          try {
            const textData = await response.text();
            if (textData) errorMsg = textData;
          } catch (e2) {}
        }
        throw new Error(errorMsg);
      }

    } catch (error: any) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    await supabase.from('documents').delete().eq('id', docId);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) return <div className="flex h-screen bg-bg-primary items-center justify-center text-text-primary">Loading...</div>;
  if (!kb) return <div className="flex h-screen bg-bg-primary items-center justify-center text-text-primary">Knowledge Base not found.</div>;

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto w-full">
          <button
            onClick={() => navigate('/knowledge-bases')}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-6"
          >
            <ArrowLeft size={16} />
            Back to Knowledge Bases
          </button>

          <div className="flex items-start justify-between mb-8">
            <div className="flex-1 pr-8">
              <input
                type="text"
                value={kb.name}
                onChange={(e) => setKb({ ...kb, name: e.target.value })}
                onBlur={(e) => handleUpdate('name', e.target.value)}
                className="text-4xl font-sans font-bold text-text-primary bg-transparent border-none focus:ring-0 p-0 mb-2 w-full placeholder:text-text-tertiary"
                placeholder="Knowledge Base Name"
              />
              <input
                type="text"
                value={kb.description || ''}
                onChange={(e) => setKb({ ...kb, description: e.target.value })}
                onBlur={(e) => handleUpdate('description', e.target.value)}
                className="text-text-secondary font-sans text-sm bg-transparent border-none focus:ring-0 p-0 w-full placeholder:text-text-tertiary"
                placeholder="Add a description..."
              />
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <button
                onClick={async () => {
                  const { data } = await supabase.from('conversations').insert({
                    user_id: user?.id,
                    knowledge_base_id: kb.id,
                    title: `Chat with ${kb.name}`
                  }).select().single();
                  if (data) navigate(`/chat/${data.id}`);
                }}
                className="bg-accent-gold text-bg-primary px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity shadow-sm"
              >
                Start New Chat →
              </button>
              <div className="text-xs text-text-tertiary font-mono uppercase tracking-wider">
                {documents.length} docs • {formatBytes(documents.reduce((acc, doc) => acc + (doc.file_size || 0), 0))}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            {/* System Prompt */}
            <section className="bg-bg-secondary border border-border-default rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">System Prompt</h3>
              <textarea
                value={kb.system_prompt || ''}
                onChange={(e) => setKb({ ...kb, system_prompt: e.target.value })}
                onBlur={(e) => handleUpdate('system_prompt', e.target.value)}
                className="w-full h-32 bg-bg-tertiary border border-border-default rounded-lg p-4 text-text-primary text-sm focus:outline-none focus:border-accent-gold focus:ring-1 focus:ring-accent-gold transition-all resize-none custom-scrollbar"
                placeholder="You are a helpful assistant..."
              />
            </section>

            {/* Documents */}
            <section className="bg-bg-secondary border border-border-default rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Documents</h3>
                <label className="cursor-pointer flex items-center gap-2 bg-bg-tertiary hover:bg-bg-hover text-text-primary px-3 py-1.5 rounded-md text-sm border border-border-default transition-colors">
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                  <span>{uploading ? 'Uploading...' : 'Upload File'}</span>
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} accept=".pdf,.docx,.txt,.csv,.json,.xlsx,.html,.md" />
                </label>
              </div>

              {/* Upload Zone */}
              <label className="block w-full border-2 border-dashed border-border-default hover:border-accent-gold rounded-xl p-8 text-center cursor-pointer transition-colors mb-6 group bg-bg-primary/50">
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} accept=".pdf,.docx,.txt,.csv,.json,.xlsx,.html,.md" />
                <UploadCloud size={32} className="mx-auto mb-3 text-text-tertiary group-hover:text-accent-gold transition-colors" />
                <p className="text-text-primary font-medium mb-1">Drag & drop files or click to browse</p>
                <p className="text-xs text-text-tertiary">PDF, DOCX, TXT, CSV, JSON — Max 100MB</p>
              </label>

              {/* Document List */}
              <div className="border border-border-default rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-bg-tertiary text-text-secondary text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Size</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default">
                    {documents.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-text-tertiary">
                          No documents uploaded yet.
                        </td>
                      </tr>
                    ) : (
                      documents.map((doc) => (
                        <tr key={doc.id} className="hover:bg-bg-hover transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <File size={16} className="text-text-tertiary shrink-0" />
                              <span className="text-text-primary truncate max-w-[200px] sm:max-w-[300px]">{doc.file_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-text-secondary font-mono text-xs">
                            {formatBytes(doc.file_size)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {doc.status === 'ready' && <CheckCircle2 size={14} className="text-status-ready" />}
                              {doc.status === 'indexing' && <Loader2 size={14} className="text-status-indexing animate-spin" />}
                              {doc.status === 'uploading' && <UploadCloud size={14} className="text-status-uploading animate-bounce" />}
                              {doc.status === 'failed' && <AlertCircle size={14} className="text-status-failed" />}
                              <span className="text-xs capitalize text-text-secondary">{doc.status}</span>
                            </div>
                            {doc.error_message && (
                              <div className="text-[10px] text-status-failed mt-1 truncate max-w-[150px]" title={doc.error_message}>
                                {doc.error_message}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeleteDoc(doc.id)}
                              className="p-1.5 text-text-tertiary hover:text-status-failed hover:bg-status-failed/10 rounded-md transition-colors"
                              title="Delete document"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
