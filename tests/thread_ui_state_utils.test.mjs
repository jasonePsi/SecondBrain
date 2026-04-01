import test from 'node:test';
import assert from 'node:assert/strict';
import { TURN_STAGES } from '../src/services/assistant_turn_utils.ts';
import {
  getTurnStageStatusText,
  resolveHistoryLoadActionLabel,
  resolveJumpHintAction,
  resolveThreadComposerPlaceholder,
  resolveThreadStatusText
} from '../src/services/thread_ui_state_utils.ts';

test('getTurnStageStatusText maps cloud/local generation stages deterministically', () => {
  assert.equal(
    getTurnStageStatusText(TURN_STAGES.GENERATE_ASSISTANT_REPLY, 'cloud'),
    'Waiting for cloud response…'
  );
  assert.equal(
    getTurnStageStatusText(TURN_STAGES.GENERATE_ASSISTANT_REPLY, 'local'),
    'Generating reply…'
  );
  assert.equal(
    getTurnStageStatusText(TURN_STAGES.PERSIST_USER_MESSAGE, 'local'),
    'Saving your message…'
  );
});

test('resolveThreadStatusText keeps deterministic priority: loading > retry > unavailable', () => {
  assert.equal(
    resolveThreadStatusText({
      isLoading: true,
      activeTurnStage: TURN_STAGES.BUILD_MEMORY_CONTEXT,
      activeTurnProvider: 'local',
      retryingProvider: true,
      providerUnavailable: true
    }),
    'Preparing conversation context…'
  );

  assert.equal(
    resolveThreadStatusText({
      isLoading: false,
      activeTurnStage: null,
      activeTurnProvider: null,
      retryingProvider: true,
      providerUnavailable: true
    }),
    'Reconnecting AI…'
  );

  assert.equal(
    resolveThreadStatusText({
      isLoading: false,
      activeTurnStage: null,
      activeTurnProvider: null,
      retryingProvider: false,
      providerUnavailable: true
    }),
    'Sending is disabled until AI is available.'
  );

  assert.equal(
    resolveThreadStatusText({
      isLoading: false,
      activeTurnStage: null,
      activeTurnProvider: null,
      retryingProvider: false,
      providerUnavailable: false
    }),
    null
  );
});

test('resolveThreadComposerPlaceholder prioritizes unavailable/retry/loading/recording states', () => {
  assert.equal(
    resolveThreadComposerPlaceholder({
      providerUnavailable: true,
      retryingProvider: false,
      isLoading: false,
      isRecording: false
    }),
    'AI unavailable. Open Settings to restore provider/model setup'
  );

  assert.equal(
    resolveThreadComposerPlaceholder({
      providerUnavailable: false,
      retryingProvider: true,
      isLoading: false,
      isRecording: false
    }),
    'Retrying AI connection…'
  );

  assert.equal(
    resolveThreadComposerPlaceholder({
      providerUnavailable: false,
      retryingProvider: false,
      isLoading: true,
      isRecording: true
    }),
    'Generating reply…'
  );

  assert.equal(
    resolveThreadComposerPlaceholder({
      providerUnavailable: false,
      retryingProvider: false,
      isLoading: false,
      isRecording: true
    }),
    'Listening…'
  );

  assert.equal(
    resolveThreadComposerPlaceholder({
      providerUnavailable: false,
      retryingProvider: false,
      isLoading: false,
      isRecording: false
    }),
    'Type a message or use the mic'
  );
});

test('resolveHistoryLoadActionLabel keeps loading and blocking labels explicit', () => {
  assert.equal(
    resolveHistoryLoadActionLabel({
      loadingOlderMessages: true,
      blockOlderLoad: false,
      remainingOlderCount: 8
    }),
    'Loading earlier messages…'
  );

  assert.equal(
    resolveHistoryLoadActionLabel({
      loadingOlderMessages: false,
      blockOlderLoad: true,
      remainingOlderCount: 8
    }),
    'Finish current reply first'
  );

  assert.equal(
    resolveHistoryLoadActionLabel({
      loadingOlderMessages: false,
      blockOlderLoad: false,
      remainingOlderCount: 8
    }),
    'Load earlier messages (8 remaining)'
  );
});

test('resolveJumpHintAction returns deterministic load vs dismiss actions', () => {
  assert.deepEqual(
    resolveJumpHintAction({
      jumpHintKind: 'older',
      hasOlderMessages: true,
      loadingOlderMessages: true,
      blockOlderLoad: false
    }),
    {
      mode: 'load',
      label: 'Loading…',
      disabled: true,
      loading: true
    }
  );

  assert.deepEqual(
    resolveJumpHintAction({
      jumpHintKind: 'older',
      hasOlderMessages: true,
      loadingOlderMessages: false,
      blockOlderLoad: true
    }),
    {
      mode: 'load',
      label: 'Finish current reply first',
      disabled: true,
      loading: false
    }
  );

  assert.deepEqual(
    resolveJumpHintAction({
      jumpHintKind: 'older',
      hasOlderMessages: true,
      loadingOlderMessages: false,
      blockOlderLoad: false
    }),
    {
      mode: 'load',
      label: 'Load earlier',
      disabled: false,
      loading: false
    }
  );

  assert.deepEqual(
    resolveJumpHintAction({
      jumpHintKind: 'missing',
      hasOlderMessages: true,
      loadingOlderMessages: false,
      blockOlderLoad: false
    }),
    {
      mode: 'dismiss',
      label: 'Dismiss',
      disabled: false,
      loading: false
    }
  );
});
