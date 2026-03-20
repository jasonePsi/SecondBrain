import { LLMService } from './LLMService';
import type { AIProviderType } from './LLMService';
import {
    normalizeScope,
    parseStructuredExtractionRaw,
    parseTimestamp,
    StructuredExtractionDiagnostics,
    validateOps,
    ValidatedStructuredOp
} from './structured_extraction_utils';

export interface StructuredExtractionResult {
    ops: ValidatedStructuredOp[];
    raw: string;
    parseError?: string;
    diagnostics: StructuredExtractionDiagnostics;
}

const buildExtractionPrompt = (userMessage: string, assistantMessage: string): string => {
    return [
        'Extract structured memory ops from this turn.',
        'Return ONLY JSON object: {"ops":[...]}',
        'Allowed ops:',
        '- UPSERT_FACT data: {scope?, key, value, unit?}',
        '- CREATE_ACTION data: {scope?, payload:{text}, schedule:{timestamp}}',
        '- UPDATE_THREAD data: {title?, summary?}',
        'Rules: include ops only when explicit in conversation; do not guess.',
        'For reminders use unix ms timestamp.',
        'If nothing actionable: {"ops":[]}.',
        '',
        `User: ${userMessage}`,
        `Assistant: ${assistantMessage}`
    ].join('\n');
};

export const StructuredExtractionService = {
    extractFromTurn: async (
        userMessage: string,
        assistantMessage: string,
        options?: {
            provider?: AIProviderType;
            requestId?: string;
            turnId?: string;
        }
    ): Promise<StructuredExtractionResult> => {
        const prompt = buildExtractionPrompt(userMessage, assistantMessage);
        const raw = await LLMService.process(prompt, {
            task: 'extraction',
            provider: options?.provider,
            requestId: options?.requestId
        });
        const parsed = parseStructuredExtractionRaw(raw);
        if (parsed.parseError) {
            console.warn('[StructuredExtraction] parse failed', {
                turnId: options?.turnId,
                error: parsed.parseError,
                rawLength: raw.length
            });
        } else {
            console.log('[StructuredExtraction] parsed ops', {
                turnId: options?.turnId,
                rawLength: raw.length,
                opCount: parsed.ops.length,
                droppedOpsCount: parsed.diagnostics.droppedOpsCount,
                droppedReasons: parsed.diagnostics.droppedReasons.slice(0, 4)
            });
        }
        return {
            raw,
            ...parsed
        };
    }
};

export const __structuredExtractionTestUtils = {
    parseTimestamp,
    normalizeScope,
    validateOps,
    parseStructuredExtractionRaw,
    buildExtractionPrompt
};
