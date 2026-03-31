import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isNonRetryableProxyErrorCode,
  trimErrorMessage,
  parseProxyErrorPayload,
  toProxyErrorMessage
} from '../src/services/providers/openai_proxy_error_utils.ts';
import { OpenAIProxyProvider } from '../src/services/providers/OpenAIProxyProvider.ts';

const withMutedConsole = (fn) => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    const value = fn();
    if (value && typeof value.then === 'function') {
      return value.finally(() => {
        console.log = originalLog;
        console.warn = originalWarn;
      });
    }
    console.log = originalLog;
    console.warn = originalWarn;
    return value;
  } catch (error) {
    console.log = originalLog;
    console.warn = originalWarn;
    throw error;
  }
};

test('parseProxyErrorPayload supports nested and flat JSON error shapes', () => {
  const nested = parseProxyErrorPayload('{"error":{"code":"UPSTREAM","message":"Proxy failed"}}');
  assert.equal(nested?.code, 'UPSTREAM');
  assert.equal(nested?.message, 'Proxy failed');

  const flat = parseProxyErrorPayload('{"error":"Simple failure","requestId":"req-1"}');
  assert.equal(flat?.message, 'Simple failure');
  assert.equal(flat?.requestId, 'req-1');
});

test('parseProxyErrorPayload returns null for payloads without message fields', () => {
  assert.equal(parseProxyErrorPayload('{"ok":false}'), null);
  assert.equal(parseProxyErrorPayload('   '), null);
});

test('toProxyErrorMessage builds trimmed and traceable message', () => {
  const message = toProxyErrorMessage(
    502,
    '{"error":{"code":"UPSTREAM_CHAT_FAILED","message":"Cloud upstream timed out"},"requestId":"abc123"}'
  );
  assert.ok(message.includes('[UPSTREAM_CHAT_FAILED]'));
  assert.ok(message.includes('Cloud upstream timed out'));
  assert.ok(message.includes('request abc123'));
});

test('toProxyErrorMessage uses fallback request id when response body omits one', () => {
  const message = toProxyErrorMessage(
    503,
    '{"error":{"code":"UPSTREAM_CHAT_FAILED","message":"Try again later"}}',
    'fallback-req-99'
  );
  assert.ok(message.includes('[UPSTREAM_CHAT_FAILED]'));
  assert.ok(message.includes('request fallback-req-99'));
});

test('toProxyErrorMessage falls back to generic status message for empty payload bodies', () => {
  const message = toProxyErrorMessage(504, '   ', 'req-fallback-504');
  assert.ok(message.includes('Cloud request failed (504)'));
  assert.ok(message.includes('request req-fallback-504'));
});

test('trimErrorMessage clamps long whitespace-heavy errors', () => {
  const long = trimErrorMessage(`  ${'x '.repeat(300)} `, 20);
  assert.ok(long.length <= 20);
  assert.ok(long.endsWith('…'));
});

test('isNonRetryableProxyErrorCode flags stable request/config problems', () => {
  assert.equal(isNonRetryableProxyErrorCode('PROXY_NOT_CONFIGURED'), true);
  assert.equal(isNonRetryableProxyErrorCode('INVALID_REQUEST'), true);
  assert.equal(isNonRetryableProxyErrorCode('CLOUD_PROXY_URL_MISSING'), true);
  assert.equal(isNonRetryableProxyErrorCode('UPSTREAM_CHAT_FAILED'), false);
  assert.equal(isNonRetryableProxyErrorCode(undefined), false);
});

test('OpenAIProxyProvider.init surfaces detail code and trace for unavailable cloud status', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getStatus = async () => ({
    provider: 'cloud',
    label: provider.label,
    available: false,
    configured: false,
    reason: 'OPENAI_API_KEY is not configured',
    detailCode: 'PROXY_NOT_CONFIGURED',
    requestId: 'trace-abc'
  });

  await withMutedConsole(async () => {
    await assert.rejects(
      () => provider.init(),
      /\[PROXY_NOT_CONFIGURED\] OPENAI_API_KEY is not configured \(trace trace-abc\)/
    );
  });
});

test('OpenAIProxyProvider.init falls back to stable generic message when reason is missing', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getStatus = async () => ({
    provider: 'cloud',
    label: provider.label,
    available: false,
    configured: true
  });

  await withMutedConsole(async () => {
    await assert.rejects(
      () => provider.init(),
      /Cloud provider is unavailable/
    );
  });
});

test('OpenAIProxyProvider.chat surfaces request id on transport failure for traceability', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getBaseUrl = () => 'http://127.0.0.1:9999';

  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('network unreachable');
  };

  try {
    await withMutedConsole(async () => {
      await assert.rejects(
        () => provider.chat(
          [{ role: 'user', content: 'hello' }],
          {
            requestId: 'turn-trace-123',
            timeoutMs: 50,
            task: 'assistant'
          }
        ),
        /request turn-trace-123/
      );
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAIProxyProvider.chat does not retry when proxy marks failure as non-retryable', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getBaseUrl = () => 'http://127.0.0.1:8787';

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        error: {
          code: 'PROXY_NOT_CONFIGURED',
          message: 'Cloud provider is not configured on the server'
        },
        requestId: 'proxy-req-1'
      }),
      {
        status: 503,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'proxy-req-1'
        }
      }
    );
  };

  try {
    await withMutedConsole(async () => {
      await assert.rejects(
        () => provider.chat(
          [{ role: 'user', content: 'hello' }],
          {
            requestId: 'turn-no-retry',
            timeoutMs: 50,
            task: 'assistant'
          }
        ),
        /\[PROXY_NOT_CONFIGURED\]/
      );
    });
    assert.equal(fetchCalls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAIProxyProvider.chat retries transient proxy failures once and succeeds', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getBaseUrl = () => 'http://127.0.0.1:8787';

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'UPSTREAM_CHAT_FAILED',
            message: 'OpenAI upstream timeout'
          },
          requestId: 'proxy-retry-1'
        }),
        {
          status: 503,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'proxy-retry-1'
          }
        }
      );
    }
    return new Response(
      JSON.stringify({
        text: 'retry success',
        requestId: 'proxy-retry-2'
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'proxy-retry-2'
        }
      }
    );
  };

  try {
    const reply = await withMutedConsole(() => provider.chat(
      [{ role: 'user', content: 'hello' }],
      {
        requestId: 'turn-retry',
        timeoutMs: 50,
        task: 'assistant'
      }
    ));
    assert.equal(reply, 'retry success');
    assert.equal(fetchCalls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAIProxyProvider.process keeps extraction retries disabled by default', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getBaseUrl = () => 'http://127.0.0.1:8787';

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        error: {
          code: 'UPSTREAM_EXTRACT_FAILED',
          message: 'Extract upstream timeout'
        },
        requestId: 'proxy-extract-1'
      }),
      {
        status: 503,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'proxy-extract-1'
        }
      }
    );
  };

  try {
    await withMutedConsole(async () => {
      await assert.rejects(
        () => provider.process(
          'extract this text',
          {
            requestId: 'turn-extract',
            timeoutMs: 50,
            task: 'extraction'
          }
        ),
        /\[UPSTREAM_EXTRACT_FAILED\]/
      );
    });
    assert.equal(fetchCalls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAIProxyProvider.getStatus returns URL-missing status when proxy base URL is empty', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getBaseUrl = () => '';

  const status = await withMutedConsole(() => provider.getStatus());
  assert.equal(status.available, false);
  assert.equal(status.configured, false);
  assert.equal(status.detailCode, 'CLOUD_PROXY_URL_MISSING');
});

test('OpenAIProxyProvider.getStatus maps non-2xx health responses with proxy trace id', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getBaseUrl = () => 'http://127.0.0.1:8787';

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(
    JSON.stringify({ ok: false, code: 'DOWN' }),
    {
      status: 503,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'proxy-health-503'
      }
    }
  );

  try {
    const status = await withMutedConsole(() => provider.getStatus());
    assert.equal(status.available, false);
    assert.equal(status.configured, true);
    assert.equal(status.detailCode, 'CLOUD_PROXY_HEALTH_HTTP_ERROR');
    assert.equal(status.requestId, 'proxy-health-503');
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAIProxyProvider.getStatus maps invalid health JSON to deterministic status', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getBaseUrl = () => 'http://127.0.0.1:8787';

  const originalFetch = global.fetch;
  global.fetch = async () => new Response('not-json', {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'proxy-health-invalid-json'
    }
  });

  try {
    const status = await withMutedConsole(() => provider.getStatus());
    assert.equal(status.available, false);
    assert.equal(status.configured, true);
    assert.equal(status.detailCode, 'CLOUD_PROXY_INVALID_HEALTH_RESPONSE');
    assert.equal(status.requestId, 'proxy-health-invalid-json');
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAIProxyProvider.chat rejects empty successful payload text', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getBaseUrl = () => 'http://127.0.0.1:8787';

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(
    JSON.stringify({ text: '   ', requestId: 'proxy-empty-text' }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'proxy-empty-text'
      }
    }
  );

  try {
    await withMutedConsole(async () => {
      await assert.rejects(
        () => provider.chat([{ role: 'user', content: 'hello' }], { requestId: 'turn-empty-text' }),
        /Cloud provider returned an empty response/
      );
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAIProxyProvider.chat surfaces invalid JSON response with trace id', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getBaseUrl = () => 'http://127.0.0.1:8787';

  const originalFetch = global.fetch;
  global.fetch = async () => new Response('not-json', {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'proxy-invalid-json-chat'
    }
  });

  try {
    await withMutedConsole(async () => {
      await assert.rejects(
        () => provider.chat(
          [{ role: 'user', content: 'hello' }],
          { requestId: 'turn-invalid-json-chat', timeoutMs: 50 }
        ),
        /\[CLOUD_PROXY_INVALID_RESPONSE\].*request proxy-invalid-json-chat/
      );
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAIProxyProvider.process returns raw extraction payload when json field is absent', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getBaseUrl = () => 'http://127.0.0.1:8787';

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(
    JSON.stringify({ raw: '{"ops":[]}', requestId: 'proxy-extract-raw' }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'proxy-extract-raw'
      }
    }
  );

  try {
    const raw = await withMutedConsole(() => provider.process('extract this'));
    assert.equal(raw, '{"ops":[]}');
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAIProxyProvider.process rejects responses without json or raw payload', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getBaseUrl = () => 'http://127.0.0.1:8787';

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(
    JSON.stringify({ requestId: 'proxy-extract-empty' }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'proxy-extract-empty'
      }
    }
  );

  try {
    await withMutedConsole(async () => {
      await assert.rejects(
        () => provider.process('extract this'),
        /Cloud extraction did not return structured JSON/
      );
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAIProxyProvider.getStatus prefers body requestId when health header trace is missing', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getBaseUrl = () => 'http://127.0.0.1:8787';

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(
    JSON.stringify({
      ok: true,
      configured: true,
      code: 'OK',
      requestId: 'health-body-trace-1'
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json'
      }
    }
  );

  try {
    const status = await withMutedConsole(() => provider.getStatus());
    assert.equal(status.available, true);
    assert.equal(status.configured, true);
    assert.equal(status.requestId, 'health-body-trace-1');
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAIProxyProvider.chat uses proxy header request id when non-2xx body is empty', async () => {
  const provider = new OpenAIProxyProvider();
  provider.getBaseUrl = () => 'http://127.0.0.1:8787';

  const originalFetch = global.fetch;
  global.fetch = async () => new Response('', {
    status: 503,
    headers: {
      'x-request-id': 'proxy-header-503-empty',
      'content-type': 'text/plain'
    }
  });

  try {
    await withMutedConsole(async () => {
      await assert.rejects(
        () => provider.chat(
          [{ role: 'user', content: 'hello' }],
          {
            requestId: 'turn-empty-error',
            timeoutMs: 50,
            task: 'assistant'
          }
        ),
        /request proxy-header-503-empty/
      );
    });
  } finally {
    global.fetch = originalFetch;
  }
});
