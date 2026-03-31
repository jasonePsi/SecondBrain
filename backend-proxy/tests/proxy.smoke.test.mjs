import test from 'node:test';
import assert from 'node:assert/strict';
import serverModule from '../src/server.js';

const { createServerApp, resolveConfig, validateConfig } = serverModule;
const { resolvePrivacy, selectModel, isRetryableStatus } = serverModule.__proxyTestUtils;

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

const startServer = async (options = {}) => {
  const { app } = createServerApp({
    logger: silentLogger,
    ...options
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`
  };
};

const stopServer = async (server) => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
};

test('GET /health reports unconfigured proxy when API key is missing', async (t) => {
  const config = {
    ...resolveConfig({}),
    openaiApiKey: ''
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: null });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/health`, {
    headers: {
      'x-request-id': 'qa-health-unconfigured'
    }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'qa-health-unconfigured');
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.configured, false);
  assert.equal(body.code, 'PROXY_NOT_CONFIGURED');
  assert.equal(typeof body.reason, 'string');
  assert.equal(body.requestId, 'qa-health-unconfigured');
  assert.equal(body.privacyDefaults.mode, 'minimal');
  assert.equal(body.privacyDefaults.store, false);
});

test('GET /health propagates request id and configuration details', async (t) => {
  const openaiStub = {
    responses: {
      create: async () => ({ output_text: 'ok' })
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key'
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/health`, {
    headers: {
      'x-request-id': 'qa-health-ok'
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'qa-health-ok');
  const body = await response.json();
  assert.equal(body.requestId, 'qa-health-ok');
  assert.equal(body.code, 'OK');
  assert.equal(body.ok, true);
  assert.equal(body.configured, true);
  assert.equal(body.privacyDefaults.store, false);
});

test('GET /health generates request id when header is missing', async (t) => {
  const openaiStub = {
    responses: {
      create: async () => ({ output_text: 'ok' })
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key'
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  const headerRequestId = response.headers.get('x-request-id');
  assert.equal(typeof headerRequestId, 'string');
  assert.ok(headerRequestId.length > 0);
  const body = await response.json();
  assert.equal(body.requestId, headerRequestId);
});

test('POST /v1/chat returns stable 400 error shape for invalid payload', async (t) => {
  const openaiStub = {
    responses: {
      create: async () => ({ output_text: 'ok' })
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key'
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'qa-chat-invalid'
    },
    body: JSON.stringify({ foo: 'bar' })
  });

  assert.equal(response.status, 400);
  assert.equal(response.headers.get('x-request-id'), 'qa-chat-invalid');
  const body = await response.json();
  assert.equal(body.requestId, 'qa-chat-invalid');
  assert.equal(body.error.code, 'INVALID_REQUEST');
  assert.equal(typeof body.error.message, 'string');
  assert.ok(body.error.message.startsWith('Invalid chat request payload'));
});

test('POST /v1/chat success keeps request-id trace and forwards it to OpenAI metadata', async (t) => {
  let capturedRequest = null;
  const openaiStub = {
    responses: {
      create: async (input) => {
        capturedRequest = input;
        return { output_text: 'hello from cloud' };
      }
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key'
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'qa-chat-success'
    },
    body: JSON.stringify({
      task: 'assistant',
      messages: [{ role: 'user', content: 'hello' }]
    })
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'qa-chat-success');
  const body = await response.json();
  assert.equal(body.requestId, 'qa-chat-success');
  assert.equal(body.text, 'hello from cloud');
  assert.equal(capturedRequest?.metadata?.request_id, 'qa-chat-success');
});

test('POST /v1/chat uses requestId from payload when header is missing', async (t) => {
  let capturedRequest = null;
  const openaiStub = {
    responses: {
      create: async (input) => {
        capturedRequest = input;
        return { output_text: 'hello from cloud' };
      }
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key'
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      requestId: 'qa-chat-body-only',
      task: 'assistant',
      messages: [{ role: 'user', content: 'hello' }]
    })
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'qa-chat-body-only');
  const body = await response.json();
  assert.equal(body.requestId, 'qa-chat-body-only');
  assert.equal(capturedRequest?.metadata?.request_id, 'qa-chat-body-only');
});

test('POST /v1/chat keeps header request id when header/body request ids mismatch', async (t) => {
  let capturedRequest = null;
  const openaiStub = {
    responses: {
      create: async (input) => {
        capturedRequest = input;
        return { output_text: 'hello from cloud' };
      }
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key'
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'qa-chat-header-id'
    },
    body: JSON.stringify({
      requestId: 'qa-chat-body-id',
      task: 'assistant',
      messages: [{ role: 'user', content: 'hello' }]
    })
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'qa-chat-header-id');
  const body = await response.json();
  assert.equal(body.requestId, 'qa-chat-header-id');
  assert.equal(capturedRequest?.metadata?.request_id, 'qa-chat-header-id');
});

test('POST /v1/chat applies conservative privacy defaults when request omits privacy', async (t) => {
  let capturedRequest = null;
  const openaiStub = {
    responses: {
      create: async (input) => {
        capturedRequest = input;
        return { output_text: 'ok' };
      }
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key',
    defaultPrivacyMode: 'minimal',
    defaultStore: false
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'qa-chat-default-privacy'
    },
    body: JSON.stringify({
      task: 'assistant',
      messages: [{ role: 'user', content: 'hello' }]
    })
  });

  assert.equal(response.status, 200);
  assert.equal(capturedRequest?.store, false);
  assert.equal(capturedRequest?.metadata?.privacy_mode, 'minimal');
});

test('POST /v1/chat allows explicit privacy override per request', async (t) => {
  let capturedRequest = null;
  const openaiStub = {
    responses: {
      create: async (input) => {
        capturedRequest = input;
        return { output_text: 'ok' };
      }
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key',
    defaultPrivacyMode: 'minimal',
    defaultStore: false
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'qa-chat-privacy-override'
    },
    body: JSON.stringify({
      task: 'assistant',
      messages: [{ role: 'user', content: 'hello' }],
      privacy: {
        mode: 'debug',
        store: true
      }
    })
  });

  assert.equal(response.status, 200);
  assert.equal(capturedRequest?.store, true);
  assert.equal(capturedRequest?.metadata?.privacy_mode, 'debug');
  assert.equal(capturedRequest?.metadata?.request_id, 'qa-chat-privacy-override');
});

test('POST /v1/chat upstream failure returns stable 502 error shape with trace id', async (t) => {
  const openaiStub = {
    responses: {
      create: async () => {
        throw new Error('upstream timeout');
      }
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key'
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'qa-chat-upstream-fail'
    },
    body: JSON.stringify({
      task: 'assistant',
      messages: [{ role: 'user', content: 'hello' }]
    })
  });

  assert.equal(response.status, 502);
  assert.equal(response.headers.get('x-request-id'), 'qa-chat-upstream-fail');
  const body = await response.json();
  assert.equal(body.requestId, 'qa-chat-upstream-fail');
  assert.equal(body.error.code, 'UPSTREAM_CHAT_FAILED');
  assert.equal(typeof body.error.message, 'string');
});

test('POST /v1/chat returns stable 503 error shape when proxy is not configured', async (t) => {
  const config = {
    ...resolveConfig({}),
    openaiApiKey: ''
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: null });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'hello' }]
    })
  });

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, 'PROXY_NOT_CONFIGURED');
  assert.equal(typeof body.error.message, 'string');
  assert.equal(typeof body.requestId, 'string');
  assert.ok(body.requestId.length > 0);
});

test('POST /v1/extract returns stable 400 error shape for invalid payload', async (t) => {
  const openaiStub = {
    responses: {
      create: async () => ({ output_text: '{"ops":[]}' })
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key'
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/extract`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'qa-extract-invalid'
    },
    body: JSON.stringify({ foo: 'bar' })
  });

  assert.equal(response.status, 400);
  assert.equal(response.headers.get('x-request-id'), 'qa-extract-invalid');
  const body = await response.json();
  assert.equal(body.requestId, 'qa-extract-invalid');
  assert.equal(body.error.code, 'INVALID_REQUEST');
  assert.equal(typeof body.error.message, 'string');
});

test('POST /v1/extract success keeps request-id trace and forwards it to OpenAI metadata', async (t) => {
  let capturedRequest = null;
  const openaiStub = {
    responses: {
      create: async (input) => {
        capturedRequest = input;
        return { output_text: '{"ops":[]}' };
      }
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key'
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/extract`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'qa-extract-success'
    },
    body: JSON.stringify({
      task: 'extraction',
      prompt: 'extract ops'
    })
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'qa-extract-success');
  const body = await response.json();
  assert.equal(body.requestId, 'qa-extract-success');
  assert.deepEqual(body.json, { ops: [] });
  assert.equal(capturedRequest?.metadata?.request_id, 'qa-extract-success');
});

test('POST /v1/extract uses requestId from payload when header is missing', async (t) => {
  let capturedRequest = null;
  const openaiStub = {
    responses: {
      create: async (input) => {
        capturedRequest = input;
        return { output_text: '{"ops":[]}' };
      }
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key'
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/extract`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      requestId: 'qa-extract-body-only',
      task: 'extraction',
      prompt: 'extract ops'
    })
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'qa-extract-body-only');
  const body = await response.json();
  assert.equal(body.requestId, 'qa-extract-body-only');
  assert.equal(capturedRequest?.metadata?.request_id, 'qa-extract-body-only');
});

test('POST /v1/extract keeps header request id when header/body request ids mismatch', async (t) => {
  let capturedRequest = null;
  const openaiStub = {
    responses: {
      create: async (input) => {
        capturedRequest = input;
        return { output_text: '{"ops":[]}' };
      }
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key'
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/extract`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'qa-extract-header-id'
    },
    body: JSON.stringify({
      requestId: 'qa-extract-body-id',
      task: 'extraction',
      prompt: 'extract ops'
    })
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'qa-extract-header-id');
  const body = await response.json();
  assert.equal(body.requestId, 'qa-extract-header-id');
  assert.equal(capturedRequest?.metadata?.request_id, 'qa-extract-header-id');
});

test('POST /v1/extract applies privacy defaults and allows per-request override', async (t) => {
  const capturedRequests = [];
  const openaiStub = {
    responses: {
      create: async (input) => {
        capturedRequests.push(input);
        return { output_text: '{"ops":[]}' };
      }
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key',
    defaultPrivacyMode: 'minimal',
    defaultStore: false
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const defaultResponse = await fetch(`${baseUrl}/v1/extract`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'qa-extract-default-privacy'
    },
    body: JSON.stringify({
      prompt: 'extract ops'
    })
  });

  assert.equal(defaultResponse.status, 200);
  assert.equal(capturedRequests[0]?.store, false);
  assert.equal(capturedRequests[0]?.metadata?.privacy_mode, 'minimal');

  const overrideResponse = await fetch(`${baseUrl}/v1/extract`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'qa-extract-privacy-override'
    },
    body: JSON.stringify({
      prompt: 'extract ops',
      privacy: {
        mode: 'debug',
        store: true
      }
    })
  });

  assert.equal(overrideResponse.status, 200);
  assert.equal(capturedRequests[1]?.store, true);
  assert.equal(capturedRequests[1]?.metadata?.privacy_mode, 'debug');
  assert.equal(capturedRequests[1]?.metadata?.request_id, 'qa-extract-privacy-override');
});

test('POST /v1/extract returns stable 400 INVALID_JSON for malformed JSON bodies', async (t) => {
  const openaiStub = {
    responses: {
      create: async () => ({ output_text: '{"ops":[]}' })
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key'
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/extract`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'qa-extract-invalid-json'
    },
    body: '{"prompt": '
  });

  assert.equal(response.status, 400);
  assert.equal(response.headers.get('x-request-id'), 'qa-extract-invalid-json');
  const body = await response.json();
  assert.equal(body.requestId, 'qa-extract-invalid-json');
  assert.equal(body.error.code, 'INVALID_JSON');
  assert.equal(body.error.message, 'Malformed JSON body');
});

test('POST /v1/chat returns stable 400 INVALID_JSON for malformed JSON bodies', async (t) => {
  const openaiStub = {
    responses: {
      create: async () => ({ output_text: 'ok' })
    }
  };
  const config = {
    ...resolveConfig({}),
    openaiApiKey: 'test-key'
  };
  const { server, baseUrl } = await startServer({ config, openaiClient: openaiStub });
  t.after(async () => {
    await stopServer(server);
  });

  const response = await fetch(`${baseUrl}/v1/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'qa-invalid-json'
    },
    body: '{"messages": ['
  });

  assert.equal(response.status, 400);
  assert.equal(response.headers.get('x-request-id'), 'qa-invalid-json');
  const body = await response.json();
  assert.equal(body.requestId, 'qa-invalid-json');
  assert.equal(body.error.code, 'INVALID_JSON');
  assert.equal(body.error.message, 'Malformed JSON body');
});

test('validateConfig reports actionable config errors and warnings', () => {
  const result = validateConfig({
    openaiApiKey: '',
    assistantModel: '',
    utilityModel: '',
    host: '',
    port: 70000,
    requestTimeoutMs: 10,
    defaultPrivacyMode: '',
    defaultStore: false
  });

  assert.equal(result.errors.length > 0, true);
  assert.equal(result.warnings.length > 0, true);
});

test('validateConfig rejects unsupported default privacy mode values', () => {
  const result = validateConfig({
    openaiApiKey: 'test-key',
    assistantModel: 'gpt-5.4',
    utilityModel: 'gpt-5.4-mini',
    host: '0.0.0.0',
    port: 8787,
    requestTimeoutMs: 25000,
    defaultPrivacyMode: 'invalid-mode',
    defaultStore: false
  });

  assert.equal(result.warnings.length, 0);
  assert.equal(result.errors.length > 0, true);
  assert.ok(result.errors.some((error) => error.includes('OPENAI_PROXY_DEFAULT_PRIVACY_MODE')));
});

test('__proxyTestUtils.resolvePrivacy keeps defaults and normalizes invalid overrides', () => {
  const config = {
    defaultPrivacyMode: 'minimal',
    defaultStore: false
  };

  const defaults = resolvePrivacy(undefined, config);
  assert.deepEqual(defaults, { mode: 'minimal', store: false });

  const invalidOverride = resolvePrivacy({ mode: 'invalid-mode', store: true }, config);
  assert.deepEqual(invalidOverride, { mode: 'minimal', store: true });
});

test('__proxyTestUtils.selectModel routes assistant to primary model and utility tasks to aux model', () => {
  const config = {
    assistantModel: 'gpt-5.4',
    utilityModel: 'gpt-5.4-mini'
  };
  assert.equal(selectModel('assistant', config), 'gpt-5.4');
  assert.equal(selectModel('extraction', config), 'gpt-5.4-mini');
  assert.equal(selectModel('summary', config), 'gpt-5.4-mini');
});

test('__proxyTestUtils.isRetryableStatus only marks transient upstream statuses as retryable', () => {
  assert.equal(isRetryableStatus(408), true);
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(503), true);
  assert.equal(isRetryableStatus(400), false);
  assert.equal(isRetryableStatus(404), false);
});
