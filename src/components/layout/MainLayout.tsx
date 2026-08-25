import React, { useEffect } from 'react';
import { Titlebar } from './Titlebar';
import { Sidebar } from './Sidebar';
import { useTetherStore } from '../../store/useTetherStore';
import { LiveTelemetryHUD } from '../hud/LiveTelemetryHUD';
import { ModelRoutingMatrix } from '../matrix/ModelRoutingMatrix';
import { ToolMarketplace } from '../toolhub/ToolMarketplace';
import { ObservabilityTraces } from '../traces/ObservabilityTraces';
import { ActiveAgentTracker } from '../agents/ActiveAgentTracker';
import { ClientIntegrationHub } from '../quickstart/ClientIntegrationHub';
import { SettingsModal } from '../settings/SettingsModal';
import { QuickstartModal } from '../quickstart/QuickstartModal';
import { KeyManagerModal } from '../matrix/KeyManagerModal';
import { DiagnosticReportModal } from '../settings/DiagnosticReportModal';
import { TerminalDrawer } from '../terminal/TerminalDrawer';

export const MainLayout: React.FC = () => {
  const { activeTab, fetchGatewayHealth } = useTetherStore();

  useEffect(() => {
    fetchGatewayHealth();
    const interval = setInterval(fetchGatewayHealth, 3000);
    return () => clearInterval(interval);
  }, [fetchGatewayHealth]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'hud': return <LiveTelemetryHUD />;
      case 'matrix': return <ModelRoutingMatrix />;
      case 'tools': return <ToolMarketplace />;
      case 'traces': return <ObservabilityTraces />;
      case 'agents': return <ActiveAgentTracker />;
      case 'quickstart': return <ClientIntegrationHub />;
      case 'settings': return <SettingsModal />;
      default: return <LiveTelemetryHUD />;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none font-sans">
      {/* Top Titlebar */}
      <Titlebar />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Dynamic Center Viewport */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-950/40 relative">
          <div className="max-w-7xl mx-auto pb-24">
            {renderTabContent()}
          </div>
        </main>
      </div>

      {/* Global Embedded Drawer & Modals */}
      <TerminalDrawer />
      <QuickstartModal />
      <KeyManagerModal />
      <DiagnosticReportModal />
    </div>
  );
};
