import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveFallbackActiveModelId,
  shouldAttemptLocalFallbackActivation
} from '../src/services/model_manager_utils.ts';

test('resolveFallbackActiveModelId returns null when deleted model was not active', () => {
  const fallback = resolveFallbackActiveModelId(false, [{ model_id: 'm1' }]);
  assert.equal(fallback, null);
});

test('resolveFallbackActiveModelId returns first remaining model id for deterministic fallback', () => {
  const fallback = resolveFallbackActiveModelId(true, [
    { model_id: 'm2' },
    { model_id: 'm3' }
  ]);
  assert.equal(fallback, 'm2');
});

test('resolveFallbackActiveModelId trims fallback id to avoid whitespace-only drift', () => {
  const fallback = resolveFallbackActiveModelId(true, [
    { model_id: '  m2  ' },
    { model_id: 'm3' }
  ]);
  assert.equal(fallback, 'm2');
});

test('resolveFallbackActiveModelId returns null when remaining list is empty or invalid', () => {
  assert.equal(resolveFallbackActiveModelId(true, []), null);
  assert.equal(resolveFallbackActiveModelId(true, [{ model_id: '' }]), null);
  assert.equal(resolveFallbackActiveModelId(true, [{ model_id: '   ' }]), null);
});

test('resolveFallbackActiveModelId skips invalid entries and keeps deterministic first valid fallback', () => {
  const fallback = resolveFallbackActiveModelId(true, [
    { model_id: '   ' },
    { model_id: '' },
    { model_id: 'm4' },
    { model_id: 'm5' }
  ]);
  assert.equal(fallback, 'm4');
});

test('resolveFallbackActiveModelId ignores malformed candidate objects safely', () => {
  const fallback = resolveFallbackActiveModelId(true, [
    null,
    {},
    { model_id: 42 },
    { model_id: '   ' },
    { model_id: 'm6' }
  ]);
  assert.equal(fallback, 'm6');
});

test('shouldAttemptLocalFallbackActivation allows fallback when local file is missing and usable models exist', () => {
  assert.equal(
    shouldAttemptLocalFallbackActivation({
      localProviderAvailable: false,
      localStatusDetailCode: 'LOCAL_MODEL_FILE_MISSING',
      usableInstalledModelCount: 2
    }),
    true
  );
});

test('shouldAttemptLocalFallbackActivation allows fallback when no active model is selected but usable models exist', () => {
  assert.equal(
    shouldAttemptLocalFallbackActivation({
      localProviderAvailable: false,
      localStatusDetailCode: 'LOCAL_MODEL_NOT_SELECTED',
      usableInstalledModelCount: 1
    }),
    true
  );
});

test('shouldAttemptLocalFallbackActivation blocks fallback for healthy provider, no models, or non-eligible detail code', () => {
  assert.equal(
    shouldAttemptLocalFallbackActivation({
      localProviderAvailable: true,
      localStatusDetailCode: 'LOCAL_MODEL_FILE_MISSING',
      usableInstalledModelCount: 2
    }),
    false
  );
  assert.equal(
    shouldAttemptLocalFallbackActivation({
      localProviderAvailable: false,
      localStatusDetailCode: 'LOCAL_PROVIDER_STATUS_CHECK_FAILED',
      usableInstalledModelCount: 2
    }),
    false
  );
  assert.equal(
    shouldAttemptLocalFallbackActivation({
      localProviderAvailable: false,
      localStatusDetailCode: 'LOCAL_MODEL_NOT_SELECTED',
      usableInstalledModelCount: 0
    }),
    false
  );
  assert.equal(
    shouldAttemptLocalFallbackActivation({
      localProviderAvailable: false,
      localStatusDetailCode: 'LOCAL_MODEL_NOT_SELECTED',
      usableInstalledModelCount: Number.NaN
    }),
    false
  );
});
