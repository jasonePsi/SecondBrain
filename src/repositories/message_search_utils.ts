const tokenizeQuery = (query: string): string[] => {
    return query
        .trim()
        .split(/\s+/)
        .map((token) => token.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase())
        .filter((token) => token.length >= 2);
};

export const buildFtsMatchQuery = (query: string): string => {
    const tokens = tokenizeQuery(query).slice(0, 8);
    if (tokens.length === 0) {
        return '';
    }
    return tokens.map((token) => `${token}*`).join(' OR ');
};

export const buildMessageSnippet = (text: string, maxChars = 140): string => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
};
