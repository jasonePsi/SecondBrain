import { LLMService } from './LLMService';

const MAX_OPS = 6;

type FactScope = 'thread' | 'space' | 'global';

export type ValidatedStructuredOp =
    | {
        op: 'UPSERT_FACT';
        data: {
            scope?: FactScope;
            key: string;
            value: unknown;
            unit?: string;
        };
    }
    | {
        op: 'CREATE_ACTION';
        data: {
            scope?: FactScope;
            payload: { text: string };
            schedule: { timestamp: number };
        };
    }
    | {
        op: 'UPDATE_THREAD';
        data: {
            title?: string;
            summary?: string;
        };
    };

export interface StructuredExtractionResult {
    ops: ValidatedStructuredOp[];
    raw: string;
    parseError?: string;
}

const parseTimestamp = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const normalizeScope = (value: unknown): FactScope | undefined => {
    if (value === 'thread' || value === 'space' || value === 'global') {
        return value;
    }
    return undefined;
};

const validateOps = (input: unknown): ValidatedStructuredOp[] => {
    if (!Array.isArray(input)) return [];

    const validOps: ValidatedStructuredOp[] = [];
    for (const rawOp of input.slice(0, MAX_OPS)) {
        if (!rawOp || typeof rawOp !== 'object') continue;
        const op = (rawOp as any).op;
        const data = (rawOp as any).data;
        if (!data || typeof data !== 'object') continue;

        if (op === 'UPSERT_FACT') {
            const key = typeof data.key === 'string' ? data.key.trim() : '';
            if (!key || key.length > 80 || data.value === undefined) continue;

            const validFact: ValidatedStructuredOp = {
                op: 'UPSERT_FACT',
                data: {
                    scope: normalizeScope(data.scope),
                    key,
                    value: data.value
                }
            };
            if (typeof data.unit === 'string' && data.unit.trim().length > 0) {
                validFact.data.unit = data.unit.trim().slice(0, 24);
            }
            validOps.push(validFact);
            continue;
        }

        if (op === 'CREATE_ACTION') {
            const text = typeof data?.payload?.text === 'string'
                ? data.payload.text.trim()
                : '';
            const timestamp = parseTimestamp(data?.schedule?.timestamp);
            if (!text || !timestamp) continue;

            validOps.push({
                op: 'CREATE_ACTION',
                data: {
                    scope: normalizeScope(data.scope),
                    payload: { text: text.slice(0, 180) },
                    schedule: { timestamp }
                }
            });
            continue;
        }

        if (op === 'UPDATE_THREAD') {
            const title = typeof data.title === 'string' ? data.title.trim() : '';
            const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
            if (!title && !summary) continue;

            validOps.push({
                op: 'UPDATE_THREAD',
                data: {
                    ...(title ? { title: title.slice(0, 80) } : {}),
                    ...(summary ? { summary: summary.slice(0, 1000) } : {})
                }
            });
        }
    }

    return validOps;
};

const getJsonObjectCandidate = (raw: string): string => {
    const trimmed = raw.trim();
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        return trimmed.slice(firstBrace, lastBrace + 1);
    }
    return trimmed;
};

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
        assistantMessage: string
    ): Promise<StructuredExtractionResult> => {
        const prompt = buildExtractionPrompt(userMessage, assistantMessage);
        const raw = await LLMService.process(prompt, { task: 'extraction' });
        const jsonCandidate = getJsonObjectCandidate(raw);

        try {
            const parsed = JSON.parse(jsonCandidate);
            const ops = validateOps(parsed?.ops);
            console.log('[StructuredExtraction] parsed ops', { rawLength: raw.length, opCount: ops.length });
            return { raw, ops };
        } catch (error: any) {
            console.warn('[StructuredExtraction] parse failed', { error: error?.message, raw });
            return {
                raw,
                ops: [],
                parseError: error?.message || 'Invalid JSON'
            };
        }
    }
};
