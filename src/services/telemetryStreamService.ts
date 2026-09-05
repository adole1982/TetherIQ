/**
 * TetherIQ Real-Time Telemetry Stream Service
 *
 * Connects to the local LiteLLM sidecar proxy on http://127.0.0.1:4000/tether/events
 * via Server-Sent Events (SSE), streaming live request traces, connected agent discoveries,
 * and rolling throughput stats directly into the Zustand store.
 */

import { ActivityTrace } from '../types/traces';
import { ConnectedAgent, TelemetryPoint } from '../types/telemetry';

export interface TelemetrySnapshot {
  traces: ActivityTrace[];
  agents: ConnectedAgent[];
  stats: {
    tokensPerSecond: number;
    currentLatencyMs: number;
    currentBurnRatePerHour: number;
    totalTokensToday: number;
    totalCostToday: number;
    totalRequestsToday: number;
  };
  history: TelemetryPoint[];
}

export type TelemetryUpdateHandler = (data: {
  traces?: ActivityTrace[];
  newTrace?: ActivityTrace;
  agents?: ConnectedAgent[];
  updatedAgent?: ConnectedAgent;
  stats?: TelemetrySnapshot['stats'];
  point?: TelemetryPoint;
  history?: TelemetryPoint[];
}) => void;

class TelemetryStreamService {
  private pollInterval: any = null;
  private baseUrl = '';
  private listeners: Set<TelemetryUpdateHandler> = new Set();
  private isConnected = false;
  private unlistenEvent: (() => void) | null = null;
  private abortController: AbortController | null = null;

  public subscribe(handler: TelemetryUpdateHandler): () => void {
    this.listeners.add(handler);
    if (this.listeners.size === 1) {
      this.startStream();
    }
    return () => {
      this.listeners.delete(handler);
      if (this.listeners.size === 0) {
        this.stopStream();
      }
    };
  }

  public setBaseUrl(url: string) {
    if (this.baseUrl !== url) {
      this.baseUrl = url;
      this.restart();
    }
  }

  public async fetchSnapshot(): Promise<TelemetrySnapshot | null> {
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/core');
        return (await invoke<TelemetrySnapshot>('get_telemetry_snapshot')) || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async startStream() {
    if (typeof window === 'undefined') return;

    this.stopStream();

    // 1. In Tauri Desktop mode: listen to native broadcast event with polling fallback
    if ((window as any).__TAURI__) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen<TelemetrySnapshot>('tether-telemetry-event', (event) => {
          if (event.payload) {
            this.notifyListeners({
              traces: event.payload.traces,
              agents: event.payload.agents,
              stats: event.payload.stats,
              history: event.payload.history,
            });
          }
        });
        this.unlistenEvent = unlisten;
      } catch (err) {
        console.warn('[TelemetryStream] Native event listener init notice:', err);
      }

      const snap = await this.fetchSnapshot();
      if (snap) {
        this.notifyListeners({
          traces: snap.traces,
          agents: snap.agents,
          stats: snap.stats,
          history: snap.history,
        });
      }

      // Set up periodic native polling fallback
      this.pollInterval = setInterval(async () => {
        const latest = await this.fetchSnapshot();
        if (latest) {
          this.notifyListeners({
            traces: latest.traces,
            agents: latest.agents,
            stats: latest.stats,
            history: latest.history,
          });
        }
      }, 3000);
      return;
    }

    // 2. Web fallback mode
    this.startPolling();
  }

  private startPolling() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(async () => {
      const snap = await this.fetchSnapshot();
      if (snap) {
        this.notifyListeners({
          traces: snap.traces,
          agents: snap.agents,
          stats: snap.stats,
          history: snap.history,
        });
      }
    }, 2000);
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private stopStream() {
    if (this.unlistenEvent) {
      this.unlistenEvent();
      this.unlistenEvent = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.stopPolling();
    this.isConnected = false;
  }

  private restart() {
    this.stopStream();
    if (this.listeners.size > 0) {
      this.startStream();
    }
  }

  private notifyListeners(data: Parameters<TelemetryUpdateHandler>[0]) {
    for (const handler of this.listeners) {
      try {
        handler(data);
      } catch (err) {
        console.error('[TelemetryStream] Error in listener handler:', err);
      }
    }
  }
}

export const telemetryStreamService = new TelemetryStreamService();
