import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatProviderStatusReason,
  toUserFacingProviderMessage
} from '../src/services/provider_status_copy_utils.ts';

test('formatProviderStatusReason maps known cloud detail codes to actionable copy', () => {
  const message = formatProviderStatusReason({
    provider: 'cloud',
    label: 'Cloud',
    available: false,
    configured: false,
    detailCode: 'CLOUD_PROXY_URL_MISSING',
    requestId: 'trace-1'
  });

  assert.ok(message.startsWith('[CLOUD_PROXY_URL_MISSING] Cloud proxy URL is missing.'));
  assert.ok(message.endsWith('(trace trace-1)'));
});

test('formatProviderStatusReason can hide diagnostics for user-facing banners', () => {
  const message = formatProviderStatusReason(
    {
      provider: 'local',
      label: 'Local',
      available: false,
      configured: true,
      detailCode: 'LOCAL_MODEL_FILE_MISSING',
      requestId: 'trace-2'
    },
    { includeDiagnostics: false }
  );

  assert.equal(
    message,
    'Active local model file is missing. Reinstall or switch models in Settings.'
  );
});

test('formatProviderStatusReason falls back to explicit reason when code is unknown', () => {
  const message = formatProviderStatusReason({
    provider: 'cloud',
    label: 'Cloud',
    available: false,
    configured: true,
    detailCode: 'OPENAI_UPSTREAM_DEGRADED',
    reason: 'OpenAI upstream is degraded'
  });

  assert.equal(message, '[OPENAI_UPSTREAM_DEGRADED] OpenAI upstream is degraded');
});

test('toUserFacingProviderMessage strips diagnostics and keeps actionable cloud copy', () => {
  const message = toUserFacingProviderMessage(
    '[PROXY_NOT_CONFIGURED] OPENAI_API_KEY is not configured (trace cloud-req-3)'
  );
  assert.equal(
    message,
    'Cloud proxy is reachable but not configured. Add OPENAI_API_KEY on the proxy.'
  );
});

test('toUserFacingProviderMessage maps timeout noise to stable copy', () => {
  const message = toUserFacingProviderMessage(
    'Cloud request failed: timed out after 20000ms (request turn-7)'
  );
  assert.equal(
    message,
    'Cloud request timed out. Check network/proxy latency and try again.'
  );
});

test('toUserFacingProviderMessage keeps fallback for unknown non-empty errors', () => {
  const message = toUserFacingProviderMessage('Something else failed (trace abc)');
  assert.equal(message, 'Something else failed');
});

test('toUserFacingProviderMessage uses deterministic fallback for empty/non-string errors', () => {
  assert.equal(
    toUserFacingProviderMessage('   '),
    'AI is unavailable. Check provider and model setup in Settings.'
  );
  assert.equal(
    toUserFacingProviderMessage({}),
    'AI is unavailable. Check provider and model setup in Settings.'
  );
});

test('formatProviderStatusReason returns empty string for healthy status with no explicit reason', () => {
  const message = formatProviderStatusReason({
    provider: 'local',
    label: 'Local',
    available: true,
    configured: true
  });
  assert.equal(message, '');
});

test('formatProviderStatusReason uses deterministic fallback copy when status is missing', () => {
  const message = formatProviderStatusReason(undefined, {
    unknownFallback: 'Status unavailable. Retry.'
  });
  assert.equal(message, 'Status unavailable. Retry.');
});

test('formatProviderStatusReason uses stable unavailable fallback when detail code and reason are absent', () => {
  const message = formatProviderStatusReason({
    provider: 'cloud',
    label: 'Cloud',
    available: false,
    configured: true
  });
  assert.equal(message, 'Provider is currently unavailable.');
});
