export type ChatMessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
    role: ChatMessageRole;
    content: string;
}

export type AIProviderType = 'local' | 'cloud';

export type AIWorkload = 'assistant' | 'extraction' | 'summary' | 'title' | 'ranking';

export interface AIRequestOptions {
    task?: AIWorkload;
    timeoutMs?: number;
    requestId?: string;
    provider?: AIProviderType;
}

export interface AIProviderStatus {
    provider: AIProviderType;
    label: string;
    available: boolean;
    configured: boolean;
    reason?: string;
    detailCode?: string;
    requestId?: string;
    lastCheckedAt?: number;
}

export interface AIProvider {
    readonly provider: AIProviderType;
    readonly label: string;
    init(): Promise<void>;
    release(): Promise<void>;
    getStatus(): Promise<AIProviderStatus>;
    chat(messages: ChatMessage[], options?: AIRequestOptions): Promise<string>;
    process(prompt: string, options?: AIRequestOptions): Promise<string>;
}
