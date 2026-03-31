import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTurnStageTracker,
  getAssistantFallbackReplyForStage,
  getUserFacingTurnErrorForStage,
  isCloudAssistantReplyFailureStage,
  isProviderIssueTurnFailure,
  isExpectedTurnStageTransition,
  isTerminalTurnStage,
  logTurnStageTransition,
  TURN_POST_PROCESSING_STAGES,
  shouldBlockProviderRetryForThread,
  shouldBlockSendForThread,
  logTurnPostProcessingStage,
  shouldResetProviderReadinessForStage,
  TURN_STAGES
} from '../src/services/assistant_turn_utils.ts';

const withMutedConsole = (fn) => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    const value = fn();
    if (value && typeof value.then === 'function') {
      return value.finally(() => {
        console.log = originalLog;
        console.warn = originalWarn;
      });
    }
    console.log = originalLog;
    console.warn = originalWarn;
    return value;
  } catch (error) {
    console.log = originalLog;
    console.warn = originalWarn;
    throw error;
  }
};

test('provider-stage failures map to provider reset + provider error message', () => {
  assert.equal(
    shouldResetProviderReadinessForStage(TURN_STAGES.RESOLVE_PROVIDER),
    true
  );
  assert.equal(
    shouldResetProviderReadinessForStage(TURN_STAGES.INIT_PROVIDER),
    true
  );
  assert.equal(
    getUserFacingTurnErrorForStage(TURN_STAGES.RESOLVE_PROVIDER),
    'Could not start the selected AI provider. Check Settings and try again.'
  );
});

test('memory-context-stage failure maps to context-specific user message', () => {
  assert.equal(
    shouldResetProviderReadinessForStage(TURN_STAGES.BUILD_MEMORY_CONTEXT),
    false
  );
  assert.equal(
    getUserFacingTurnErrorForStage(TURN_STAGES.BUILD_MEMORY_CONTEXT),
    'Could not prepare conversation context. Please try again.'
  );
});

test('logTurnStageTransition returns next stage for deterministic state updates', () => {
  const next = withMutedConsole(() => logTurnStageTransition(
    TURN_STAGES.START,
    TURN_STAGES.PERSIST_USER_MESSAGE,
    {
      turnId: 'turn-1',
      threadId: 'thread-1',
      provider: 'local'
    }
  ));
  assert.equal(next, TURN_STAGES.PERSIST_USER_MESSAGE);
});

test('logTurnStageTransition is stable when stage does not change', () => {
  const next = logTurnStageTransition(
    TURN_STAGES.GENERATE_ASSISTANT_REPLY,
    TURN_STAGES.GENERATE_ASSISTANT_REPLY,
    {
      turnId: 'turn-2',
      threadId: 'thread-2',
      provider: 'cloud'
    }
  );
  assert.equal(next, TURN_STAGES.GENERATE_ASSISTANT_REPLY);
});

test('unknown stage falls back to generic user-facing error', () => {
  assert.equal(
    getUserFacingTurnErrorForStage('some_unknown_stage'),
    'Could not generate a reply right now. Check your provider/model settings and try again.'
  );
  assert.equal(
    getAssistantFallbackReplyForStage('some_unknown_stage'),
    'I hit a temporary issue while replying. Please try again in a moment.'
  );
});

test('isTerminalTurnStage marks completed/failed as terminal only', () => {
  assert.equal(isTerminalTurnStage(TURN_STAGES.COMPLETED), true);
  assert.equal(isTerminalTurnStage(TURN_STAGES.FAILED), true);
  assert.equal(isTerminalTurnStage(TURN_STAGES.GENERATE_ASSISTANT_REPLY), false);
  assert.equal(isTerminalTurnStage('unknown_stage'), false);
});

test('shouldBlockSendForThread blocks only same-thread in-flight turns or explicit loading state', () => {
  assert.equal(shouldBlockSendForThread('thread-1', null, false), false);
  assert.equal(shouldBlockSendForThread('thread-1', { threadId: 'thread-1', turnId: 't1' }, false), true);
  assert.equal(shouldBlockSendForThread('thread-2', { threadId: 'thread-1', turnId: 't1' }, false), false);
  assert.equal(shouldBlockSendForThread('thread-1', { threadId: 'thread-1', turnId: 't1' }, true), true);
});

test('shouldBlockProviderRetryForThread mirrors in-flight/thread loading guard semantics', () => {
  assert.equal(shouldBlockProviderRetryForThread('thread-1', null, false), false);
  assert.equal(shouldBlockProviderRetryForThread('thread-1', { threadId: 'thread-1', turnId: 't1' }, false), true);
  assert.equal(shouldBlockProviderRetryForThread('thread-2', { threadId: 'thread-1', turnId: 't1' }, false), false);
  assert.equal(shouldBlockProviderRetryForThread('thread-1', { threadId: 'thread-1', turnId: 't1' }, true), true);
});

test('isExpectedTurnStageTransition allows forward transitions and terminal failure, blocks reverse/terminal transitions', () => {
  assert.equal(
    isExpectedTurnStageTransition(TURN_STAGES.START, TURN_STAGES.PERSIST_USER_MESSAGE),
    true
  );
  assert.equal(
    isExpectedTurnStageTransition(TURN_STAGES.START, TURN_STAGES.INIT_PROVIDER),
    false
  );
  assert.equal(
    isExpectedTurnStageTransition(TURN_STAGES.PERSIST_ASSISTANT_REPLY, TURN_STAGES.QUEUE_POST_PROCESSING),
    true
  );
  assert.equal(
    isExpectedTurnStageTransition(TURN_STAGES.GENERATE_ASSISTANT_REPLY, TURN_STAGES.FAILED),
    true
  );
  assert.equal(
    isExpectedTurnStageTransition(TURN_STAGES.BUILD_MEMORY_CONTEXT, TURN_STAGES.PERSIST_USER_MESSAGE),
    false
  );
  assert.equal(
    isExpectedTurnStageTransition(TURN_STAGES.COMPLETED, TURN_STAGES.FAILED),
    false
  );
});

test('logTurnStageTransition keeps previous stage when transition is unexpected', () => {
  const next = withMutedConsole(() => logTurnStageTransition(
    TURN_STAGES.START,
    TURN_STAGES.INIT_PROVIDER,
    {
      turnId: 'turn-unexpected',
      threadId: 'thread-unexpected',
      provider: 'cloud'
    }
  ));
  assert.equal(next, TURN_STAGES.START);
});

test('stage-specific assistant fallback text is explicit for provider/context failures', () => {
  assert.equal(
    getAssistantFallbackReplyForStage(TURN_STAGES.INIT_PROVIDER),
    "I couldn't reach the selected AI provider. Please check Settings and try again."
  );
  assert.equal(
    getAssistantFallbackReplyForStage(TURN_STAGES.BUILD_MEMORY_CONTEXT),
    "I couldn't prepare enough conversation context to reply reliably. Please try again."
  );
});

test('isCloudAssistantReplyFailureStage identifies cloud generation-stage failures only', () => {
  assert.equal(
    isCloudAssistantReplyFailureStage('cloud', TURN_STAGES.GENERATE_ASSISTANT_REPLY),
    true
  );
  assert.equal(
    isCloudAssistantReplyFailureStage('local', TURN_STAGES.GENERATE_ASSISTANT_REPLY),
    false
  );
  assert.equal(
    isCloudAssistantReplyFailureStage('cloud', TURN_STAGES.BUILD_MEMORY_CONTEXT),
    false
  );
});

test('isProviderIssueTurnFailure combines provider-init and cloud-generation failure signals', () => {
  assert.equal(
    isProviderIssueTurnFailure('cloud', TURN_STAGES.RESOLVE_PROVIDER),
    true
  );
  assert.equal(
    isProviderIssueTurnFailure('cloud', TURN_STAGES.GENERATE_ASSISTANT_REPLY),
    true
  );
  assert.equal(
    isProviderIssueTurnFailure('local', TURN_STAGES.GENERATE_ASSISTANT_REPLY),
    false
  );
  assert.equal(
    isProviderIssueTurnFailure('local', TURN_STAGES.BUILD_MEMORY_CONTEXT),
    false
  );
});

test('logTurnPostProcessingStage is callable for stable stage instrumentation', () => {
  assert.doesNotThrow(() => withMutedConsole(() => {
    logTurnPostProcessingStage(TURN_POST_PROCESSING_STAGES.QUEUED, {
      turnId: 'turn-1',
      threadId: 'thread-1',
      provider: 'cloud',
      detail: 'queued after assistant reply'
    });
  }));
});

test('createTurnStageTracker synchronizes stage/provider updates through callback', () => {
  const snapshots = [];

  const tracker = createTurnStageTracker({
    turnId: 'turn-sync',
    threadId: 'thread-sync',
    onStateChange: (snapshot) => {
      snapshots.push(`${snapshot.stage}:${snapshot.provider ?? 'none'}`);
    }
  });

  tracker.setProvider('cloud');
  tracker.advance(TURN_STAGES.PERSIST_USER_MESSAGE);
  tracker.advance(TURN_STAGES.RESOLVE_PROVIDER);

  assert.equal(tracker.getStage(), TURN_STAGES.RESOLVE_PROVIDER);
  assert.equal(tracker.getProvider(), 'cloud');
  assert.deepEqual(snapshots, [
    'start:cloud',
    'persist_user_message:cloud',
    'resolve_provider:cloud'
  ]);
});

test('createTurnStageTracker preserves stage when transition is unexpected', () => {
  const tracker = createTurnStageTracker({
    turnId: 'turn-unexpected-transition',
    threadId: 'thread-unexpected-transition'
  });

  const next = withMutedConsole(() => tracker.advance(TURN_STAGES.INIT_PROVIDER));
  assert.equal(next, TURN_STAGES.START);
  assert.equal(tracker.getStage(), TURN_STAGES.START);
});
