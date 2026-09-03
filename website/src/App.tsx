import React, { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { DownloadModal } from './components/modals/DownloadModal';
import { HomePage } from './pages/HomePage';
import { SecurityPage } from './pages/SecurityPage';
import { McpPage } from './pages/McpPage';
import { DocsPage } from './pages/DocsPage';
import { ChangelogPage } from './pages/ChangelogPage';
import { Analytics } from '@vercel/analytics/react';

export function App() {
  const [currentRoute, setCurrentRoute] = useState<string>('/');
  const [isDownloadOpen, setIsDownloadOpen] = useState<boolean>(false);

  useEffect(() => {
    // Initial sync with browser path
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (['/', '/security', '/mcp', '/docs', '/changelog'].includes(path)) {
        setCurrentRoute(path);
      }

      const handlePopState = () => {
        setCurrentRoute(window.location.pathname || '/');
      };

      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, []);

  const navigate = (route: string) => {
    setCurrentRoute(route);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', route);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-slate-900 font-sans selection:bg-cyan-500 selection:text-white">
      {/* Sticky Top Navbar */}
      <Navbar 
        currentRoute={currentRoute} 
        navigate={navigate} 
        onOpenDownload={() => setIsDownloadOpen(true)} 
      />

      {/* Main Routed Page Content */}
      <main className="flex-grow">
        {currentRoute === '/' && (
          <HomePage navigate={navigate} onOpenDownload={() => setIsDownloadOpen(true)} />
        )}
        {currentRoute === '/security' && (
          <SecurityPage navigate={navigate} onOpenDownload={() => setIsDownloadOpen(true)} />
        )}
        {currentRoute === '/mcp' && (
          <McpPage navigate={navigate} onOpenDownload={() => setIsDownloadOpen(true)} />
        )}
        {currentRoute === '/docs' && (
          <DocsPage navigate={navigate} onOpenDownload={() => setIsDownloadOpen(true)} />
        )}
        {currentRoute === '/changelog' && (
          <ChangelogPage navigate={navigate} onOpenDownload={() => setIsDownloadOpen(true)} />
        )}
      </main>

      {/* Global Footer */}
      <Footer navigate={navigate} onOpenDownload={() => setIsDownloadOpen(true)} />

      {/* Universal Download Modal */}
      <DownloadModal 
        isOpen={isDownloadOpen} 
        onClose={() => setIsDownloadOpen(false)} 
      />

      {/* Vercel Web Analytics */}
      <Analytics />
    </div>
  );
}

export default App;
