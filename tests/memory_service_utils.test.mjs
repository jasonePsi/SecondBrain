import test from 'node:test';
import assert from 'node:assert/strict';
import { clipText, selectMessagesWithinCharBudget } from '../src/services/memory_context_utils.ts';

test('clipText truncates and appends ellipsis deterministically', () => {
  assert.equal(clipText('abcdef', 4), 'abc…');
  assert.equal(clipText('abc', 4), 'abc');
});

test('clipText handles tiny/invalid max lengths predictably', () => {
  assert.equal(clipText('abcdef', 1), '…');
  assert.equal(clipText('abcdef', 0), '');
});

test('selectMessagesWithinCharBudget keeps latest messages within budget', () => {
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

test('selectMessagesWithinCharBudget preserves chronology of selected subset', () => {
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

test('selectMessagesWithinCharBudget drops all messages when reserved budget is exhausted', () => {
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

test('selectMessagesWithinCharBudget clamps invalid reserved/max budget deterministically', () => {
  const messages = [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'world' }
  ];

  const overReserved = selectMessagesWithinCharBudget(messages, {
    maxChars: 5,
    reservedChars: 999
  });
  assert.equal(overReserved.usedChars, 5);
  assert.equal(overReserved.selectedMessages.length, 0);
  assert.equal(overReserved.droppedCount, 2);

  const negativeBudget = selectMessagesWithinCharBudget(messages, {
    maxChars: -10,
    reservedChars: -20
  });
  assert.equal(negativeBudget.usedChars, 0);
  assert.equal(negativeBudget.selectedMessages.length, 0);
  assert.equal(negativeBudget.droppedCount, 2);
});

test('selectMessagesWithinCharBudget keeps a contiguous newest suffix when budget fills', () => {
  const messages = [
    { role: 'user', content: 'old tiny' },
    { role: 'assistant', content: 'middle message that is intentionally much longer than the rest' },
    { role: 'user', content: 'latest tiny' }
  ];

  const result = selectMessagesWithinCharBudget(messages, {
    maxChars: 60,
    reservedChars: 30
  });

  assert.deepEqual(
    result.selectedMessages.map((message) => message.content),
    ['latest tiny']
  );
});
