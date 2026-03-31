import { AIConfig } from '../../constants/AIConfig.ts';
import { sanitizeAssistantResponse } from '../ai/sanitize.ts';
import { debugLog } from '../runtime_log.ts';
import {
    isNonRetryableProxyErrorCode,
    parseProxyErrorPayload,
    toProxyErrorMessage,
    trimErrorMessage
} from './openai_proxy_error_utils.ts';
import {
    healthHttpErrorStatus,
    invalidHealthResponseStatus,
    mapHealthPayloadToStatus,
    missingProxyUrlStatus,
    unreachableProxyStatus
} from './openai_proxy_status_utils.ts';
import type { ProxyHealthResponse } from './openai_proxy_status_utils.ts';
import type {
    AIProvider,
    AIProviderStatus,
    AIRequestOptions,
    AIWorkload,
    ChatMessage
} from '../ai/types';

type ProxyChatResponse = {
    text?: string;
    requestId?: string;
};

type ProxyExtractResponse = {
    json?: unknown;
    raw?: string;
    requestId?: string;
};

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const generateRequestId = (prefix: string): string => {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now()}_${random}`;
};

const fetchWithTimeout = async (
    url: string,
    init: RequestInit,
    timeoutMs: number
): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }
};

const readResponseTraceId = <T extends { requestId?: string }>(
    response: Response,
    body?: T
): string | undefined => {
    const bodyRequestId = typeof body?.requestId === 'string' && body.requestId.trim().length > 0
        ? body.requestId.trim()
        : undefined;
    const headerRequestId = response.headers.get('x-request-id')?.trim() || undefined;
    return bodyRequestId || headerRequestId;
};

const toSafeErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return trimErrorMessage(error.message || 'Request failed');
    }
    if (typeof error === 'string' && error.trim().length > 0) {
        return trimErrorMessage(error);
    }
    return 'Request failed';
};

export class OpenAIProxyProvider implements AIProvider {
    readonly provider = 'cloud' as const;
    readonly label = 'OpenAI (Cloud via Proxy)';

    async init(): Promise<void> {
        const status = await this.getStatus();
        if (!status.available) {
            const codePrefix = status.detailCode ? `[${status.detailCode}] ` : '';
            const reason = status.reason?.trim() || 'Cloud provider is unavailable';
            const traceSuffix = status.requestId ? ` (trace ${status.requestId})` : '';
            throw new Error(`${codePrefix}${reason}${traceSuffix}`);
        }
    }

    async release(): Promise<void> {
        // Stateless provider; no runtime resources to release.
    }

    private getBaseUrl(): string {
        return AIConfig.proxyBaseUrl;
    }

    private getTask(task?: AIWorkload): AIWorkload {
        if (!task) return 'assistant';
        return task;
    }

    private async requestJson<T>(
        path: string,
        body: Record<string, unknown>,
        options?: { timeoutMs?: number; retries?: number; requestId?: string }
    ): Promise<T> {
        const baseUrl = this.getBaseUrl();
        if (!baseUrl) {
            throw new Error('Cloud proxy URL is not configured');
        }

        const timeoutMs = options?.timeoutMs || AIConfig.defaultTimeoutMs;
        const retries = Math.max(0, options?.retries ?? 1);
        const requestId = options?.requestId || generateRequestId('cloud');
        const url = `${baseUrl}${path}`;
        const payload = {
            ...body,
            requestId,
            privacy: AIConfig.defaultPrivacy
        };

        debugLog('[OpenAIProxyProvider] request', {
            path,
            requestId,
            timeoutMs,
            privacyMode: AIConfig.defaultPrivacy.mode,
            privacyStore: AIConfig.defaultPrivacy.store
        });

        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= retries; attempt += 1) {
            try {
                const response = await fetchWithTimeout(
                    url,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-request-id': requestId
                        },
                        body: JSON.stringify(payload)
                    },
                    timeoutMs
                );

                if (!response.ok) {
                    const responseBody = await response.text();
                    const responseTraceId = response.headers.get('x-request-id')?.trim() || requestId;
                    const parsedError = parseProxyErrorPayload(responseBody);
                    const nonRetryableCode = isNonRetryableProxyErrorCode(parsedError?.code);
                    const shouldRetry = (
                        RETRYABLE_STATUS_CODES.has(response.status)
                        && !nonRetryableCode
                        && attempt < retries
                    );
                    if (shouldRetry) {
                        debugLog('[OpenAIProxyProvider] transient non-2xx response, retrying', {
                            path,
                            requestId,
                            proxyRequestId: responseTraceId,
                            status: response.status,
                            errorCode: parsedError?.code,
                            attempt,
                            retries
                        });
                        await delay(300 * (attempt + 1));
                        continue;
                    }
                    const nonRetryableError = new Error(
                        toProxyErrorMessage(response.status, responseBody, responseTraceId)
                    );
                    (nonRetryableError as any).retryable = false;
                    (nonRetryableError as any).proxyStatus = response.status;
                    (nonRetryableError as any).proxyCode = parsedError?.code;
                    (nonRetryableError as any).proxyRequestId = responseTraceId;
                    throw nonRetryableError;
                }

                let parsedResponse: T;
                try {
                    parsedResponse = (await response.json()) as T;
                } catch (error: any) {
                    const responseTraceId = response.headers.get('x-request-id')?.trim() || requestId;
                    const invalidResponseError = new Error(
                        trimErrorMessage(
                            `[CLOUD_PROXY_INVALID_RESPONSE] Cloud proxy returned invalid JSON (request ${responseTraceId})`
                        )
                    );
                    (invalidResponseError as any).retryable = false;
                    throw invalidResponseError;
                }
                const responseTraceId = readResponseTraceId(
                    response,
                    parsedResponse as { requestId?: string }
                );
                if (responseTraceId && responseTraceId !== requestId) {
                    debugLog('[OpenAIProxyProvider] request trace mismatch', {
                        path,
                        clientRequestId: requestId,
                        proxyRequestId: responseTraceId
                    });
                }
                debugLog('[OpenAIProxyProvider] response', {
                    path,
                    requestId,
                    proxyRequestId: responseTraceId
                });
                return parsedResponse;
            } catch (error: any) {
                const isAbort = error?.name === 'AbortError';
                const isRetryable = error?.retryable !== false;
                const shouldRetry = isRetryable && attempt < retries;
                const baseMessage = isAbort
                    ? `Cloud request timed out after ${timeoutMs}ms`
                    : toSafeErrorMessage(error);
                const requestTaggedMessage = /\(request [^)]+\)\s*$/i.test(baseMessage)
                    ? baseMessage
                    : `${baseMessage} (request ${requestId})`;
                lastError = new Error(trimErrorMessage(requestTaggedMessage, 220));

                if (!shouldRetry) {
                    console.warn('[OpenAIProxyProvider] request failed', {
                        path,
                        requestId,
                        proxyRequestId: error?.proxyRequestId,
                        status: error?.proxyStatus,
                        errorCode: error?.proxyCode,
                        isAbort,
                        attempt,
                        retries,
                        message: toSafeErrorMessage(error)
                    });
                    break;
                }
                debugLog('[OpenAIProxyProvider] request attempt failed, retrying', {
                    path,
                    requestId,
                    proxyRequestId: error?.proxyRequestId,
                    status: error?.proxyStatus,
                    errorCode: error?.proxyCode,
                    isAbort,
                    attempt,
                    retries
                });
                await delay(300 * (attempt + 1));
            }
        }

        throw lastError || new Error('Cloud request failed');
    }

    async getStatus(): Promise<AIProviderStatus> {
        const baseUrl = this.getBaseUrl();
        const checkedAt = Date.now();
        const healthRequestId = generateRequestId('health');
        const statusSeed = {
            provider: this.provider,
            label: this.label,
            checkedAt
        } as const;

        if (!baseUrl) {
            return missingProxyUrlStatus(statusSeed);
        }

        try {
            const response = await fetchWithTimeout(
                `${baseUrl}/health`,
                {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        'x-request-id': healthRequestId
                    }
                },
                AIConfig.healthTimeoutMs
            );
            const responseTraceIdFromHeader = response.headers.get('x-request-id')?.trim() || healthRequestId;

            if (!response.ok) {
                console.warn('[OpenAIProxyProvider] health check non-2xx response', {
                    requestId: healthRequestId,
                    proxyRequestId: responseTraceIdFromHeader,
                    status: response.status
                });
                return healthHttpErrorStatus(
                    {
                        ...statusSeed,
                        requestId: responseTraceIdFromHeader
                    },
                    response.status
                );
            }

            let payload: ProxyHealthResponse;
            try {
                payload = (await response.json()) as ProxyHealthResponse;
            } catch (error: any) {
                console.warn('[OpenAIProxyProvider] health check invalid JSON response', {
                    requestId: healthRequestId,
                    proxyRequestId: responseTraceIdFromHeader,
                    message: error?.message
                });
                return invalidHealthResponseStatus(
                    {
                        ...statusSeed,
                        requestId: responseTraceIdFromHeader
                    },
                    error?.message || 'parse failed'
                );
            }
            const responseTraceId = readResponseTraceId(response, payload) || healthRequestId;
            return mapHealthPayloadToStatus(
                {
                    ...statusSeed,
                    requestId: responseTraceId
                },
                payload
            );
        } catch (error: any) {
            console.warn('[OpenAIProxyProvider] health check request failed', {
                requestId: healthRequestId,
                message: error?.message
            });
            return unreachableProxyStatus(
                {
                    ...statusSeed,
                    requestId: healthRequestId
                },
                error?.message || 'Cloud proxy unreachable. Verify URL/network and that the proxy is running.'
            );
        }
    }

    async chat(messages: ChatMessage[], options?: AIRequestOptions): Promise<string> {
        const result = await this.requestJson<ProxyChatResponse>(
            '/v1/chat',
            {
                task: this.getTask(options?.task),
                messages
            },
            {
                timeoutMs: options?.timeoutMs,
                requestId: options?.requestId,
                retries: AIConfig.chatRetries
            }
        );

        if (typeof result?.text !== 'string' || result.text.trim().length === 0) {
            throw new Error('Cloud provider returned an empty response');
        }

        return sanitizeAssistantResponse(result.text);
    }

    async process(prompt: string, options?: AIRequestOptions): Promise<string> {
        const result = await this.requestJson<ProxyExtractResponse>(
            '/v1/extract',
            {
                task: this.getTask(options?.task || 'extraction'),
                prompt
            },
            {
                timeoutMs: options?.timeoutMs,
                requestId: options?.requestId,
                retries: AIConfig.extractionRetries
            }
        );

        if (result && typeof result === 'object' && result.json !== undefined) {
            return JSON.stringify(result.json);
        }
        if (typeof result?.raw === 'string') {
            return result.raw;
        }

        throw new Error('Cloud extraction did not return structured JSON');
    }
}
