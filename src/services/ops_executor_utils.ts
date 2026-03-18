export type SupportedScope = 'thread' | 'space' | 'global';

export const parseTimestamp = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

export const normalizeScope = (
    requestedScope: unknown,
    currentSpaceId?: string,
    currentThreadId?: string
): { scopeType: SupportedScope; scopeId: string | null } => {
    const validRequestedScope = (
        requestedScope === 'thread' || requestedScope === 'space' || requestedScope === 'global'
    )
        ? requestedScope
        : null;

    const scopeType: SupportedScope = validRequestedScope
        ? validRequestedScope
        : (currentThreadId ? 'thread' : currentSpaceId ? 'space' : 'global');

    if (scopeType === 'thread') {
        return { scopeType, scopeId: currentThreadId || null };
    }
    if (scopeType === 'space') {
        return { scopeType, scopeId: currentSpaceId || null };
    }
    return { scopeType, scopeId: null };
};
