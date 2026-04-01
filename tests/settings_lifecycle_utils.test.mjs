import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAutoRepairLocalProviderSwitch,
  deriveSettingsProviderFeedback,
  getDeleteModelSuccessMessage,
  getProviderBadgeLabel,
  getProviderSwitchState,
  getLocalModelSummary,
  getSettingsModelActionState,
  getSettingsModelStatus,
  getSettingsModelStatusLabel,
  getSettingsModelStatusTone,
  getSettingsProviderTone,
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

test('getSettingsProviderTone keeps active availability semantics explicit', () => {
  assert.equal(
    getSettingsProviderTone(undefined, true),
    'neutral'
  );
  assert.equal(
    getSettingsProviderTone({
      provider: 'cloud',
      label: 'Cloud',
      available: false,
      configured: true
    }, true),
    'error'
  );
  assert.equal(
    getSettingsProviderTone({
      provider: 'local',
      label: 'Local',
      available: true,
      configured: true
    }, true),
    'success'
  );
  assert.equal(
    getSettingsProviderTone({
      provider: 'cloud',
      label: 'Cloud',
      available: false,
      configured: false
    }, false),
    'warning'
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

test('getProviderSwitchState keeps active provider action locked regardless status payload', () => {
  assert.deepEqual(
    getProviderSwitchState({
      targetProvider: 'local',
      status: {
        provider: 'local',
        label: 'Local',
        available: false,
        configured: false
      },
      isActive: true,
      switchingProvider: 'cloud'
    }),
    {
      disabled: true,
      label: 'Active'
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
  assert.equal(getSettingsModelStatusTone('active'), 'success');
  assert.equal(getSettingsModelStatusTone('missing'), 'warning');
  assert.equal(getSettingsModelStatusTone('available'), 'info');
  assert.equal(getSettingsModelStatusTone('installed'), 'neutral');
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

test('deriveSettingsProviderFeedback keeps local missing-model warning explicit when local provider is selected', () => {
  const feedback = deriveSettingsProviderFeedback({
    selectedProvider: 'local',
    selectedProviderStatus: {
      provider: 'local',
      label: 'Local',
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
    usableInstalledModelCount: 2
  });

  assert.equal(
    feedback.loadError,
    'Active local model file is missing. Reinstall it or choose another model below.'
  );
  assert.equal(feedback.localFallbackWarning, null);
});

test('getLocalModelSummary keeps fallback/active copy explicit across provider modes', () => {
  const cloudMissingFallback = getLocalModelSummary({
    activeProvider: 'cloud',
    activeModelName: null,
    activeModelMissing: false,
    usableInstalledModelCount: 0
  });
  assert.equal(cloudMissingFallback.title, 'No local fallback selected');
  assert.equal(cloudMissingFallback.statusLabel, 'Fallback Missing');
  assert.equal(cloudMissingFallback.statusTone, 'warning');

  const localMissingActive = getLocalModelSummary({
    activeProvider: 'local',
    activeModelName: null,
    activeModelMissing: false,
    usableInstalledModelCount: 2
  });
  assert.equal(localMissingActive.title, 'No active local model selected');
  assert.equal(localMissingActive.statusLabel, 'Setup Required');

  const activeReady = getLocalModelSummary({
    activeProvider: 'local',
    activeModelName: 'Llama 3.2 1B',
    activeModelMissing: false,
    activeModelSizeBytes: 2_400_000_000,
    usableInstalledModelCount: 1
  });
  assert.equal(activeReady.statusLabel, 'Active');
  assert.equal(activeReady.statusTone, 'success');
  assert.ok(activeReady.body.includes('2.4 GB'));

  const activeMissing = getLocalModelSummary({
    activeProvider: 'cloud',
    activeModelName: 'Llama 3.2 1B',
    activeModelMissing: true,
    usableInstalledModelCount: 1
  });
  assert.equal(activeMissing.statusLabel, 'Missing File');
  assert.equal(activeMissing.statusTone, 'warning');
});

test('getDeleteModelSuccessMessage keeps delete-active-model outcomes deterministic', () => {
  assert.equal(
    getDeleteModelSuccessMessage({
      activeProvider: 'local',
      deletedWasActive: true,
      fallbackActiveModelName: 'Llama 3.2 1B'
    }),
    'Llama 3.2 1B is now active.'
  );

  assert.equal(
    getDeleteModelSuccessMessage({
      activeProvider: 'cloud',
      deletedWasActive: true,
      fallbackActiveModelName: 'Llama 3.2 1B'
    }),
    'Llama 3.2 1B is now set as local fallback. Cloud provider remains active.'
  );

  assert.equal(
    getDeleteModelSuccessMessage({
      activeProvider: 'local',
      deletedWasActive: true,
      fallbackActiveModelName: null
    }),
    'No installed models remain. Install and activate a model to continue chatting locally.'
  );

  assert.equal(
    getDeleteModelSuccessMessage({
      activeProvider: 'cloud',
      deletedWasActive: true,
      fallbackActiveModelName: null
    }),
    'Local fallback model was removed. Cloud provider remains active, but offline mode now requires installing a local model.'
  );

  assert.equal(
    getDeleteModelSuccessMessage({
      activeProvider: 'cloud',
      deletedWasActive: false,
      fallbackActiveModelName: null
    }),
    'Model removed from this device.'
  );
});
