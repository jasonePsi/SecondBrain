import { initLlama, LlamaContext } from 'llama.rn';
import { ModelManager } from './ModelManager';

let context: LlamaContext | null = null;

// Simple JSON grammar (GBNF) constructed with standard strings to avoid template literal issues in tooling
const JSON_GRAMMAR =
    "root   ::= object\\n" +
    "value  ::= object | array | string | number | (\"true\" | \"false\" | \"null\") ws\\n" +
    "object ::= \"{\" ws (string \":\" ws value (\",\" ws string \":\" ws value)*)? \"}\" ws\\n" +
    "array  ::= \"[\" ws (value (\",\" ws value)*)? \"]\" ws\\n" +
    "string ::= \"\\\"\" ([^\"\\\\] | \"\\\\\" ([\"\\\\/bfnrt] | \"u\" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* \"\\\"\" ws\\n" +
    "number ::= (\"-\"? ([0-9]+) (\".\" [0-9]+)? ([eE] [-+]? [0-9]+)?) ws\\n" +
    "ws ::= ([ \\t\\n]*)\\n";

export const LLMService = {
    init: async () => {
        if (context) return context;

        // Get active model from database
        const activeModel = await ModelManager.getActiveModel();
        if (!activeModel) {
            throw new Error('No model installed. Please download a model in Settings.');
        }

        // Verify model file exists
        const isInstalled = await ModelManager.isInstalled(activeModel.model_id);
        if (!isInstalled) {
            throw new Error('Active model file not found. Please re-download in Settings.');
        }

        const path = activeModel.path;
        console.log(`Initializing LLM with model: ${activeModel.model_id} at ${path}`);

        context = await initLlama({
            model: path,
            use_mlock: true,
            n_ctx: 2048,
            n_gpu_layers: 0,
        });

        return context;
    },

    release: async () => {
        if (context) {
            await context.release();
            context = null;
        }
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
    }
};
