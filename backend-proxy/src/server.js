const cors = require('cors');
const crypto = require('crypto');
const express = require('express');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const { z } = require('zod');

dotenv.config();

const DEFAULT_PORT = 8787;
const DEFAULT_REQUEST_TIMEOUT_MS = 25000;
const MIN_REQUEST_TIMEOUT_MS = 1000;
const MAX_REQUEST_TIMEOUT_MS = 120000;
const REQUEST_ID_MAX_CHARS = 120;
const ALLOWED_PRIVACY_MODES = new Set(['minimal', 'standard', 'debug']);

const toBoolean = (value, defaultValue = false) => {
    if (typeof value !== 'string') return defaultValue;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return defaultValue;
};

const parsePositiveInteger = (value, fallback) => {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return NaN;
    return parsed;
};

const normalizeRequestId = (value) => {
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    if (!normalized) return '';
    if (normalized.length <= REQUEST_ID_MAX_CHARS) return normalized;
    return normalized.slice(0, REQUEST_ID_MAX_CHARS);
};

const normalizePrivacyMode = (value, fallbackMode) => {
    if (typeof value !== 'string') return fallbackMode;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallbackMode;
    if (!ALLOWED_PRIVACY_MODES.has(normalized)) return fallbackMode;
    return normalized;
};

const resolveConfig = (env = process.env) => ({
    openaiApiKey: env.OPENAI_API_KEY || '',
    assistantModel: env.OPENAI_ASSISTANT_MODEL || 'gpt-5.4',
    utilityModel: env.OPENAI_AUX_MODEL || 'gpt-5.4-mini',
    host: env.OPENAI_PROXY_HOST || '0.0.0.0',
    port: parsePositiveInteger(env.OPENAI_PROXY_PORT, DEFAULT_PORT),
    requestTimeoutMs: parsePositiveInteger(
        env.OPENAI_PROXY_REQUEST_TIMEOUT_MS,
        DEFAULT_REQUEST_TIMEOUT_MS
    ),
    defaultPrivacyMode: typeof env.OPENAI_PROXY_DEFAULT_PRIVACY_MODE === 'string'
        && env.OPENAI_PROXY_DEFAULT_PRIVACY_MODE.trim().length > 0
        ? env.OPENAI_PROXY_DEFAULT_PRIVACY_MODE.trim().toLowerCase()
        : 'minimal',
    defaultStore: toBoolean(env.OPENAI_PROXY_DEFAULT_STORE, false)
});

const validateConfig = (config) => {
    const errors = [];
    const warnings = [];

    if (typeof config.host !== 'string' || config.host.trim().length === 0) {
        errors.push('OPENAI_PROXY_HOST must be a non-empty host string.');
    }
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
        errors.push('OPENAI_PROXY_PORT must be an integer between 1 and 65535.');
    }
    if (
        !Number.isInteger(config.requestTimeoutMs)
        || config.requestTimeoutMs < MIN_REQUEST_TIMEOUT_MS
        || config.requestTimeoutMs > MAX_REQUEST_TIMEOUT_MS
    ) {
        errors.push(
            `OPENAI_PROXY_REQUEST_TIMEOUT_MS must be an integer between ${MIN_REQUEST_TIMEOUT_MS} and ${MAX_REQUEST_TIMEOUT_MS}.`
        );
    }
    if (typeof config.assistantModel !== 'string' || config.assistantModel.trim().length === 0) {
        errors.push('OPENAI_ASSISTANT_MODEL must be a non-empty string.');
    }
    if (typeof config.utilityModel !== 'string' || config.utilityModel.trim().length === 0) {
        errors.push('OPENAI_AUX_MODEL must be a non-empty string.');
    }
    if (
        typeof config.defaultPrivacyMode !== 'string'
        || !ALLOWED_PRIVACY_MODES.has(config.defaultPrivacyMode)
    ) {
        errors.push(
            `OPENAI_PROXY_DEFAULT_PRIVACY_MODE must be one of: ${Array.from(ALLOWED_PRIVACY_MODES).join(', ')}.`
        );
    }
    if (!config.openaiApiKey) {
        warnings.push('OPENAI_API_KEY is not configured; cloud endpoints will return PROXY_NOT_CONFIGURED.');
    }

    return { errors, warnings };
};

const isRetryableStatus = (status) => [408, 429, 500, 502, 503, 504].includes(status);

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

const selectModel = (task, config) => {
    return task === 'assistant' ? config.assistantModel : config.utilityModel;
};

const resolvePrivacy = (requestPrivacy, config) => {
    const privacy = requestPrivacy || {};
    return {
        mode: normalizePrivacyMode(privacy.mode, config.defaultPrivacyMode),
        store: privacy.store === undefined ? config.defaultStore : Boolean(privacy.store)
    };
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

const sendError = (res, status, code, message, requestId) => {
    const resolvedRequestId = requestId || crypto.randomUUID();
    const errorMessage = typeof message === 'string' && message.trim().length > 0
        ? message.replace(/\s+/g, ' ').trim().slice(0, 240)
        : 'Request failed';
    res.setHeader('x-request-id', resolvedRequestId);
    res.status(status).json({
        error: {
            code,
            message: errorMessage
        },
        requestId: resolvedRequestId
    });
};

const toValidationMessage = (zodError, fallback) => {
    const issue = zodError?.issues?.[0];
    if (!issue) return fallback;
    const path = Array.isArray(issue.path) && issue.path.length > 0
        ? issue.path.join('.')
        : 'request';
    const issueMessage = typeof issue.message === 'string' ? issue.message : 'Invalid value';
    return `${fallback}: ${path} ${issueMessage}`.trim();
};

const resolveRequestIdFromPayload = (req, res, payloadRequestId) => {
    const normalizedPayloadRequestId = normalizeRequestId(payloadRequestId);
    if (!normalizedPayloadRequestId) {
        return req.requestId;
    }

    if (req.requestIdSource === 'header') {
        if (req.requestId !== normalizedPayloadRequestId) {
            console.warn('[openai-proxy] request id mismatch', {
                requestId: req.requestId,
                payloadRequestId: normalizedPayloadRequestId
            });
        }
        return req.requestId;
    }

    req.requestId = normalizedPayloadRequestId;
    req.requestIdSource = 'body';
    res.setHeader('x-request-id', req.requestId);
    return req.requestId;
};

const allowedRoleSchema = z.enum(['system', 'user', 'assistant']);
const requestIdSchema = z.string().trim().min(1).max(REQUEST_ID_MAX_CHARS);
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
    requestId: requestIdSchema.optional(),
    privacy: privacySchema
});

const extractRequestSchema = z.object({
    prompt: z.string().min(1).max(16000),
    task: z.enum(['assistant', 'summary', 'title', 'extraction', 'ranking']).optional(),
    requestId: requestIdSchema.optional(),
    privacy: privacySchema
});

const memoryOpsSchema = z.object({
    ops: z.array(z.object({
        op: z.enum(['UPSERT_FACT', 'CREATE_ACTION', 'UPDATE_THREAD']),
        data: z.record(z.any())
    })).max(8)
});

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

const executeWithRetry = async (requestId, operation, config, options = {}) => {
    const retries = options.retries ?? 0;
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

const createServerApp = (options = {}) => {
    const config = options.config || resolveConfig();
    const configValidation = validateConfig(config);
    if (configValidation.errors.length > 0) {
        throw new Error(
            `[openai-proxy] Invalid configuration: ${configValidation.errors.join(' ')}`
        );
    }
    if (configValidation.warnings.length > 0) {
        console.warn('[openai-proxy] startup warnings', {
            warnings: configValidation.warnings
        });
    }

    const openai = options.openaiClient === undefined
        ? (config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null)
        : options.openaiClient;

    const app = express();
    app.use(cors());

    app.use((req, res, next) => {
        const requestIdHeader = normalizeRequestId(req.headers['x-request-id']);
        const requestId = requestIdHeader || crypto.randomUUID();

        req.requestId = requestId;
        req.requestIdSource = requestIdHeader ? 'header' : 'generated';
        res.setHeader('x-request-id', requestId);
        next();
    });

    app.use(express.json({ limit: '1mb' }));
    app.use((error, req, res, next) => {
        if (!(error instanceof SyntaxError) || error.status !== 400 || !('body' in error)) {
            return next(error);
        }
        sendError(
            res,
            400,
            'INVALID_JSON',
            'Malformed JSON body',
            req.requestId
        );
    });

    app.get('/health', (req, res) => {
        if (!openai) {
            res.status(200).json({
                ok: false,
                configured: false,
                code: 'PROXY_NOT_CONFIGURED',
                reason: 'OPENAI_API_KEY is not configured',
                requestId: req.requestId,
                privacyDefaults: {
                    mode: config.defaultPrivacyMode,
                    store: config.defaultStore
                },
                warnings: configValidation.warnings
            });
            return;
        }

        res.status(200).json({
            ok: true,
            configured: true,
            code: 'OK',
            requestId: req.requestId,
            assistantModel: config.assistantModel,
            utilityModel: config.utilityModel,
            privacyDefaults: {
                mode: config.defaultPrivacyMode,
                store: config.defaultStore
            },
            warnings: configValidation.warnings
        });
    });

    app.post('/v1/chat', async (req, res) => {
        if (!openai) {
            sendError(
                res,
                503,
                'PROXY_NOT_CONFIGURED',
                'Cloud provider is not configured on the server',
                req.requestId
            );
            return;
        }

        const parsed = chatRequestSchema.safeParse(req.body);
        const payloadRequestId = req.body && typeof req.body === 'object'
            ? req.body.requestId
            : undefined;
        resolveRequestIdFromPayload(req, res, payloadRequestId);
        if (!parsed.success) {
            sendError(
                res,
                400,
                'INVALID_REQUEST',
                toValidationMessage(parsed.error, 'Invalid chat request payload'),
                req.requestId
            );
            return;
        }

        const payload = parsed.data;
        resolveRequestIdFromPayload(req, res, payload.requestId);
        const task = payload.task || 'assistant';
        const privacy = resolvePrivacy(payload.privacy, config);
        const model = selectModel(task, config);
        console.log('[openai-proxy] chat request', {
            requestId: req.requestId,
            task,
            model,
            messageCount: payload.messages.length,
            privacyMode: privacy.mode,
            privacyStore: privacy.store
        });

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
                config,
                { operationName: 'chat_response', retries: 0 }
            );

            const text = typeof completion.output_text === 'string'
                ? completion.output_text.trim()
                : '';

            if (!text) {
                throw new Error('OpenAI returned an empty response');
            }

            console.log('[openai-proxy] chat success', {
                requestId: req.requestId,
                task,
                model,
                outputChars: text.length
            });
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
            sendError(
                res,
                502,
                'UPSTREAM_CHAT_FAILED',
                'Failed to get cloud assistant response',
                req.requestId
            );
        }
    });

    app.post('/v1/extract', async (req, res) => {
        if (!openai) {
            sendError(
                res,
                503,
                'PROXY_NOT_CONFIGURED',
                'Cloud provider is not configured on the server',
                req.requestId
            );
            return;
        }

        const parsed = extractRequestSchema.safeParse(req.body);
        const payloadRequestId = req.body && typeof req.body === 'object'
            ? req.body.requestId
            : undefined;
        resolveRequestIdFromPayload(req, res, payloadRequestId);
        if (!parsed.success) {
            sendError(
                res,
                400,
                'INVALID_REQUEST',
                toValidationMessage(parsed.error, 'Invalid extraction request payload'),
                req.requestId
            );
            return;
        }

        const payload = parsed.data;
        resolveRequestIdFromPayload(req, res, payload.requestId);
        const task = payload.task || 'extraction';
        const privacy = resolvePrivacy(payload.privacy, config);
        const model = selectModel(task, config);
        console.log('[openai-proxy] extract request', {
            requestId: req.requestId,
            task,
            model,
            promptChars: payload.prompt.length,
            privacyMode: privacy.mode,
            privacyStore: privacy.store
        });

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
                config,
                { operationName: 'extract_response', retries: 0 }
            );

            const raw = typeof response.output_text === 'string'
                ? response.output_text.trim()
                : '';

            if (!raw) {
                throw new Error('OpenAI extraction response was empty');
            }

            const parsedJson = JSON.parse(raw);
            const validated = memoryOpsSchema.parse(parsedJson);

            console.log('[openai-proxy] extract success', {
                requestId: req.requestId,
                task,
                model,
                opCount: Array.isArray(validated.ops) ? validated.ops.length : 0
            });
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
            sendError(
                res,
                502,
                'UPSTREAM_EXTRACT_FAILED',
                'Failed to extract structured memory ops',
                req.requestId
            );
        }
    });

    app.use((error, req, res, _next) => {
        console.error('[openai-proxy] unhandled error', {
            requestId: req.requestId,
            message: error?.message
        });

        sendError(
            res,
            500,
            'INTERNAL_PROXY_ERROR',
            'Internal proxy error',
            req.requestId
        );
    });

    return { app, config, openai };
};

const startProxyServer = (options = {}) => {
    const { app, config } = createServerApp(options);
    const server = app.listen(config.port, config.host, () => {
        console.log('[openai-proxy] listening', {
            host: config.host,
            port: config.port,
            requestTimeoutMs: config.requestTimeoutMs,
            assistantModel: config.assistantModel,
            utilityModel: config.utilityModel,
            privacyDefaultMode: config.defaultPrivacyMode,
            privacyDefaultStore: config.defaultStore,
            configured: Boolean(config.openaiApiKey)
        });
        if (!config.openaiApiKey) {
            console.warn(
                '[openai-proxy] OPENAI_API_KEY is missing. Configure it to enable cloud endpoints.'
            );
        }
    });
    return { app, server, config };
};

if (require.main === module) {
    startProxyServer();
}

module.exports = {
    createServerApp,
    startProxyServer,
    resolveConfig,
    validateConfig,
    __proxyTestUtils: {
        toBoolean,
        isRetryableStatus,
        resolvePrivacy,
        selectModel
    }
};
