import type { AIProviderStatus, AIProviderType } from './ai/types';
import {
    resolveFallbackActiveModelId,
    shouldAttemptLocalFallbackActivation
} from './model_manager_utils.ts';
import { formatProviderStatusReason } from './provider_status_copy_utils.ts';

type ProviderBadgeInput = {
    status?: AIProviderStatus;
    isActive: boolean;
};

type ProviderSwitchInput = {
    targetProvider: AIProviderType;
    status?: AIProviderStatus;
    isActive: boolean;
    switchingProvider?: AIProviderType | null;
    allowUnavailableSwitch?: boolean;
    unavailableSwitchLabel?: string;
};

type SettingsFeedbackInput = {
    selectedProvider: AIProviderType;
    selectedProviderStatus?: AIProviderStatus;
    localProviderStatus?: AIProviderStatus;
    activeModelMissing: boolean;
    hasActiveModel: boolean;
    usableInstalledModelCount: number;
};

const ACTIVE_LOCAL_MODEL_MISSING_MESSAGE =
    'Active local model file is missing. Reinstall it or choose another model below.';

const LOCAL_FALLBACK_MISSING_MESSAGE =
    'Local fallback model file is missing. Reinstall it or set a different fallback model for offline use.';

const LOCAL_FALLBACK_NOT_SET_MESSAGE =
    'No local fallback model is set. Cloud chat works, but offline mode requires installing a local model.';

const normalizeCount = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
};

const normalizeString = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim();
};

export const getProviderBadgeLabel = (
    input: ProviderBadgeInput
): string => {
    const { status, isActive } = input;
    if (!status) return isActive ? 'Active · Checking' : 'Checking';
    if (!status.configured) return isActive ? 'Active · Setup Required' : 'Setup Required';
    if (isActive && status.available === false) return 'Active · Unavailable';
    if (isActive) return 'Active';
    if (status.available) return 'Ready';
    return 'Unavailable';
};

export const getProviderSwitchState = (
    input: ProviderSwitchInput
): { disabled: boolean; label: string } => {
    const {
        targetProvider,
        status,
        isActive,
        switchingProvider,
        allowUnavailableSwitch,
        unavailableSwitchLabel
    } = input;
    if (isActive) {
        return { disabled: true, label: 'Active' };
    }

    if (!status) {
        return {
            disabled: !!switchingProvider,
            label: targetProvider === 'cloud' ? 'Switch to Cloud' : 'Switch to Local'
        };
    }

    if (!status.available) {
        if (allowUnavailableSwitch) {
            return {
                disabled: !!switchingProvider,
                label: unavailableSwitchLabel || 'Fix and Switch'
            };
        }
        return {
            disabled: true,
            label: status.configured === false ? 'Setup Required' : 'Unavailable'
        };
    }

    return {
        disabled: !!switchingProvider,
        label: targetProvider === 'cloud' ? 'Switch to Cloud' : 'Switch to Local'
    };
};

type InstalledModelLike = {
    model_id: string;
};

export const canAutoRepairLocalProviderSwitch = (input: {
    targetProvider: AIProviderType;
    targetProviderStatus?: AIProviderStatus;
    usableInstalledModelCount: number;
}): boolean => {
    if (input.targetProvider !== 'local') return false;
    if (!input.targetProviderStatus) return false;
    return shouldAttemptLocalFallbackActivation({
        localProviderAvailable: input.targetProviderStatus.available,
        localStatusDetailCode: input.targetProviderStatus.detailCode,
        usableInstalledModelCount: normalizeCount(input.usableInstalledModelCount)
    });
};

export const resolveLocalAutoRepairCandidateModelId = (
    models: InstalledModelLike[]
): string | null => {
    return resolveFallbackActiveModelId(true, models);
};

export type SettingsModelStatus =
    | 'available'
    | 'downloading'
    | 'installed'
    | 'active'
    | 'missing';

export const getSettingsModelStatus = (input: {
    modelId: string;
    activeModelId?: string | null;
    hasModelRecord: boolean;
    isModelInstalled: boolean;
    downloadingModelId?: string | null;
}): SettingsModelStatus => {
    const normalizedModelId = normalizeString(input.modelId);
    if (!normalizedModelId) return 'available';

    const downloadingModelId = normalizeString(input.downloadingModelId);
    if (downloadingModelId && downloadingModelId === normalizedModelId) return 'downloading';

    const activeModelId = normalizeString(input.activeModelId);
    if (activeModelId && activeModelId === normalizedModelId) {
        return input.isModelInstalled ? 'active' : 'missing';
    }

    if (!input.hasModelRecord) return 'available';
    if (input.isModelInstalled) return 'installed';
    return 'missing';
};

export const getSettingsModelStatusLabel = (status: SettingsModelStatus): string => {
    if (status === 'active') return 'Active';
    if (status === 'installed') return 'Installed';
    if (status === 'downloading') return 'Downloading';
    if (status === 'missing') return 'Missing File';
    return 'Available';
};

export const getSettingsModelActionState = (input: {
    status: SettingsModelStatus;
    activeProvider: AIProviderType;
}): {
    showInstallAction: boolean;
    installActionLabel: 'Install' | 'Reinstall' | null;
    showActivateAction: boolean;
    activateActionLabel: 'Use This Model' | 'Set as Fallback' | null;
    showDeleteAction: boolean;
} => {
    if (input.status === 'downloading') {
        return {
            showInstallAction: false,
            installActionLabel: null,
            showActivateAction: false,
            activateActionLabel: null,
            showDeleteAction: false
        };
    }

    const activateLabel = input.activeProvider === 'cloud'
        ? 'Set as Fallback'
        : 'Use This Model';

    if (input.status === 'available') {
        return {
            showInstallAction: true,
            installActionLabel: 'Install',
            showActivateAction: false,
            activateActionLabel: null,
            showDeleteAction: false
        };
    }

    if (input.status === 'missing') {
        return {
            showInstallAction: true,
            installActionLabel: 'Reinstall',
            showActivateAction: false,
            activateActionLabel: null,
            showDeleteAction: true
        };
    }

    if (input.status === 'installed') {
        return {
            showInstallAction: false,
            installActionLabel: null,
            showActivateAction: true,
            activateActionLabel: activateLabel,
            showDeleteAction: true
        };
    }

    return {
        showInstallAction: false,
        installActionLabel: null,
        showActivateAction: false,
        activateActionLabel: null,
        showDeleteAction: true
    };
};

export const deriveSettingsProviderFeedback = (
    input: SettingsFeedbackInput
): { loadError: string | null; localFallbackWarning: string | null } => {
    const selectedStatus = input.selectedProviderStatus;
    const localStatus = input.localProviderStatus;
    const usableInstalledModelCount = normalizeCount(input.usableInstalledModelCount);

    let loadError: string | null = null;
    if (selectedStatus && !selectedStatus.available) {
        loadError = formatProviderStatusReason(selectedStatus, {
            includeDiagnostics: false
        });
    } else if (input.selectedProvider === 'local' && input.activeModelMissing) {
        loadError = ACTIVE_LOCAL_MODEL_MISSING_MESSAGE;
    } else if (!selectedStatus) {
        loadError = 'Selected provider status is unavailable right now. Tap Retry.';
    }

    let localFallbackWarning: string | null = null;
    if (input.selectedProvider === 'cloud') {
        if (input.activeModelMissing) {
            localFallbackWarning = LOCAL_FALLBACK_MISSING_MESSAGE;
        } else if (!input.hasActiveModel && usableInstalledModelCount <= 0) {
            localFallbackWarning = LOCAL_FALLBACK_NOT_SET_MESSAGE;
        } else if (localStatus && !localStatus.available) {
            localFallbackWarning = formatProviderStatusReason(localStatus, {
                includeDiagnostics: false
            });
        }
    }

    return {
        loadError,
        localFallbackWarning
    };
};

export const settingsLifecycleCopy = {
    ACTIVE_LOCAL_MODEL_MISSING_MESSAGE,
    LOCAL_FALLBACK_MISSING_MESSAGE,
    LOCAL_FALLBACK_NOT_SET_MESSAGE
} as const;
