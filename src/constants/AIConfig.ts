import type { AIProviderType } from '../services/ai/types';

type ExpoExtra = {
    aiProxyBaseUrl?: string;
    aiDefaultProvider?: AIProviderType;
};

declare const require: undefined | ((moduleId: string) => unknown);

const loadExpoConstants = (): any | null => {
    if (typeof require !== 'function') {
        return null;
    }

    try {
        const loaded = require('expo-constants') as any;
        return loaded?.default || loaded || null;
    } catch {
        return null;
    }
};

const getExpoExtra = (): ExpoExtra => {
    const constants = loadExpoConstants();
    if (!constants) {
        return {};
    }

    const configExtra = (constants.expoConfig?.extra || {}) as ExpoExtra;
    if (configExtra && Object.keys(configExtra).length > 0) {
        return configExtra;
    }

    const legacyExtra = (constants.manifest?.extra || {}) as ExpoExtra;
    return legacyExtra || {};
};

const trimBaseUrl = (value: string | undefined): string => {
    if (!value || typeof value !== 'string') return '';
    return value.trim().replace(/\/+$/, '');
};

const expoExtra = getExpoExtra();

const defaultProvider = expoExtra.aiDefaultProvider === 'cloud'
    ? 'cloud'
    : 'local';

export const AIConfig = {
    defaultProvider,
    proxyBaseUrl: trimBaseUrl(
        process.env.EXPO_PUBLIC_AI_PROXY_BASE_URL || expoExtra.aiProxyBaseUrl
    ),
    defaultTimeoutMs: 20_000,
    healthTimeoutMs: 4_000,
    chatRetries: 1,
    extractionRetries: 0,
    defaultPrivacy: {
        mode: 'minimal',
        store: false
    }
} as const;
