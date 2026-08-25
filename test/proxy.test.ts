import { fastify } from '../proxy-engine/src/server';

interface TestStats {
  passed: number;
  failed: number;
  total: number;
  errors: string[];
}

const stats: TestStats = { passed: 0, failed: 0, total: 0, errors: [] };

function assert(condition: boolean, testName: string, detail?: string) {
  stats.total++;
  if (condition) {
    stats.passed++;
    console.log(`  \x1b[32m✔\x1b[0m ${testName}`);
  } else {
    stats.failed++;
    const errMsg = `FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`;
    stats.errors.push(errMsg);
    console.error(`  \x1b[31m✖\x1b[0m ${testName}`);
    if (detail) console.error(`    \x1b[33m${detail}\x1b[0m`);
  }
}

async function runProxyTests() {
  console.log('\n============================================================');
  console.log('       TetherIQ Proxy Gateway & Protocol Test Suite         ');
  console.log('============================================================\n');

  // Ensure server is ready
  await fastify.ready();

  // Test 1: Health & Models
  console.log('\x1b[1m[Suite 1: Health & Models Endpoints]\x1b[0m');
  const healthRes = await fastify.inject({ method: 'GET', url: '/health' });
  assert(healthRes.statusCode === 200, 'GET /health returns 200 OK');
  const healthData = JSON.parse(healthRes.payload);
  assert(healthData.status === 'ok' && healthData.port === 4000, 'Health data contains valid gateway port & status');

  const modelsRes = await fastify.inject({ method: 'GET', url: '/v1/models' });
  assert(modelsRes.statusCode === 200, 'GET /v1/models returns 200 OK');
  const modelsData = JSON.parse(modelsRes.payload);
  assert(Array.isArray(modelsData.data) && modelsData.data.length >= 8, 'Exposes standard models list including virtual aliases');

  // Test 2: OpenAI Chat Completions (Non-Streaming)
  console.log('\n\x1b[1m[Suite 2: OpenAI /v1/chat/completions Protocol]\x1b[0m');
  const openaiRes = await fastify.inject({
    method: 'POST',
    url: '/v1/chat/completions',
    payload: {
      model: 'fast-code',
      messages: [{ role: 'user', content: 'Generate a TypeScript helper' }]
    }
  });
  assert(openaiRes.statusCode === 200, 'OpenAI completions returns 200 OK');
  const openaiData = JSON.parse(openaiRes.payload);
  assert(openaiData.choices?.[0]?.message?.role === 'assistant', 'OpenAI response contains assistant message');
  assert(typeof openaiData.usage?.total_tokens === 'number', 'OpenAI response includes token usage stats');

  // Test 3: Anthropic Messages (Non-Streaming)
  console.log('\n\x1b[1m[Suite 3: Anthropic /v1/messages Protocol]\x1b[0m');
  const anthropicRes = await fastify.inject({
    method: 'POST',
    url: '/v1/messages',
    payload: {
      model: 'claude-3-7-sonnet-20250219',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello Claude' }] }]
    }
  });
  assert(anthropicRes.statusCode === 200, 'Anthropic /v1/messages returns 200 OK');
  const anthropicData = JSON.parse(anthropicRes.payload);
  assert(anthropicData.type === 'message', 'Anthropic payload has type: "message"');
  assert(anthropicData.content?.[0]?.type === 'text', 'Anthropic payload has content text block');

  // Test 4: Anthropic SSE Stream Protocol Validation
  console.log('\n\x1b[1m[Suite 4: Anthropic SSE Stream Specification Conformance]\x1b[0m');
  const streamRes = await fastify.inject({
    method: 'POST',
    url: '/v1/messages',
    payload: {
      model: 'heavy-reasoning',
      messages: [{ role: 'user', content: 'Stream this response' }],
      stream: true
    }
  });
  assert(streamRes.statusCode === 200, 'Anthropic stream returns 200 OK');
  const streamBody = streamRes.payload;

  assert(streamBody.includes('event: message_start'), 'Emits event: message_start');
  assert(streamBody.includes('event: content_block_start'), 'Emits event: content_block_start (Claude Code requirement)');
  assert(streamBody.includes('event: content_block_delta'), 'Emits event: content_block_delta');
  assert(streamBody.includes('event: content_block_stop'), 'Emits event: content_block_stop');
  assert(streamBody.includes('event: message_delta'), 'Emits event: message_delta');
  assert(streamBody.includes('event: message_stop'), 'Emits event: message_stop');

  // Verify event order sequence
  const idxStart = streamBody.indexOf('event: message_start');
  const idxBlockStart = streamBody.indexOf('event: content_block_start');
  const idxBlockDelta = streamBody.indexOf('event: content_block_delta');
  const idxBlockStop = streamBody.indexOf('event: content_block_stop');
  const idxMsgDelta = streamBody.indexOf('event: message_delta');
  const idxMsgStop = streamBody.indexOf('event: message_stop');

  const ordered = (idxStart < idxBlockStart) &&
    (idxBlockStart < idxBlockDelta) &&
    (idxBlockDelta < idxBlockStop) &&
    (idxBlockStop < idxMsgDelta) &&
    (idxMsgDelta < idxMsgStop);
  assert(ordered, 'All Anthropic SSE stream events emitted in exact strict protocol sequence');

  // Test 5: Circuit Breaker 402 Enforcement & Reset
  console.log('\n\x1b[1m[Suite 5: Spend Circuit Breaker & 402 Guardrail]\x1b[0m');
  // Lower budget cap temporarily
  await fastify.inject({
    method: 'POST',
    url: '/v1/spend/budget',
    payload: { dailyBudgetCap: 0.000001 }
  });

  const blockedRes = await fastify.inject({
    method: 'POST',
    url: '/v1/chat/completions',
    payload: { model: 'gpt-4o', messages: [{ role: 'user', content: 'Should be blocked' }] }
  });
  assert(blockedRes.statusCode === 402, 'Returns HTTP 402 Payment Required when budget cap is exceeded');
  const blockedData = JSON.parse(blockedRes.payload);
  assert(blockedData.error?.code === 'payment_required', 'Structured 402 error payload matches spec');

  // Reset circuit breaker
  await fastify.inject({
    method: 'POST',
    url: '/v1/spend/budget',
    payload: { dailyBudgetCap: 50.0 }
  });
  const resetRes = await fastify.inject({ method: 'POST', url: '/v1/spend/reset' });
  assert(resetRes.statusCode === 200, 'Reset circuit breaker endpoint succeeds');

  const unblockedRes = await fastify.inject({
    method: 'POST',
    url: '/v1/chat/completions',
    payload: { model: 'fast-code', messages: [{ role: 'user', content: 'Unblocked now' }] }
  });
  assert(unblockedRes.statusCode === 200, 'Requests resume normally after circuit breaker reset');

  console.log('\n------------------------------------------------------------');
  console.log(`Results: \x1b[32m${stats.passed} Passed\x1b[0m | \x1b[31m${stats.failed} Failed\x1b[0m | Total: ${stats.total}`);
  console.log('------------------------------------------------------------\n');

  if (stats.failed > 0) {
    process.exit(1);
  } else {
    console.log('\x1b[32m✔ ALL PROXY GATEWAY PROTOCOL TESTS PASSED.\x1b[0m\n');
    process.exit(0);
  }
}

runProxyTests();
