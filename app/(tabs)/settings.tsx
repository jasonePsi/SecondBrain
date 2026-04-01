import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AIConfig } from '../../src/constants/AIConfig';
import { getAllModels, getModelById, ModelConfig } from '../../src/constants/ModelRegistry';
import { ModelSetting } from '../../src/repositories/model_repo';
import { LLMService } from '../../src/services/LLMService';
import type { AIProviderStatus, AIProviderType } from '../../src/services/LLMService';
import { ModelManager } from '../../src/services/ModelManager';
import { formatProviderStatusReason } from '../../src/services/provider_status_copy_utils';
import {
    canAutoRepairLocalProviderSwitch,
    deriveSettingsProviderFeedback,
    getProviderBadgeLabel,
    getProviderSwitchState,
    getSettingsModelActionState,
    getSettingsModelStatus,
    getSettingsModelStatusLabel,
    resolveLocalAutoRepairCandidateModelId
} from '../../src/services/settings_lifecycle_utils';
import { useAppTheme } from '../../src/theme/theme';
import {
    AppButton,
    GroupedSection,
    InlineBanner,
    LoadingStateView,
    ScreenScaffold,
    SectionHeader,
    StatusChip
} from '../../src/components/ui';
import { runLayoutFeedback, triggerHaptic, useReducedMotion } from '../../src/services/interaction_feedback';

type ProviderOption = {
    id: AIProviderType;
    name: string;
    description: string;
    privacyHint?: string;
};

const PROVIDER_OPTIONS: ProviderOption[] = [
    {
        id: 'local',
        name: 'Local (On-device)',
        description: 'Runs fully offline with your installed GGUF model.'
    },
    {
        id: 'cloud',
        name: 'OpenAI Cloud (Proxy)',
        description: 'Routes through your backend proxy. API keys stay server-side.',
        privacyHint: `Default privacy: ${AIConfig.defaultPrivacy.mode} mode, storage ${AIConfig.defaultPrivacy.store ? 'enabled' : 'disabled'}.`
    }
];

const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0.0 GB';
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
};

const formatCheckTime = (value?: number): string => {
    if (!value) return 'Not checked yet';
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatBatteryImpact = (impact: ModelConfig['batteryImpact']): string => {
    if (impact === 'low') return 'Low impact';
    if (impact === 'medium') return 'Balanced impact';
    if (impact === 'high') return 'High impact';
    return 'Unknown impact';
};

const providerIconName = (provider: AIProviderType): React.ComponentProps<typeof Ionicons>['name'] => {
    return provider === 'cloud' ? 'cloud-outline' : 'phone-portrait-outline';
};

const getProviderTone = (
    status: AIProviderStatus | undefined,
    isActive: boolean
): 'success' | 'warning' | 'error' | 'neutral' => {
    if (!status) return 'neutral';
    if (isActive && !status.available) return 'error';
    if (isActive && status.available) return 'success';
    if (!status.configured) return 'warning';
    return status.available ? 'neutral' : 'warning';
};

const getModelStatusTone = (status: ReturnType<typeof getSettingsModelStatus>): 'neutral' | 'success' | 'warning' => {
    if (status === 'active') return 'success';
    if (status === 'missing') return 'warning';
    return 'neutral';
};

export default function SettingsScreen() {
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    const isMountedRef = useRef(true);
    const loadRequestRef = useRef(0);
    const [activeProvider, setActiveProvider] = useState<AIProviderType>('local');
    const [providerStatuses, setProviderStatuses] = useState<AIProviderStatus[]>([]);
    const [switchingProvider, setSwitchingProvider] = useState<AIProviderType | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [localFallbackWarning, setLocalFallbackWarning] = useState<string | null>(null);

    const [activeModel, setActiveModel] = useState<ModelSetting | null>(null);
    const [installedModels, setInstalledModels] = useState<ModelSetting[]>([]);
    const [usableInstalledModelIds, setUsableInstalledModelIds] = useState<Set<string>>(new Set());
    const [missingInstalledModelIds, setMissingInstalledModelIds] = useState<Set<string>>(new Set());
    const [activeModelMissing, setActiveModelMissing] = useState(false);
    const [availableModels, setAvailableModels] = useState<ModelConfig[]>([]);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const formatProviderReason = (
        status?: AIProviderStatus,
        includeDiagnostics = true
    ): string => formatProviderStatusReason(status, { includeDiagnostics });

    const upsertProviderStatus = (status: AIProviderStatus) => {
        setProviderStatuses((prev) => {
            const others = prev.filter((item) => item.provider !== status.provider);
            return [...others, status];
        });
    };

    const loadData = async () => {
        const requestId = ++loadRequestRef.current;
        const canApply = () => isMountedRef.current && requestId === loadRequestRef.current;
        try {
            if (canApply()) {
                setLoading(true);
                setLoadError(null);
                setLocalFallbackWarning(null);
            }
            const [selectedProvider, statuses, active, installed] = await Promise.all([
                LLMService.getActiveProvider(),
                LLMService.listProviderStatuses(),
                ModelManager.getActiveModel(),
                ModelManager.getInstalledModels()
            ]);
            const installChecks = await Promise.all(
                installed.map(async (model) => ({
                    modelId: model.model_id,
                    usable: await ModelManager.isInstalled(model.model_id)
                }))
            );
            const usableIds = new Set(
                installChecks
                    .filter((item) => item.usable)
                    .map((item) => item.modelId)
            );
            const missingIds = new Set(
                installChecks
                    .filter((item) => !item.usable)
                    .map((item) => item.modelId)
            );
            const activeMissing = !!active && missingIds.has(active.model_id);
            if (!canApply()) return;

            setActiveProvider(selectedProvider);
            runLayoutFeedback(reducedMotion);
            setProviderStatuses(statuses);
            setActiveModel(active);
            setInstalledModels(installed);
            setUsableInstalledModelIds(usableIds);
            setMissingInstalledModelIds(missingIds);
            setActiveModelMissing(activeMissing);
            setAvailableModels(getAllModels());

            const feedback = deriveSettingsProviderFeedback({
                selectedProvider,
                selectedProviderStatus: statuses.find((item) => item.provider === selectedProvider),
                localProviderStatus: statuses.find((item) => item.provider === 'local'),
                activeModelMissing: activeMissing,
                hasActiveModel: !!active,
                usableInstalledModelCount: usableIds.size
            });
            setLoadError(feedback.loadError);
            setLocalFallbackWarning(feedback.localFallbackWarning);
        } catch (error) {
            console.error('Error loading model data:', error);
            if (canApply()) {
                setLoadError('Could not refresh settings. Try again.');
                setLocalFallbackWarning(null);
            }
        } finally {
            if (canApply()) {
                setLoading(false);
            }
        }
    };

    const getProviderStatus = (provider: AIProviderType): AIProviderStatus | undefined => {
        return providerStatuses.find((item) => item.provider === provider);
    };

    const getUsableInstalledModels = useCallback(async (): Promise<ModelSetting[]> => {
        const installed = await ModelManager.getInstalledModels();
        const installChecks = await Promise.all(
            installed.map(async (model) => ({
                model,
                usable: await ModelManager.isInstalled(model.model_id)
            }))
        );
        return installChecks
            .filter((item) => item.usable)
            .map((item) => item.model);
    }, []);

    const handleSwitchProvider = async (provider: AIProviderType) => {
        try {
            setSwitchingProvider(provider);
            const runtimeState = LLMService.getRuntimeState();
            const latestStatus = await LLMService.getProviderStatus(provider);
            upsertProviderStatus(latestStatus);

            let statusForSwitch = latestStatus;
            if (
                provider === 'local'
                && !statusForSwitch.available
                && canAutoRepairLocalProviderSwitch({
                    targetProvider: provider,
                    targetProviderStatus: statusForSwitch,
                    usableInstalledModelCount: usableInstalledModelIds.size
                })
            ) {
                const usableInstalledModels = await getUsableInstalledModels();
                const fallbackModelId = resolveLocalAutoRepairCandidateModelId(usableInstalledModels);
                if (fallbackModelId) {
                    await ModelManager.setActiveModel(fallbackModelId);
                    await LLMService.release();
                    statusForSwitch = await LLMService.getProviderStatus('local');
                    upsertProviderStatus(statusForSwitch);
                }
            }

            if (!statusForSwitch.available) {
                const unavailableReason = formatProviderReason(statusForSwitch, false);
                setLoadError(unavailableReason);
                triggerHaptic('error', reducedMotion);
                throw new Error(unavailableReason);
            }

            await LLMService.setActiveProvider(provider);
            const refreshedStatus = await LLMService.getProviderStatus(provider);
            upsertProviderStatus(refreshedStatus);

            const releaseNotice = runtimeState.inFlightRequests > 0
                ? ' Current in-flight reply will finish first; switch applies to the next turn.'
                : '';
            if (!refreshedStatus.available) {
                const reason = formatProviderReason(refreshedStatus, false);
                setLoadError(reason);
                Alert.alert(
                    'Provider Updated',
                    provider === 'local'
                        ? `Local provider selected, but setup is still required. ${reason}${releaseNotice}`
                        : `Provider selected, but currently unavailable. ${reason}${releaseNotice}`
                );
            } else {
                setLoadError(null);
                Alert.alert(
                    'Provider Updated',
                    provider === 'cloud'
                        ? `Cloud provider is now active.${releaseNotice}`
                        : `Local provider is now active.${releaseNotice}`
                );
                triggerHaptic('success', reducedMotion);
            }
        } catch (error: any) {
            Alert.alert('Provider Unavailable', error.message || 'Could not switch provider.');
            triggerHaptic('error', reducedMotion);
        } finally {
            await loadData();
            setSwitchingProvider(null);
        }
    };

    const handleDownloadModel = async (modelId: string) => {
        try {
            setDownloading(modelId);
            setDownloadProgress(0);

            await ModelManager.downloadModel(modelId, (progress) => {
                setDownloadProgress(progress);
            }, { activate: false });
            triggerHaptic('success', reducedMotion);

            Alert.alert(
                'Model Installed',
                activeProvider === 'cloud'
                    ? 'Model download complete. Select "Set as Fallback" if you want this model ready for offline local mode.'
                    : 'Model download complete. Select "Use This Model" to activate it.'
            );
            await loadData();
        } catch (error: any) {
            Alert.alert('Download Failed', error.message || 'Failed to download model');
            triggerHaptic('error', reducedMotion);
        } finally {
            setDownloading(null);
            setDownloadProgress(0);
        }
    };

    const handleSwitchModel = async (modelId: string) => {
        try {
            const installed = await ModelManager.isInstalled(modelId);
            if (!installed) {
                Alert.alert('Model Not Installed', 'Install this model before activating it.');
                return;
            }

            await ModelManager.setActiveModel(modelId);
            await LLMService.release();
            triggerHaptic('success', reducedMotion);
            if (activeProvider === 'cloud') {
                Alert.alert(
                    'Fallback Updated',
                    'Local fallback model updated. Cloud provider remains active.'
                );
            } else {
                Alert.alert('Model Active', 'This model is now active.');
            }
            await loadData();
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to switch model');
            triggerHaptic('error', reducedMotion);
        }
    };

    const handleDeleteModel = (modelId: string) => {
        const modelConfig = getModelById(modelId);
        Alert.alert(
            'Delete Model',
            `Delete ${modelConfig?.name || 'this model'}? This frees ${formatBytes(modelConfig?.sizeBytes || 0)}.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            triggerHaptic('warning', reducedMotion);
                            const result = await ModelManager.deleteModel(modelId);
                            await LLMService.release();

                            if (result.deletedWasActive && result.fallbackActiveModelId) {
                                const fallbackName = getModelById(result.fallbackActiveModelId)?.name || result.fallbackActiveModelId;
                                Alert.alert(
                                    'Model Deleted',
                                    activeProvider === 'cloud'
                                        ? `${fallbackName} is now set as local fallback. Cloud provider remains active.`
                                        : `${fallbackName} is now active.`
                                );
                            } else if (result.deletedWasActive) {
                                Alert.alert(
                                    'Model Deleted',
                                    activeProvider === 'cloud'
                                        ? 'Local fallback model was removed. Cloud provider remains active, but offline mode now requires installing a local model.'
                                        : 'No installed models remain. Install and activate a model to continue chatting locally.'
                                );
                            } else {
                                Alert.alert('Model Deleted', 'Model removed from this device.');
                            }
                            triggerHaptic('success', reducedMotion);

                            await loadData();
                        } catch (error: any) {
                            Alert.alert('Error', error.message || 'Failed to delete model');
                            triggerHaptic('error', reducedMotion);
                        }
                    }
                }
            ]
        );
    };

    const hasModelRecord = (modelId: string): boolean => {
        return installedModels.some((model) => model.model_id === modelId);
    };

    const isModelInstalled = (modelId: string): boolean => {
        return usableInstalledModelIds.has(modelId);
    };

    const selectedProviderStatus = getProviderStatus(activeProvider);
    const localProviderStatus = getProviderStatus('local');
    const cloudProviderStatus = getProviderStatus('cloud');
    const usableInstalledModels = installedModels.filter((model) => usableInstalledModelIds.has(model.model_id));
    const missingModelCount = installedModels.length - usableInstalledModels.length;
    const totalStorageUsed = usableInstalledModels.reduce((total, model) => total + model.size_bytes, 0);

    if (loading) {
        return (
            <ScreenScaffold>
                <LoadingStateView
                    title="Loading settings"
                    message="Checking provider status and local model lifecycle."
                />
            </ScreenScaffold>
        );
    }

    return (
        <ScreenScaffold>
            <Stack.Screen
                options={{
                    title: 'Settings',
                    headerRight: () => (
                        <TouchableOpacity
                            onPress={loadData}
                            style={styles.refreshButton}
                            accessibilityRole="button"
                            accessibilityLabel="Refresh provider and model status"
                            accessibilityHint="Rechecks provider availability and model install states"
                        >
                            <Ionicons name="refresh" size={20} color={theme.colors.tint.primary} />
                        </TouchableOpacity>
                    )
                }}
            />
            <ScrollView contentContainerStyle={styles.content}>
                <SectionHeader
                    title="Provider & Model Controls"
                    subtitle="Choose where replies run and keep local fallback lifecycle healthy."
                />

                {!!loadError && (
                    <InlineBanner
                        tone="warning"
                        message={loadError}
                        actionLabel="Retry"
                        onActionPress={loadData}
                    />
                )}

                <View style={styles.sectionBlock}>
                    <SectionHeader
                        title="Active Provider"
                        subtitle={activeProvider === 'cloud' ? 'Cloud via proxy is selected.' : 'On-device local provider is selected.'}
                    />
                    {PROVIDER_OPTIONS.map((option) => {
                        const status = getProviderStatus(option.id);
                        const isActive = activeProvider === option.id;
                        const allowUnavailableSwitch = canAutoRepairLocalProviderSwitch({
                            targetProvider: option.id,
                            targetProviderStatus: status,
                            usableInstalledModelCount: usableInstalledModelIds.size
                        });
                        const switchState = getProviderSwitchState({
                            targetProvider: option.id,
                            status,
                            isActive,
                            switchingProvider,
                            allowUnavailableSwitch,
                            unavailableSwitchLabel: allowUnavailableSwitch ? 'Fix and Switch to Local' : undefined
                        });

                        return (
                            <GroupedSection key={option.id} style={styles.providerCard}>
                                <View style={styles.providerTopRow}>
                                    <View style={styles.providerTitleRow}>
                                        <Ionicons
                                            name={providerIconName(option.id)}
                                            size={18}
                                            color={theme.colors.tint.primary}
                                        />
                                        <Text style={[styles.providerName, { color: theme.colors.text.primary }]}>
                                            {option.name}
                                        </Text>
                                    </View>
                                    <StatusChip
                                        label={getProviderBadgeLabel({ status, isActive })}
                                        tone={getProviderTone(status, isActive)}
                                    />
                                </View>

                                <Text style={[styles.providerDescription, { color: theme.colors.text.secondary }]}>
                                    {option.description}
                                </Text>

                                {!!option.privacyHint && (
                                    <Text style={[styles.providerHint, { color: theme.colors.text.tertiary }]}>
                                        {option.privacyHint}
                                    </Text>
                                )}

                                {!status && (
                                    <InlineBanner
                                        tone="warning"
                                        message="Provider status unavailable. Refresh to re-check."
                                        actionLabel="Refresh"
                                        onActionPress={loadData}
                                    />
                                )}

                                {!!status && (!status.available || !status.configured || !!status.reason) && (
                                    <InlineBanner
                                        tone={status.available ? 'info' : 'warning'}
                                        message={formatProviderReason(status, false)}
                                    />
                                )}

                                {!!status?.lastCheckedAt && (
                                    <Text style={[styles.checkedText, { color: theme.colors.text.tertiary }]}>
                                        Last checked {formatCheckTime(status.lastCheckedAt)}
                                    </Text>
                                )}

                                {!isActive && (
                                    <View style={styles.providerActions}>
                                        <AppButton
                                            label={switchState.label}
                                            onPress={() => handleSwitchProvider(option.id)}
                                            disabled={switchState.disabled}
                                            loading={switchingProvider === option.id}
                                        />
                                    </View>
                                )}
                            </GroupedSection>
                        );
                    })}
                </View>

                <View style={styles.sectionBlock}>
                    <SectionHeader
                        title="Cloud Status"
                        subtitle="Configuration and availability for proxy-backed cloud replies."
                        trailing={<StatusChip label={cloudProviderStatus?.available ? 'Available' : 'Unavailable'} tone={cloudProviderStatus?.available ? 'success' : 'warning'} />}
                    />
                    <GroupedSection style={styles.infoCard}>
                        <Text style={[styles.infoTitle, { color: theme.colors.text.primary }]}>
                            OpenAI Proxy
                        </Text>
                        <Text style={[styles.infoBody, { color: theme.colors.text.secondary }]}>
                            {cloudProviderStatus
                                ? formatProviderReason(cloudProviderStatus, false)
                                : 'Cloud provider has not reported status yet. Refresh to check availability.'}
                        </Text>
                        {!!cloudProviderStatus?.lastCheckedAt && (
                            <Text style={[styles.infoMeta, { color: theme.colors.text.tertiary }]}>
                                Checked at {formatCheckTime(cloudProviderStatus.lastCheckedAt)}
                            </Text>
                        )}
                    </GroupedSection>
                </View>

                <View style={styles.sectionBlock}>
                    <SectionHeader
                        title={activeProvider === 'cloud' ? 'Local Fallback Model' : 'Active Local Model'}
                        subtitle={activeProvider === 'cloud'
                            ? 'Cloud is active. Keep one local model ready for offline fallback.'
                            : 'This model powers local on-device chat.'}
                    />
                    <GroupedSection style={styles.infoCard}>
                        {activeModel ? (
                            <>
                                <View style={styles.infoTopRow}>
                                    <Text style={[styles.infoTitle, { color: theme.colors.text.primary }]}>
                                        {getModelById(activeModel.model_id)?.name || activeModel.model_id}
                                    </Text>
                                    <StatusChip
                                        label={activeModelMissing ? 'Missing File' : (activeProvider === 'cloud' ? 'Fallback Ready' : 'Active')}
                                        tone={activeModelMissing ? 'warning' : 'success'}
                                    />
                                </View>
                                <Text style={[styles.infoBody, { color: theme.colors.text.secondary }]}>
                                    Size on disk: {formatBytes(activeModel.size_bytes)}
                                </Text>
                                {activeModelMissing && (
                                    <InlineBanner
                                        tone="warning"
                                        message="Local model file is missing. Reinstall this model or pick another below."
                                    />
                                )}
                            </>
                        ) : (
                            <>
                                <Text style={[styles.infoTitle, { color: theme.colors.text.primary }]}>
                                    {activeProvider === 'cloud'
                                        ? 'No local fallback selected'
                                        : 'No active local model selected'}
                                </Text>
                                <Text style={[styles.infoBody, { color: theme.colors.text.secondary }]}>
                                    {usableInstalledModels.length > 0
                                        ? (activeProvider === 'cloud'
                                            ? 'Set one installed model as fallback for offline continuity.'
                                            : 'Choose an installed model below to activate local chat.')
                                        : 'Install a local model below to continue.'}
                                </Text>
                            </>
                        )}
                        {!!localFallbackWarning && (
                            <InlineBanner
                                tone="warning"
                                message={localFallbackWarning}
                            />
                        )}
                    </GroupedSection>
                </View>

                <View style={styles.sectionBlock}>
                    <SectionHeader
                        title="Local Models"
                        subtitle="Install, activate, remove, or set fallback behavior."
                        trailing={<StatusChip label={`${usableInstalledModels.length} Installed`} />}
                    />
                    <GroupedSection style={styles.storageCard}>
                        <Text style={[styles.storageText, { color: theme.colors.text.secondary }]}>
                            Storage used: {formatBytes(totalStorageUsed)}
                        </Text>
                        {missingModelCount > 0 && (
                            <InlineBanner
                                tone="warning"
                                message={`${missingModelCount} model ${missingModelCount === 1 ? 'entry needs' : 'entries need'} reinstall (missing file).`}
                            />
                        )}
                    </GroupedSection>

                    {availableModels.map((model) => {
                        const hasRecord = hasModelRecord(model.id);
                        const installed = isModelInstalled(model.id);
                        const status = getSettingsModelStatus({
                            modelId: model.id,
                            activeModelId: activeModel?.model_id,
                            hasModelRecord: hasRecord,
                            isModelInstalled: installed,
                            downloadingModelId: downloading
                        });
                        const actionState = getSettingsModelActionState({
                            status,
                            activeProvider
                        });
                        const isDownloading = status === 'downloading';

                        return (
                            <GroupedSection key={model.id} style={styles.modelCard}>
                                <View style={styles.modelTopRow}>
                                    <View style={styles.modelNameRow}>
                                        <Text style={[styles.modelName, { color: theme.colors.text.primary }]}>
                                            {model.name}
                                        </Text>
                                        <StatusChip
                                            label={model.category === 'fast' ? 'Fast' : 'Smart'}
                                            tone={model.category === 'fast' ? 'info' : 'warning'}
                                        />
                                    </View>
                                    <StatusChip
                                        label={getSettingsModelStatusLabel(status)}
                                        tone={getModelStatusTone(status)}
                                    />
                                </View>

                                <Text style={[styles.modelDescription, { color: theme.colors.text.secondary }]}>
                                    {model.description}
                                </Text>

                                <Text style={[styles.modelMeta, { color: theme.colors.text.tertiary }]}>
                                    {formatBytes(model.sizeBytes)} • Speed {model.speedRating}/5 • Quality {model.qualityRating}/5 • {formatBatteryImpact(model.batteryImpact)}
                                </Text>

                                {isDownloading && (
                                    <View style={styles.progressBlock}>
                                        <Text style={[styles.progressLabel, { color: theme.colors.text.secondary }]}>
                                            Downloading {(downloadProgress * 100).toFixed(0)}%
                                        </Text>
                                        <View
                                            style={[
                                                styles.progressTrack,
                                                { backgroundColor: theme.colors.background.grouped }
                                            ]}
                                        >
                                            <View
                                                style={[
                                                    styles.progressFill,
                                                    {
                                                        width: `${Math.max(0, Math.min(100, downloadProgress * 100))}%`,
                                                        backgroundColor: theme.colors.tint.primary
                                                    }
                                                ]}
                                            />
                                        </View>
                                    </View>
                                )}

                                {!isDownloading && (
                                    <View style={styles.modelActions}>
                                        {actionState.showInstallAction && actionState.installActionLabel && (
                                            <AppButton
                                                size="sm"
                                                variant="secondary"
                                                label={actionState.installActionLabel}
                                                onPress={() => handleDownloadModel(model.id)}
                                                disabled={!!downloading}
                                            />
                                        )}
                                        {actionState.showActivateAction && actionState.activateActionLabel && (
                                            <AppButton
                                                size="sm"
                                                label={actionState.activateActionLabel}
                                                onPress={() => handleSwitchModel(model.id)}
                                            />
                                        )}
                                        {actionState.showDeleteAction && (
                                            <AppButton
                                                size="sm"
                                                variant="destructive"
                                                label="Delete"
                                                onPress={() => handleDeleteModel(model.id)}
                                            />
                                        )}
                                    </View>
                                )}
                            </GroupedSection>
                        );
                    })}
                </View>

                <View style={styles.sectionBlock}>
                    <SectionHeader
                        title="Privacy & Diagnostics"
                        subtitle="Visibility into defaults and actionable provider traces."
                    />
                    <GroupedSection style={styles.infoCard}>
                        <Text style={[styles.infoTitle, { color: theme.colors.text.primary }]}>
                            Default privacy behavior
                        </Text>
                        <Text style={[styles.infoBody, { color: theme.colors.text.secondary }]}>
                            Cloud requests default to {AIConfig.defaultPrivacy.mode} mode with storage {AIConfig.defaultPrivacy.store ? 'enabled' : 'disabled'}.
                        </Text>
                        <Text style={[styles.infoMeta, { color: theme.colors.text.tertiary }]}>
                            API keys remain in backend-proxy, never in the mobile app.
                        </Text>
                        {!!selectedProviderStatus?.detailCode && (
                            <Text style={[styles.infoMeta, { color: theme.colors.text.tertiary }]}>
                                Detail code: {selectedProviderStatus.detailCode}
                            </Text>
                        )}
                        {!!selectedProviderStatus?.requestId && (
                            <Text style={[styles.infoMeta, { color: theme.colors.text.tertiary }]}>
                                Trace: {selectedProviderStatus.requestId}
                            </Text>
                        )}
                    </GroupedSection>
                </View>

                <View style={styles.sectionBlock}>
                    <SectionHeader
                        title="Troubleshooting"
                        subtitle="Quick recovery actions for setup and availability issues."
                    />
                    <GroupedSection style={styles.troubleshootingCard}>
                        <AppButton
                            label="Refresh All Status"
                            onPress={loadData}
                            variant="secondary"
                        />
                        {activeProvider === 'cloud' && localProviderStatus?.available && (
                            <AppButton
                                label="Switch to Local Now"
                                onPress={() => handleSwitchProvider('local')}
                            />
                        )}
                        {activeProvider === 'local' && cloudProviderStatus?.available && (
                            <AppButton
                                label="Switch to Cloud Now"
                                onPress={() => handleSwitchProvider('cloud')}
                            />
                        )}
                        <Text style={[styles.troubleshootingHint, { color: theme.colors.text.tertiary }]}>
                            If cloud is unavailable, verify proxy URL and backend-proxy health. If local is unavailable, ensure one installed model has a valid file.
                        </Text>
                    </GroupedSection>
                </View>
            </ScrollView>
        </ScreenScaffold>
    );
}

const styles = StyleSheet.create({
    refreshButton: {
        marginRight: 12
    },
    content: {
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 28,
        gap: 10
    },
    sectionBlock: {
        marginTop: 8
    },
    providerCard: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        marginBottom: 10
    },
    providerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10
    },
    providerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1
    },
    providerName: {
        fontSize: 16,
        fontWeight: '700'
    },
    providerDescription: {
        marginTop: 6,
        fontSize: 13
    },
    providerHint: {
        marginTop: 4,
        fontSize: 12
    },
    checkedText: {
        marginTop: 8,
        fontSize: 11
    },
    providerActions: {
        marginTop: 10
    },
    infoCard: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 8
    },
    infoTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10
    },
    infoTitle: {
        fontSize: 15,
        fontWeight: '700'
    },
    infoBody: {
        fontSize: 13,
        lineHeight: 19
    },
    infoMeta: {
        fontSize: 12
    },
    storageCard: {
        marginBottom: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8
    },
    storageText: {
        fontSize: 13,
        fontWeight: '600'
    },
    modelCard: {
        marginBottom: 10,
        paddingHorizontal: 12,
        paddingVertical: 12
    },
    modelTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10
    },
    modelNameRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    modelName: {
        fontSize: 15,
        fontWeight: '700'
    },
    modelDescription: {
        marginTop: 6,
        fontSize: 13
    },
    modelMeta: {
        marginTop: 5,
        fontSize: 12
    },
    modelActions: {
        marginTop: 10,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8
    },
    progressBlock: {
        marginTop: 10,
        gap: 6
    },
    progressLabel: {
        fontSize: 12
    },
    progressTrack: {
        height: 8,
        borderRadius: 999,
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        borderRadius: 999
    },
    troubleshootingCard: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 8
    },
    troubleshootingHint: {
        fontSize: 12,
        lineHeight: 17
    }
});
