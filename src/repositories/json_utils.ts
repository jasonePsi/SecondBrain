const normalizeJsonValue = (value: unknown): unknown => {
    if (value === undefined) return null;
    if (value === null) return null;
    if (Array.isArray(value)) {
        return value.map((item) => normalizeJsonValue(item));
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (typeof value === 'object') {
        const sortedEntries = Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entryValue]) => [key, normalizeJsonValue(entryValue)]);
        return Object.fromEntries(sortedEntries);
    }

    return value;
};

export const stableJsonStringify = (value: unknown): string => {
    const normalized = normalizeJsonValue(value);
    return JSON.stringify(normalized === undefined ? null : normalized);
};

export const safeJsonParse = <T>(raw: string | null | undefined, fallback: T): T => {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
};

export const normalizeNullableString = (value?: string | null): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
