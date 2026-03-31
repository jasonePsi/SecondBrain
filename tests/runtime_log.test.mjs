import test from 'node:test';
import assert from 'node:assert/strict';
import { debugLog, isDebugLoggingEnabled } from '../src/services/runtime_log.ts';

const withEnv = (name, value, fn) => {
  const previous = process.env[name];
  if (typeof value === 'undefined') {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }

  try {
    return fn();
  } finally {
    if (typeof previous === 'undefined') {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
};

const withDevFlag = (value, fn) => {
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, '__DEV__');
  const previous = globalThis.__DEV__;

  if (typeof value === 'undefined') {
    if (hadOwn) {
      delete globalThis.__DEV__;
    }
  } else {
    globalThis.__DEV__ = value;
  }

  try {
    return fn();
  } finally {
    if (hadOwn) {
      globalThis.__DEV__ = previous;
    } else {
      delete globalThis.__DEV__;
    }
  }
};

const withConsoleSpy = async (fn) => {
  const originalLog = console.log;
  const calls = [];
  console.log = (...args) => {
    calls.push(args);
  };

  try {
    await fn(calls);
  } finally {
    console.log = originalLog;
  }
};

test('isDebugLoggingEnabled is false by default in non-dev environment', () => {
  return withDevFlag(undefined, () => (
    withEnv('SECOND_BRAIN_DEBUG_LOGS', undefined, () => (
      withEnv('EXPO_PUBLIC_DEBUG_LOGS', undefined, () => {
        assert.equal(isDebugLoggingEnabled(), false);
      })
    ))
  ));
});

test('isDebugLoggingEnabled becomes true when SECOND_BRAIN_DEBUG_LOGS is enabled', () => {
  return withDevFlag(undefined, () => (
    withEnv('SECOND_BRAIN_DEBUG_LOGS', 'true', () => (
      withEnv('EXPO_PUBLIC_DEBUG_LOGS', undefined, () => {
        assert.equal(isDebugLoggingEnabled(), true);
      })
    ))
  ));
});

test('isDebugLoggingEnabled becomes true when EXPO_PUBLIC_DEBUG_LOGS is enabled', () => {
  return withDevFlag(undefined, () => (
    withEnv('SECOND_BRAIN_DEBUG_LOGS', undefined, () => (
      withEnv('EXPO_PUBLIC_DEBUG_LOGS', '1', () => {
        assert.equal(isDebugLoggingEnabled(), true);
      })
    ))
  ));
});

test('isDebugLoggingEnabled prefers __DEV__ when available', () => {
  return withDevFlag(true, () => (
    withEnv('SECOND_BRAIN_DEBUG_LOGS', undefined, () => (
      withEnv('EXPO_PUBLIC_DEBUG_LOGS', undefined, () => {
        assert.equal(isDebugLoggingEnabled(), true);
      })
    ))
  ));
});

test('debugLog does not emit when debug logging is disabled', async () => {
  await withConsoleSpy(async (calls) => {
    await withDevFlag(undefined, () => (
      withEnv('SECOND_BRAIN_DEBUG_LOGS', undefined, () => (
        withEnv('EXPO_PUBLIC_DEBUG_LOGS', undefined, () => {
          debugLog('[test] should_not_log');
        })
      ))
    ));

    assert.equal(calls.length, 0);
  });
});

test('debugLog emits when debug logging is enabled', async () => {
  await withConsoleSpy(async (calls) => {
    await withDevFlag(undefined, () => (
      withEnv('SECOND_BRAIN_DEBUG_LOGS', 'true', () => (
        withEnv('EXPO_PUBLIC_DEBUG_LOGS', undefined, () => {
          debugLog('[test] should_log', { ok: true });
        })
      ))
    ));

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '[test] should_log');
  });
});
