import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildHistorySnapshotFromNewest,
    JUMP_HINT_TEXT,
    mergeOlderHistoryBatch,
    resolveJumpBehavior,
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

test('resolveInitialVisibleCount normalizes invalid page size and trailing context', () => {
  assert.equal(resolveInitialVisibleCount(Number.NaN, 4, Number.NaN), 4);
  assert.equal(resolveInitialVisibleCount(0, 4, -10), 4);
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

test('resolveMutationRefreshVisibleCount normalizes invalid page size and trailing buffer', () => {
  assert.equal(resolveMutationRefreshVisibleCount(5, Number.NaN, 4), 9);
  assert.equal(resolveMutationRefreshVisibleCount(5, 0, Number.NaN), 5);
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

test('buildHistorySnapshotFromNewest normalizes invalid totals to message length floor', () => {
  const snapshot = buildHistorySnapshotFromNewest(
    [
      { id: 'm2', created_at: 2000 },
      { id: 'm1', created_at: 1000 }
    ],
    Number.NaN
  );

  assert.equal(snapshot.totalMessageCount, 2);
  assert.equal(snapshot.loadedMessageCount, 2);
  assert.equal(snapshot.hasOlderMessages, false);
});

test('buildHistorySnapshotFromNewest de-duplicates repeated ids and keeps deterministic order', () => {
  const snapshot = buildHistorySnapshotFromNewest(
    [
      { id: 'm2', created_at: 2000 },
      { id: 'm1', created_at: 1000 },
      { id: 'm2', created_at: 2000 },
      { id: 'm3', created_at: 3000 }
    ],
    10
  );

  assert.deepEqual(snapshot.messages.map((message) => message.id), ['m1', 'm2', 'm3']);
  assert.equal(snapshot.loadedMessageCount, 3);
  assert.equal(snapshot.totalMessageCount, 10);
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

test('mergeOlderHistoryBatch normalizes invalid count inputs without producing NaN state', () => {
  const snapshot = mergeOlderHistoryBatch({
    existingMessages: [
      { id: 'm3', created_at: 3000 }
    ],
    olderBatch: [
      { id: 'm1', created_at: 1000 },
      { id: 'm2', created_at: 2000 }
    ],
    loadedMessageCount: Number.NaN,
    totalMessageCount: Number.NaN
  });

  assert.equal(snapshot.totalMessageCount, 3);
  assert.equal(snapshot.loadedMessageCount, 3);
  assert.equal(snapshot.hasOlderMessages, false);
});

test('mergeOlderHistoryBatch clamps loaded count to total count when incoming state is oversized', () => {
  const snapshot = mergeOlderHistoryBatch({
    existingMessages: [
      { id: 'm3', created_at: 3000 },
      { id: 'm4', created_at: 4000 }
    ],
    olderBatch: [
      { id: 'm1', created_at: 1000 },
      { id: 'm2', created_at: 2000 }
    ],
    loadedMessageCount: 999,
    totalMessageCount: 3
  });

  assert.equal(snapshot.totalMessageCount, 4);
  assert.equal(snapshot.loadedMessageCount, 4);
  assert.equal(snapshot.hasOlderMessages, false);
});

test('mergeOlderHistoryBatch keeps deterministic id ordering for same-timestamp merges', () => {
  const snapshot = mergeOlderHistoryBatch({
    existingMessages: [
      { id: 'm3', created_at: 3000 },
      { id: 'm4', created_at: 3000 }
    ],
    olderBatch: [
      { id: 'm1', created_at: 1000 },
      { id: 'm2', created_at: 3000 }
    ],
    loadedMessageCount: 2,
    totalMessageCount: 4
  });

  assert.deepEqual(snapshot.messages.map((message) => message.id), ['m1', 'm2', 'm3', 'm4']);
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

test('resolveJumpBehavior waits while initial or older history is still loading', () => {
  const messages = [
    { id: 'm1', created_at: 1000 },
    { id: 'm2', created_at: 2000 }
  ];

  assert.deepEqual(resolveJumpBehavior({
    messages,
    targetMessageId: 'm9',
    lastJumpedMessageId: null,
    loadingInitialMessages: true,
    loadingOlderMessages: false,
    hasOlderMessages: true
  }), { kind: 'wait' });

  assert.deepEqual(resolveJumpBehavior({
    messages,
    targetMessageId: 'm9',
    lastJumpedMessageId: null,
    loadingInitialMessages: false,
    loadingOlderMessages: true,
    hasOlderMessages: true
  }), { kind: 'wait' });
});

test('resolveJumpBehavior prioritizes immediate jump when target is already loaded', () => {
  const messages = [
    { id: 'm1', created_at: 1000 },
    { id: 'm2', created_at: 2000 }
  ];

  assert.deepEqual(resolveJumpBehavior({
    messages,
    targetMessageId: 'm2',
    lastJumpedMessageId: null,
    loadingInitialMessages: true,
    loadingOlderMessages: true,
    hasOlderMessages: true
  }), { kind: 'jump', index: 1 });
});

test('resolveJumpBehavior returns none when no target message id is provided', () => {
  const messages = [
    { id: 'm1', created_at: 1000 },
    { id: 'm2', created_at: 2000 }
  ];

  assert.deepEqual(resolveJumpBehavior({
    messages,
    targetMessageId: null,
    lastJumpedMessageId: null,
    loadingInitialMessages: false,
    loadingOlderMessages: false,
    hasOlderMessages: true
  }), { kind: 'none' });
});

test('resolveJumpBehavior waits when target exists but has already been jumped', () => {
  const messages = [
    { id: 'm1', created_at: 1000 },
    { id: 'm2', created_at: 2000 }
  ];

  assert.deepEqual(resolveJumpBehavior({
    messages,
    targetMessageId: 'm2',
    lastJumpedMessageId: 'm2',
    loadingInitialMessages: false,
    loadingOlderMessages: false,
    hasOlderMessages: false
  }), { kind: 'wait' });
});

test('resolveJumpBehavior returns deterministic jump/hint outcomes', () => {
  const messages = [
    { id: 'm1', created_at: 1000 },
    { id: 'm2', created_at: 2000 }
  ];

  assert.deepEqual(resolveJumpBehavior({
    messages,
    targetMessageId: 'm2',
    lastJumpedMessageId: null,
    loadingInitialMessages: false,
    loadingOlderMessages: false,
    hasOlderMessages: true
  }), { kind: 'jump', index: 1 });

  assert.deepEqual(resolveJumpBehavior({
    messages,
    targetMessageId: 'm9',
    lastJumpedMessageId: null,
    loadingInitialMessages: false,
    loadingOlderMessages: false,
    hasOlderMessages: true
  }), { kind: 'hint', hint: 'older', text: JUMP_HINT_TEXT.OLDER });

  assert.deepEqual(resolveJumpBehavior({
    messages,
    targetMessageId: 'm9',
    lastJumpedMessageId: null,
    loadingInitialMessages: false,
    loadingOlderMessages: false,
    hasOlderMessages: false
  }), { kind: 'hint', hint: 'missing', text: JUMP_HINT_TEXT.MISSING });
});
