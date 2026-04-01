import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
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
    getDeleteModelSuccessMessage,
    canAutoRepairLocalProviderSwitch,
    deriveSettingsProviderFeedback,
    getProviderBadgeLabel,
    getLocalModelSummary,
    getProviderSwitchState,
    getSettingsModelActionState,
    getSettingsModelStatus,
    getSettingsModelStatusLabel,
    getSettingsModelStatusTone,
    getSettingsProviderTone,
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
import { SettingsActiveModelCard } from '../../src/components/settings/SettingsActiveModelCard';
import { SettingsModelCard } from '../../src/components/settings/SettingsModelCard';
import { SettingsProviderCard } from '../../src/components/settings/SettingsProviderCard';
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

    const handleRefreshSettings = () => {
        triggerHaptic('selection', reducedMotion);
        loadData();
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
            triggerHaptic('selection', reducedMotion);
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
            Alert.alert('Provider Unavailable', error.message || 'Could not switch provider right now.');
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
            Alert.alert('Download Unavailable', error.message || 'Could not download this model right now.');
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
            Alert.alert('Model Activation Unavailable', error.message || 'Could not activate this model right now.');
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
                            const fallbackName = result.fallbackActiveModelId
                                ? (getModelById(result.fallbackActiveModelId)?.name || result.fallbackActiveModelId)
                                : null;
                            Alert.alert(
                                'Model Deleted',
                                getDeleteModelSuccessMessage({
                                    activeProvider,
                                    deletedWasActive: result.deletedWasActive,
                                    fallbackActiveModelName: fallbackName
                                })
                            );
                            triggerHaptic('success', reducedMotion);

                            await loadData();
                        } catch (error: any) {
                            Alert.alert('Delete Unavailable', error.message || 'Could not delete this model right now.');
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
    const activeModelName = activeModel
        ? (getModelById(activeModel.model_id)?.name || activeModel.model_id)
        : null;
    const localModelSummary = getLocalModelSummary({
        activeProvider,
        activeModelName,
        activeModelMissing,
        activeModelSizeBytes: activeModel?.size_bytes,
        usableInstalledModelCount: usableInstalledModels.length
    });

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
                            onPress={handleRefreshSettings}
                            style={styles.refreshButton}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Refresh provider and model status"
                            accessibilityHint="Rechecks provider availability and model install states"
                            accessibilityState={{ busy: loading }}
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
                        onActionPress={handleRefreshSettings}
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
                        const showStatusMessage = !!status && (!status.available || !status.configured || !!status.reason);
                        return (
                            <SettingsProviderCard
                                key={option.id}
                                provider={option.id}
                                name={option.name}
                                description={option.description}
                                privacyHint={option.privacyHint}
                                status={status}
                                badgeLabel={getProviderBadgeLabel({ status, isActive })}
                                badgeTone={getSettingsProviderTone(status, isActive)}
                                statusMessage={showStatusMessage ? formatProviderReason(status, false) : null}
                                statusMessageTone={status?.available ? 'info' : 'warning'}
                                checkedAtLabel={status?.lastCheckedAt ? formatCheckTime(status.lastCheckedAt) : null}
                                showSwitchAction={!isActive}
                                switchLabel={switchState.label}
                                switchDisabled={switchState.disabled}
                                switchLoading={switchingProvider === option.id}
                                onSwitch={() => handleSwitchProvider(option.id)}
                                onRefresh={handleRefreshSettings}
                            />
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
                        {!!cloudProviderStatus?.detailCode && (
                            <Text style={[styles.infoMeta, { color: theme.colors.text.tertiary }]}>
                                Status code: {cloudProviderStatus.detailCode}
                            </Text>
                        )}
                        {!!cloudProviderStatus?.requestId && (
                            <Text style={[styles.infoMeta, { color: theme.colors.text.tertiary }]}>
                                Trace: {cloudProviderStatus.requestId}
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
                    <SettingsActiveModelCard
                        title={localModelSummary.title}
                        body={localModelSummary.body}
                        statusLabel={localModelSummary.statusLabel}
                        statusTone={localModelSummary.statusTone}
                        warningMessage={activeModelMissing
                            ? 'Local model file is missing. Reinstall this model or pick another below.'
                            : null}
                        fallbackWarningMessage={localFallbackWarning}
                    />
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
                        const modelMeta = `${formatBytes(model.sizeBytes)} • Speed ${model.speedRating}/5 • Quality ${model.qualityRating}/5 • ${formatBatteryImpact(model.batteryImpact)}`;

                        return (
                            <SettingsModelCard
                                key={model.id}
                                model={model}
                                status={status}
                                statusLabel={getSettingsModelStatusLabel(status)}
                                statusTone={getSettingsModelStatusTone(status)}
                                categoryLabel={model.category === 'fast' ? 'Fast' : 'Smart'}
                                categoryTone={model.category === 'fast' ? 'info' : 'warning'}
                                meta={modelMeta}
                                actionState={actionState}
                                isDownloading={isDownloading}
                                downloadProgress={downloadProgress}
                                disableInstall={!!downloading}
                                onInstall={() => handleDownloadModel(model.id)}
                                onActivate={() => handleSwitchModel(model.id)}
                                onDelete={() => handleDeleteModel(model.id)}
                            />
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
                                Selected provider code: {selectedProviderStatus.detailCode}
                            </Text>
                        )}
                        {!!selectedProviderStatus?.requestId && (
                            <Text style={[styles.infoMeta, { color: theme.colors.text.tertiary }]}>
                                Selected trace: {selectedProviderStatus.requestId}
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
                            onPress={handleRefreshSettings}
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
        marginRight: 12,
        minWidth: 40,
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center'
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
    infoCard: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 8
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
