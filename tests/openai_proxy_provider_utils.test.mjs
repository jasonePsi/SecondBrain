import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isNonRetryableProxyErrorCode,
  trimErrorMessage,
  parseProxyErrorPayload,
  toProxyErrorMessage
} from '../src/services/providers/openai_proxy_error_utils.ts';
import { OpenAIProxyProvider } from '../src/services/providers/OpenAIProxyProvider.ts';

test('parseProxyErrorPayload supports nested and flat JSON error shapes', () => {
  const nested = parseProxyErrorPayload('{"error":{"code":"UPSTREAM","message":"Proxy failed"}}');
  assert.equal(nested?.code, 'UPSTREAM');
  assert.equal(nested?.message, 'Proxy failed');

  const flat = parseProxyErrorPayload('{"error":"Simple failure","requestId":"req-1"}');
  assert.equal(flat?.message, 'Simple failure');
  assert.equal(flat?.requestId, 'req-1');
});

test('parseProxyErrorPayload returns null for payloads without message fields', () => {
  assert.equal(parseProxyErrorPayload('{"ok":false}'), null);
  assert.equal(parseProxyErrorPayload('   '), null);
});

test('toProxyErrorMessage builds trimmed and traceable message', () => {
  const message = toProxyErrorMessage(
    502,
    '{"error":{"code":"UPSTREAM_CHAT_FAILED","message":"Cloud upstream timed out"},"requestId":"abc123"}'
  );
  assert.ok(message.includes('[UPSTREAM_CHAT_FAILED]'));
  assert.ok(message.includes('Cloud upstream timed out'));
  assert.ok(message.includes('request abc123'));
});

test('toProxyErrorMessage uses fallback request id when response body omits one', () => {
  const message = toProxyErrorMessage(
    503,
    '{"error":{"code":"UPSTREAM_CHAT_FAILED","message":"Try again later"}}',
    'fallback-req-99'
  );
  assert.ok(message.includes('[UPSTREAM_CHAT_FAILED]'));
  assert.ok(message.includes('request fallback-req-99'));
});

test('toProxyErrorMessage falls back to generic status message for empty payload bodies', () => {
  const message = toProxyErrorMessage(504, '   ', 'req-fallback-504');
  assert.ok(message.includes('Cloud request failed (504)'));
  assert.ok(message.includes('request req-fallback-504'));
});

test('trimErrorMessage clamps long whitespace-heavy errors', () => {
  const long = trimErrorMessage(`  ${'x '.repeat(300)} `, 20);
  assert.ok(long.length <= 20);
  assert.ok(long.endsWith('…'));
});

test('isNonRetryableProxyErrorCode flags stable request/config problems', () => {
  assert.equal(isNonRetryableProxyErrorCode('PROXY_NOT_CONFIGURED'), true);
  assert.equal(isNonRetryableProxyErrorCode('INVALID_REQUEST'), true);
  assert.equal(isNonRetryableProxyErrorCode('CLOUD_PROXY_URL_MISSING'), true);
  assert.equal(isNonRetryableProxyErrorCode('UPSTREAM_CHAT_FAILED'), false);
  assert.equal(isNonRetryableProxyErrorCode(undefined), false);
});

test('OpenAIProxyProvider.init surfaces detail code and trace for unavailable cloud status', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getStatus = async () => ({
    provider: 'cloud',
    label: provider.label,
    available: false,
    configured: false,
    reason: 'OPENAI_API_KEY is not configured',
    detailCode: 'PROXY_NOT_CONFIGURED',
    requestId: 'trace-abc'
  });

  await assert.rejects(
    () => provider.init(),
    /\[PROXY_NOT_CONFIGURED\] OPENAI_API_KEY is not configured \(trace trace-abc\)/
  );
});

test('OpenAIProxyProvider.init falls back to stable generic message when reason is missing', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getStatus = async () => ({
    provider: 'cloud',
    label: provider.label,
    available: false,
    configured: true
  });

  await assert.rejects(
    () => provider.init(),
    /Cloud provider is unavailable/
  );
});
