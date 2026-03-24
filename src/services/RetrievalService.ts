import { MessageRepo } from '../repositories/message_repo';
import type { Message } from '../repositories/message_repo';
import { rankOlderCandidates, scoreMessage, tokenize } from './retrieval_utils';

const DEFAULT_RECENT_OFFSET = 12;
const DEFAULT_CANDIDATE_LIMIT = 180;
const DEFAULT_MAX_RESULTS = 4;

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
            turnId?: string;
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
        const ranked = rankOlderCandidates(
            olderCandidates,
            query,
            queryTokens,
            excludeMessageIds,
            maxResults
        );

        console.log('[RetrievalService] older retrieval', {
            turnId: options?.turnId,
            threadId,
            queryTokens: queryTokens.length,
            candidates: olderCandidates.length,
            selected: ranked.length,
            maxResults,
            recentOffset,
            candidateLimit
        });

        return ranked.map((item) => ({
            message: item.message,
            score: item.score,
            matchedTokens: item.matchedTokens
        }));
    }
};

export const __retrievalTestUtils = {
    tokenize,
    scoreMessage,
    rankOlderCandidates
};
