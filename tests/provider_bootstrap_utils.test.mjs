import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCloudProviderInitialRoute,
  resolveLocalProviderInitialRoute
} from '../src/services/provider_bootstrap_utils.ts';

test('resolveCloudProviderInitialRoute routes available cloud to spaces', () => {
  assert.equal(resolveCloudProviderInitialRoute(true), '/(tabs)/spaces');
});

test('resolveCloudProviderInitialRoute routes unavailable cloud to settings', () => {
  assert.equal(resolveCloudProviderInitialRoute(false), '/(tabs)/settings');
});

test('resolveLocalProviderInitialRoute routes available local provider to spaces', () => {
  assert.equal(
    resolveLocalProviderInitialRoute({
      localAvailable: true,
      installedModelCount: 0
    }),
    '/(tabs)/spaces'
  );
});

test('resolveLocalProviderInitialRoute routes to onboarding when no installed models exist', () => {
  assert.equal(
    resolveLocalProviderInitialRoute({
      localAvailable: false,
      installedModelCount: 0
    }),
    '/onboarding/model-selection'
  );
});

test('resolveLocalProviderInitialRoute treats invalid negative model counts as onboarding case', () => {
  assert.equal(
    resolveLocalProviderInitialRoute({
      localAvailable: false,
      installedModelCount: -3
    }),
    '/onboarding/model-selection'
  );
});

test('resolveLocalProviderInitialRoute routes to settings when models exist but local is unavailable', () => {
  assert.equal(
    resolveLocalProviderInitialRoute({
      localAvailable: false,
      installedModelCount: 2
    }),
    '/(tabs)/settings'
  );
});
