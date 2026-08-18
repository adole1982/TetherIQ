import Fastify from 'fastify';

const fastify = Fastify({
  logger: false,
});

const PORT = 4000;
const HOST = '127.0.0.1';

// In-memory spend tracking & telemetry
let dailySpend = 1.38;
let dailyBudgetCap = 10.00;
let isCircuitBreakerTripped = false;

interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
}

interface AnthropicMessageRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  stream?: boolean;
}

// Enable CORS for frontend desktop client
fastify.addHook('onRequest', async (req, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  reply.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    reply.send();
  }
});

// 1. Health & Ping
fastify.get('/health', async () => {
  return {
    status: 'ok',
    version: '1.0.0',
    gateway: 'TetherIQ Local Control Plane',
    port: PORT,
    circuitBreakerTripped: isCircuitBreakerTripped,
    dailySpend,
    dailyBudgetCap
  };
});

// 2. OpenAI /v1/models
fastify.get('/v1/models', async () => {
  return {
    object: 'list',
    data: [
      { id: 'fast-code', object: 'model', created: 1700000000, owned_by: 'tetheriq-virtual' },
      { id: 'heavy-reasoning', object: 'model', created: 1700000000, owned_by: 'tetheriq-virtual' },
      { id: 'claude-3-7-sonnet-20250219', object: 'model', created: 1700000000, owned_by: 'anthropic' },
      { id: 'claude-3-5-sonnet-20241022', object: 'model', created: 1700000000, owned_by: 'anthropic' },
      { id: 'gpt-4o', object: 'model', created: 1700000000, owned_by: 'openai' },
      { id: 'o3-mini', object: 'model', created: 1700000000, owned_by: 'openai' },
      { id: 'llama-3.3-70b-versatile', object: 'model', created: 1700000000, owned_by: 'groq' },
      { id: 'qwen2.5-coder:14b', object: 'model', created: 1700000000, owned_by: 'ollama' }
    ]
  };
});

// 3. OpenAI /v1/chat/completions
fastify.post<{ Body: ChatCompletionRequest }>('/v1/chat/completions', async (req, reply) => {
  // Check Circuit Breaker
  if (isCircuitBreakerTripped || dailySpend >= dailyBudgetCap) {
    isCircuitBreakerTripped = true;
    reply.status(402).send({
      error: {
        message: `[TetherIQ Circuit Breaker] Daily budget limit ($${dailyBudgetCap.toFixed(2)}) exceeded. Request blocked to prevent runaway loop costs.`,
        type: 'budget_exceeded_error',
        code: 'payment_required'
      }
    });
    return;
  }

  const { model, messages, stream } = req.body;
  const targetModel = model || 'heavy-reasoning';
  
  // Calculate simulated cost
  const inputTokens = messages.reduce((acc, m) => acc + (m.content ? m.content.length / 4 : 0), 0);
  const outputTokens = 150;
  const cost = (inputTokens * 0.000003) + (outputTokens * 0.000015);
  dailySpend += cost;

  if (stream) {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const chunks = [
      '// TetherIQ Proxied Stream Response via ',
      targetModel,
      '\n\n',
      'export function processData(input: string[]) {\n  return input.map(item => item.trim());\n}'
    ];

    for (let i = 0; i < chunks.length; i++) {
      const payload = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: targetModel,
        choices: [
          {
            index: 0,
            delta: { content: chunks[i] },
            finish_reason: i === chunks.length - 1 ? 'stop' : null
          }
        ]
      };
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
    return;
  }

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: targetModel,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: `// [TetherIQ Gateway Served via ${targetModel}]\n\nfunction calculateMetrics() {\n  return { status: "active", latencyMs: 42 };\n}`
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: Math.round(inputTokens),
      completion_tokens: outputTokens,
      total_tokens: Math.round(inputTokens) + outputTokens
    }
  };
});

// 4. Anthropic /v1/messages (For Claude Code CLI and Anthropic clients)
fastify.post<{ Body: AnthropicMessageRequest }>('/v1/messages', async (req, reply) => {
  // Check Circuit Breaker
  if (isCircuitBreakerTripped || dailySpend >= dailyBudgetCap) {
    isCircuitBreakerTripped = true;
    reply.status(402).send({
      type: 'error',
      error: {
        type: 'budget_exceeded_error',
        message: `[TetherIQ Circuit Breaker] Daily budget limit ($${dailyBudgetCap.toFixed(2)}) exceeded. Request blocked.`
      }
    });
    return;
  }

  const { model, messages, stream } = req.body;
  const targetModel = model || 'claude-3-7-sonnet-20250219';

  const inputTokens = messages.reduce((acc, m) => acc + (m.content ? m.content.length / 4 : 0), 0);
  const outputTokens = 180;
  const cost = (inputTokens * 0.000003) + (outputTokens * 0.000015);
  dailySpend += cost;

  if (stream) {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const text = `/* Claude Code routed through TetherIQ Gateway [${targetModel}] */\n\nconsole.log("Connected to TetherIQ Local Control Plane");`;
    
    reply.raw.write(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model: targetModel, usage: { input_tokens: Math.round(inputTokens) } } })}\n\n`);
    reply.raw.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\n`);
    reply.raw.write(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: outputTokens } })}\n\n`);
    reply.raw.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
    reply.raw.end();
    return;
  }

  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: targetModel,
    content: [
      {
        type: 'text',
        text: `/* Claude Code routed through TetherIQ Gateway [${targetModel}] */\n\nconsole.log("Connected to TetherIQ Local Control Plane");`
      }
    ],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: Math.round(inputTokens),
      output_tokens: outputTokens
    }
  };
});

// Start Server
export async function startServer() {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`[TetherIQ] Local Gateway Proxy active on http://${HOST}:${PORT}`);
  } catch (err) {
    console.error('[TetherIQ] Error starting proxy gateway:', err);
  }
}

if (process.argv[1]?.includes('server.ts') || process.argv[1]?.includes('server.js')) {
  startServer();
}
