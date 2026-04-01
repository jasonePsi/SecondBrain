import type { AIProviderStatus } from './ai/types';

export type InitialRoute = '/(tabs)/spaces' | '/(tabs)/settings' | '/onboarding/model-selection';

type CloudBootstrapInput =
    | boolean
    | Pick<AIProviderStatus, 'available'>;

type LocalBootstrapInput = {
    localAvailable?: boolean;
    localStatusAvailable?: boolean;
    installedModelCount?: number;
    usableInstalledModelCount?: number;
};

const normalizeCount = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
};

const resolveCloudAvailability = (input: CloudBootstrapInput): boolean => {
    if (typeof input === 'boolean') return input;
    return input.available === true;
};

const resolveLocalAvailability = (input: LocalBootstrapInput): boolean => {
    if (typeof input.localStatusAvailable === 'boolean') {
        return input.localStatusAvailable;
    }
    return input.localAvailable === true;
};

const resolveUsableInstalledModelCount = (input: LocalBootstrapInput): number => {
    if (typeof input.usableInstalledModelCount === 'number') {
        return normalizeCount(input.usableInstalledModelCount);
    }
    return normalizeCount(input.installedModelCount);
};

export const resolveCloudProviderInitialRoute = (input: CloudBootstrapInput): InitialRoute => {
    return resolveCloudAvailability(input) ? '/(tabs)/spaces' : '/(tabs)/settings';
};

export const resolveLocalProviderInitialRoute = (params: LocalBootstrapInput): InitialRoute => {
    if (resolveLocalAvailability(params)) return '/(tabs)/spaces';
    if (resolveUsableInstalledModelCount(params) <= 0) return '/onboarding/model-selection';
    return '/(tabs)/settings';
};
