import test from 'node:test';
import assert from 'node:assert/strict';
import { clipText, selectMessagesWithinCharBudget } from '../src/services/memory_context_utils.ts';

test('clipText truncates and appends ellipsis deterministically', () => {
  assert.equal(clipText('abcdef', 4), 'abc…');
  assert.equal(clipText('abc', 4), 'abc');
});

test('selectRecentContextMessages keeps latest messages within budget', () => {
  const messages = [
    { role: 'user', content: 'old message one' },
    { role: 'assistant', content: 'middle response' },
    { role: 'user', content: 'latest ask' }
  ];

  const result = selectMessagesWithinCharBudget(messages, {
    maxChars: 65,
    reservedChars: 40
  });

  assert.equal(result.selectedMessages.length, 1);
  assert.equal(result.selectedMessages[0].content, 'latest ask');
  assert.equal(result.droppedCount, 2);
});

test('selectRecentContextMessages preserves chronology of selected subset', () => {
  const messages = [
    { role: 'user', content: 'one' },
    { role: 'assistant', content: 'two' },
    { role: 'user', content: 'three' }
  ];

  const result = selectMessagesWithinCharBudget(messages, {
    maxChars: 80,
    reservedChars: 30
  });

  assert.deepEqual(
    result.selectedMessages.map((message) => message.content),
    ['two', 'three']
  );
  assert.ok(result.usedChars <= 80);
});

test('selectRecentContextMessages drops all messages when reserved budget is exhausted', () => {
  const messages = [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'world' }
  ];

  const result = selectMessagesWithinCharBudget(messages, {
    maxChars: 10,
    reservedChars: 10
  });

  assert.equal(result.selectedMessages.length, 0);
  assert.equal(result.droppedCount, 2);
});
