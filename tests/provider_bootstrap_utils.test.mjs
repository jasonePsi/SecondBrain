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

test('resolveCloudProviderInitialRoute accepts status objects', () => {
  assert.equal(
    resolveCloudProviderInitialRoute({ available: true }),
    '/(tabs)/spaces'
  );
  assert.equal(
    resolveCloudProviderInitialRoute({ available: false }),
    '/(tabs)/settings'
  );
});

test('resolveCloudProviderInitialRoute treats missing availability as unavailable', () => {
  assert.equal(
    resolveCloudProviderInitialRoute({}),
    '/(tabs)/settings'
  );
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

test('resolveLocalProviderInitialRoute prefers usable installed model count when provided', () => {
  assert.equal(
    resolveLocalProviderInitialRoute({
      localStatusAvailable: false,
      installedModelCount: 3,
      usableInstalledModelCount: 0
    }),
    '/onboarding/model-selection'
  );
  assert.equal(
    resolveLocalProviderInitialRoute({
      localStatusAvailable: false,
      installedModelCount: 0,
      usableInstalledModelCount: 2
    }),
    '/(tabs)/settings'
  );
});

test('resolveLocalProviderInitialRoute uses explicit localStatusAvailable over legacy localAvailable', () => {
  assert.equal(
    resolveLocalProviderInitialRoute({
      localAvailable: true,
      localStatusAvailable: false,
      usableInstalledModelCount: 1
    }),
    '/(tabs)/settings'
  );
});

test('resolveLocalProviderInitialRoute treats explicit localStatusAvailable=true as authoritative', () => {
  assert.equal(
    resolveLocalProviderInitialRoute({
      localAvailable: false,
      localStatusAvailable: true,
      usableInstalledModelCount: Number.NaN
    }),
    '/(tabs)/spaces'
  );
});

test('resolveLocalProviderInitialRoute normalizes invalid model counts to deterministic fallback', () => {
  assert.equal(
    resolveLocalProviderInitialRoute({
      localStatusAvailable: false,
      installedModelCount: Number.NaN
    }),
    '/onboarding/model-selection'
  );
  assert.equal(
    resolveLocalProviderInitialRoute({
      localStatusAvailable: false,
      usableInstalledModelCount: Number.POSITIVE_INFINITY
    }),
    '/onboarding/model-selection'
  );
});

test('resolveLocalProviderInitialRoute ignores legacy installed count when usable count is explicitly invalid', () => {
  assert.equal(
    resolveLocalProviderInitialRoute({
      localStatusAvailable: false,
      installedModelCount: 9,
      usableInstalledModelCount: Number.NaN
    }),
    '/onboarding/model-selection'
  );
});

test('resolveCloudProviderInitialRoute treats malformed status payload as unavailable', () => {
  assert.equal(
    resolveCloudProviderInitialRoute({ available: undefined }),
    '/(tabs)/settings'
  );
});
