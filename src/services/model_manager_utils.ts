export interface InstalledModelLike {
    model_id: string;
}

export const resolveFallbackActiveModelId = (
    deletedWasActive: boolean,
    remainingModels: InstalledModelLike[]
): string | null => {
    if (!deletedWasActive) return null;
    if (!Array.isArray(remainingModels) || remainingModels.length === 0) return null;

    const candidate = remainingModels[0];
    if (!candidate || typeof candidate.model_id !== 'string' || candidate.model_id.trim().length === 0) {
        return null;
    }
    return candidate.model_id.trim();
};
