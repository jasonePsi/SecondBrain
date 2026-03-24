export interface InstalledModelLike {
    model_id: string;
}

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
