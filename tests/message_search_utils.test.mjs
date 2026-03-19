import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFtsMatchQuery, buildMessageSnippet } from '../src/repositories/message_search_utils.ts';

test('buildFtsMatchQuery tokenizes and appends wildcards', () => {
  const query = buildFtsMatchQuery('daily standup notes');
  assert.equal(query, 'daily* OR standup* OR notes*');
});

test('buildFtsMatchQuery removes punctuation and short tokens', () => {
  const query = buildFtsMatchQuery('a! b? @project-roadmap');
  assert.equal(query, 'project-roadmap*');
});

test('buildMessageSnippet clamps long text with ellipsis', () => {
  const snippet = buildMessageSnippet('x'.repeat(20), 10);
  assert.equal(snippet, 'xxxxxxxxx…');
});

test('buildMessageSnippet focuses around query token when provided', () => {
  const text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa';
  const snippet = buildMessageSnippet(text, 24, 'theta');
  assert.ok(snippet.toLowerCase().includes('theta'));
});
