import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScope, parseTimestamp } from '../src/services/ops_executor_utils.ts';

test('parseTimestamp supports numbers and numeric strings', () => {
  assert.equal(parseTimestamp(123), 123);
  assert.equal(parseTimestamp('456'), 456);
  assert.equal(parseTimestamp('abc'), null);
});

test('normalizeScope uses requested scope when valid', () => {
  const normalized = normalizeScope('space', 'space-1', 'thread-1');
  assert.deepEqual(normalized, { scopeType: 'space', scopeId: 'space-1' });
});

test('normalizeScope falls back to thread then space then global', () => {
  const threadFallback = normalizeScope(undefined, 'space-1', 'thread-1');
  assert.deepEqual(threadFallback, { scopeType: 'thread', scopeId: 'thread-1' });

  const spaceFallback = normalizeScope(undefined, 'space-1', undefined);
  assert.deepEqual(spaceFallback, { scopeType: 'space', scopeId: 'space-1' });

  const globalFallback = normalizeScope(undefined, undefined, undefined);
  assert.deepEqual(globalFallback, { scopeType: 'global', scopeId: null });
});
