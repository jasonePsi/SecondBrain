const tokenizeQuery = (query: string): string[] => {
    return query
        .trim()
        .split(/\s+/)
        .map((token) => token.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase())
        .filter((token) => token.length >= 2);
};

const buildFocusTokens = (query: string | string[] | undefined): string[] => {
    if (!query) return [];
    if (Array.isArray(query)) {
        return query
            .map((value) => value.toLowerCase().trim())
            .filter((value) => value.length >= 2)
            .slice(0, 6);
    }
    return tokenizeQuery(query).slice(0, 6);
};

export const buildFtsMatchQuery = (query: string): string => {
    const tokens = tokenizeQuery(query).slice(0, 8);
    if (tokens.length === 0) {
        return '';
    }
    return tokens.map((token) => `${token}*`).join(' OR ');
};

export const buildMessageSnippet = (
    text: string,
    maxChars = 140,
    query?: string | string[]
): string => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxChars) return normalized;

    const lower = normalized.toLowerCase();
    const focusTokens = buildFocusTokens(query);
    const focusIndex = focusTokens.reduce((best, token) => {
        const index = lower.indexOf(token);
        if (index < 0) return best;
        if (best < 0) return index;
        return Math.min(best, index);
    }, -1);

    if (focusIndex >= 0) {
        const contextLead = Math.floor(maxChars * 0.35);
        const start = Math.max(0, focusIndex - contextLead);
        const end = Math.min(normalized.length, start + maxChars);
        const focused = normalized.slice(start, end).trim();
        const prefix = start > 0 ? '…' : '';
        const suffix = end < normalized.length ? '…' : '';
        return `${prefix}${focused}${suffix}`;
    }

    return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
};
