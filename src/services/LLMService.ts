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

const getActiveProviderImpl = async () => {
    const activeProvider = await getStoredProvider();
    return providerMap[activeProvider];
};

const normalizeError = (error: unknown, fallback: string): Error => {
    if (error instanceof Error) return error;
    if (typeof error === 'string' && error.trim().length > 0) {
        return new Error(error.trim());
    }
    return new Error(fallback);
};

export const LLMService = {
    init: async (): Promise<void> => {
        const provider = await getActiveProviderImpl();
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
        const provider = await getActiveProviderImpl();
        try {
            return await provider.chat(messages, options);
        } catch (error) {
            throw normalizeError(error, 'Failed to generate assistant response');
        }
    },

    process: async (
        prompt: string,
        options?: AIRequestOptions
    ): Promise<string> => {
        const provider = await getActiveProviderImpl();
        try {
            return await provider.process(prompt, options);
        } catch (error) {
            throw normalizeError(error, 'Failed to process structured output');
        }
    },

    getActiveProvider: async (): Promise<AIProviderType> => {
        return await getStoredProvider();
    },

    setActiveProvider: async (provider: AIProviderType): Promise<void> => {
        const targetProvider = providerMap[provider];
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
        return await providerMap[provider].getStatus();
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
