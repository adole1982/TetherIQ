export type TraceType = 'llm-proxy' | 'mcp-tool' | 'fallback-event' | 'circuit-breaker';

export type TraceStatus = 'success' | 'rate-limited' | 'error' | 'fallback-rerouted' | 'blocked-budget';

export interface SpanRecord {
  id: string;
  parentId?: string;
  name: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  status: 'ok' | 'error';
  attributes: Record<string, any>;
}

export interface ActivityTrace {
  id: string;
  traceId: string;
  timestamp: number;
  type: TraceType;
  clientName: string;
  modelRequested: string;
  modelServed: string;
  providerServed: string;
  status: TraceStatus;
  statusCode: number;
  totalDurationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  fallbacksTriggered: Array<{
    fromModel: string;
    toModel: string;
    reason: string;
    durationMs: number;
  }>;
  spans: SpanRecord[];
  requestPayloadSummary?: {
    messagesCount: number;
    toolsCount?: number;
    temperature?: number;
    stream: boolean;
    samplePrompt?: string;
  };
  responsePayloadSummary?: {
    finishReason?: string;
    sampleResponse?: string;
    toolCallsMade?: string[];
  };
}
