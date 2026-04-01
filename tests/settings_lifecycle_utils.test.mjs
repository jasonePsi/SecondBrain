import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAutoRepairLocalProviderSwitch,
  deriveSettingsProviderFeedback,
  getProviderBadgeLabel,
  getProviderSwitchState,
  getSettingsModelActionState,
  getSettingsModelStatus,
  getSettingsModelStatusLabel,
  resolveLocalAutoRepairCandidateModelId
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

test('getProviderSwitchState keeps checking state switch disabled while another switch is in flight', () => {
  assert.deepEqual(
    getProviderSwitchState({
      targetProvider: 'cloud',
      status: undefined,
      isActive: false,
      switchingProvider: 'local'
    }),
    {
      disabled: true,
      label: 'Switch to Cloud'
    }
  );
});

test('getProviderSwitchState allows repairable local switch when explicitly enabled', () => {
  assert.deepEqual(
    getProviderSwitchState({
      targetProvider: 'local',
      status: {
        provider: 'local',
        label: 'Local',
        available: false,
        configured: true,
        detailCode: 'LOCAL_MODEL_FILE_MISSING'
      },
      isActive: false,
      switchingProvider: null,
      allowUnavailableSwitch: true,
      unavailableSwitchLabel: 'Fix and Switch to Local'
    }),
    {
      disabled: false,
      label: 'Fix and Switch to Local'
    }
  );
});

test('canAutoRepairLocalProviderSwitch matches eligible local-unavailable conditions', () => {
  assert.equal(
    canAutoRepairLocalProviderSwitch({
      targetProvider: 'local',
      targetProviderStatus: {
        provider: 'local',
        label: 'Local',
        available: false,
        configured: true,
        detailCode: 'LOCAL_MODEL_NOT_SELECTED'
      },
      usableInstalledModelCount: 1
    }),
    true
  );

  assert.equal(
    canAutoRepairLocalProviderSwitch({
      targetProvider: 'cloud',
      targetProviderStatus: {
        provider: 'cloud',
        label: 'Cloud',
        available: false,
        configured: true,
        detailCode: 'CLOUD_PROXY_UNREACHABLE'
      },
      usableInstalledModelCount: 3
    }),
    false
  );

  assert.equal(
    canAutoRepairLocalProviderSwitch({
      targetProvider: 'local',
      targetProviderStatus: {
        provider: 'local',
        label: 'Local',
        available: false,
        configured: true,
        detailCode: 'LOCAL_MODEL_FILE_MISSING'
      },
      usableInstalledModelCount: 0
    }),
    false
  );
});

test('resolveLocalAutoRepairCandidateModelId returns deterministic first valid fallback id', () => {
  assert.equal(
    resolveLocalAutoRepairCandidateModelId([
      { model_id: '   ' },
      { model_id: 'm2' },
      { model_id: 'm3' }
    ]),
    'm2'
  );
  assert.equal(resolveLocalAutoRepairCandidateModelId([]), null);
});

test('getSettingsModelStatus and label mapping are deterministic', () => {
  const downloading = getSettingsModelStatus({
    modelId: 'm1',
    activeModelId: 'm1',
    hasModelRecord: true,
    isModelInstalled: true,
    downloadingModelId: 'm1'
  });
  assert.equal(downloading, 'downloading');
  assert.equal(getSettingsModelStatusLabel(downloading), 'Downloading');

  assert.equal(
    getSettingsModelStatus({
      modelId: 'm2',
      activeModelId: 'm2',
      hasModelRecord: true,
      isModelInstalled: false
    }),
    'missing'
  );
  assert.equal(
    getSettingsModelStatus({
      modelId: 'm3',
      activeModelId: 'm2',
      hasModelRecord: true,
      isModelInstalled: true
    }),
    'installed'
  );
});

test('getSettingsModelActionState keeps install/activate/delete actions explicit per status', () => {
  assert.deepEqual(
    getSettingsModelActionState({
      status: 'available',
      activeProvider: 'local'
    }),
    {
      showInstallAction: true,
      installActionLabel: 'Install',
      showActivateAction: false,
      activateActionLabel: null,
      showDeleteAction: false
    }
  );

  assert.deepEqual(
    getSettingsModelActionState({
      status: 'installed',
      activeProvider: 'cloud'
    }),
    {
      showInstallAction: false,
      installActionLabel: null,
      showActivateAction: true,
      activateActionLabel: 'Set as Fallback',
      showDeleteAction: true
    }
  );

  assert.deepEqual(
    getSettingsModelActionState({
      status: 'downloading',
      activeProvider: 'cloud'
    }),
    {
      showInstallAction: false,
      installActionLabel: null,
      showActivateAction: false,
      activateActionLabel: null,
      showDeleteAction: false
    }
  );

  assert.deepEqual(
    getSettingsModelActionState({
      status: 'active',
      activeProvider: 'local'
    }),
    {
      showInstallAction: false,
      installActionLabel: null,
      showActivateAction: false,
      activateActionLabel: null,
      showDeleteAction: true
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

test('deriveSettingsProviderFeedback returns deterministic retry copy when selected provider status is missing', () => {
  const feedback = deriveSettingsProviderFeedback({
    selectedProvider: 'local',
    selectedProviderStatus: undefined,
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
    'Selected provider status is unavailable right now. Tap Retry.'
  );
  assert.equal(feedback.localFallbackWarning, null);
});
