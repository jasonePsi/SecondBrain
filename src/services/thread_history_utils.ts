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

export const resolveInitialVisibleCount = (
    pageSize: number,
    targetOffset?: number | null,
    trailingContext = 8
): number => {
    const normalizedPageSize = Math.max(1, Math.floor(pageSize));
    if (typeof targetOffset !== 'number' || !Number.isFinite(targetOffset) || targetOffset < 0) {
        return normalizedPageSize;
    }

    const normalizedTrailingContext = Math.max(0, Math.floor(trailingContext));
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
    const normalizedPageSize = Math.max(1, Math.floor(pageSize));
    const normalizedLoadedCount = Number.isFinite(loadedMessageCount)
        ? Math.max(0, Math.floor(loadedMessageCount))
        : 0;
    const normalizedTrailingBuffer = Math.max(0, Math.floor(trailingBuffer));
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

export const buildHistorySnapshotFromNewest = <T extends HistoryMessageLike>(
    newestMessages: T[],
    totalMessageCount: number
): ThreadHistorySnapshot<T> => {
    const messages = sortChronological(dedupeById(newestMessages));
    const normalizedTotal = Math.max(totalMessageCount, messages.length);
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
    const normalizedTotal = Math.max(input.totalMessageCount, mergedMessages.length);
    const loadedMessageCount = Math.min(
        normalizedTotal,
        Math.max(input.loadedMessageCount, mergedMessages.length)
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
