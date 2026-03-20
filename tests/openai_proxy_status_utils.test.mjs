import test from 'node:test';
import assert from 'node:assert/strict';
import {
  healthHttpErrorStatus,
  invalidHealthResponseStatus,
  mapHealthPayloadToStatus,
  missingProxyUrlStatus,
  unreachableProxyStatus
} from '../src/services/providers/openai_proxy_status_utils.ts';

const baseSeed = {
  provider: 'cloud',
  label: 'OpenAI (Cloud via Proxy)',
  checkedAt: 1234567890
};

test('missingProxyUrlStatus reports unconfigured cloud with actionable detail code', () => {
  const status = missingProxyUrlStatus(baseSeed);
  assert.equal(status.available, false);
  assert.equal(status.configured, false);
  assert.equal(status.detailCode, 'CLOUD_PROXY_URL_MISSING');
});

test('healthHttpErrorStatus reports proxy health HTTP errors with request trace', () => {
  const status = healthHttpErrorStatus(
    { ...baseSeed, requestId: 'health-req-1' },
    503
  );

  assert.equal(status.available, false);
  assert.equal(status.configured, true);
  assert.equal(status.detailCode, 'CLOUD_PROXY_HEALTH_HTTP_ERROR');
  assert.equal(status.requestId, 'health-req-1');
  assert.ok(status.reason.includes('503'));
});

test('invalidHealthResponseStatus keeps invalid JSON failures deterministic', () => {
  const status = invalidHealthResponseStatus(
    { ...baseSeed, requestId: 'health-req-2' },
    'Unexpected token < in JSON'
  );

  assert.equal(status.available, false);
  assert.equal(status.configured, true);
  assert.equal(status.detailCode, 'CLOUD_PROXY_INVALID_HEALTH_RESPONSE');
  assert.equal(status.requestId, 'health-req-2');
  assert.ok(status.reason.includes('invalid JSON'));
});

test('mapHealthPayloadToStatus handles healthy and unconfigured payloads', () => {
  const healthy = mapHealthPayloadToStatus(
    { ...baseSeed, requestId: 'health-ok' },
    { ok: true, configured: true, code: 'OK' }
  );
  assert.equal(healthy.available, true);
  assert.equal(healthy.configured, true);
  assert.equal(healthy.detailCode, 'OK');
  assert.equal(healthy.requestId, 'health-ok');

  const unconfigured = mapHealthPayloadToStatus(
    { ...baseSeed, requestId: 'health-config-missing' },
    { ok: false, configured: false }
  );
  assert.equal(unconfigured.available, false);
  assert.equal(unconfigured.configured, false);
  assert.equal(unconfigured.detailCode, 'PROXY_NOT_CONFIGURED');
});

test('mapHealthPayloadToStatus maps unhealthy configured payload to fallback detail code', () => {
  const unhealthy = mapHealthPayloadToStatus(
    { ...baseSeed, requestId: 'health-bad' },
    { ok: false, configured: true }
  );
  assert.equal(unhealthy.available, false);
  assert.equal(unhealthy.configured, true);
  assert.equal(unhealthy.detailCode, 'CLOUD_PROXY_HEALTH_UNHEALTHY');
  assert.equal(unhealthy.reason, 'Cloud proxy health check did not pass.');
  assert.equal(unhealthy.requestId, 'health-bad');
});

test('mapHealthPayloadToStatus preserves explicit proxy code and reason', () => {
  const unhealthy = mapHealthPayloadToStatus(
    { ...baseSeed, requestId: 'health-custom' },
    {
      ok: false,
      configured: true,
      code: 'OPENAI_UPSTREAM_DEGRADED',
      reason: 'OpenAI upstream is degraded'
    }
  );
  assert.equal(unhealthy.detailCode, 'OPENAI_UPSTREAM_DEGRADED');
  assert.equal(unhealthy.reason, 'OpenAI upstream is degraded');
});

test('mapHealthPayloadToStatus trims whitespace in explicit reason/code fields', () => {
  const status = mapHealthPayloadToStatus(
    { ...baseSeed, requestId: 'health-trimmed' },
    {
      ok: false,
      configured: true,
      code: '  OPENAI_UPSTREAM_DEGRADED  ',
      reason: '  OpenAI upstream is degraded  '
    }
  );
  assert.equal(status.detailCode, 'OPENAI_UPSTREAM_DEGRADED');
  assert.equal(status.reason, 'OpenAI upstream is degraded');
});

test('unreachableProxyStatus normalizes network errors and keeps stable detail code', () => {
  const status = unreachableProxyStatus(
    { ...baseSeed, requestId: 'health-req-timeout' },
    '  connect ECONNREFUSED  '
  );
  assert.equal(status.available, false);
  assert.equal(status.configured, true);
  assert.equal(status.detailCode, 'CLOUD_PROXY_UNREACHABLE');
  assert.equal(status.reason, 'connect ECONNREFUSED');
  assert.equal(status.requestId, 'health-req-timeout');
});
