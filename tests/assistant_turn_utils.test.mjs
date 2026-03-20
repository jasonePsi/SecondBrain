import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAssistantFallbackReplyForStage,
  getUserFacingTurnErrorForStage,
  isExpectedTurnStageTransition,
  isTerminalTurnStage,
  logTurnStageTransition,
  TURN_POST_PROCESSING_STAGES,
  shouldBlockSendForThread,
  logTurnPostProcessingStage,
  shouldResetProviderReadinessForStage,
  TURN_STAGES
} from '../src/services/assistant_turn_utils.ts';

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
  const next = logTurnStageTransition(
    TURN_STAGES.START,
    TURN_STAGES.PERSIST_USER_MESSAGE,
    {
      turnId: 'turn-1',
      threadId: 'thread-1',
      provider: 'local'
    }
  );
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

test('isExpectedTurnStageTransition allows forward transitions and terminal failure, blocks reverse/terminal transitions', () => {
  assert.equal(
    isExpectedTurnStageTransition(TURN_STAGES.START, TURN_STAGES.PERSIST_USER_MESSAGE),
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

test('logTurnPostProcessingStage is callable for stable stage instrumentation', () => {
  assert.doesNotThrow(() => {
    logTurnPostProcessingStage(TURN_POST_PROCESSING_STAGES.QUEUED, {
      turnId: 'turn-1',
      threadId: 'thread-1',
      provider: 'cloud',
      detail: 'queued after assistant reply'
    });
  });
});
