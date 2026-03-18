import { Message, MessageRepo } from '../repositories/message_repo';

const DEFAULT_RECENT_OFFSET = 12;
const DEFAULT_CANDIDATE_LIMIT = 180;
const DEFAULT_MAX_RESULTS = 4;

const tokenize = (text: string): string[] => {
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

const scoreMessage = (message: Message, query: string, queryTokens: string[]) => {
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

export interface RetrievedMessageHit {
    message: Message;
    score: number;
    matchedTokens: string[];
}

export const RetrievalService = {
    retrieveOlderRelevantMessages: async (
        threadId: string,
        query: string,
        options?: {
            excludeMessageIds?: Set<string>;
            recentOffset?: number;
            candidateLimit?: number;
            maxResults?: number;
        }
    ): Promise<RetrievedMessageHit[]> => {
        const excludeMessageIds = options?.excludeMessageIds ?? new Set<string>();
        const recentOffset = options?.recentOffset ?? DEFAULT_RECENT_OFFSET;
        const candidateLimit = options?.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
        const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;

        if (maxResults <= 0) return [];

        const queryTokens = tokenize(query);
        if (queryTokens.length === 0) {
            return [];
        }

        const olderCandidates = await MessageRepo.listOlderByThread(threadId, recentOffset, candidateLimit);
        const filteredCandidates = olderCandidates.filter((message) => {
            if (excludeMessageIds.has(message.id)) return false;
            if (message.role === 'system') return false;
            return message.text.trim().length > 0;
        });

        const ranked = filteredCandidates
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

        console.log('[RetrievalService] older retrieval', {
            threadId,
            queryTokens: queryTokens.length,
            candidates: filteredCandidates.length,
            selected: ranked.length
        });

        return ranked.map((item) => ({
            message: item.message,
            score: item.score,
            matchedTokens: item.matchedTokens
        }));
    }
};
