import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import Sidebar from '../components/Sidebar';
import { Moon, Sun, Monitor, LogOut } from 'lucide-react';

export default function Settings() {
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [extraMode, setExtraMode] = useState(localStorage.getItem('extra_mode') === 'true');

  const toggleExtraMode = () => {
    const next = !extraMode;
    setExtraMode(next);
    localStorage.setItem('extra_mode', String(next));
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (newTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-3xl mx-auto w-full">
          <h1 className="text-4xl font-sans font-bold text-text-primary mb-2">Settings</h1>
          <p className="text-text-secondary font-sans text-sm mb-8">Manage your account and application preferences.</p>

          <div className="space-y-8">
            {/* Appearance */}
            <section className="bg-bg-secondary border border-border-default rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">Appearance</h3>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleThemeChange('light')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${theme === 'light' ? 'border-accent-gold text-accent-gold bg-accent-gold-dim' : 'border-border-default text-text-secondary hover:bg-bg-hover'} transition-colors`}
                >
                  <Sun size={18} />
                  Light
                </button>
                <button
                  onClick={() => handleThemeChange('dark')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${theme === 'dark' ? 'border-accent-gold text-accent-gold bg-accent-gold-dim' : 'border-border-default text-text-secondary hover:bg-bg-hover'} transition-colors`}
                >
                  <Moon size={18} />
                  Dark
                </button>
                <button
                  onClick={() => handleThemeChange('system')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${theme === 'system' ? 'border-accent-gold text-accent-gold bg-accent-gold-dim' : 'border-border-default text-text-secondary hover:bg-bg-hover'} transition-colors`}
                >
                  <Monitor size={18} />
                  System
                </button>
              </div>
            </section>

            {/* Mode */}
            <section className="bg-bg-secondary border border-border-default rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">Mode</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-text-primary font-medium">Extra Mode</p>
                  <p className="text-sm text-text-secondary">Enable for more capable responses on complex questions.</p>
                </div>
                <button
                  role="switch"
                  aria-checked={extraMode}
                  onClick={toggleExtraMode}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-accent-gold focus:ring-offset-2 focus:ring-offset-bg-secondary ${extraMode ? 'bg-accent-gold' : 'bg-bg-tertiary'}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${extraMode ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            </section>

            {/* Account */}
            <section className="bg-bg-secondary border border-border-default rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">Account</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-text-primary font-medium">{user?.email}</p>
                  <p className="text-sm text-text-secondary">Signed in via {user?.app_metadata?.provider || 'email'}</p>
                </div>
                <button
                  onClick={signOut}
                  className="flex items-center gap-2 px-4 py-2 border border-status-failed text-status-failed hover:bg-status-failed/10 rounded-lg transition-colors"
                >
                  <LogOut size={18} />
                  Sign Out
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
