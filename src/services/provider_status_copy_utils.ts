import type { AIProviderStatus } from './ai/types';

type DetailCode = string | undefined;

const normalizeText = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim();
};

const mapDetailCodeToUserMessage = (detailCode: DetailCode): string => {
    switch (detailCode) {
        case 'CLOUD_PROXY_URL_MISSING':
            return 'Cloud proxy URL is missing. Set EXPO_PUBLIC_AI_PROXY_BASE_URL.';
        case 'PROXY_NOT_CONFIGURED':
            return 'Cloud proxy is reachable but not configured. Add OPENAI_API_KEY on the proxy.';
        case 'CLOUD_PROXY_UNREACHABLE':
            return 'Cloud proxy is unreachable. Verify URL/network and that backend-proxy is running.';
        case 'CLOUD_PROXY_HEALTH_HTTP_ERROR':
            return 'Cloud proxy health check failed. Verify proxy URL and server status.';
        case 'CLOUD_PROXY_INVALID_HEALTH_RESPONSE':
            return 'Cloud proxy returned an invalid health response. Check backend-proxy logs.';
        case 'CLOUD_PROXY_HEALTH_UNHEALTHY':
            return 'Cloud proxy health check did not pass. Check backend-proxy status.';
        case 'CLOUD_PROVIDER_STATUS_CHECK_FAILED':
            return 'Cloud availability check failed. Verify proxy URL/network and retry.';
        case 'LOCAL_MODEL_NOT_SELECTED':
            return 'No active local model is selected. Choose one in Settings.';
        case 'LOCAL_MODEL_FILE_MISSING':
            return 'Active local model file is missing. Reinstall or switch models in Settings.';
        case 'LOCAL_PROVIDER_STATUS_CHECK_FAILED':
            return 'Local model status check failed. Open Settings and retry model setup.';
        default:
            return '';
    }
};

export const formatProviderStatusReason = (
    status?: AIProviderStatus,
    options?: {
        includeDiagnostics?: boolean;
        unknownFallback?: string;
    }
): string => {
    const includeDiagnostics = options?.includeDiagnostics !== false;
    const unknownFallback = options?.unknownFallback || 'Provider status is unknown. Tap Retry to refresh.';

    if (!status) return unknownFallback;

    const mappedReason = mapDetailCodeToUserMessage(status.detailCode);
    const explicitReason = normalizeText(status.reason);

    let base = mappedReason || explicitReason;
    if (!base) {
        if (!status.configured) {
            base = 'Provider setup is required.';
        } else if (!status.available) {
            base = 'Provider is currently unavailable.';
        } else {
            return '';
        }
    }

    if (!includeDiagnostics) return base;
    const codePrefix = status.detailCode ? `[${status.detailCode}] ` : '';
    const traceSuffix = status.requestId ? ` (trace ${status.requestId})` : '';
    return `${codePrefix}${base}${traceSuffix}`;
};

export const toUserFacingProviderMessage = (error: unknown): string => {
    const raw = error instanceof Error
        ? error.message
        : typeof error === 'string'
            ? error
            : '';
    const trimmed = raw.trim();
    if (!trimmed) {
        return 'AI is unavailable. Check provider and model setup in Settings.';
    }

    const detailCode = trimmed.match(/^\[([A-Z0-9_]+)\]/)?.[1];
    const withoutCodeAndTrace = trimmed
        .replace(/^\[[A-Z0-9_]+\]\s*/, '')
        .replace(/\s*\((trace|request) [^)]+\)\s*$/i, '')
        .trim();

    const mapped = mapDetailCodeToUserMessage(detailCode);
    if (mapped) return mapped;

    if (/timed out/i.test(withoutCodeAndTrace)) {
        return 'Cloud request timed out. Check network/proxy latency and try again.';
    }

    return withoutCodeAndTrace || 'AI is unavailable. Check provider and model setup in Settings.';
};
