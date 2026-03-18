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

const ACTIVE_AI_PROVIDER_KEY = 'active_ai_provider';

const localProvider = new LocalLlamaProvider();
const cloudProvider = new OpenAIProxyProvider();

const providerMap = {
    local: localProvider,
    cloud: cloudProvider
} as const;

const getProviderImplByType = (providerType: AIProviderType) => {
    return providerMap[providerType];
};

const getStoredProvider = async (): Promise<AIProviderType> => {
    try {
        const stored = await AppSettingsRepo.getString(ACTIVE_AI_PROVIDER_KEY);
        return resolveProviderFromSetting(stored, AIConfig.defaultProvider);
    } catch (error) {
        console.warn('[LLMService] Failed to read active provider setting, using default', error);
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

export const LLMService = {
    init: async (preferredProvider?: AIProviderType): Promise<void> => {
        const providerType = await resolveProviderType(preferredProvider);
        const provider = getProviderImplByType(providerType);
        await provider.init();
    },

    release: async (): Promise<void> => {
        await Promise.all([
            localProvider.release(),
            cloudProvider.release()
        ]);
    },

    chat: async (
        messages: ChatMessage[],
        options?: AIRequestOptions
    ): Promise<string> => {
        const providerType = await resolveProviderType(options?.provider);
        const provider = getProviderImplByType(providerType);
        console.log('[LLMService] chat request', {
            provider: providerType,
            task: options?.task || 'assistant',
            requestId: options?.requestId,
            messageCount: messages.length
        });
        try {
            return await provider.chat(messages, options);
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
        console.log('[LLMService] process request', {
            provider: providerType,
            task: options?.task || 'extraction',
            requestId: options?.requestId,
            promptChars: prompt.length
        });
        try {
            return await provider.process(prompt, options);
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
        const targetProvider = getProviderImplByType(provider);
        if (provider === 'cloud') {
            const status = await targetProvider.getStatus();
            if (!status.available) {
                throw new Error(status.reason || 'Cloud provider is unavailable');
            }
        }

        await persistProvider(provider);
        await LLMService.release();
    },

    getProviderStatus: async (provider: AIProviderType): Promise<AIProviderStatus> => {
        return await getProviderImplByType(provider).getStatus();
    },

    listProviderStatuses: async (): Promise<AIProviderStatus[]> => {
        return await Promise.all([
            localProvider.getStatus(),
            cloudProvider.getStatus()
        ]);
    }
};

export { sanitizeAssistantResponse };
export type {
    AIProviderStatus,
    AIProviderType,
    AIRequestOptions,
    ChatMessage
} from './ai/types';
