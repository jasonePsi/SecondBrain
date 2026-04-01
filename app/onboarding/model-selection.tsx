import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { getAllModels, ModelConfig } from '../../src/constants/ModelRegistry';
import { ModelManager } from '../../src/services/ModelManager';
import { useAppTheme } from '../../src/theme/theme';
import { runLayoutFeedback, triggerHaptic, useReducedMotion } from '../../src/services/interaction_feedback';
import {
    AppButton,
    GroupedSection,
    InlineBanner,
    LoadingStateView,
    ScreenScaffold,
    SectionHeader,
    StatusChip
} from '../../src/components/ui';

type ModelRowStatus = 'active' | 'installed' | 'available';

const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0.0 GB';
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
};

const formatBatteryImpact = (impact: ModelConfig['batteryImpact']): string => {
    if (impact === 'low') return 'Low impact';
    if (impact === 'medium') return 'Balanced impact';
    if (impact === 'high') return 'High impact';
    return 'Unknown impact';
};

const statusTone = (status: ModelRowStatus): 'success' | 'neutral' | 'info' => {
    if (status === 'active') return 'success';
    if (status === 'installed') return 'neutral';
    return 'info';
};

const statusLabel = (status: ModelRowStatus): string => {
    if (status === 'active') return 'Active';
    if (status === 'installed') return 'Installed';
    return 'Available';
};

const modelCategoryTone = (model: ModelConfig): 'info' | 'warning' => {
    return model.category === 'fast' ? 'info' : 'warning';
};

const modelCategoryLabel = (model: ModelConfig): string => {
    return model.category === 'fast' ? 'Fast' : 'Smart';
};

export default function ModelSelectionScreen() {
    const router = useRouter();
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    const [models, setModels] = useState<ModelConfig[]>([]);
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [availableStorage, setAvailableStorage] = useState<number>(0);
    const [installedModelIds, setInstalledModelIds] = useState<Set<string>>(new Set());
    const [missingInstalledCount, setMissingInstalledCount] = useState(0);
    const [activeModelId, setActiveModelId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            setLoadError(null);
            const allModels = getAllModels();
            runLayoutFeedback(reducedMotion);
            setModels(allModels);

            const freeDisk = await FileSystem.getFreeDiskStorageAsync();
            setAvailableStorage(freeDisk);

            const installedModels = await ModelManager.getInstalledModels();
            const activeModel = await ModelManager.getActiveModel();
            const installChecks = await Promise.all(
                installedModels.map(async (model) => ({
                    modelId: model.model_id,
                    usable: await ModelManager.isInstalled(model.model_id)
                }))
            );
            const installedIds = new Set(
                installChecks
                    .filter((item) => item.usable)
                    .map((item) => item.modelId)
            );
            const missingCount = installChecks.filter((item) => !item.usable).length;
            const activeIsUsable = !!activeModel?.model_id && installedIds.has(activeModel.model_id);

            setInstalledModelIds(installedIds);
            setMissingInstalledCount(missingCount);
            setActiveModelId(activeIsUsable ? activeModel!.model_id : null);

            if (activeIsUsable) {
                setSelectedModel(activeModel!.model_id);
            } else if (installedIds.size > 0) {
                setSelectedModel(Array.from(installedIds)[0]);
            } else {
                const fallbackModelId = freeDisk < 5_000_000_000
                    ? 'llama-3.2-1b'
                    : (allModels[0]?.id || null);
                setSelectedModel(fallbackModelId);
            }
        } catch (error) {
            console.error('Error loading model data:', error);
            setLoadError('Model list is temporarily unavailable. Please try again.');
            triggerHaptic('error', reducedMotion);
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshModels = () => {
        triggerHaptic('selection', reducedMotion);
        loadData();
    };

    const getModelStatus = (modelId: string): ModelRowStatus => {
        if (activeModelId === modelId) return 'active';
        if (installedModelIds.has(modelId)) return 'installed';
        return 'available';
    };

    const selectedModelConfig = useMemo(
        () => models.find((model) => model.id === selectedModel) || null,
        [models, selectedModel]
    );
    const selectedModelLowStorageRisk = !!selectedModelConfig
        && availableStorage < selectedModelConfig.sizeBytes * 1.5;
    const installedUsableCount = installedModelIds.size;
    const selectionNextStepTitle = selectedModelConfig
        ? `Selected: ${selectedModelConfig.name}`
        : 'Select a model to continue';
    const selectionNextStepHint = selectedModel && installedModelIds.has(selectedModel)
        ? 'This sets your active local model now.'
        : selectedModelConfig
            ? `Next step downloads and activates ${selectedModelConfig.name}.`
            : 'Choose one model to continue setup.';

    const handleContinue = async () => {
        if (!selectedModel) return;

        const isInstalled = installedModelIds.has(selectedModel);
        try {
            setSubmitting(true);
            if (isInstalled) {
                await ModelManager.setActiveModel(selectedModel);
                triggerHaptic('success', reducedMotion);
                router.replace('/');
                return;
            }

            triggerHaptic('selection', reducedMotion);
            router.push({
                pathname: '/onboarding/download',
                params: { modelId: selectedModel }
            });
        } catch (error: any) {
            Alert.alert('Model Setup Failed', error?.message || 'Could not activate selected model.');
            triggerHaptic('error', reducedMotion);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <ScreenScaffold>
                <LoadingStateView
                    title="Loading local models"
                    message="Checking storage and install status."
                />
            </ScreenScaffold>
        );
    }

    return (
        <ScreenScaffold>
            <Stack.Screen options={{ title: 'Model Setup' }} />
            <ScrollView contentContainerStyle={styles.content}>
                <SectionHeader
                    title="Choose a Local Model"
                    subtitle="Select one model to complete setup. You can install or switch more models later in Settings."
                />

                <GroupedSection style={styles.storageCard}>
                    <View style={styles.storageTopRow}>
                        <Text style={[styles.storageLabel, { color: theme.colors.text.secondary }]}>
                            Free storage
                        </Text>
                        <StatusChip label={formatBytes(availableStorage)} tone="info" />
                    </View>
                    <Text style={[styles.storageHint, { color: theme.colors.text.tertiary }]}>
                        Choose a smaller model for faster setup and lower battery impact, or a larger model for better answer quality.
                    </Text>
                </GroupedSection>

                <GroupedSection style={styles.lifecycleCard}>
                    <View style={styles.lifecycleTopRow}>
                        <Text style={[styles.lifecycleLabel, { color: theme.colors.text.secondary }]}>
                            Installed usable models
                        </Text>
                        <StatusChip
                            label={`${installedUsableCount}`}
                            tone={installedUsableCount > 0 ? 'success' : 'warning'}
                        />
                    </View>
                    <Text style={[styles.lifecycleHint, { color: theme.colors.text.tertiary }]}>
                        {installedUsableCount > 0
                            ? 'You can activate an installed model immediately, or download another one.'
                            : 'No local model is ready yet. Download one model to finish onboarding.'}
                    </Text>
                </GroupedSection>

                {!!loadError && (
                    <InlineBanner
                        tone="error"
                        message={loadError}
                        actionLabel="Retry"
                        onActionPress={handleRefreshModels}
                    />
                )}

                {missingInstalledCount > 0 && (
                    <InlineBanner
                        tone="warning"
                        message={`${missingInstalledCount} previously installed model ${missingInstalledCount === 1 ? 'entry is' : 'entries are'} missing local files. You can reinstall from Settings later.`}
                    />
                )}

                {models.map((model) => {
                    const status = getModelStatus(model.id);
                    const isSelected = selectedModel === model.id;
                    const lowStorageRisk = availableStorage < model.sizeBytes * 1.5;
                    return (
                        <TouchableOpacity
                            key={model.id}
                            onPress={() => {
                                triggerHaptic('selection', reducedMotion);
                                setSelectedModel(model.id);
                            }}
                            activeOpacity={0.9}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={`${model.name}. ${statusLabel(status)}. ${formatBatteryImpact(model.batteryImpact)}.`}
                            accessibilityHint="Selects this model for onboarding"
                            accessibilityState={{ selected: isSelected }}
                        >
                            <GroupedSection
                                style={[
                                    styles.modelCard,
                                    {
                                        borderColor: isSelected ? theme.colors.tint.primary : theme.colors.separator.subtle,
                                        backgroundColor: isSelected ? theme.colors.background.elevated : theme.colors.background.surface
                                    }
                                ]}
                            >
                                <View style={styles.modelTopRow}>
                                    <View style={styles.modelTitleWrap}>
                                        <Text style={[styles.modelTitle, { color: theme.colors.text.primary }]}>
                                            {model.name}
                                        </Text>
                                        <View style={styles.modelChips}>
                                            <StatusChip label={modelCategoryLabel(model)} tone={modelCategoryTone(model)} />
                                            <StatusChip label={statusLabel(status)} tone={statusTone(status)} />
                                        </View>
                                    </View>
                                    {isSelected && (
                                        <Ionicons
                                            name="checkmark-circle"
                                            size={20}
                                            color={theme.colors.tint.primary}
                                        />
                                    )}
                                </View>

                                <Text style={[styles.modelDescription, { color: theme.colors.text.secondary }]}>
                                    {model.description}
                                </Text>

                                <Text style={[styles.modelMeta, { color: theme.colors.text.tertiary }]}>
                                    Size {formatBytes(model.sizeBytes)} • Speed {model.speedRating}/5 • Quality {model.qualityRating}/5 • Battery {formatBatteryImpact(model.batteryImpact)}
                                </Text>

                                {lowStorageRisk && (
                                    <View style={styles.lowStorageWrap}>
                                        <InlineBanner
                                            tone="warning"
                                            message="Storage may be too low for this model. Setup can fail if free space drops during download."
                                        />
                                    </View>
                                )}
                            </GroupedSection>
                        </TouchableOpacity>
                    );
                })}

                <GroupedSection style={styles.ctaCard}>
                    <Text style={[styles.ctaTitle, { color: theme.colors.text.primary }]}>
                        {selectionNextStepTitle}
                    </Text>
                    <Text style={[styles.ctaHint, { color: theme.colors.text.secondary }]}>
                        {selectionNextStepHint}
                    </Text>
                    {selectedModelLowStorageRisk && (
                        <InlineBanner
                            tone="warning"
                            message="Selected model may exceed available storage during install. Consider a smaller model first."
                        />
                    )}
                    <View style={styles.ctaActions}>
                        <AppButton
                            label={submitting
                                ? 'Please wait…'
                                : selectedModel && installedModelIds.has(selectedModel)
                                    ? 'Use Selected Model'
                                    : `Download & Continue${selectedModelConfig ? ` (${formatBytes(selectedModelConfig.sizeBytes)})` : ''}`}
                            onPress={handleContinue}
                            disabled={!selectedModel || submitting}
                            loading={submitting}
                        />
                        <AppButton
                            label="Refresh Model List"
                            variant="secondary"
                            onPress={handleRefreshModels}
                            disabled={submitting}
                        />
                    </View>
                </GroupedSection>
            </ScrollView>
        </ScreenScaffold>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 30,
        gap: 10
    },
    storageCard: {
        paddingHorizontal: 12,
        paddingVertical: 12
    },
    storageTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8
    },
    storageLabel: {
        fontSize: 13,
        fontWeight: '600'
    },
    storageHint: {
        marginTop: 6,
        fontSize: 12
    },
    lifecycleCard: {
        paddingHorizontal: 12,
        paddingVertical: 12
    },
    lifecycleTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8
    },
    lifecycleLabel: {
        fontSize: 13,
        fontWeight: '600'
    },
    lifecycleHint: {
        marginTop: 6,
        fontSize: 12
    },
    modelCard: {
        marginTop: 4,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderWidth: 1
    },
    modelTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8
    },
    modelTitleWrap: {
        flex: 1
    },
    modelTitle: {
        fontSize: 16,
        fontWeight: '700'
    },
    modelChips: {
        marginTop: 6,
        flexDirection: 'row',
        gap: 6,
        flexWrap: 'wrap'
    },
    modelDescription: {
        marginTop: 8,
        fontSize: 13
    },
    modelMeta: {
        marginTop: 6,
        fontSize: 12
    },
    lowStorageWrap: {
        marginTop: 8
    },
    ctaCard: {
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 12
    },
    ctaTitle: {
        fontSize: 15,
        fontWeight: '700'
    },
    ctaHint: {
        marginTop: 5,
        fontSize: 13
    },
    ctaActions: {
        marginTop: 10,
        gap: 8
    }
});
