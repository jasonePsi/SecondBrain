interface HistoryMessageLike {
    id: string;
    created_at: number;
}

export interface ThreadHistorySnapshot<T extends HistoryMessageLike> {
    messages: T[];
    loadedMessageCount: number;
    totalMessageCount: number;
    hasOlderMessages: boolean;
}

export const JUMP_HINT_TEXT = {
    OLDER: 'This message is in earlier history. Load earlier messages to jump to it.',
    MISSING: 'This message is no longer available in this thread.'
} as const;

export type JumpBehavior =
    | { kind: 'none' }
    | { kind: 'wait' }
    | { kind: 'jump'; index: number }
    | { kind: 'hint'; hint: 'older' | 'missing'; text: string };

const sortChronological = <T extends HistoryMessageLike>(messages: T[]): T[] => {
    return [...messages].sort((left, right) => {
        if (left.created_at !== right.created_at) {
            return left.created_at - right.created_at;
        }
        return left.id.localeCompare(right.id);
    });
};

const dedupeById = <T extends HistoryMessageLike>(messages: T[]): T[] => {
    const seen = new Set<string>();
    const deduped: T[] = [];

    for (const message of messages) {
        if (seen.has(message.id)) continue;
        seen.add(message.id);
        deduped.push(message);
    }

    return deduped;
};

const normalizePositiveInt = (value: number, fallback = 1): number => {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(1, Math.floor(value));
};

const normalizeNonNegativeInt = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
};

export const resolveInitialVisibleCount = (
    pageSize: number,
    targetOffset?: number | null,
    trailingContext = 8
): number => {
    const normalizedPageSize = normalizePositiveInt(pageSize);
    if (typeof targetOffset !== 'number' || !Number.isFinite(targetOffset) || targetOffset < 0) {
        return normalizedPageSize;
    }

    const normalizedTrailingContext = normalizeNonNegativeInt(trailingContext);
    return Math.max(
        normalizedPageSize,
        Math.floor(targetOffset) + normalizedTrailingContext
    );
};

export const resolveMutationRefreshVisibleCount = (
    loadedMessageCount: number,
    pageSize: number,
    trailingBuffer = 4
): number => {
    const normalizedPageSize = normalizePositiveInt(pageSize);
    const normalizedLoadedCount = normalizeNonNegativeInt(loadedMessageCount);
    const normalizedTrailingBuffer = normalizeNonNegativeInt(trailingBuffer);
    return Math.max(
        normalizedPageSize,
        normalizedLoadedCount + normalizedTrailingBuffer
    );
};

export const resolveJumpTargetIndex = <T extends { id: string }>(params: {
    messages: T[];
    targetMessageId?: string | null;
    lastJumpedMessageId?: string | null;
}): number | null => {
    const targetMessageId = params.targetMessageId;
    if (!targetMessageId || params.messages.length === 0) return null;
    if (params.lastJumpedMessageId === targetMessageId) return null;

    const targetIndex = params.messages.findIndex((message) => message.id === targetMessageId);
    if (targetIndex < 0) return null;
    return targetIndex;
};

export const resolveJumpBehavior = <T extends { id: string }>(params: {
    messages: T[];
    targetMessageId?: string | null;
    lastJumpedMessageId?: string | null;
    loadingInitialMessages: boolean;
    loadingOlderMessages: boolean;
    hasOlderMessages: boolean;
}): JumpBehavior => {
    const targetMessageId = params.targetMessageId;
    if (!targetMessageId) return { kind: 'none' };

    const targetIndex = resolveJumpTargetIndex({
        messages: params.messages,
        targetMessageId,
        lastJumpedMessageId: params.lastJumpedMessageId
    });
    if (targetIndex !== null) {
        return { kind: 'jump', index: targetIndex };
    }

    if (params.loadingInitialMessages || params.loadingOlderMessages) {
        return { kind: 'wait' };
    }

    if (params.messages.some((message) => message.id === targetMessageId)) {
        return { kind: 'wait' };
    }

    if (params.hasOlderMessages) {
        return {
            kind: 'hint',
            hint: 'older',
            text: JUMP_HINT_TEXT.OLDER
        };
    }

    return {
        kind: 'hint',
        hint: 'missing',
        text: JUMP_HINT_TEXT.MISSING
    };
};

export const buildHistorySnapshotFromNewest = <T extends HistoryMessageLike>(
    newestMessages: T[],
    totalMessageCount: number
): ThreadHistorySnapshot<T> => {
    const messages = sortChronological(dedupeById(newestMessages));
    const normalizedTotal = Math.max(
        normalizeNonNegativeInt(totalMessageCount),
        messages.length
    );
    const loadedMessageCount = messages.length;
    return {
        messages,
        loadedMessageCount,
        totalMessageCount: normalizedTotal,
        hasOlderMessages: loadedMessageCount < normalizedTotal
    };
};

export const mergeOlderHistoryBatch = <T extends HistoryMessageLike>(input: {
    existingMessages: T[];
    olderBatch: T[];
    loadedMessageCount: number;
    totalMessageCount: number;
}): ThreadHistorySnapshot<T> => {
    const chronologicalOlderBatch = sortChronological(dedupeById(input.olderBatch));
    const mergedMessages = sortChronological(
        dedupeById([...chronologicalOlderBatch, ...input.existingMessages])
    );
    const normalizedTotal = Math.max(
        normalizeNonNegativeInt(input.totalMessageCount),
        mergedMessages.length
    );
    const loadedMessageCount = Math.min(
        normalizedTotal,
        Math.max(normalizeNonNegativeInt(input.loadedMessageCount), mergedMessages.length)
    );

    return {
        messages: mergedMessages,
        loadedMessageCount,
        totalMessageCount: normalizedTotal,
        hasOlderMessages: loadedMessageCount < normalizedTotal
    };
};

export const shouldLoadOlderHistory = (params: {
    threadId: string | null | undefined;
    loadingOlderMessages: boolean;
    hasOlderMessages: boolean;
    turnInFlight?: boolean;
}): boolean => {
    if (!params.threadId) return false;
    if (params.turnInFlight) return false;
    if (params.loadingOlderMessages) return false;
    return params.hasOlderMessages;
};
