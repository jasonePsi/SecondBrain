import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInFlightTurnController,
  createTurnStageTracker,
  executeAssistantTurn,
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

test('createInFlightTurnController keeps ref synchronized with stage/provider changes', () => {
  const inFlightTurnRef = { current: null };
  const controller = createInFlightTurnController({
    inFlightTurnRef,
    turnId: 'turn-controller',
    threadId: 'thread-controller',
    startedAt: 123
  });

  assert.equal(inFlightTurnRef.current.turnId, 'turn-controller');
  assert.equal(inFlightTurnRef.current.threadId, 'thread-controller');
  assert.equal(inFlightTurnRef.current.stage, TURN_STAGES.START);
  assert.equal(inFlightTurnRef.current.provider, undefined);

  controller.setProvider('cloud');
  controller.advance(TURN_STAGES.PERSIST_USER_MESSAGE);

  assert.equal(inFlightTurnRef.current.stage, TURN_STAGES.PERSIST_USER_MESSAGE);
  assert.equal(inFlightTurnRef.current.provider, 'cloud');
  assert.equal(controller.getStage(), TURN_STAGES.PERSIST_USER_MESSAGE);
  assert.equal(controller.getProvider(), 'cloud');
});

test('createInFlightTurnController clears only the matching in-flight turn', () => {
  const inFlightTurnRef = { current: null };
  const controller = createInFlightTurnController({
    inFlightTurnRef,
    turnId: 'turn-controller-clear',
    threadId: 'thread-controller-clear',
    startedAt: 321
  });

  inFlightTurnRef.current = {
    threadId: 'other-thread',
    turnId: 'other-turn',
    stage: TURN_STAGES.START,
    provider: 'local',
    startedAt: 0
  };
  controller.clearIfCurrent();
  assert.equal(inFlightTurnRef.current.turnId, 'other-turn');

  inFlightTurnRef.current = {
    threadId: 'thread-controller-clear',
    turnId: 'turn-controller-clear',
    stage: TURN_STAGES.INIT_PROVIDER,
    provider: 'cloud',
    startedAt: 321
  };
  controller.clearIfCurrent();
  assert.equal(inFlightTurnRef.current, null);
});

test('createTurnStageTracker does not emit state changes when provider value is unchanged', () => {
  let emissions = 0;
  const tracker = createTurnStageTracker({
    turnId: 'turn-provider-noop',
    threadId: 'thread-provider-noop',
    provider: 'local',
    onStateChange: () => {
      emissions += 1;
    }
  });

  tracker.setProvider('local');
  assert.equal(emissions, 0);
  assert.equal(tracker.getProvider(), 'local');
});

test('createInFlightTurnController clearIfCurrent is a safe no-op when ref is already empty', () => {
  const inFlightTurnRef = { current: null };
  const controller = createInFlightTurnController({
    inFlightTurnRef,
    turnId: 'turn-controller-empty',
    threadId: 'thread-controller-empty',
    startedAt: 999
  });

  inFlightTurnRef.current = null;
  assert.doesNotThrow(() => controller.clearIfCurrent());
  assert.equal(inFlightTurnRef.current, null);
});

test('executeAssistantTurn runs deterministic lifecycle and clears in-flight turn state', async () => {
  const inFlightTurnRef = { current: null };
  const stageTransitions = [];
  const callOrder = [];

  const result = await withMutedConsole(() => executeAssistantTurn({
    turnId: 'turn-exec-success',
    threadId: 'thread-exec-success',
    startedAt: 1234,
    inFlightTurnRef,
    persistUserMessage: async () => {
      callOrder.push('persist_user');
    },
    resolveProvider: async () => {
      callOrder.push('resolve_provider');
      return 'cloud';
    },
    initProvider: async (provider) => {
      callOrder.push(`init:${provider}`);
    },
    buildMemoryContext: async (provider) => {
      callOrder.push(`build_context:${provider}`);
      return { chatMessages: [{ role: 'user', content: 'hello' }] };
    },
    generateAssistantReply: async (provider, context) => {
      callOrder.push(`generate:${provider}:${context.chatMessages.length}`);
      return 'assistant reply';
    },
    persistAssistantReply: async (assistantReply, provider) => {
      callOrder.push(`persist_assistant:${provider}:${assistantReply}`);
    },
    queuePostProcessing: async ({ provider, assistantReply }) => {
      callOrder.push(`queue:${provider}:${assistantReply}`);
    },
    onStateChange: (snapshot) => {
      stageTransitions.push(`${snapshot.stage}:${snapshot.provider ?? 'none'}`);
    }
  }));

  assert.equal(result.outcome, 'completed');
  assert.equal(result.stage, TURN_STAGES.COMPLETED);
  assert.equal(result.provider, 'cloud');
  assert.equal(result.userMessagePersisted, true);
  assert.equal(result.assistantMessagePersisted, true);
  assert.equal(result.assistantReply, 'assistant reply');
  assert.equal(inFlightTurnRef.current, null);
  assert.deepEqual(callOrder, [
    'persist_user',
    'resolve_provider',
    'init:cloud',
    'build_context:cloud',
    'generate:cloud:1',
    'persist_assistant:cloud:assistant reply',
    'queue:cloud:assistant reply'
  ]);
  assert.ok(stageTransitions.includes('persist_user_message:none'));
  assert.ok(stageTransitions.includes('resolve_provider:none'));
  assert.ok(stageTransitions.includes('resolve_provider:cloud'));
  assert.ok(stageTransitions.includes('queue_post_processing:cloud'));
  assert.ok(stageTransitions.includes('completed:cloud'));
});

test('executeAssistantTurn returns failed outcome with stage context and clears in-flight state', async () => {
  const inFlightTurnRef = { current: null };

  const result = await withMutedConsole(() => executeAssistantTurn({
    turnId: 'turn-exec-failure',
    threadId: 'thread-exec-failure',
    startedAt: 5678,
    inFlightTurnRef,
    persistUserMessage: async () => {},
    resolveProvider: async () => 'local',
    initProvider: async () => {},
    buildMemoryContext: async () => {
      throw new Error('context exploded');
    },
    generateAssistantReply: async () => 'should-not-run',
    persistAssistantReply: async () => {},
    queuePostProcessing: async () => {}
  }));

  assert.equal(result.outcome, 'failed');
  assert.equal(result.stage, TURN_STAGES.BUILD_MEMORY_CONTEXT);
  assert.equal(result.provider, 'local');
  assert.equal(result.userMessagePersisted, true);
  assert.equal(result.assistantMessagePersisted, false);
  assert.equal(result.assistantReply, undefined);
  assert.equal(result.error instanceof Error, true);
  assert.equal(result.error.message, 'context exploded');
  assert.equal(inFlightTurnRef.current, null);
});

test('executeAssistantTurn runs stop-recording stage before persisting user message', async () => {
  const inFlightTurnRef = { current: null };
  const callOrder = [];

  const result = await withMutedConsole(() => executeAssistantTurn({
    turnId: 'turn-exec-recording',
    threadId: 'thread-exec-recording',
    startedAt: 9999,
    inFlightTurnRef,
    isRecording: true,
    stopRecording: async () => {
      callOrder.push('stop_recording');
    },
    persistUserMessage: async () => {
      callOrder.push('persist_user');
    },
    resolveProvider: async () => 'local',
    initProvider: async () => {},
    buildMemoryContext: async () => ({}),
    generateAssistantReply: async () => 'ok',
    persistAssistantReply: async () => {},
    queuePostProcessing: async () => {}
  }));

  assert.equal(result.outcome, 'completed');
  assert.deepEqual(callOrder.slice(0, 2), ['stop_recording', 'persist_user']);
});

test('executeAssistantTurn fails at stop-recording stage before persisting user message when recorder stop throws', async () => {
  const inFlightTurnRef = { current: null };

  const result = await withMutedConsole(() => executeAssistantTurn({
    turnId: 'turn-exec-stop-failure',
    threadId: 'thread-exec-stop-failure',
    startedAt: 10001,
    inFlightTurnRef,
    isRecording: true,
    stopRecording: async () => {
      throw new Error('mic stop failed');
    },
    persistUserMessage: async () => {},
    resolveProvider: async () => 'local',
    initProvider: async () => {},
    buildMemoryContext: async () => ({}),
    generateAssistantReply: async () => 'ok',
    persistAssistantReply: async () => {},
    queuePostProcessing: async () => {}
  }));

  assert.equal(result.outcome, 'failed');
  assert.equal(result.stage, TURN_STAGES.STOP_RECORDING);
  assert.equal(result.provider, undefined);
  assert.equal(result.userMessagePersisted, false);
  assert.equal(result.assistantMessagePersisted, false);
  assert.equal(result.error instanceof Error, true);
  assert.equal(result.error.message, 'mic stop failed');
  assert.equal(inFlightTurnRef.current, null);
});

test('executeAssistantTurn fails at queue stage but keeps persisted assistant state for graceful fallback handling', async () => {
  const inFlightTurnRef = { current: null };

  const result = await withMutedConsole(() => executeAssistantTurn({
    turnId: 'turn-exec-queue-failure',
    threadId: 'thread-exec-queue-failure',
    startedAt: 7777,
    inFlightTurnRef,
    persistUserMessage: async () => {},
    resolveProvider: async () => 'cloud',
    initProvider: async () => {},
    buildMemoryContext: async () => ({ compact: true }),
    generateAssistantReply: async () => 'assistant ok',
    persistAssistantReply: async () => {},
    queuePostProcessing: async () => {
      throw new Error('queue failed');
    }
  }));

  assert.equal(result.outcome, 'failed');
  assert.equal(result.stage, TURN_STAGES.QUEUE_POST_PROCESSING);
  assert.equal(result.provider, 'cloud');
  assert.equal(result.userMessagePersisted, true);
  assert.equal(result.assistantMessagePersisted, true);
  assert.equal(result.assistantReply, 'assistant ok');
  assert.equal(result.error instanceof Error, true);
  assert.equal(result.error.message, 'queue failed');
  assert.equal(inFlightTurnRef.current, null);
});

test('executeAssistantTurn fails at provider resolution stage after persisting user message', async () => {
  const inFlightTurnRef = { current: null };
  const callOrder = [];

  const result = await withMutedConsole(() => executeAssistantTurn({
    turnId: 'turn-exec-provider-failure',
    threadId: 'thread-exec-provider-failure',
    startedAt: 8800,
    inFlightTurnRef,
    persistUserMessage: async () => {
      callOrder.push('persist_user');
    },
    resolveProvider: async () => {
      callOrder.push('resolve_provider');
      throw new Error('provider resolution failed');
    },
    initProvider: async () => {
      callOrder.push('init_provider');
    },
    buildMemoryContext: async () => {
      callOrder.push('build_context');
      return {};
    },
    generateAssistantReply: async () => {
      callOrder.push('generate');
      return 'assistant reply';
    },
    persistAssistantReply: async () => {
      callOrder.push('persist_assistant');
    },
    queuePostProcessing: async () => {
      callOrder.push('queue');
    }
  }));

  assert.equal(result.outcome, 'failed');
  assert.equal(result.stage, TURN_STAGES.RESOLVE_PROVIDER);
  assert.equal(result.provider, undefined);
  assert.equal(result.userMessagePersisted, true);
  assert.equal(result.assistantMessagePersisted, false);
  assert.equal(result.assistantReply, undefined);
  assert.equal(result.error instanceof Error, true);
  assert.equal(result.error.message, 'provider resolution failed');
  assert.deepEqual(callOrder, ['persist_user', 'resolve_provider']);
  assert.equal(inFlightTurnRef.current, null);
});

test('executeAssistantTurn fails at assistant persistence stage and keeps generated reply context', async () => {
  const inFlightTurnRef = { current: null };

  const result = await withMutedConsole(() => executeAssistantTurn({
    turnId: 'turn-exec-persist-assistant-failure',
    threadId: 'thread-exec-persist-assistant-failure',
    startedAt: 9900,
    inFlightTurnRef,
    persistUserMessage: async () => {},
    resolveProvider: async () => 'local',
    initProvider: async () => {},
    buildMemoryContext: async () => ({ compact: true }),
    generateAssistantReply: async () => 'assistant draft reply',
    persistAssistantReply: async () => {
      throw new Error('persist assistant failed');
    },
    queuePostProcessing: async () => {}
  }));

  assert.equal(result.outcome, 'failed');
  assert.equal(result.stage, TURN_STAGES.PERSIST_ASSISTANT_REPLY);
  assert.equal(result.provider, 'local');
  assert.equal(result.userMessagePersisted, true);
  assert.equal(result.assistantMessagePersisted, false);
  assert.equal(result.assistantReply, 'assistant draft reply');
  assert.equal(result.error instanceof Error, true);
  assert.equal(result.error.message, 'persist assistant failed');
  assert.equal(inFlightTurnRef.current, null);
});
