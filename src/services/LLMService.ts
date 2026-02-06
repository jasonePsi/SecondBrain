import { initLlama, LlamaContext } from 'llama.rn';
import { ModelManager } from './ModelManager';

let context: LlamaContext | null = null;
let activeModelId: string | null = null;

export type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

// Simple JSON grammar (GBNF) constructed with standard strings to avoid template literal issues in tooling
const JSON_GRAMMAR =
    "root   ::= object\\n" +
    "value  ::= object | array | string | number | (\"true\" | \"false\" | \"null\") ws\\n" +
    "object ::= \"{\" ws (string \":\" ws value (\",\" ws string \":\" ws value)*)? \"}\" ws\\n" +
    "array  ::= \"[\" ws (value (\",\" ws value)*)? \"]\" ws\\n" +
    "string ::= \"\\\"\" ([^\"\\\\] | \"\\\\\" ([\"\\\\/bfnrt] | \"u\" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* \"\\\"\" ws\\n" +
    "number ::= (\"-\"? ([0-9]+) (\".\" [0-9]+)? ([eE] [-+]? [0-9]+)?) ws\\n" +
    "ws ::= ([ \\t\\n]*)\\n";

export const sanitizeAssistantResponse = (text: string): string => {
    let cleaned = text || '';
    const tokenRegex = /<\|[^>]+?\|>/g;
    const firstTokenIndex = cleaned.search(tokenRegex);

    if (firstTokenIndex >= 0) {
        cleaned = cleaned.slice(0, firstTokenIndex);
    }

    cleaned = cleaned.replace(tokenRegex, '');

    const lines = cleaned.split('\n');
    const filtered = lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (/^-\s*\[?ask\]?:/i.test(trimmed)) return false;
        if (/^-\s*response:/i.test(trimmed)) return false;
        if (/^\[?ask\]?:/i.test(trimmed)) return false;
        if (/^response:/i.test(trimmed)) return false;
        return true;
    });

    cleaned = filtered.join('\n').replace(/\n{3,}/g, '\n\n');
    return cleaned.trim();
};

export const LLMService = {
    init: async () => {
        // Get active model from database
        const activeModel = await ModelManager.getActiveModel();
        if (!activeModel) {
            throw new Error('No model installed. Please download a model in Settings.');
        }

        if (context && activeModelId === activeModel.model_id) {
            return context;
        }

        if (context) {
            await context.release();
            context = null;
        }

        activeModelId = activeModel.model_id;

        // Verify model file exists
        const isInstalled = await ModelManager.isInstalled(activeModel.model_id);
        if (!isInstalled) {
            throw new Error('Active model file not found. Please re-download in Settings.');
        }

        const path = activeModel.path;
        console.log(`Initializing LLM with model: ${activeModel.model_id} at ${path}`);

        const nCtx = [
            'phi-3-mini',
            'phi-3.5-mini',
            'llama-3.2-3b',
            'llama-3.1-8b',
            'qwen2.5-3b',
            'qwen2.5-7b',
            'mistral-7b',
            'gemma-2-2b',
            'gemma-2-9b'
        ].includes(activeModel.model_id)
            ? 4096
            : 2048;

        context = await initLlama({
            model: path,
            use_mlock: true,
            n_ctx: nCtx,
            n_gpu_layers: 0,
        });

        return context;
    },

    release: async () => {
        if (context) {
            await context.release();
            context = null;
        }
        activeModelId = null;
    },

    process: async (prompt: string) => {
        if (!context) throw new Error('Context not initialized');

        const response = await context.completion({
            prompt,
            n_predict: 512,
            temperature: 0.2,
            grammar: JSON_GRAMMAR,
            stop: ['</s>', 'Assistant:', 'User:'],
        });

        return response.text;
    },

    // Chat method for natural language responses (no grammar constraint)
    chat: async (messages: ChatMessage[]) => {
        if (!context) throw new Error('Context not initialized');

        if (!activeModelId) {
            const activeModel = await ModelManager.getActiveModel();
            activeModelId = activeModel?.model_id || null;
        }

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
            console.warn('Failed to clear cache:', error);
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
};
