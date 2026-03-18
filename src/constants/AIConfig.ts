import Constants from 'expo-constants';
import type { AIProviderType } from '../services/ai/types';

type ExpoExtra = {
    aiProxyBaseUrl?: string;
    aiDefaultProvider?: AIProviderType;
};

const getExpoExtra = (): ExpoExtra => {
    const configExtra = (Constants.expoConfig?.extra || {}) as ExpoExtra;
    if (configExtra && Object.keys(configExtra).length > 0) {
        return configExtra;
    }

    const legacyExtra = ((Constants as any).manifest?.extra || {}) as ExpoExtra;
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
    defaultPrivacy: {
        mode: 'minimal',
        store: false
    }
} as const;
