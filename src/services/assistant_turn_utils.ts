import type { AIProviderType } from './ai/types';

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

const TURN_STAGE_SEQUENCE: TurnStage[] = [
    TURN_STAGES.START,
    TURN_STAGES.STOP_RECORDING,
    TURN_STAGES.PERSIST_USER_MESSAGE,
    TURN_STAGES.RESOLVE_PROVIDER,
    TURN_STAGES.INIT_PROVIDER,
    TURN_STAGES.BUILD_MEMORY_CONTEXT,
    TURN_STAGES.GENERATE_ASSISTANT_REPLY,
    TURN_STAGES.PERSIST_ASSISTANT_REPLY,
    TURN_STAGES.QUEUE_POST_PROCESSING,
    TURN_STAGES.COMPLETED
];

const TURN_STAGE_INDEX = new Map(
    TURN_STAGE_SEQUENCE.map((stage, index) => [stage, index] as const)
);

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
    if (to === TURN_STAGES.FAILED) return !isTerminalTurnStage(from);
    if (isTerminalTurnStage(from)) return false;

    const fromIndex = TURN_STAGE_INDEX.get(from);
    const toIndex = TURN_STAGE_INDEX.get(to);
    if (fromIndex === undefined || toIndex === undefined) return false;
    return toIndex >= fromIndex;
};

export const shouldResetProviderReadinessForStage = (
    stage: TurnStage | string | undefined
): boolean => {
    if (!stage) return false;
    return PROVIDER_FAILURE_STAGES.has(stage);
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
            detail: sanitizeStageDetail(context.detail)
        });
    }
    console.log('[ThreadTurn] stage', {
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

export const shouldBlockSendForThread = (
    currentThreadId: string | null | undefined,
    inFlightTurn: { threadId: string; turnId: string } | null,
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
    console.log('[ThreadTurn] post-processing stage', {
        turnId: context.turnId,
        threadId: context.threadId,
        provider: context.provider,
        stage,
        detail: sanitizeStageDetail(context.detail)
    });
};
