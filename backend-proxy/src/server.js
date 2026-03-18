const cors = require('cors');
const crypto = require('crypto');
const express = require('express');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const { z } = require('zod');

dotenv.config();

const toBoolean = (value, defaultValue = false) => {
    if (typeof value !== 'string') return defaultValue;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return defaultValue;
};

const config = {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    assistantModel: process.env.OPENAI_ASSISTANT_MODEL || 'gpt-5.4',
    utilityModel: process.env.OPENAI_AUX_MODEL || 'gpt-5.4-mini',
    host: process.env.OPENAI_PROXY_HOST || '0.0.0.0',
    port: Number(process.env.OPENAI_PROXY_PORT || 8787),
    requestTimeoutMs: Number(process.env.OPENAI_PROXY_REQUEST_TIMEOUT_MS || 25000),
    defaultPrivacyMode: process.env.OPENAI_PROXY_DEFAULT_PRIVACY_MODE || 'minimal',
    defaultStore: toBoolean(process.env.OPENAI_PROXY_DEFAULT_STORE, false)
};

const openai = config.openaiApiKey
    ? new OpenAI({ apiKey: config.openaiApiKey })
    : null;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
    const requestIdHeader = req.headers['x-request-id'];
    const requestId = typeof requestIdHeader === 'string' && requestIdHeader.trim().length > 0
        ? requestIdHeader.trim()
        : crypto.randomUUID();

    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
});

const allowedRoleSchema = z.enum(['system', 'user', 'assistant']);
const privacySchema = z.object({
    mode: z.string().optional(),
    store: z.boolean().optional()
}).optional();

const chatRequestSchema = z.object({
    messages: z.array(z.object({
        role: allowedRoleSchema,
        content: z.string().min(1).max(12000)
    })).min(1).max(64),
    task: z.enum(['assistant', 'summary', 'title', 'extraction', 'ranking']).optional(),
    requestId: z.string().optional(),
    privacy: privacySchema
});

const extractRequestSchema = z.object({
    prompt: z.string().min(1).max(16000),
    task: z.enum(['assistant', 'summary', 'title', 'extraction', 'ranking']).optional(),
    requestId: z.string().optional(),
    privacy: privacySchema
});

const memoryOpsSchema = z.object({
    ops: z.array(z.object({
        op: z.enum(['UPSERT_FACT', 'CREATE_ACTION', 'UPDATE_THREAD']),
        data: z.record(z.any())
    })).max(8)
});

const isRetryableStatus = (status) => [408, 429, 500, 502, 503, 504].includes(status);

const resolvePrivacy = (requestPrivacy) => {
    const privacy = requestPrivacy || {};
    return {
        mode: privacy.mode || config.defaultPrivacyMode,
        store: privacy.store === undefined ? config.defaultStore : Boolean(privacy.store)
    };
};

const withTimeout = async (promise, timeoutMs, label) => {
    let timeoutHandle = null;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
    }
};

const executeWithRetry = async (requestId, operation, options = {}) => {
    const retries = options.retries ?? 1;
    const operationName = options.operationName || 'openai_call';
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await withTimeout(operation(), config.requestTimeoutMs, operationName);
        } catch (error) {
            const status = error && typeof error === 'object' ? error.status : undefined;
            const retryable = status === undefined || isRetryableStatus(status);
            const shouldRetry = retryable && attempt < retries;

            lastError = error;
            console.warn('[openai-proxy] request failed', {
                requestId,
                operation: operationName,
                attempt,
                status,
                retryable,
                message: error?.message
            });

            if (!shouldRetry) break;
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
    }

    throw lastError || new Error('OpenAI request failed');
};

const selectModel = (task) => {
    return task === 'assistant' ? config.assistantModel : config.utilityModel;
};

const toResponsesInput = (messages) => {
    return messages.map((message) => ({
        role: message.role,
        content: [
            {
                type: 'input_text',
                text: message.content
            }
        ]
    }));
};

const extractionJsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['ops'],
    properties: {
        ops: {
            type: 'array',
            maxItems: 8,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['op', 'data'],
                properties: {
                    op: {
                        type: 'string',
                        enum: ['UPSERT_FACT', 'CREATE_ACTION', 'UPDATE_THREAD']
                    },
                    data: {
                        type: 'object'
                    }
                }
            }
        }
    }
};

app.get('/health', (_req, res) => {
    if (!openai) {
        res.status(200).json({
            ok: false,
            configured: false,
            reason: 'OPENAI_API_KEY is not configured'
        });
        return;
    }

    res.status(200).json({
        ok: true,
        configured: true,
        assistantModel: config.assistantModel,
        utilityModel: config.utilityModel,
        privacyDefaults: {
            mode: config.defaultPrivacyMode,
            store: config.defaultStore
        }
    });
});

app.post('/v1/chat', async (req, res) => {
    if (!openai) {
        res.status(503).json({
            error: 'Cloud provider is not configured on the server',
            requestId: req.requestId
        });
        return;
    }

    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: 'Invalid chat request payload',
            requestId: req.requestId
        });
        return;
    }

    const payload = parsed.data;
    const task = payload.task || 'assistant';
    const privacy = resolvePrivacy(payload.privacy);
    const model = selectModel(task);

    try {
        const completion = await executeWithRetry(
            req.requestId,
            () => openai.responses.create({
                model,
                input: toResponsesInput(payload.messages),
                temperature: task === 'assistant' ? 0.2 : 0.1,
                max_output_tokens: task === 'assistant' ? 700 : 320,
                store: privacy.store,
                metadata: {
                    request_id: req.requestId,
                    privacy_mode: privacy.mode,
                    task
                }
            }),
            { operationName: 'chat_response' }
        );

        const text = typeof completion.output_text === 'string'
            ? completion.output_text.trim()
            : '';

        if (!text) {
            throw new Error('OpenAI returned an empty response');
        }

        res.status(200).json({
            requestId: req.requestId,
            model,
            text
        });
    } catch (error) {
        console.error('[openai-proxy] chat failed', {
            requestId: req.requestId,
            message: error?.message
        });
        res.status(502).json({
            error: 'Failed to get cloud assistant response',
            requestId: req.requestId
        });
    }
});

app.post('/v1/extract', async (req, res) => {
    if (!openai) {
        res.status(503).json({
            error: 'Cloud provider is not configured on the server',
            requestId: req.requestId
        });
        return;
    }

    const parsed = extractRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: 'Invalid extraction request payload',
            requestId: req.requestId
        });
        return;
    }

    const payload = parsed.data;
    const task = payload.task || 'extraction';
    const privacy = resolvePrivacy(payload.privacy);
    const model = selectModel(task);

    try {
        const response = await executeWithRetry(
            req.requestId,
            () => openai.responses.create({
                model,
                input: [
                    {
                        role: 'system',
                        content: [
                            {
                                type: 'input_text',
                                text: 'Extract structured memory operations and return strict JSON matching the schema.'
                            }
                        ]
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'input_text',
                                text: payload.prompt
                            }
                        ]
                    }
                ],
                text: {
                    format: {
                        type: 'json_schema',
                        name: 'memory_ops',
                        schema: extractionJsonSchema,
                        strict: true
                    }
                },
                temperature: 0,
                max_output_tokens: 700,
                store: privacy.store,
                metadata: {
                    request_id: req.requestId,
                    privacy_mode: privacy.mode,
                    task
                }
            }),
            { operationName: 'extract_response' }
        );

        const raw = typeof response.output_text === 'string'
            ? response.output_text.trim()
            : '';

        if (!raw) {
            throw new Error('OpenAI extraction response was empty');
        }

        const parsedJson = JSON.parse(raw);
        const validated = memoryOpsSchema.parse(parsedJson);

        res.status(200).json({
            requestId: req.requestId,
            model,
            json: validated
        });
    } catch (error) {
        console.error('[openai-proxy] extract failed', {
            requestId: req.requestId,
            message: error?.message
        });
        res.status(502).json({
            error: 'Failed to extract structured memory ops',
            requestId: req.requestId
        });
    }
});

app.use((error, req, res, _next) => {
    console.error('[openai-proxy] unhandled error', {
        requestId: req.requestId,
        message: error?.message
    });

    res.status(500).json({
        error: 'Internal proxy error',
        requestId: req.requestId
    });
});

app.listen(config.port, config.host, () => {
    console.log('[openai-proxy] listening', {
        host: config.host,
        port: config.port,
        assistantModel: config.assistantModel,
        utilityModel: config.utilityModel,
        configured: Boolean(config.openaiApiKey)
    });
});
