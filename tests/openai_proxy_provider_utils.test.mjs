import test from 'node:test';
import assert from 'node:assert/strict';
import {
  trimErrorMessage,
  parseProxyErrorPayload,
  toProxyErrorMessage
} from '../src/services/providers/openai_proxy_error_utils.ts';

test('parseProxyErrorPayload supports nested and flat JSON error shapes', () => {
  const nested = parseProxyErrorPayload('{"error":{"code":"UPSTREAM","message":"Proxy failed"}}');
  assert.equal(nested?.code, 'UPSTREAM');
  assert.equal(nested?.message, 'Proxy failed');

  const flat = parseProxyErrorPayload('{"error":"Simple failure","requestId":"req-1"}');
  assert.equal(flat?.message, 'Simple failure');
  assert.equal(flat?.requestId, 'req-1');
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

test('trimErrorMessage clamps long whitespace-heavy errors', () => {
  const long = trimErrorMessage(`  ${'x '.repeat(300)} `, 20);
  assert.ok(long.length <= 20);
  assert.ok(long.endsWith('…'));
});
