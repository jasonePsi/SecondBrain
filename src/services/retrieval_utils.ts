export interface RetrievalMessageLike {
    id: string;
    text: string;
    created_at: number;
}

export interface RetrievalCandidateLike extends RetrievalMessageLike {
    role?: string;
}

export const tokenize = (text: string): string[] => {
    const lower = text.toLowerCase();
    const normalized = lower
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return [];

    const seen = new Set<string>();
    const tokens: string[] = [];
    for (const token of normalized.split(' ')) {
        if (token.length < 3) continue;
        if (seen.has(token)) continue;
        seen.add(token);
        tokens.push(token);
        if (tokens.length >= 12) break;
    }
    return tokens;
};

export const scoreMessage = <T extends RetrievalMessageLike>(
    message: T,
    query: string,
    queryTokens: string[]
) => {
    const haystack = message.text.toLowerCase();
    const matchedTokens = queryTokens.filter((token) => haystack.includes(token));
    const overlap = matchedTokens.length;
    const densityScore = queryTokens.length > 0
        ? Math.round((overlap / queryTokens.length) * 20)
        : 0;
    const phraseBoost = query.length >= 8 && haystack.includes(query.toLowerCase()) ? 30 : 0;
    const recencyBoost = Math.floor(message.created_at / 1_000_000_000_000);
    const score = overlap * 100 + densityScore + phraseBoost + recencyBoost;

    return {
        message,
        score,
        overlap,
        matchedTokens
    };
};

export const rankOlderCandidates = <T extends RetrievalCandidateLike>(
    candidates: T[],
    query: string,
    queryTokens: string[],
    excludeMessageIds: Set<string>,
    maxResults: number
) => {
    const filteredCandidates: T[] = [];
    const seenIds = new Set<string>();

    for (const message of candidates) {
        if (seenIds.has(message.id)) continue;
        seenIds.add(message.id);
        if (excludeMessageIds.has(message.id)) continue;
        if (message.role === 'system') continue;
        if (message.text.trim().length === 0) continue;
        filteredCandidates.push(message);
    }

    return filteredCandidates
        .map((message) => scoreMessage(message, query, queryTokens))
        .filter((item) => item.overlap > 0)
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.message.created_at !== a.message.created_at) {
                return b.message.created_at - a.message.created_at;
            }
            return a.message.id.localeCompare(b.message.id);
        })
        .slice(0, maxResults)
        .sort((a, b) => a.message.created_at - b.message.created_at);
};
