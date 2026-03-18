import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getJsonObjectCandidate,
  validateOps
} from '../src/services/structured_extraction_utils.ts';

test('validateOps keeps valid operations and reports drops', () => {
  const input = [
    { op: 'UPSERT_FACT', data: { key: 'city', value: 'Athens', scope: 'thread' } },
    { op: 'CREATE_ACTION', data: { payload: { text: 'pay bill' }, schedule: { timestamp: 1700000000000 } } },
    { op: 'UPDATE_THREAD', data: { title: 'Plan' } },
    { op: 'CREATE_ACTION', data: { payload: { text: '' }, schedule: { timestamp: 1 } } },
    { op: 'UNKNOWN', data: {} }
  ];

  const result = validateOps(input);
  assert.equal(result.ops.length, 3);
  assert.equal(result.diagnostics.rawOpsCount, 5);
  assert.equal(result.diagnostics.acceptedOpsCount, 3);
  assert.equal(result.diagnostics.droppedOpsCount, 2);
  assert.ok(result.diagnostics.droppedReasons.length >= 1);
});

test('getJsonObjectCandidate extracts JSON object from noisy wrapper text', () => {
  const raw = 'prefix text {"ops":[]} suffix text';
  assert.equal(getJsonObjectCandidate(raw), '{"ops":[]}');
});
