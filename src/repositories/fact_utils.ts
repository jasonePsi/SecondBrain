import { normalizeNullableString, safeJsonParse, stableJsonStringify } from './json_utils';

export const normalizeFactComparable = (
    value: unknown,
    unit?: string | null
): { normalizedValue: string; normalizedUnit: string | null } => {
    return {
        normalizedValue: stableJsonStringify(value),
        normalizedUnit: normalizeNullableString(unit)
    };
};

export const hasFactChanged = (params: {
    latestValueJson: string;
    latestUnit?: string | null;
    nextValue: unknown;
    nextUnit?: string | null;
}): boolean => {
    const latestParsedValue = safeJsonParse(params.latestValueJson, params.latestValueJson);
    const latestComparable = normalizeFactComparable(latestParsedValue, params.latestUnit);
    const nextComparable = normalizeFactComparable(params.nextValue, params.nextUnit);

    return (
        latestComparable.normalizedValue !== nextComparable.normalizedValue ||
        latestComparable.normalizedUnit !== nextComparable.normalizedUnit
    );
};
