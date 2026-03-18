import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreMessage, tokenize } from '../src/services/retrieval_utils.ts';

test('tokenize normalizes, deduplicates, and drops short tokens', () => {
  const tokens = tokenize('Hi hi project! project notes?');
  assert.deepEqual(tokens, ['project', 'notes']);
});

test('scoreMessage rewards overlap and phrase matches', () => {
  const message = {
    id: 'm1',
    thread_id: 't1',
    role: 'user',
    text: 'Discuss project timeline and project scope in detail',
    meta_json: null,
    created_at: 1700000000000
  };

  const scored = scoreMessage(message, 'project timeline', ['project', 'timeline']);
  assert.ok(scored.score > 0);
  assert.ok(scored.overlap >= 1);
  assert.ok(scored.matchedTokens.includes('project'));
});
