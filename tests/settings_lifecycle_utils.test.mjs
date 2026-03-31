import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSettingsProviderFeedback,
  getProviderBadgeLabel,
  getProviderSwitchState
} from '../src/services/settings_lifecycle_utils.ts';

test('getProviderBadgeLabel returns deterministic labels for checking/setup/active states', () => {
  assert.equal(
    getProviderBadgeLabel({ status: undefined, isActive: true }),
    'Active · Checking'
  );
  assert.equal(
    getProviderBadgeLabel({
      status: {
        provider: 'cloud',
        label: 'Cloud',
        available: false,
        configured: false
      },
      isActive: false
    }),
    'Setup Required'
  );
  assert.equal(
    getProviderBadgeLabel({
      status: {
        provider: 'local',
        label: 'Local',
        available: false,
        configured: true
      },
      isActive: true
    }),
    'Active · Unavailable'
  );
});

test('getProviderSwitchState disables unavailable targets with explicit labels', () => {
  assert.deepEqual(
    getProviderSwitchState({
      targetProvider: 'cloud',
      status: {
        provider: 'cloud',
        label: 'Cloud',
        available: false,
        configured: false
      },
      isActive: false,
      switchingProvider: null
    }),
    {
      disabled: true,
      label: 'Setup Required'
    }
  );

  assert.deepEqual(
    getProviderSwitchState({
      targetProvider: 'local',
      status: {
        provider: 'local',
        label: 'Local',
        available: true,
        configured: true
      },
      isActive: false,
      switchingProvider: 'cloud'
    }),
    {
      disabled: true,
      label: 'Switch to Local'
    }
  );
});

test('deriveSettingsProviderFeedback returns actionable selected-provider load errors', () => {
  const feedback = deriveSettingsProviderFeedback({
    selectedProvider: 'cloud',
    selectedProviderStatus: {
      provider: 'cloud',
      label: 'Cloud',
      available: false,
      configured: false,
      detailCode: 'CLOUD_PROXY_URL_MISSING',
      requestId: 'trace-hidden'
    },
    localProviderStatus: {
      provider: 'local',
      label: 'Local',
      available: true,
      configured: true
    },
    activeModelMissing: false,
    hasActiveModel: true,
    usableInstalledModelCount: 1
  });

  assert.equal(
    feedback.loadError,
    'Cloud proxy URL is missing. Set EXPO_PUBLIC_AI_PROXY_BASE_URL.'
  );
  assert.equal(feedback.localFallbackWarning, null);
});

test('deriveSettingsProviderFeedback handles local fallback warnings in cloud mode', () => {
  const missingFallback = deriveSettingsProviderFeedback({
    selectedProvider: 'cloud',
    selectedProviderStatus: {
      provider: 'cloud',
      label: 'Cloud',
      available: true,
      configured: true
    },
    localProviderStatus: {
      provider: 'local',
      label: 'Local',
      available: true,
      configured: true
    },
    activeModelMissing: true,
    hasActiveModel: true,
    usableInstalledModelCount: 1
  });
  assert.equal(
    missingFallback.localFallbackWarning,
    'Local fallback model file is missing. Reinstall it or set a different fallback model for offline use.'
  );

  const notSet = deriveSettingsProviderFeedback({
    selectedProvider: 'cloud',
    selectedProviderStatus: {
      provider: 'cloud',
      label: 'Cloud',
      available: true,
      configured: true
    },
    localProviderStatus: {
      provider: 'local',
      label: 'Local',
      available: false,
      configured: false,
      detailCode: 'LOCAL_MODEL_NOT_SELECTED'
    },
    activeModelMissing: false,
    hasActiveModel: false,
    usableInstalledModelCount: 0
  });
  assert.equal(
    notSet.localFallbackWarning,
    'No local fallback model is set. Cloud chat works, but offline mode requires installing a local model.'
  );
});

test('deriveSettingsProviderFeedback warns about local unavailability in cloud mode when fallback exists', () => {
  const feedback = deriveSettingsProviderFeedback({
    selectedProvider: 'cloud',
    selectedProviderStatus: {
      provider: 'cloud',
      label: 'Cloud',
      available: true,
      configured: true
    },
    localProviderStatus: {
      provider: 'local',
      label: 'Local',
      available: false,
      configured: true,
      detailCode: 'LOCAL_MODEL_FILE_MISSING'
    },
    activeModelMissing: false,
    hasActiveModel: true,
    usableInstalledModelCount: 1
  });

  assert.equal(
    feedback.localFallbackWarning,
    'Active local model file is missing. Reinstall or switch models in Settings.'
  );
});

test('deriveSettingsProviderFeedback treats invalid usable model counts as zero for fallback warnings', () => {
  const feedback = deriveSettingsProviderFeedback({
    selectedProvider: 'cloud',
    selectedProviderStatus: {
      provider: 'cloud',
      label: 'Cloud',
      available: true,
      configured: true
    },
    localProviderStatus: {
      provider: 'local',
      label: 'Local',
      available: true,
      configured: true
    },
    activeModelMissing: false,
    hasActiveModel: false,
    usableInstalledModelCount: Number.NaN
  });

  assert.equal(
    feedback.localFallbackWarning,
    'No local fallback model is set. Cloud chat works, but offline mode requires installing a local model.'
  );
});
