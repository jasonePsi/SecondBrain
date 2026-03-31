import { AIConfig } from '../constants/AIConfig';
import { AppSettingsRepo } from '../repositories/app_settings_repo';
import { sanitizeAssistantResponse } from './ai/sanitize';
import type {
    AIProviderStatus,
    AIProviderType,
    AIRequestOptions,
    ChatMessage
} from './ai/types';
import { resolveProviderFromSetting } from './ai/provider_selection';
import { LocalLlamaProvider } from './providers/LocalLlamaProvider';
import { OpenAIProxyProvider } from './providers/OpenAIProxyProvider';
import { debugLog } from './runtime_log.ts';

const ACTIVE_AI_PROVIDER_KEY = 'active_ai_provider';

const localProvider = new LocalLlamaProvider();
const cloudProvider = new OpenAIProxyProvider();

const providerMap = {
    local: localProvider,
    cloud: cloudProvider
} as const;

let inFlightRequests = 0;
let deferredReleaseRequested = false;
let releaseInProgress: Promise<void> | null = null;

const getProviderImplByType = (providerType: AIProviderType) => {
    return providerMap[providerType];
};

const releaseProviders = async (): Promise<void> => {
    await Promise.all([
        localProvider.release(),
        cloudProvider.release()
    ]);
};

const runReleaseNow = async (reason: 'direct' | 'deferred'): Promise<void> => {
    if (releaseInProgress) {
        await releaseInProgress;
        return;
    }

    releaseInProgress = (async () => {
        debugLog('[LLMService] releasing providers', {
            reason,
            inFlightRequests
        });
        await releaseProviders();
    })().finally(() => {
        releaseInProgress = null;
    });

    await releaseInProgress;
};

const flushDeferredReleaseIfIdle = async (): Promise<void> => {
    if (!deferredReleaseRequested || inFlightRequests > 0) return;
    deferredReleaseRequested = false;
    await runReleaseNow('deferred');
};

const withTrackedProviderRequest = async <T>(
    context: {
        provider: AIProviderType;
        task: string;
        requestId?: string;
    },
    action: () => Promise<T>
): Promise<T> => {
    inFlightRequests += 1;
    debugLog('[LLMService] request started', {
        provider: context.provider,
        task: context.task,
        requestId: context.requestId,
        inFlightRequests
    });

    try {
        return await action();
    } finally {
        inFlightRequests = Math.max(0, inFlightRequests - 1);
        debugLog('[LLMService] request finished', {
            provider: context.provider,
            task: context.task,
            requestId: context.requestId,
            inFlightRequests,
            deferredReleaseRequested
        });

        if (inFlightRequests === 0 && deferredReleaseRequested) {
            try {
                await flushDeferredReleaseIfIdle();
            } catch (error) {
                console.warn('[LLMService] deferred release failed', {
                    message: toSafeErrorMessage(error, 'Deferred release failed')
                });
            }
        }
    }
};

const getStoredProvider = async (): Promise<AIProviderType> => {
    try {
        const stored = await AppSettingsRepo.getString(ACTIVE_AI_PROVIDER_KEY);
        return resolveProviderFromSetting(stored, AIConfig.defaultProvider);
    } catch (error) {
        console.warn('[LLMService] failed to read active provider setting, using default', {
            message: toSafeErrorMessage(error, 'Provider setting lookup failed')
        });
    }
    return AIConfig.defaultProvider;
};

const persistProvider = async (provider: AIProviderType): Promise<void> => {
    await AppSettingsRepo.setString(ACTIVE_AI_PROVIDER_KEY, provider);
};

const resolveProviderType = async (preferred?: AIProviderType): Promise<AIProviderType> => {
    if (preferred) return preferred;
    return await getStoredProvider();
};

const normalizeError = (error: unknown, fallback: string): Error => {
    if (error instanceof Error) return error;
    if (typeof error === 'string' && error.trim().length > 0) {
        return new Error(error.trim());
    }
    return new Error(fallback);
};

const toSafeErrorMessage = (error: unknown, fallback: string): string => {
    return normalizeError(error, fallback).message;
};

const formatProviderStatusError = (
    status: AIProviderStatus,
    fallback: string
): string => {
    const reason = status.reason?.trim() || fallback;
    const codePrefix = status.detailCode ? `[${status.detailCode}] ` : '';
    const traceSuffix = status.requestId ? ` (trace ${status.requestId})` : '';
    return `${codePrefix}${reason}${traceSuffix}`;
};

const toStatusCheckFailureStatus = (
    provider: AIProviderType,
    error: unknown
): AIProviderStatus => {
    const message = normalizeError(
        error,
        'Provider status check failed'
    ).message;
    const detailCode = provider === 'cloud'
        ? 'CLOUD_PROVIDER_STATUS_CHECK_FAILED'
        : 'LOCAL_PROVIDER_STATUS_CHECK_FAILED';
    return {
        provider,
        label: getProviderImplByType(provider).label,
        available: false,
        configured: false,
        reason: message,
        detailCode,
        lastCheckedAt: Date.now()
    };
};

const getProviderStatusSafe = async (provider: AIProviderType): Promise<AIProviderStatus> => {
    try {
        return await getProviderImplByType(provider).getStatus();
    } catch (error) {
        const fallbackStatus = toStatusCheckFailureStatus(provider, error);
        console.warn('[LLMService] provider status check failed', {
            provider,
            detailCode: fallbackStatus.detailCode,
            reason: fallbackStatus.reason
        });
        return fallbackStatus;
    }
};

export const LLMService = {
    init: async (preferredProvider?: AIProviderType): Promise<void> => {
        const providerType = await resolveProviderType(preferredProvider);
        const status = await getProviderStatusSafe(providerType);
        if (!status.available) {
            throw new Error(
                formatProviderStatusError(
                    status,
                    providerType === 'cloud'
                        ? 'Cloud provider is unavailable'
                        : 'Local provider is unavailable'
                )
            );
        }
        const provider = getProviderImplByType(providerType);
        try {
            await provider.init();
        } catch (error) {
            throw normalizeError(
                error,
                providerType === 'cloud'
                    ? 'Failed to initialize cloud provider'
                    : 'Failed to initialize local provider'
            );
        }
    },

    release: async (): Promise<void> => {
        if (inFlightRequests > 0) {
            deferredReleaseRequested = true;
            debugLog('[LLMService] release deferred', {
                inFlightRequests
            });
            return;
        }
        await runReleaseNow('direct');
    },

    chat: async (
        messages: ChatMessage[],
        options?: AIRequestOptions
    ): Promise<string> => {
        const providerType = await resolveProviderType(options?.provider);
        const provider = getProviderImplByType(providerType);
        debugLog('[LLMService] chat request', {
            provider: providerType,
            task: options?.task || 'assistant',
            requestId: options?.requestId,
            messageCount: messages.length
        });
        try {
            return await withTrackedProviderRequest(
                {
                    provider: providerType,
                    task: options?.task || 'assistant',
                    requestId: options?.requestId
                },
                async () => await provider.chat(messages, options)
            );
        } catch (error) {
            const normalized = normalizeError(error, 'Failed to generate assistant response');
            console.warn('[LLMService] chat failed', {
                provider: providerType,
                task: options?.task || 'assistant',
                requestId: options?.requestId,
                message: normalized.message
            });
            throw normalized;
        }
    },

    process: async (
        prompt: string,
        options?: AIRequestOptions
    ): Promise<string> => {
        const providerType = await resolveProviderType(options?.provider);
        const provider = getProviderImplByType(providerType);
        debugLog('[LLMService] process request', {
            provider: providerType,
            task: options?.task || 'extraction',
            requestId: options?.requestId,
            promptChars: prompt.length
        });
        try {
            return await withTrackedProviderRequest(
                {
                    provider: providerType,
                    task: options?.task || 'extraction',
                    requestId: options?.requestId
                },
                async () => await provider.process(prompt, options)
            );
        } catch (error) {
            const normalized = normalizeError(error, 'Failed to process structured output');
            console.warn('[LLMService] process failed', {
                provider: providerType,
                task: options?.task || 'extraction',
                requestId: options?.requestId,
                message: normalized.message
            });
            throw normalized;
        }
    },

    resolveProviderForTurn: async (preferredProvider?: AIProviderType): Promise<AIProviderType> => {
        return await resolveProviderType(preferredProvider);
    },

    getActiveProvider: async (): Promise<AIProviderType> => {
        return await getStoredProvider();
    },

    setActiveProvider: async (provider: AIProviderType): Promise<void> => {
        const status = await getProviderStatusSafe(provider);
        if (!status.available) {
            throw new Error(
                formatProviderStatusError(
                    status,
                    provider === 'cloud'
                        ? 'Cloud provider is unavailable'
                        : 'Local provider is unavailable'
                )
            );
        }

        await persistProvider(provider);
        await LLMService.release();
    },

    getProviderStatus: async (provider: AIProviderType): Promise<AIProviderStatus> => {
        return await getProviderStatusSafe(provider);
    },

    listProviderStatuses: async (): Promise<AIProviderStatus[]> => {
        return await Promise.all([
            getProviderStatusSafe('local'),
            getProviderStatusSafe('cloud')
        ]);
    },

    getRuntimeState: (): {
        inFlightRequests: number;
        deferredReleaseRequested: boolean;
        releaseInProgress: boolean;
    } => {
        return {
            inFlightRequests,
            deferredReleaseRequested,
            releaseInProgress: releaseInProgress !== null
        };
    }
};

export { sanitizeAssistantResponse };
export type {
    AIProviderStatus,
    AIProviderType,
    AIRequestOptions,
    ChatMessage
} from './ai/types';
