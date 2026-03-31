import type { AIProviderStatus, AIProviderType } from './ai/types';
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
    const { targetProvider, status, isActive, switchingProvider } = input;
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
