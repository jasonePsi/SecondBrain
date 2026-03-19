export type ProxyErrorPayload = {
    message: string;
    code?: string;
    requestId?: string;
};

export const trimErrorMessage = (message: string, maxChars = 180): string => {
    const normalized = message.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxChars) return normalized;
    return normalized.slice(0, maxChars - 1) + '…';
};

export const parseProxyErrorPayload = (raw: string): ProxyErrorPayload | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== 'object') return null;

        const message = typeof (parsed as any).error === 'string'
            ? (parsed as any).error
            : typeof (parsed as any).message === 'string'
                ? (parsed as any).message
                : typeof (parsed as any).error?.message === 'string'
                    ? (parsed as any).error.message
                    : '';

        if (!message.trim()) return null;
        const code = typeof (parsed as any).code === 'string'
            ? (parsed as any).code
            : typeof (parsed as any).error?.code === 'string'
                ? (parsed as any).error.code
                : undefined;
        const requestId = typeof (parsed as any).requestId === 'string'
            ? (parsed as any).requestId
            : undefined;

        return {
            message: message.trim(),
            code,
            requestId
        };
    } catch {
        return {
            message: trimmed
        };
    }
};

export const toProxyErrorMessage = (
    status: number,
    rawBody: string,
    fallbackRequestId?: string
): string => {
    const parsed = parseProxyErrorPayload(rawBody);
    const base = parsed?.message || `Cloud request failed (${status})`;
    const codePrefix = parsed?.code ? `[${parsed.code}] ` : '';
    const reqId = parsed?.requestId || fallbackRequestId;
    const requestSuffix = reqId ? ` (request ${reqId})` : '';
    return trimErrorMessage(`${codePrefix}${base}${requestSuffix}`);
};
