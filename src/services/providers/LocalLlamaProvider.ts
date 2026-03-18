import { initLlama, LlamaContext } from 'llama.rn';
import { ModelManager } from '../ModelManager';
import { sanitizeAssistantResponse } from '../ai/sanitize';
import type {
    AIProvider,
    AIProviderStatus,
    AIRequestOptions,
    ChatMessage
} from '../ai/types';

const JSON_GRAMMAR =
    "root   ::= object\\n" +
    "value  ::= object | array | string | number | (\"true\" | \"false\" | \"null\") ws\\n" +
    "object ::= \"{\" ws (string \":\" ws value (\",\" ws string \":\" ws value)*)? \"}\" ws\\n" +
    "array  ::= \"[\" ws (value (\",\" ws value)*)? \"]\" ws\\n" +
    "string ::= \"\\\"\" ([^\"\\\\] | \"\\\\\" ([\"\\\\/bfnrt] | \"u\" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* \"\\\"\" ws\\n" +
    "number ::= (\"-\"? ([0-9]+) (\".\" [0-9]+)? ([eE] [-+]? [0-9]+)?) ws\\n" +
    "ws ::= ([ \\t\\n]*)\\n";

const LARGE_CONTEXT_MODELS = new Set([
    'phi-3-mini',
    'phi-3.5-mini',
    'llama-3.2-3b',
    'llama-3.1-8b',
    'qwen2.5-3b',
    'qwen2.5-7b',
    'mistral-7b',
    'gemma-2-2b',
    'gemma-2-9b'
]);

const getContextWindow = (modelId: string): number => {
    return LARGE_CONTEXT_MODELS.has(modelId) ? 4096 : 2048;
};

export class LocalLlamaProvider implements AIProvider {
    readonly provider = 'local' as const;
    readonly label = 'Local (On-device)';

    private context: LlamaContext | null = null;
    private activeModelId: string | null = null;

    async init(): Promise<void> {
        const activeModel = await ModelManager.getActiveModel();
        if (!activeModel) {
            throw new Error('No active local model. Install and activate a model in Settings.');
        }

        const isInstalled = await ModelManager.isInstalled(activeModel.model_id);
        if (!isInstalled) {
            throw new Error('Active local model file is missing. Re-download it in Settings.');
        }

        if (this.context && this.activeModelId === activeModel.model_id) {
            return;
        }

        await this.release();

        this.activeModelId = activeModel.model_id;
        console.log('[LocalLlamaProvider] Initializing', {
            model: activeModel.model_id,
            path: activeModel.path
        });

        this.context = await initLlama({
            model: activeModel.path,
            use_mlock: true,
            n_ctx: getContextWindow(activeModel.model_id),
            n_gpu_layers: 0
        });
    }

    async release(): Promise<void> {
        if (this.context) {
            await this.context.release();
            this.context = null;
        }
        this.activeModelId = null;
    }

    async getStatus(): Promise<AIProviderStatus> {
        const activeModel = await ModelManager.getActiveModel();
        if (!activeModel) {
            return {
                provider: this.provider,
                label: this.label,
                available: false,
                configured: false,
                reason: 'No active local model selected'
            };
        }

        const installed = await ModelManager.isInstalled(activeModel.model_id);
        if (!installed) {
            return {
                provider: this.provider,
                label: this.label,
                available: false,
                configured: true,
                reason: 'Active local model file not found'
            };
        }

        return {
            provider: this.provider,
            label: this.label,
            available: true,
            configured: true
        };
    }

    private async requireContext(): Promise<LlamaContext> {
        if (!this.context) {
            await this.init();
        }
        if (!this.context) {
            throw new Error('Local model context is not initialized');
        }
        return this.context;
    }

    async process(prompt: string, _options?: AIRequestOptions): Promise<string> {
        const context = await this.requireContext();
        const response = await context.completion({
            prompt,
            n_predict: 512,
            temperature: 0.2,
            grammar: JSON_GRAMMAR,
            stop: ['</s>', 'Assistant:', 'User:']
        });

        return response.text;
    }

    async chat(messages: ChatMessage[], _options?: AIRequestOptions): Promise<string> {
        const context = await this.requireContext();
        const normalizedMessages = messages.map((message) => {
            if (message.role !== 'assistant') return message;
            return {
                ...message,
                content: sanitizeAssistantResponse(message.content)
            };
        });

        try {
            await context.clearCache(false);
        } catch (error) {
            console.warn('[LocalLlamaProvider] Failed to clear cache', error);
        }

        const response = await context.completion({
            messages: normalizedMessages.map((message) => ({
                role: message.role,
                content: message.content
            })),
            add_generation_prompt: true,
            n_predict: 256,
            temperature: 0.2,
            top_k: 40,
            top_p: 0.9,
            min_p: 0.05,
            penalty_repeat: 1.1,
            penalty_last_n: 128,
            seed: 42
        });

        return sanitizeAssistantResponse(response.text);
    }
}
