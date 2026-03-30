import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // The trigger or backend should create a default KB.
        // For now, we'll just show success.
        alert('Check your email for the login link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/chat`,
          skipBrowserRedirect: true, // Required for iframe environments
        },
      });
      if (error) throw error;
      
      if (data?.url) {
        // Open the Google OAuth URL directly in a popup
        window.open(data.url, 'oauth_popup', 'width=600,height=700');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary relative overflow-hidden">
      {/* Animated gradient mesh background */}
      <div className="absolute inset-0 z-0 opacity-30">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-accent-gold-glow blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent-gold-dim blur-[100px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="z-10 w-full max-w-md p-8 glass-panel rounded-2xl"
      >
        <div className="text-center mb-8">
          <h1 className="text-5xl font-sans font-bold text-text-primary tracking-tight mb-2">◉ Cortex AI</h1>
          <p className="text-text-secondary font-sans text-xl font-medium tracking-wider uppercase">RAG Agent</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-status-failed/10 border border-status-failed/20 text-status-failed rounded-md text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-border-default rounded-lg text-text-primary hover:bg-bg-hover transition-colors mb-6"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>

        <div className="relative flex items-center py-2 mb-6">
          <div className="flex-grow border-t border-border-default"></div>
          <span className="flex-shrink-0 mx-4 text-text-tertiary text-sm">or</span>
          <div className="flex-grow border-t border-border-default"></div>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-bg-tertiary border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-accent-gold focus:ring-1 focus:ring-accent-gold transition-all"
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-bg-tertiary border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-accent-gold focus:ring-1 focus:ring-accent-gold transition-all"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-accent-gold text-bg-primary font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-text-secondary hover:text-text-primary text-sm transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
