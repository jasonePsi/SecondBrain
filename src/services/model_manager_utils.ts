export interface InstalledModelLike {
    model_id: string;
}

const LOCAL_FALLBACK_ELIGIBLE_DETAIL_CODES = new Set([
    'LOCAL_MODEL_FILE_MISSING',
    'LOCAL_MODEL_NOT_SELECTED'
]);

export const resolveFallbackActiveModelId = (
    deletedWasActive: boolean,
    remainingModels: InstalledModelLike[]
): string | null => {
    if (!deletedWasActive) return null;
    if (!Array.isArray(remainingModels) || remainingModels.length === 0) return null;

    for (const candidate of remainingModels) {
        if (!candidate || typeof candidate.model_id !== 'string') {
            continue;
        }
        const trimmedId = candidate.model_id.trim();
        if (trimmedId.length === 0) {
            continue;
        }
        return trimmedId;
    }

    return null;
};

export const shouldAttemptLocalFallbackActivation = (input: {
    localProviderAvailable: boolean;
    localStatusDetailCode?: string;
    usableInstalledModelCount: number;
}): boolean => {
    if (input.localProviderAvailable) return false;
    if (!Number.isFinite(input.usableInstalledModelCount)) return false;
    if (Math.floor(input.usableInstalledModelCount) <= 0) return false;
    return LOCAL_FALLBACK_ELIGIBLE_DETAIL_CODES.has(input.localStatusDetailCode || '');
};
