import { Action, ActionRepo, parseActionPayload } from '../repositories/action_repo';
import { Fact, FactRepo } from '../repositories/fact_repo';
import { Message, MessageRepo } from '../repositories/message_repo';
import { ThreadRepo } from '../repositories/thread_repo';
import { safeJsonParse } from '../repositories/json_utils';
import { LLMService, sanitizeAssistantResponse } from './LLMService';
import type { AIProviderType, ChatMessage } from './LLMService';
import { RetrievedMessageHit, RetrievalService } from './RetrievalService';
import {
    clipText,
    estimateContextMessageChars,
    selectMessagesWithinCharBudget
} from './memory_context_utils';

const RECENT_MESSAGE_LIMIT = 10;
const MAX_RETRIEVED_OLDER_MESSAGES = 4;
const MAX_THREAD_FACTS = 6;
const MAX_SPACE_FACTS = 4;
const MAX_GLOBAL_FACTS = 3;
const MAX_ACTIONS = 6;
const SUMMARY_UPDATE_MIN_TOTAL_MESSAGES = 8;
const SUMMARY_UPDATE_STEP = 4;
const SUMMARY_WINDOW_MESSAGES = 20;
const MAX_MEMORY_BLOCK_CHARS = 2200;
const MAX_CONTEXT_MESSAGE_CHARS = 380;
const MAX_TOTAL_CONTEXT_CHARS = 6000;

interface BuiltMemoryBlock {
    text: string;
    rawChars: number;
    clipped: boolean;
}

const formatFactValue = (fact: Fact): string => {
    const parsed = safeJsonParse<any>(fact.value_json, fact.value_json);
    let rendered: string;
    if (parsed === null || parsed === undefined) {
        rendered = 'null';
    } else if (typeof parsed === 'string') {
        rendered = parsed;
    } else if (typeof parsed === 'number' || typeof parsed === 'boolean') {
        rendered = String(parsed);
    } else {
        rendered = JSON.stringify(parsed);
    }

    if (fact.unit) {
        return `${rendered} ${fact.unit}`.trim();
    }
    return rendered;
};

const formatActionLine = (action: Action): string => {
    const payload = parseActionPayload<{ text?: string }>(action, {});
    const text = payload.text?.trim() || action.type;
    const when = (() => {
        if (!action.scheduled_for) return 'unscheduled';
        const date = new Date(action.scheduled_for);
        if (Number.isNaN(date.getTime())) return 'unscheduled';
        return date.toISOString();
    })();
    return `[${action.type}] ${clipText(text, 80)} @ ${when}`;
};

const dedupeLatestFactsByKey = (facts: Fact[], maxItems: number): Fact[] => {
    const selected: Fact[] = [];
    const seen = new Set<string>();
    for (const fact of facts) {
        const dedupeKey = `${fact.entity_id || ''}::${fact.key}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        selected.push(fact);
        if (selected.length >= maxItems) break;
    }
    return selected;
};

const sortActionsForContext = (actions: Action[]): Action[] => {
    return [...actions].sort((left, right) => {
        const leftScheduled = left.scheduled_for ?? Number.MAX_SAFE_INTEGER;
        const rightScheduled = right.scheduled_for ?? Number.MAX_SAFE_INTEGER;
        if (leftScheduled !== rightScheduled) {
            return leftScheduled - rightScheduled;
        }
        if (left.created_at !== right.created_at) {
            return left.created_at - right.created_at;
        }
        return left.id.localeCompare(right.id);
    });
};

const toContextMessage = (message: Message): ChatMessage | null => {
    const cleaned = message.role === 'assistant'
        ? sanitizeAssistantResponse(message.text)
        : message.text;
    const normalized = clipText(cleaned.replace(/\s+/g, ' ').trim(), MAX_CONTEXT_MESSAGE_CHARS);
    if (!normalized) return null;
    return {
        role: message.role,
        content: normalized
    };
};


const buildMemoryBlock = (context: {
    summary: string | null;
    threadFacts: Fact[];
    spaceFacts: Fact[];
    globalFacts: Fact[];
    openActions: Action[];
    olderMessageHits: RetrievedMessageHit[];
}): BuiltMemoryBlock => {
    const lines: string[] = [];

    if (context.summary) {
        lines.push('Thread summary:');
        lines.push(clipText(context.summary, 650));
    }

    if (context.threadFacts.length > 0) {
        lines.push('Thread facts:');
        context.threadFacts.forEach((fact) => {
            lines.push(`- ${fact.key}: ${clipText(formatFactValue(fact), 120)}`);
        });
    }

    if (context.spaceFacts.length > 0) {
        lines.push('Space facts:');
        context.spaceFacts.forEach((fact) => {
            lines.push(`- ${fact.key}: ${clipText(formatFactValue(fact), 100)}`);
        });
    }

    if (context.globalFacts.length > 0) {
        lines.push('Global facts:');
        context.globalFacts.forEach((fact) => {
            lines.push(`- ${fact.key}: ${clipText(formatFactValue(fact), 100)}`);
        });
    }

    if (context.openActions.length > 0) {
        lines.push('Open actions:');
        context.openActions.forEach((action) => {
            lines.push(`- ${clipText(formatActionLine(action), 140)}`);
        });
    }

    if (context.olderMessageHits.length > 0) {
        lines.push('Older relevant conversation snippets:');
        context.olderMessageHits.forEach((hit) => {
            const snippet = hit.message.role === 'assistant'
                ? sanitizeAssistantResponse(hit.message.text)
                : hit.message.text;
            lines.push(`- ${hit.message.role}: ${clipText(snippet, 140)}`);
        });
    }

    const block = lines.join('\n').trim();
    const clippedBlock = clipText(block, MAX_MEMORY_BLOCK_CHARS);
    return {
        text: clippedBlock,
        rawChars: block.length,
        clipped: clippedBlock.length < block.length
    };
};

const buildSummaryPrompt = (
    existingSummary: string | null,
    latestMessages: Message[]
): ChatMessage[] => {
    const transcript = latestMessages.map((message) => {
        const cleaned = message.role === 'assistant'
            ? sanitizeAssistantResponse(message.text)
            : message.text;
        return `${message.role}: ${clipText(cleaned, 220)}`;
    }).join('\n');

    return [
        {
            role: 'system',
            content: [
                'You maintain concise conversation memory.',
                'Return only a short summary paragraph (max 120 words).',
                'Keep durable user facts, preferences, commitments, and pending tasks.',
                'Do not include markdown, bullets, or labels.'
            ].join(' ')
        },
        {
            role: 'user',
            content: [
                existingSummary ? `Previous summary:\n${clipText(existingSummary, 700)}` : 'Previous summary: (none)',
                'Latest conversation chunk:',
                transcript
            ].join('\n\n')
        }
    ];
};

export interface MemoryContextPackage {
    threadId: string;
    spaceId: string | null;
    summary: string | null;
    recentMessages: Message[];
    olderMessageHits: RetrievedMessageHit[];
    threadFacts: Fact[];
    spaceFacts: Fact[];
    globalFacts: Fact[];
    openActions: Action[];
    chatMessages: ChatMessage[];
    contextChars: number;
    droppedRecentMessages: number;
}

export interface SummaryUpdateResult {
    updated: boolean;
    summaryLength: number;
    messageCount: number;
}

interface MemoryBuildOptions {
    turnId?: string;
}

interface SummaryUpdateOptions {
    provider?: AIProviderType;
    requestId?: string;
    turnId?: string;
}

export const MemoryService = {
    buildTurnContext: async (
        threadId: string,
        userInput: string,
        options?: MemoryBuildOptions
    ): Promise<MemoryContextPackage> => {
        const thread = await ThreadRepo.get(threadId);
        if (!thread) {
            throw new Error(`Thread ${threadId} not found`);
        }

        const [recentMessages, threadFactsRaw, globalFactsRaw, threadActionsRaw] = await Promise.all([
            MessageRepo.listRecentChronological(threadId, RECENT_MESSAGE_LIMIT),
            FactRepo.list('thread', threadId),
            FactRepo.list('global', null),
            ActionRepo.listOpenByScope('thread', threadId, MAX_ACTIONS)
        ]);

        const [spaceFactsRaw, spaceActionsRaw] = thread.space_id
            ? await Promise.all([
                FactRepo.list('space', thread.space_id),
                ActionRepo.listOpenByScope('space', thread.space_id, MAX_ACTIONS)
            ])
            : [[], []];

        const recentIds = new Set(recentMessages.map((message) => message.id));
        const olderMessageHits = await RetrievalService.retrieveOlderRelevantMessages(
            threadId,
            userInput,
            {
                excludeMessageIds: recentIds,
                recentOffset: recentMessages.length,
                maxResults: MAX_RETRIEVED_OLDER_MESSAGES,
                turnId: options?.turnId
            }
        );

        const threadFacts = dedupeLatestFactsByKey(threadFactsRaw, MAX_THREAD_FACTS);
        const spaceFacts = dedupeLatestFactsByKey(spaceFactsRaw, MAX_SPACE_FACTS);
        const globalFacts = dedupeLatestFactsByKey(globalFactsRaw, MAX_GLOBAL_FACTS);
        const dedupedActions: Action[] = [];
        const seenActionIds = new Set<string>();
        for (const action of [...threadActionsRaw, ...spaceActionsRaw]) {
            if (seenActionIds.has(action.id)) continue;
            seenActionIds.add(action.id);
            dedupedActions.push(action);
        }
        const openActions = sortActionsForContext(dedupedActions).slice(0, MAX_ACTIONS);

        const memoryBlock = buildMemoryBlock({
            summary: thread.summary_text,
            threadFacts,
            spaceFacts,
            globalFacts,
            openActions,
            olderMessageHits
        });

        const baseSystemPrompt = [
            'You are a local memory-aware assistant for a personal knowledge base.',
            'Reply in the user language, be concise, and do not invent facts.',
            'If key details are missing, ask one clear follow-up question.'
        ].join(' ');

        const chatMessages: ChatMessage[] = [
            {
                role: 'system',
                content: baseSystemPrompt
            }
        ];

        let reservedChars = estimateContextMessageChars(chatMessages[0]);

        if (memoryBlock.text.length > 0) {
            chatMessages.push({
                role: 'system',
                content: memoryBlock.text
            });
            reservedChars += estimateContextMessageChars(chatMessages[1]);
        }

        const candidateContextMessages = recentMessages
            .map((message) => toContextMessage(message))
            .filter((message): message is ChatMessage => !!message);
        const recentSelection = selectMessagesWithinCharBudget(candidateContextMessages, {
            maxChars: MAX_TOTAL_CONTEXT_CHARS,
            reservedChars
        });
        recentSelection.selectedMessages.forEach((message) => {
            chatMessages.push(message);
        });

        console.log('[MemoryService] built context', {
            turnId: options?.turnId,
            threadId,
            spaceId: thread.space_id,
            summary: !!thread.summary_text,
            recentMessages: recentMessages.length,
            includedRecentMessages: recentSelection.selectedMessages.length,
            droppedRecentMessages: recentSelection.droppedCount,
            olderHits: olderMessageHits.length,
            threadFacts: threadFacts.length,
            spaceFacts: spaceFacts.length,
            globalFacts: globalFacts.length,
            openActions: openActions.length,
            memoryBlockChars: memoryBlock.text.length,
            memoryBlockRawChars: memoryBlock.rawChars,
            memoryBlockClipped: memoryBlock.clipped,
            reservedChars,
            candidateRecentMessages: candidateContextMessages.length,
            chatMessages: chatMessages.length,
            contextChars: recentSelection.usedChars,
            maxContextChars: MAX_TOTAL_CONTEXT_CHARS
        });

        return {
            threadId,
            spaceId: thread.space_id,
            summary: thread.summary_text,
            recentMessages,
            olderMessageHits,
            threadFacts,
            spaceFacts,
            globalFacts,
            openActions,
            chatMessages,
            contextChars: recentSelection.usedChars,
            droppedRecentMessages: recentSelection.droppedCount
        };
    },

    updateThreadSummaryIfNeeded: async (
        threadId: string,
        options?: SummaryUpdateOptions
    ): Promise<SummaryUpdateResult> => {
        const thread = await ThreadRepo.get(threadId);
        if (!thread) {
            return { updated: false, summaryLength: 0, messageCount: 0 };
        }

        const totalMessages = await MessageRepo.countByThread(threadId);
        if (totalMessages < SUMMARY_UPDATE_MIN_TOTAL_MESSAGES) {
            return {
                updated: false,
                summaryLength: thread.summary_text?.length || 0,
                messageCount: totalMessages
            };
        }

        const summarizedMessageCount = thread.summary_message_count || 0;
        if (totalMessages - summarizedMessageCount < SUMMARY_UPDATE_STEP) {
            return {
                updated: false,
                summaryLength: thread.summary_text?.length || 0,
                messageCount: totalMessages
            };
        }

        const recentMessages = await MessageRepo.listRecentChronological(
            threadId,
            SUMMARY_WINDOW_MESSAGES
        );
        if (recentMessages.length === 0) {
            return {
                updated: false,
                summaryLength: thread.summary_text?.length || 0,
                messageCount: totalMessages
            };
        }

        const summaryPrompt = buildSummaryPrompt(thread.summary_text, recentMessages);
        const summaryResponse = await LLMService.chat(summaryPrompt, {
            task: 'summary',
            provider: options?.provider,
            requestId: options?.requestId
        });
        const normalizedSummary = clipText(
            sanitizeAssistantResponse(summaryResponse).replace(/\s+/g, ' ').trim(),
            1200
        );

        if (!normalizedSummary) {
            return {
                updated: false,
                summaryLength: thread.summary_text?.length || 0,
                messageCount: totalMessages
            };
        }

        await ThreadRepo.update(threadId, {
            summary_text: normalizedSummary,
            summary_updated_at: Date.now(),
            summary_message_count: totalMessages
        });

        console.log('[MemoryService] summary updated', {
            turnId: options?.turnId,
            threadId,
            totalMessages,
            summaryLength: normalizedSummary.length
        });

        return {
            updated: true,
            summaryLength: normalizedSummary.length,
            messageCount: totalMessages
        };
    }
};

export const __memoryTestUtils = {
    clipText,
    selectRecentContextMessages: selectMessagesWithinCharBudget
};
