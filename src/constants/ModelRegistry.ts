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
    }
};

export const getModelById = (id: string): ModelConfig | undefined => {
    return MODELS[id];
};

export const getAllModels = (): ModelConfig[] => {
    return Object.values(MODELS);
};

export const getRecommendedModel = (availableStorageBytes: number): ModelConfig => {
    // Recommend Llama 1B if storage is tight (< 5GB)
    if (availableStorageBytes < 5_000_000_000) {
        return MODELS['llama-3.2-1b'];
    }
    return MODELS['llama-3.2-1b']; // Default to fast model
};
