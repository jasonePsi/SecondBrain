import test from 'node:test';
import assert from 'node:assert/strict';
import serverModule from '../src/server.js';

const { createServerApp, resolveConfig, validateConfig } = serverModule;

const startServer = async (options = {}) => {
  const { app } = createServerApp(options);
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

  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.configured, false);
  assert.equal(typeof body.reason, 'string');
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
