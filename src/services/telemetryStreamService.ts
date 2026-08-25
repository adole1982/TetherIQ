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
  private eventSource: EventSource | null = null;
  private pollInterval: any = null;
  private baseUrl = 'http://127.0.0.1:4000';
  private listeners: Set<TelemetryUpdateHandler> = new Set();
  private isConnected = false;

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
      const res = await fetch(`${this.baseUrl}/tether/telemetry`);
      if (!res.ok) return null;
      return (await res.json()) as TelemetrySnapshot;
    } catch {
      return null;
    }
  }

  private startStream() {
    if (typeof window === 'undefined') return;

    try {
      // Connect to SSE stream on port 4000
      this.eventSource = new EventSource(`${this.baseUrl}/tether/events`);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.stopPolling();
      };

      this.eventSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'init' && payload.snapshot) {
            const snap = payload.snapshot as TelemetrySnapshot;
            this.notifyListeners({
              traces: snap.traces,
              agents: snap.agents,
              stats: snap.stats,
              history: snap.history,
            });
          } else if (payload.type === 'trace') {
            this.notifyListeners({
              newTrace: payload.trace,
              updatedAgent: payload.agent,
              stats: payload.stats,
              point: payload.point,
            });
          }
        } catch (err) {
          console.error('[TelemetryStream] Failed to parse SSE event:', err);
        }
      };

      this.eventSource.onerror = () => {
        this.isConnected = false;
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        // Fallback to polling if SSE is interrupted
        this.startPolling();
      };
    } catch {
      this.startPolling();
    }
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
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
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
