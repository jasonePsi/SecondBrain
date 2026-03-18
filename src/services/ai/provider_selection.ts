import type { AIProviderType } from './types';

export const resolveProviderFromSetting = (
    storedValue: string | null | undefined,
    fallback: AIProviderType
): AIProviderType => {
    if (storedValue === 'local' || storedValue === 'cloud') {
        return storedValue;
    }
    return fallback;
};
