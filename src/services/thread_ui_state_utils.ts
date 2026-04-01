import {
    shouldBlockProviderRetryForThread,
    shouldBlockSendForThread,
    TURN_STAGES,
    type TurnStage
} from './assistant_turn_utils.ts';

export type ThreadTurnProvider = 'local' | 'cloud';
export type ThreadJumpHintKind = 'found' | 'older' | 'missing';

interface InFlightTurnLike {
    threadId: string;
    turnId: string;
}

interface ThreadStatusTextInput {
    isLoading: boolean;
    activeTurnStage: TurnStage | null;
    activeTurnProvider: ThreadTurnProvider | null;
    retryingProvider: boolean;
    providerUnavailable: boolean;
}

interface ComposerPlaceholderInput {
    providerUnavailable: boolean;
    retryingProvider: boolean;
    isLoading: boolean;
    isRecording: boolean;
}

interface HistoryActionLabelInput {
    loadingOlderMessages: boolean;
    blockOlderLoad: boolean;
    remainingOlderCount: number;
}

interface JumpHintActionInput {
    jumpHintKind: ThreadJumpHintKind;
    hasOlderMessages: boolean;
    loadingOlderMessages: boolean;
    blockOlderLoad: boolean;
}

interface ThreadInteractionStateInput {
    threadId: string | null | undefined;
    inFlightTurn: InFlightTurnLike | null;
    llmInitError: string | null;
    llmReady: boolean;
    retryingProvider: boolean;
    isLoading: boolean;
    inputText: string;
    isRecording: boolean;
    micStatus: string;
    activeTurnStage: TurnStage | null;
    activeTurnProvider: ThreadTurnProvider | null;
}

interface ThreadInteractionState {
    providerUnavailable: boolean;
    interactionDisabled: boolean;
    providerRetryDisabled: boolean;
    sendDisabled: boolean;
    blockOlderLoad: boolean;
    turnStatusText: string | null;
    micStatusText: string | null;
    composerPlaceholder: string;
}

export const getTurnStageStatusText = (
    stage: TurnStage | null,
    provider: ThreadTurnProvider | null
): string => {
    if (stage === TURN_STAGES.PERSIST_USER_MESSAGE) return 'Saving your message…';
    if (stage === TURN_STAGES.RESOLVE_PROVIDER) return 'Selecting AI provider…';
    if (stage === TURN_STAGES.INIT_PROVIDER) return 'Starting AI provider…';
    if (stage === TURN_STAGES.BUILD_MEMORY_CONTEXT) return 'Preparing conversation context…';
    if (stage === TURN_STAGES.GENERATE_ASSISTANT_REPLY) {
        if (provider === 'cloud') return 'Waiting for cloud response…';
        return 'Generating reply…';
    }
    if (stage === TURN_STAGES.PERSIST_ASSISTANT_REPLY) return 'Saving assistant reply…';
    if (stage === TURN_STAGES.QUEUE_POST_PROCESSING) return 'Finalizing memory updates…';
    return 'Assistant is replying…';
};

export const resolveThreadStatusText = (input: ThreadStatusTextInput): string | null => {
    if (input.isLoading) {
        return getTurnStageStatusText(input.activeTurnStage, input.activeTurnProvider);
    }
    if (input.retryingProvider) {
        return 'Reconnecting AI…';
    }
    if (input.providerUnavailable) {
        return 'Sending is disabled until AI is available.';
    }
    return null;
};

export const resolveThreadComposerPlaceholder = (
    input: ComposerPlaceholderInput
): string => {
    if (input.providerUnavailable) {
        return 'AI unavailable. Open Settings to restore provider/model setup';
    }
    if (input.retryingProvider) {
        return 'Retrying AI connection…';
    }
    if (input.isLoading) {
        return 'Generating reply…';
    }
    if (input.isRecording) {
        return 'Listening…';
    }
    return 'Type a message or use the mic';
};

export const resolveHistoryLoadActionLabel = (
    input: HistoryActionLabelInput
): string => {
    if (input.loadingOlderMessages) {
        return 'Loading earlier messages…';
    }
    if (input.blockOlderLoad) {
        return 'Finish current reply first';
    }
    return `Load earlier messages (${Math.max(0, input.remainingOlderCount)} remaining)`;
};

export const resolveJumpHintAction = (
    input: JumpHintActionInput
): {
    mode: 'load' | 'dismiss';
    label: string;
    disabled: boolean;
    loading: boolean;
} => {
    if (input.jumpHintKind === 'older' && input.hasOlderMessages) {
        if (input.loadingOlderMessages) {
            return {
                mode: 'load',
                label: 'Loading…',
                disabled: true,
                loading: true
            };
        }
        if (input.blockOlderLoad) {
            return {
                mode: 'load',
                label: 'Finish current reply first',
                disabled: true,
                loading: false
            };
        }
        return {
            mode: 'load',
            label: 'Load earlier',
            disabled: false,
            loading: false
        };
    }

    return {
        mode: 'dismiss',
        label: 'Dismiss',
        disabled: false,
        loading: false
    };
};

export const resolveThreadInteractionState = (
    input: ThreadInteractionStateInput
): ThreadInteractionState => {
    const providerUnavailable = !!input.llmInitError && !input.llmReady && !input.retryingProvider;
    const interactionDisabled = input.isLoading || input.retryingProvider;
    const turnInFlight = shouldBlockSendForThread(
        input.threadId,
        input.inFlightTurn,
        input.isLoading
    );
    const providerRetryDisabled = input.retryingProvider || shouldBlockProviderRetryForThread(
        input.threadId,
        input.inFlightTurn,
        input.isLoading
    );
    const blockOlderLoad = turnInFlight || input.retryingProvider;
    const sendDisabled = providerUnavailable || input.inputText.trim().length === 0 || interactionDisabled;
    const turnStatusText = resolveThreadStatusText({
        isLoading: input.isLoading,
        activeTurnStage: input.activeTurnStage,
        activeTurnProvider: input.activeTurnProvider,
        retryingProvider: input.retryingProvider,
        providerUnavailable
    });
    const micStatusText = input.micStatus !== 'Microphone ready' ? input.micStatus : null;
    const composerPlaceholder = resolveThreadComposerPlaceholder({
        providerUnavailable,
        retryingProvider: input.retryingProvider,
        isLoading: input.isLoading,
        isRecording: input.isRecording
    });

    return {
        providerUnavailable,
        interactionDisabled,
        providerRetryDisabled,
        sendDisabled,
        blockOlderLoad,
        turnStatusText,
        micStatusText,
        composerPlaceholder
    };
};
