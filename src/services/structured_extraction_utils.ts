const MAX_OPS = 6;
const MAX_DIAGNOSTIC_REASONS = 12;

export type FactScope = 'thread' | 'space' | 'global';

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

export interface StructuredExtractionDiagnostics {
    rawOpsCount: number;
    acceptedOpsCount: number;
    droppedOpsCount: number;
    droppedReasons: string[];
}

export const parseTimestamp = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

export const normalizeScope = (value: unknown): FactScope | undefined => {
    if (value === 'thread' || value === 'space' || value === 'global') {
        return value;
    }
    return undefined;
};

export const validateOps = (input: unknown): {
    ops: ValidatedStructuredOp[];
    diagnostics: StructuredExtractionDiagnostics;
} => {
    if (!Array.isArray(input)) {
        return {
            ops: [],
            diagnostics: {
                rawOpsCount: 0,
                acceptedOpsCount: 0,
                droppedOpsCount: 0,
                droppedReasons: ['ops_not_array']
            }
        };
    }

    const validOps: ValidatedStructuredOp[] = [];
    const droppedReasons: string[] = [];
    const sliced = input.slice(0, MAX_OPS);

    for (const rawOp of sliced) {
        if (!rawOp || typeof rawOp !== 'object') {
            if (droppedReasons.length < MAX_DIAGNOSTIC_REASONS) droppedReasons.push('invalid_op_item');
            continue;
        }

        const op = (rawOp as any).op;
        const data = (rawOp as any).data;
        if (!data || typeof data !== 'object') {
            if (droppedReasons.length < MAX_DIAGNOSTIC_REASONS) droppedReasons.push('missing_or_invalid_data');
            continue;
        }

        if (op === 'UPSERT_FACT') {
            const key = typeof data.key === 'string' ? data.key.trim() : '';
            if (!key || key.length > 80 || data.value === undefined) {
                if (droppedReasons.length < MAX_DIAGNOSTIC_REASONS) droppedReasons.push('invalid_fact_payload');
                continue;
            }

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
            if (!text || !timestamp) {
                if (droppedReasons.length < MAX_DIAGNOSTIC_REASONS) droppedReasons.push('invalid_action_payload');
                continue;
            }

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
            if (!title && !summary) {
                if (droppedReasons.length < MAX_DIAGNOSTIC_REASONS) droppedReasons.push('invalid_thread_update_payload');
                continue;
            }

            validOps.push({
                op: 'UPDATE_THREAD',
                data: {
                    ...(title ? { title: title.slice(0, 80) } : {}),
                    ...(summary ? { summary: summary.slice(0, 1000) } : {})
                }
            });
            continue;
        }

        if (droppedReasons.length < MAX_DIAGNOSTIC_REASONS) droppedReasons.push('unsupported_op');
    }

    return {
        ops: validOps,
        diagnostics: {
            rawOpsCount: input.length,
            acceptedOpsCount: validOps.length,
            droppedOpsCount: Math.max(0, input.length - validOps.length),
            droppedReasons
        }
    };
};

export const getJsonObjectCandidate = (raw: string): string => {
    const trimmed = raw.trim();
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        return trimmed.slice(firstBrace, lastBrace + 1);
    }
    return trimmed;
};
