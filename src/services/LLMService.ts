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
    init: async (modelName: string) => {
        if (context) return context;

        if (!(await ModelManager.exists(modelName))) {
            throw new Error('Model not found');
        }

        const path = ModelManager.getPath(modelName);
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
