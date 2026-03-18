import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeNullableString,
  safeJsonParse,
  stableJsonStringify
} from '../src/repositories/json_utils.ts';

test('stableJsonStringify normalizes key order', () => {
  const value = { b: 1, a: 2 };
  assert.equal(stableJsonStringify(value), '{"a":2,"b":1}');
});

test('safeJsonParse returns fallback for invalid JSON', () => {
  const fallback = { ok: false };
  const parsed = safeJsonParse('{invalid', fallback);
  assert.deepEqual(parsed, fallback);
});

test('normalizeNullableString trims and normalizes empty values', () => {
  assert.equal(normalizeNullableString('  abc  '), 'abc');
  assert.equal(normalizeNullableString('   '), null);
});
