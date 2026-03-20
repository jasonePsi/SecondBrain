import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getJsonObjectCandidate,
  parseStructuredExtractionRaw,
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

test('validateOps reports truncation when raw ops exceed max', () => {
  const input = Array.from({ length: 9 }, (_, index) => ({
    op: 'UPSERT_FACT',
    data: { key: `k${index}`, value: index }
  }));

  const result = validateOps(input);
  assert.equal(result.ops.length, 6);
  assert.equal(result.diagnostics.rawOpsCount, 9);
  assert.equal(result.diagnostics.droppedOpsCount, 3);
  assert.ok(result.diagnostics.droppedReasons.includes('ops_truncated'));
});

test('getJsonObjectCandidate extracts JSON object from noisy wrapper text', () => {
  const raw = 'prefix text {"ops":[]} suffix text';
  assert.equal(getJsonObjectCandidate(raw), '{"ops":[]}');
});

test('parseStructuredExtractionRaw accepts valid payload and reports dropped invalid ops', () => {
  const raw = [
    'noise prefix',
    '{"ops":[',
    '{"op":"UPSERT_FACT","data":{"scope":"thread","key":"city","value":"Athens"}},',
    '{"op":"CREATE_ACTION","data":{"payload":{"text":""},"schedule":{"timestamp":1}}}',
    ']}'
  ].join('');

  const parsed = parseStructuredExtractionRaw(raw);
  assert.equal(parsed.ops.length, 1);
  assert.equal(parsed.parseError, undefined);
  assert.equal(parsed.diagnostics.rawOpsCount, 2);
  assert.equal(parsed.diagnostics.droppedOpsCount, 1);
});

test('parseStructuredExtractionRaw returns parse diagnostics for malformed JSON', () => {
  const parsed = parseStructuredExtractionRaw('not-json-content');
  assert.equal(parsed.ops.length, 0);
  assert.equal(typeof parsed.parseError, 'string');
  assert.ok(parsed.diagnostics.droppedReasons.includes('json_parse_failed'));
});

test('validateOps reports ops_not_array when ops payload is not an array', () => {
  const result = validateOps({ op: 'UPSERT_FACT' });
  assert.equal(result.ops.length, 0);
  assert.equal(result.diagnostics.rawOpsCount, 0);
  assert.equal(result.diagnostics.acceptedOpsCount, 0);
  assert.equal(result.diagnostics.droppedOpsCount, 0);
  assert.deepEqual(result.diagnostics.droppedReasons, ['ops_not_array']);
});

test('validateOps normalizes action timestamps and trims long payload text', () => {
  const result = validateOps([
    {
      op: 'CREATE_ACTION',
      data: {
        payload: { text: `  ${'x'.repeat(260)}  ` },
        schedule: { timestamp: '1700000000000' }
      }
    }
  ]);

  assert.equal(result.ops.length, 1);
  const op = result.ops[0];
  assert.equal(op.op, 'CREATE_ACTION');
  if (op.op === 'CREATE_ACTION') {
    assert.equal(op.data.schedule.timestamp, 1700000000000);
    assert.equal(op.data.payload.text.length, 180);
  }
});

test('validateOps trims title/summary on UPDATE_THREAD payloads', () => {
  const result = validateOps([
    {
      op: 'UPDATE_THREAD',
      data: {
        title: `  ${'t'.repeat(120)}  `,
        summary: `  ${'s'.repeat(1400)}  `
      }
    }
  ]);

  assert.equal(result.ops.length, 1);
  const op = result.ops[0];
  assert.equal(op.op, 'UPDATE_THREAD');
  if (op.op === 'UPDATE_THREAD') {
    assert.equal(op.data.title.length, 80);
    assert.equal(op.data.summary.length, 1000);
  }
});

test('validateOps caps diagnostic reasons to avoid unbounded growth', () => {
  const invalidOps = Array.from({ length: 50 }, () => ({ op: 'UNKNOWN', data: {} }));
  const result = validateOps(invalidOps);
  assert.equal(result.ops.length, 0);
  assert.ok(result.diagnostics.droppedReasons.length <= 12);
});
