import type { AIProviderStatus } from '../ai/types';
import { trimErrorMessage } from './openai_proxy_error_utils.ts';

export interface ProxyHealthResponse {
    ok?: boolean;
    configured?: boolean;
    reason?: string;
    code?: string;
    requestId?: string;
}

interface CloudStatusSeed {
    provider: 'cloud';
    label: string;
    checkedAt: number;
    requestId?: string;
}

const normalizeReason = (reason: unknown): string | undefined => {
    if (typeof reason !== 'string') return undefined;
    const trimmed = reason.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

const resolveDetailCode = (
    payload: ProxyHealthResponse,
    configured: boolean,
    healthy: boolean
): string => {
    const rawCode = normalizeReason(payload.code);
    if (rawCode) return rawCode;
    if (!configured) return 'PROXY_NOT_CONFIGURED';
    if (healthy) return 'OK';
    return 'CLOUD_PROXY_HEALTH_UNHEALTHY';
};

export const missingProxyUrlStatus = (
    seed: CloudStatusSeed
): AIProviderStatus => ({
    provider: seed.provider,
    label: seed.label,
    available: false,
    configured: false,
    reason: 'Set EXPO_PUBLIC_AI_PROXY_BASE_URL to enable cloud provider',
    detailCode: 'CLOUD_PROXY_URL_MISSING',
    requestId: seed.requestId,
    lastCheckedAt: seed.checkedAt
});

export const healthHttpErrorStatus = (
    seed: CloudStatusSeed,
    httpStatus: number
): AIProviderStatus => ({
    provider: seed.provider,
    label: seed.label,
    available: false,
    configured: true,
    reason: `Proxy health check failed (${httpStatus}). Verify proxy URL and server logs.`,
    detailCode: 'CLOUD_PROXY_HEALTH_HTTP_ERROR',
    requestId: seed.requestId,
    lastCheckedAt: seed.checkedAt
});

export const invalidHealthResponseStatus = (
    seed: CloudStatusSeed,
    errorMessage?: string
): AIProviderStatus => ({
    provider: seed.provider,
    label: seed.label,
    available: false,
    configured: true,
    reason: trimErrorMessage(
        `Proxy health returned invalid JSON: ${errorMessage || 'parse failed'}`
    ),
    detailCode: 'CLOUD_PROXY_INVALID_HEALTH_RESPONSE',
    requestId: seed.requestId,
    lastCheckedAt: seed.checkedAt
});

export const mapHealthPayloadToStatus = (
    seed: CloudStatusSeed,
    payload: ProxyHealthResponse
): AIProviderStatus => {
    const configured = payload.configured !== false;
    const healthy = payload.ok === true;
    const reason = normalizeReason(payload.reason);
    const detailCode = resolveDetailCode(payload, configured, healthy);

    if (!configured) {
        return {
            provider: seed.provider,
            label: seed.label,
            available: false,
            configured: false,
            reason: reason || 'Cloud proxy is reachable but not configured (OPENAI_API_KEY missing).',
            detailCode,
            requestId: seed.requestId,
            lastCheckedAt: seed.checkedAt
        };
    }

    if (!healthy) {
        return {
            provider: seed.provider,
            label: seed.label,
            available: false,
            configured: true,
            reason: reason || 'Cloud proxy health check did not pass.',
            detailCode,
            requestId: seed.requestId,
            lastCheckedAt: seed.checkedAt
        };
    }

    return {
        provider: seed.provider,
        label: seed.label,
        available: true,
        configured: true,
        reason,
        detailCode,
        requestId: seed.requestId,
        lastCheckedAt: seed.checkedAt
    };
};

export const unreachableProxyStatus = (
    seed: CloudStatusSeed,
    errorMessage: unknown
): AIProviderStatus => ({
    provider: seed.provider,
    label: seed.label,
    available: false,
    configured: true,
    reason: trimErrorMessage(
        typeof errorMessage === 'string' && errorMessage.trim().length > 0
            ? errorMessage
            : 'Cloud proxy unreachable. Verify URL/network and that the proxy is running.'
    ),
    detailCode: 'CLOUD_PROXY_UNREACHABLE',
    requestId: seed.requestId,
    lastCheckedAt: seed.checkedAt
});
