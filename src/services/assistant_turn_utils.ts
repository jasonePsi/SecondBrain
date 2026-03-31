import type { AIProviderType } from './ai/types';
import { debugLog } from './runtime_log.ts';

export const TURN_STAGES = {
    START: 'start',
    STOP_RECORDING: 'stop_recording',
    PERSIST_USER_MESSAGE: 'persist_user_message',
    RESOLVE_PROVIDER: 'resolve_provider',
    INIT_PROVIDER: 'init_provider',
    BUILD_MEMORY_CONTEXT: 'build_memory_context',
    GENERATE_ASSISTANT_REPLY: 'generate_assistant_reply',
    PERSIST_ASSISTANT_REPLY: 'persist_assistant_reply',
    QUEUE_POST_PROCESSING: 'queue_post_processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
} as const;

export type TurnStage = typeof TURN_STAGES[keyof typeof TURN_STAGES];
export const TERMINAL_TURN_STAGES = new Set<TurnStage>([
    TURN_STAGES.COMPLETED,
    TURN_STAGES.FAILED
]);

export interface InFlightTurnState {
    threadId: string;
    turnId: string;
    stage: TurnStage;
    provider?: AIProviderType;
    startedAt: number;
}

interface InFlightTurnLike {
    threadId: string;
    turnId: string;
    stage?: TurnStage;
    provider?: AIProviderType;
    startedAt?: number;
}

interface TurnStageTransitionContext {
    turnId: string;
    threadId: string;
    provider?: AIProviderType;
    detail?: string;
}

interface TurnPostProcessingStageContext {
    turnId: string;
    threadId: string;
    provider?: AIProviderType;
    detail?: string;
}

interface TurnStageTrackerInput {
    turnId: string;
    threadId: string;
    provider?: AIProviderType;
    initialStage?: TurnStage;
    onStateChange?: (snapshot: {
        stage: TurnStage;
        provider?: AIProviderType;
    }) => void;
}

export interface TurnStageTracker {
    getStage: () => TurnStage;
    getProvider: () => AIProviderType | undefined;
    setProvider: (provider?: AIProviderType) => void;
    advance: (next: TurnStage, detail?: string) => TurnStage;
    snapshot: () => {
        stage: TurnStage;
        provider?: AIProviderType;
    };
}

interface InFlightTurnControllerInput {
    inFlightTurnRef: {
        current: InFlightTurnState | null;
    };
    turnId: string;
    threadId: string;
    startedAt: number;
    provider?: AIProviderType;
    initialStage?: TurnStage;
}

export interface InFlightTurnController {
    turnId: string;
    threadId: string;
    startedAt: number;
    getStage: () => TurnStage;
    getProvider: () => AIProviderType | undefined;
    setProvider: (provider?: AIProviderType) => void;
    advance: (next: TurnStage, detail?: string) => TurnStage;
    clearIfCurrent: () => void;
    snapshot: () => InFlightTurnState;
}

const TURN_ALLOWED_TRANSITIONS: Record<TurnStage, ReadonlyArray<TurnStage>> = {
    [TURN_STAGES.START]: [
        TURN_STAGES.STOP_RECORDING,
        TURN_STAGES.PERSIST_USER_MESSAGE
    ],
    [TURN_STAGES.STOP_RECORDING]: [
        TURN_STAGES.PERSIST_USER_MESSAGE
    ],
    [TURN_STAGES.PERSIST_USER_MESSAGE]: [
        TURN_STAGES.RESOLVE_PROVIDER
    ],
    [TURN_STAGES.RESOLVE_PROVIDER]: [
        TURN_STAGES.INIT_PROVIDER
    ],
    [TURN_STAGES.INIT_PROVIDER]: [
        TURN_STAGES.BUILD_MEMORY_CONTEXT
    ],
    [TURN_STAGES.BUILD_MEMORY_CONTEXT]: [
        TURN_STAGES.GENERATE_ASSISTANT_REPLY
    ],
    [TURN_STAGES.GENERATE_ASSISTANT_REPLY]: [
        TURN_STAGES.PERSIST_ASSISTANT_REPLY
    ],
    [TURN_STAGES.PERSIST_ASSISTANT_REPLY]: [
        TURN_STAGES.QUEUE_POST_PROCESSING
    ],
    [TURN_STAGES.QUEUE_POST_PROCESSING]: [
        TURN_STAGES.COMPLETED
    ],
    [TURN_STAGES.COMPLETED]: [],
    [TURN_STAGES.FAILED]: []
};

const PROVIDER_FAILURE_STAGES = new Set<string>([
    TURN_STAGES.RESOLVE_PROVIDER,
    TURN_STAGES.INIT_PROVIDER
]);

export const TURN_POST_PROCESSING_STAGES = {
    QUEUED: 'queued',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed'
} as const;

export type TurnPostProcessingStage = typeof TURN_POST_PROCESSING_STAGES[keyof typeof TURN_POST_PROCESSING_STAGES];

const sanitizeStageDetail = (detail?: string): string | undefined => {
    if (!detail) return undefined;
    const normalized = detail.trim();
    if (!normalized) return undefined;
    if (normalized.length <= 180) return normalized;
    return `${normalized.slice(0, 179)}…`;
};

export const isExpectedTurnStageTransition = (
    from: TurnStage,
    to: TurnStage
): boolean => {
    if (from === to) return true;
    if (isTerminalTurnStage(from)) return false;
    if (to === TURN_STAGES.FAILED) return true;

    const allowedTransitions = TURN_ALLOWED_TRANSITIONS[from] || [];
    return allowedTransitions.includes(to);
};

export const shouldResetProviderReadinessForStage = (
    stage: TurnStage | string | undefined
): boolean => {
    if (!stage) return false;
    return PROVIDER_FAILURE_STAGES.has(stage);
};

export const isCloudAssistantReplyFailureStage = (
    provider: AIProviderType | undefined,
    stage: TurnStage | string | undefined
): boolean => {
    return provider === 'cloud' && stage === TURN_STAGES.GENERATE_ASSISTANT_REPLY;
};

export const isProviderIssueTurnFailure = (
    provider: AIProviderType | undefined,
    stage: TurnStage | string | undefined
): boolean => {
    return shouldResetProviderReadinessForStage(stage)
        || isCloudAssistantReplyFailureStage(provider, stage);
};

export const getUserFacingTurnErrorForStage = (
    stage?: TurnStage | string
): string => {
    if (stage === TURN_STAGES.RESOLVE_PROVIDER || stage === TURN_STAGES.INIT_PROVIDER) {
        return 'Could not start the selected AI provider. Check Settings and try again.';
    }
    if (stage === TURN_STAGES.BUILD_MEMORY_CONTEXT) {
        return 'Could not prepare conversation context. Please try again.';
    }
    return 'Could not generate a reply right now. Check your provider/model settings and try again.';
};

export const getAssistantFallbackReplyForStage = (
    stage?: TurnStage | string
): string => {
    if (stage === TURN_STAGES.RESOLVE_PROVIDER || stage === TURN_STAGES.INIT_PROVIDER) {
        return 'I couldn\'t reach the selected AI provider. Please check Settings and try again.';
    }
    if (stage === TURN_STAGES.BUILD_MEMORY_CONTEXT) {
        return 'I couldn\'t prepare enough conversation context to reply reliably. Please try again.';
    }
    return 'I hit a temporary issue while replying. Please try again in a moment.';
};

export const logTurnStageTransition = (
    from: TurnStage,
    to: TurnStage,
    context: TurnStageTransitionContext
): TurnStage => {
    if (from === to) return to;
    const transitionExpected = isExpectedTurnStageTransition(from, to);
    if (!transitionExpected) {
        console.warn('[ThreadTurn] unexpected stage transition', {
            turnId: context.turnId,
            threadId: context.threadId,
            provider: context.provider,
            from,
            to,
            detail: sanitizeStageDetail(context.detail),
            expectedNextStages: TURN_ALLOWED_TRANSITIONS[from]
        });
        return from;
    }
    debugLog('[ThreadTurn] stage', {
        turnId: context.turnId,
        threadId: context.threadId,
        provider: context.provider,
        from,
        to,
        detail: sanitizeStageDetail(context.detail),
        transitionExpected
    });
    return to;
};

export const isTerminalTurnStage = (stage?: TurnStage | string): boolean => {
    if (!stage) return false;
    return TERMINAL_TURN_STAGES.has(stage as TurnStage);
};

export const createTurnStageTracker = (input: TurnStageTrackerInput): TurnStageTracker => {
    let currentStage: TurnStage = input.initialStage ?? TURN_STAGES.START;
    let currentProvider: AIProviderType | undefined = input.provider;

    const emitState = () => {
        input.onStateChange?.({
            stage: currentStage,
            provider: currentProvider
        });
    };

    return {
        getStage: () => currentStage,
        getProvider: () => currentProvider,
        setProvider: (provider?: AIProviderType) => {
            if (currentProvider === provider) return;
            currentProvider = provider;
            emitState();
        },
        advance: (next: TurnStage, detail?: string): TurnStage => {
            const transitioned = logTurnStageTransition(currentStage, next, {
                turnId: input.turnId,
                threadId: input.threadId,
                provider: currentProvider,
                detail
            });
            if (transitioned === currentStage) return currentStage;
            currentStage = transitioned;
            emitState();
            return currentStage;
        },
        snapshot: () => ({
            stage: currentStage,
            provider: currentProvider
        })
    };
};

export const createInFlightTurnController = (
    input: InFlightTurnControllerInput
): InFlightTurnController => {
    const initialStage = input.initialStage ?? TURN_STAGES.START;

    const writeInFlightState = (stage: TurnStage, provider?: AIProviderType): void => {
        input.inFlightTurnRef.current = {
            threadId: input.threadId,
            turnId: input.turnId,
            stage,
            provider,
            startedAt: input.startedAt
        };
    };

    const tracker = createTurnStageTracker({
        turnId: input.turnId,
        threadId: input.threadId,
        provider: input.provider,
        initialStage,
        onStateChange: ({ stage, provider }) => {
            writeInFlightState(stage, provider);
        }
    });

    writeInFlightState(initialStage, input.provider);

    const clearIfCurrent = (): void => {
        const current = input.inFlightTurnRef.current;
        if (!current) return;
        if (current.turnId !== input.turnId || current.threadId !== input.threadId) return;
        input.inFlightTurnRef.current = null;
    };

    return {
        turnId: input.turnId,
        threadId: input.threadId,
        startedAt: input.startedAt,
        getStage: tracker.getStage,
        getProvider: tracker.getProvider,
        setProvider: tracker.setProvider,
        advance: tracker.advance,
        clearIfCurrent,
        snapshot: () => ({
            threadId: input.threadId,
            turnId: input.turnId,
            stage: tracker.getStage(),
            provider: tracker.getProvider(),
            startedAt: input.startedAt
        })
    };
};

export const shouldBlockSendForThread = (
    currentThreadId: string | null | undefined,
    inFlightTurn: InFlightTurnLike | null,
    isLoading: boolean
): boolean => {
    if (isLoading) return true;
    if (!currentThreadId) return false;
    return !!inFlightTurn && inFlightTurn.threadId === currentThreadId;
};

export const shouldBlockProviderRetryForThread = (
    currentThreadId: string | null | undefined,
    inFlightTurn: InFlightTurnLike | null,
    isLoading: boolean
): boolean => {
    if (isLoading) return true;
    if (!currentThreadId) return false;
    return !!inFlightTurn && inFlightTurn.threadId === currentThreadId;
};

export const logTurnPostProcessingStage = (
    stage: TurnPostProcessingStage,
    context: TurnPostProcessingStageContext
): void => {
    debugLog('[ThreadTurn] post-processing stage', {
        turnId: context.turnId,
        threadId: context.threadId,
        provider: context.provider,
        stage,
        detail: sanitizeStageDetail(context.detail)
    });
};
