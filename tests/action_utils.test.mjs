import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduledForValue } from '../src/repositories/action_utils.ts';

test('parseScheduledForValue returns numeric timestamp when provided', () => {
  assert.equal(parseScheduledForValue({ timestamp: 123456 }), 123456);
});

test('parseScheduledForValue parses numeric strings', () => {
  assert.equal(parseScheduledForValue({ timestamp: '1700000000000' }), 1700000000000);
});

test('parseScheduledForValue returns null for invalid values', () => {
  assert.equal(parseScheduledForValue({ timestamp: 'abc' }), null);
  assert.equal(parseScheduledForValue({ timestamp: null }), null);
  assert.equal(parseScheduledForValue(null), null);
});
