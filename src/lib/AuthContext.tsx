import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // If we are in a popup window and authenticated, send session to parent and close
      if (session && window.opener) {
        window.opener.postMessage({ type: 'SUPABASE_SESSION', session }, '*');
        window.close();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // If we are in a popup window and authenticated, send session to parent and close
      if (session && window.opener) {
        window.opener.postMessage({ type: 'SUPABASE_SESSION', session }, '*');
        window.close();
      }
    });

    // Listen for session from popup (when running in iframe)
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'SUPABASE_SESSION' && event.data.session) {
        const { access_token, refresh_token } = event.data.session;
        if (access_token && refresh_token) {
          // Manually set the session in the iframe's local storage
          await supabase.auth.setSession({ access_token, refresh_token });
        }
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
