import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildHistorySnapshotFromNewest,
    mergeOlderHistoryBatch,
    resolveJumpTargetIndex,
    resolveInitialVisibleCount,
    resolveMutationRefreshVisibleCount,
    shouldLoadOlderHistory
} from '../src/services/thread_history_utils.ts';

test('resolveInitialVisibleCount keeps base page size for invalid offsets', () => {
  assert.equal(resolveInitialVisibleCount(50, null), 50);
  assert.equal(resolveInitialVisibleCount(50, -1), 50);
  assert.equal(resolveInitialVisibleCount(50, Number.NaN), 50);
});

test('resolveInitialVisibleCount expands when target offset is deeper than base page size', () => {
  assert.equal(resolveInitialVisibleCount(50, 80, 8), 88);
  assert.equal(resolveInitialVisibleCount(50, 10, 8), 50);
});

test('resolveMutationRefreshVisibleCount keeps loaded history visible after turn mutations', () => {
  assert.equal(resolveMutationRefreshVisibleCount(0, 50, 4), 50);
  assert.equal(resolveMutationRefreshVisibleCount(50, 50, 4), 54);
  assert.equal(resolveMutationRefreshVisibleCount(120, 50, 4), 124);
  assert.equal(resolveMutationRefreshVisibleCount(Number.NaN, 50, 4), 50);
});

test('buildHistorySnapshotFromNewest sorts newest-query rows chronologically and flags older availability', () => {
  const snapshot = buildHistorySnapshotFromNewest(
    [
      { id: 'm3', created_at: 3000 },
      { id: 'm1', created_at: 1000 },
      { id: 'm2', created_at: 2000 }
    ],
    6
  );

  assert.deepEqual(snapshot.messages.map((message) => message.id), ['m1', 'm2', 'm3']);
  assert.equal(snapshot.loadedMessageCount, 3);
  assert.equal(snapshot.totalMessageCount, 6);
  assert.equal(snapshot.hasOlderMessages, true);
});

test('mergeOlderHistoryBatch prepends older rows and de-duplicates overlap deterministically', () => {
  const snapshot = mergeOlderHistoryBatch({
    existingMessages: [
      { id: 'm3', created_at: 3000 },
      { id: 'm4', created_at: 4000 }
    ],
    olderBatch: [
      { id: 'm1', created_at: 1000 },
      { id: 'm2', created_at: 2000 },
      { id: 'm3', created_at: 3000 }
    ],
    loadedMessageCount: 2,
    totalMessageCount: 4
  });

  assert.deepEqual(snapshot.messages.map((message) => message.id), ['m1', 'm2', 'm3', 'm4']);
  assert.equal(snapshot.loadedMessageCount, 4);
  assert.equal(snapshot.totalMessageCount, 4);
  assert.equal(snapshot.hasOlderMessages, false);
});

test('shouldLoadOlderHistory blocks when thread id is missing, currently loading, or no older messages', () => {
  assert.equal(
    shouldLoadOlderHistory({
      threadId: null,
      loadingOlderMessages: false,
      hasOlderMessages: true
    }),
    false
  );
  assert.equal(
    shouldLoadOlderHistory({
      threadId: 'thread-1',
      loadingOlderMessages: true,
      hasOlderMessages: true
    }),
    false
  );
  assert.equal(
    shouldLoadOlderHistory({
      threadId: 'thread-1',
      loadingOlderMessages: false,
      hasOlderMessages: false
    }),
    false
  );
  assert.equal(
    shouldLoadOlderHistory({
      threadId: 'thread-1',
      loadingOlderMessages: false,
      hasOlderMessages: true,
      turnInFlight: true
    }),
    false
  );
  assert.equal(
    shouldLoadOlderHistory({
      threadId: 'thread-1',
      loadingOlderMessages: false,
      hasOlderMessages: true,
      turnInFlight: false
    }),
    true
  );
});

test('resolveJumpTargetIndex prevents duplicate or missing message jumps', () => {
  const messages = [
    { id: 'm1', created_at: 1000 },
    { id: 'm2', created_at: 2000 },
    { id: 'm3', created_at: 3000 }
  ];

  assert.equal(resolveJumpTargetIndex({ messages, targetMessageId: 'm2' }), 1);
  assert.equal(resolveJumpTargetIndex({
    messages,
    targetMessageId: 'm2',
    lastJumpedMessageId: 'm2'
  }), null);
  assert.equal(resolveJumpTargetIndex({ messages, targetMessageId: 'missing' }), null);
  assert.equal(resolveJumpTargetIndex({ messages: [], targetMessageId: 'm2' }), null);
});
