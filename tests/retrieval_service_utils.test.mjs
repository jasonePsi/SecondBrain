import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rankOlderCandidates,
  scoreMessage,
  tokenize
} from '../src/services/retrieval_utils.ts';

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

test('rankOlderCandidates filters excluded/system/blank messages and keeps deterministic order', () => {
  const candidates = [
    { id: 'm1', text: 'project planning with timeline details', created_at: 1000, role: 'user' },
    { id: 'm2', text: 'timeline project details and decisions', created_at: 3000, role: 'user' },
    { id: 'm3', text: 'project timeline retrospective', created_at: 7000, role: 'user' },
    { id: 'm4', text: 'system item', created_at: 9000, role: 'system' },
    { id: 'm5', text: '   ', created_at: 9500, role: 'user' },
    { id: 'm2', text: 'duplicate id should be ignored', created_at: 4000, role: 'user' }
  ];

  const ranked = rankOlderCandidates(
    candidates,
    'project timeline',
    tokenize('project timeline'),
    new Set(['m1']),
    2
  );

  assert.deepEqual(ranked.map((item) => item.message.id), ['m2', 'm3']);
  assert.ok(ranked[0].message.created_at < ranked[1].message.created_at);
});
