export interface ModelConfig {
    id: string;
    name: string;
    description: string;
    url: string;
    filename: string;
    sizeBytes: number;
    category: 'fast' | 'smart';
    batteryImpact: 'low' | 'medium' | 'high';
    speedRating: number; // 1-5
    qualityRating: number; // 1-5
}

export const MODELS: Record<string, ModelConfig> = {
    'llama-3.2-1b': {
        id: 'llama-3.2-1b',
        name: 'Llama 3.2 1B',
        description: 'Fast & efficient for everyday use',
        url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        sizeBytes: 800_000_000, // ~0.8 GB
        category: 'fast',
        batteryImpact: 'low',
        speedRating: 5,
        qualityRating: 3
    },
    'llama-3.2-3b': {
        id: 'llama-3.2-3b',
        name: 'Llama 3.2 3B',
        description: 'Better quality while staying fast',
        url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
        filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
        sizeBytes: 1_900_000_000, // ~1.9 GB
        category: 'fast',
        batteryImpact: 'medium',
        speedRating: 4,
        qualityRating: 4
    },
    'gemma-2-2b': {
        id: 'gemma-2-2b',
        name: 'Gemma 2 2B IT',
        description: 'Compact but capable',
        url: 'https://huggingface.co/bartowski/Gemma-2-2B-it-GGUF/resolve/main/Gemma-2-2B-it-Q4_K_M.gguf',
        filename: 'Gemma-2-2B-it-Q4_K_M.gguf',
        sizeBytes: 1_600_000_000, // ~1.6 GB
        category: 'fast',
        batteryImpact: 'low',
        speedRating: 4,
        qualityRating: 4
    },
    'phi-3-mini': {
        id: 'phi-3-mini',
        name: 'Phi-3 Mini 4K',
        description: 'Smarter responses, better reasoning',
        url: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
        filename: 'Phi-3-mini-4k-instruct-q4.gguf',
        sizeBytes: 2_200_000_000, // ~2.2 GB
        category: 'smart',
        batteryImpact: 'medium',
        speedRating: 3,
        qualityRating: 5
    },
    'phi-3.5-mini': {
        id: 'phi-3.5-mini',
        name: 'Phi-3.5 Mini',
        description: 'Sharper than Phi-3 Mini',
        url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
        filename: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
        sizeBytes: 2_700_000_000, // ~2.7 GB
        category: 'smart',
        batteryImpact: 'medium',
        speedRating: 3,
        qualityRating: 5
    },
    'qwen2.5-3b': {
        id: 'qwen2.5-3b',
        name: 'Qwen 2.5 3B',
        description: 'Strong bilingual reasoning',
        url: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf',
        filename: 'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
        sizeBytes: 1_800_000_000, // ~1.8 GB
        category: 'fast',
        batteryImpact: 'medium',
        speedRating: 4,
        qualityRating: 4
    },
    'qwen2.5-7b': {
        id: 'qwen2.5-7b',
        name: 'Qwen 2.5 7B',
        description: 'High quality, slower',
        url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
        filename: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
        sizeBytes: 4_700_000_000, // ~4.7 GB
        category: 'smart',
        batteryImpact: 'high',
        speedRating: 2,
        qualityRating: 5
    },
    'mistral-7b': {
        id: 'mistral-7b',
        name: 'Mistral 7B v0.3',
        description: 'Solid general-purpose model',
        url: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
        filename: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
        sizeBytes: 4_400_000_000, // ~4.4 GB
        category: 'smart',
        batteryImpact: 'high',
        speedRating: 2,
        qualityRating: 4
    },
    'llama-3.1-8b': {
        id: 'llama-3.1-8b',
        name: 'Llama 3.1 8B',
        description: 'Best quality on-device (slower)',
        url: 'https://huggingface.co/bartowski/Llama-3.1-8B-Instruct-GGUF/resolve/main/Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        filename: 'Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        sizeBytes: 4_900_000_000, // ~4.9 GB
        category: 'smart',
        batteryImpact: 'high',
        speedRating: 2,
        qualityRating: 5
    },
    'gemma-2-9b': {
        id: 'gemma-2-9b',
        name: 'Gemma 2 9B IT',
        description: 'High quality, very heavy',
        url: 'https://huggingface.co/bartowski/Gemma-2-9B-it-GGUF/resolve/main/Gemma-2-9B-it-Q4_K_M.gguf',
        filename: 'Gemma-2-9B-it-Q4_K_M.gguf',
        sizeBytes: 5_700_000_000, // ~5.7 GB
        category: 'smart',
        batteryImpact: 'high',
        speedRating: 1,
        qualityRating: 5
    }
};

export const getModelById = (id: string): ModelConfig | undefined => {
    return MODELS[id];
};

export const getAllModels = (): ModelConfig[] => {
    return Object.values(MODELS);
};

export const getRecommendedModel = (availableStorageBytes: number): ModelConfig => {
    // Recommend based on storage budget
    if (availableStorageBytes < 3_000_000_000) {
        return MODELS['llama-3.2-1b'];
    }
    if (availableStorageBytes < 6_000_000_000) {
        return MODELS['llama-3.2-3b'];
    }
    if (availableStorageBytes < 10_000_000_000) {
        return MODELS['phi-3.5-mini'];
    }
    return MODELS['llama-3.1-8b'];
};
