import { AIConfig } from '../../constants/AIConfig';
import { sanitizeAssistantResponse } from '../ai/sanitize';
import {
    toProxyErrorMessage,
    trimErrorMessage
} from './openai_proxy_error_utils';
import type {
    AIProvider,
    AIProviderStatus,
    AIRequestOptions,
    AIWorkload,
    ChatMessage
} from '../ai/types';

type ProxyHealthResponse = {
    ok?: boolean;
    configured?: boolean;
    reason?: string;
};

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

export class OpenAIProxyProvider implements AIProvider {
    readonly provider = 'cloud' as const;
    readonly label = 'OpenAI (Cloud via Proxy)';

    async init(): Promise<void> {
        const status = await this.getStatus();
        if (!status.available) {
            throw new Error(status.reason || 'Cloud provider is unavailable');
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
        const retries = options?.retries ?? 1;
        const requestId = options?.requestId || generateRequestId('cloud');
        const url = `${baseUrl}${path}`;
        const payload = {
            ...body,
            requestId,
            privacy: AIConfig.defaultPrivacy
        };

        console.log('[OpenAIProxyProvider] request', {
            path,
            requestId,
            timeoutMs
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
                    const shouldRetry = RETRYABLE_STATUS_CODES.has(response.status) && attempt < retries;
                    if (shouldRetry) {
                        await delay(300 * (attempt + 1));
                        continue;
                    }
                    const nonRetryableError = new Error(
                        toProxyErrorMessage(response.status, responseBody, requestId)
                    );
                    (nonRetryableError as any).retryable = false;
                    throw nonRetryableError;
                }

                const parsedResponse = (await response.json()) as T;
                console.log('[OpenAIProxyProvider] response', {
                    path,
                    requestId
                });
                return parsedResponse;
            } catch (error: any) {
                const isAbort = error?.name === 'AbortError';
                const isRetryable = error?.retryable !== false;
                const shouldRetry = isRetryable && attempt < retries;
                lastError = new Error(
                    isAbort
                        ? `Cloud request timed out after ${timeoutMs}ms`
                        : trimErrorMessage(error?.message || 'Cloud request failed')
                );

                if (!shouldRetry) break;
                await delay(300 * (attempt + 1));
            }
        }

        throw lastError || new Error('Cloud request failed');
    }

    async getStatus(): Promise<AIProviderStatus> {
        const baseUrl = this.getBaseUrl();
        if (!baseUrl) {
            return {
                provider: this.provider,
                label: this.label,
                available: false,
                configured: false,
                reason: 'Set EXPO_PUBLIC_AI_PROXY_BASE_URL to enable cloud provider'
            };
        }

        try {
            const response = await fetchWithTimeout(
                `${baseUrl}/health`,
                { method: 'GET', headers: { Accept: 'application/json' } },
                AIConfig.healthTimeoutMs
            );

            if (!response.ok) {
                return {
                    provider: this.provider,
                    label: this.label,
                    available: false,
                    configured: true,
                    reason: `Proxy health check failed (${response.status})`
                };
            }

            const payload = (await response.json()) as ProxyHealthResponse;
            const configured = payload.configured !== false;
            return {
                provider: this.provider,
                label: this.label,
                available: !!payload.ok && configured,
                configured,
                reason: payload.reason
            };
        } catch (error: any) {
            return {
                provider: this.provider,
                label: this.label,
                available: false,
                configured: true,
                reason: trimErrorMessage(error?.message || 'Cloud proxy unreachable')
            };
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
                retries: 1
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
                retries: 0
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
