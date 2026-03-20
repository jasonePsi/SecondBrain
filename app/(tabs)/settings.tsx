import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Colors } from '../../src/constants/Colors';
import { ModelManager } from '../../src/services/ModelManager';
import { LLMService } from '../../src/services/LLMService';
import type { AIProviderStatus, AIProviderType } from '../../src/services/LLMService';
import { getAllModels, getModelById, ModelConfig } from '../../src/constants/ModelRegistry';
import { ModelSetting } from '../../src/repositories/model_repo';

export default function SettingsScreen() {
    const [activeProvider, setActiveProvider] = useState<AIProviderType>('local');
    const [providerStatuses, setProviderStatuses] = useState<AIProviderStatus[]>([]);
    const [switchingProvider, setSwitchingProvider] = useState<AIProviderType | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [activeModel, setActiveModel] = useState<ModelSetting | null>(null);
    const [installedModels, setInstalledModels] = useState<ModelSetting[]>([]);
    const [availableModels, setAvailableModels] = useState<ModelConfig[]>([]);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const formatProviderReason = (status?: AIProviderStatus): string => {
        if (!status) return 'Provider status is unknown. Tap Retry to refresh.';
        const reason = status.reason?.trim();
        const codePrefix = status.detailCode ? `[${status.detailCode}] ` : '';
        const requestSuffix = status.requestId ? ` (trace ${status.requestId})` : '';
        if (reason) return `${codePrefix}${reason}${requestSuffix}`;
        if (!status.configured) return `${codePrefix}Provider is not configured${requestSuffix}`;
        if (!status.available) return `${codePrefix}Provider is unavailable${requestSuffix}`;
        return '';
    };

    const loadData = async () => {
        try {
            setLoading(true);
            setLoadError(null);
            const [
                selectedProvider,
                statuses,
                active,
                installed
            ] = await Promise.all([
                LLMService.getActiveProvider(),
                LLMService.listProviderStatuses(),
                ModelManager.getActiveModel(),
                ModelManager.getInstalledModels()
            ]);

            const all = getAllModels();
            setActiveProvider(selectedProvider);
            setProviderStatuses(statuses);
            setActiveModel(active);
            setInstalledModels(installed);
            setAvailableModels(all);

            const selectedStatus = statuses.find((item) => item.provider === selectedProvider);
            if (selectedStatus && !selectedStatus.available) {
                setLoadError(formatProviderReason(selectedStatus));
            } else if (!selectedStatus) {
                setLoadError('Selected provider status is unknown. Tap Retry to refresh.');
            }
        } catch (error) {
            console.error('Error loading model data:', error);
            setLoadError('Could not refresh settings. Try again.');
        } finally {
            setLoading(false);
        }
    };

    const getProviderStatus = (provider: AIProviderType): AIProviderStatus | undefined => {
        return providerStatuses.find((item) => item.provider === provider);
    };

    const getProviderBadgeLabel = (
        status: AIProviderStatus | undefined,
        isActive: boolean
    ): string => {
        if (!status) return isActive ? 'Selected · Status Unknown' : 'Status Unknown';
        if (!status?.configured) return isActive ? 'Selected · Not Configured' : 'Not Configured';
        if (isActive && status?.available === false) return 'Selected · Unavailable';
        if (isActive) return 'Selected';
        if (status?.available) return 'Available';
        return 'Unavailable';
    };

    const handleSwitchProvider = async (provider: AIProviderType) => {
        try {
            setSwitchingProvider(provider);
            if (provider === 'cloud') {
                const latestCloudStatus = await LLMService.getProviderStatus('cloud');
                setProviderStatuses((prev) => {
                    const others = prev.filter((item) => item.provider !== 'cloud');
                    return [...others, latestCloudStatus];
                });
                if (!latestCloudStatus.available) {
                    setLoadError(formatProviderReason(latestCloudStatus));
                    throw new Error(formatProviderReason(latestCloudStatus));
                }
            }
            await LLMService.setActiveProvider(provider);
            setLoadError(null);
            Alert.alert(
                'Provider Updated',
                provider === 'cloud'
                    ? 'Cloud provider is now active.'
                    : 'Local provider is now active.'
            );
        } catch (error: any) {
            Alert.alert('Provider Unavailable', error.message || 'Could not switch provider.');
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

            Alert.alert('Model Installed', 'Model download complete. Select "Use This Model" to activate it.');
            await loadData();
        } catch (error: any) {
            Alert.alert('Download Failed', error.message || 'Failed to download model');
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
            Alert.alert('Model Active', 'This model is now active.');
            await loadData();
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to switch model');
        }
    };

    const handleDeleteModel = (modelId: string) => {
        const modelConfig = getModelById(modelId);

        Alert.alert(
            'Delete Model',
            `Are you sure you want to delete ${modelConfig?.name}? This will free up ${formatBytes(modelConfig?.sizeBytes || 0)}.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const result = await ModelManager.deleteModel(modelId);
                            await LLMService.release();

                            if (result.deletedWasActive && result.fallbackActiveModelId) {
                                const fallbackName = getModelById(result.fallbackActiveModelId)?.name || result.fallbackActiveModelId;
                                Alert.alert('Model Deleted', `${fallbackName} is now active.`);
                            } else if (result.deletedWasActive) {
                                Alert.alert('Model Deleted', 'No installed models remain. Install and activate a model to continue chatting.');
                            } else {
                                Alert.alert('Model Deleted', 'Model removed from this device.');
                            }

                            await loadData();
                        } catch (error: any) {
                            Alert.alert('Error', error.message || 'Failed to delete model');
                        }
                    }
                }
            ]
        );
    };

    const formatBytes = (bytes: number): string => {
        return (bytes / 1_000_000_000).toFixed(1) + ' GB';
    };

    const getTotalStorageUsed = (): number => {
        return installedModels.reduce((total, model) => total + model.size_bytes, 0);
    };

    const isModelInstalled = (modelId: string): boolean => {
        return installedModels.some(m => m.model_id === modelId);
    };

    const getModelStatus = (
        modelId: string,
        isDownloading: boolean
    ): 'available' | 'downloading' | 'installed' | 'active' => {
        if (isDownloading) return 'downloading';
        if (activeModel?.model_id === modelId) return 'active';
        if (isModelInstalled(modelId)) return 'installed';
        return 'available';
    };

    const getStatusLabel = (status: ReturnType<typeof getModelStatus>): string => {
        if (status === 'active') return 'Active';
        if (status === 'installed') return 'Installed';
        if (status === 'downloading') return 'Downloading';
        return 'Available';
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading settings…</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.header}>Settings</Text>
            {!!loadError && (
                <View style={styles.inlineWarningRow}>
                    <Text style={styles.inlineWarning}>{loadError}</Text>
                    <TouchableOpacity onPress={loadData}>
                        <Text style={styles.inlineWarningAction}>Retry</Text>
                    </TouchableOpacity>
                </View>
            )}

            <View style={styles.section}>
                <Text style={styles.sectionHeader}>AI Provider</Text>
                <Text style={styles.smallText}>
                    Current provider: {activeProvider === 'cloud' ? 'OpenAI Cloud (Proxy)' : 'Local (On-device)'}
                </Text>
                {[
                    {
                        id: 'local' as AIProviderType,
                        name: 'Local (On-device)',
                        description: 'Runs fully offline with your installed GGUF model.'
                    },
                    {
                        id: 'cloud' as AIProviderType,
                        name: 'OpenAI Cloud (Proxy)',
                        description: 'Routes requests through your backend proxy (no API key in app).'
                    }
                ].map((option) => {
                    const status = getProviderStatus(option.id);
                    const isActive = activeProvider === option.id;
                    const isUnavailable = option.id === 'cloud' && !!status && !status.available;
                    const disabled = !!switchingProvider || isUnavailable;

                    return (
                        <View key={option.id} style={styles.providerCard}>
                            <View style={styles.providerHeader}>
                                <Text style={styles.providerName}>{option.name}</Text>
                                <View style={[
                                    styles.providerBadge,
                                    isActive && status?.available === false
                                        ? styles.providerBadgeUnavailable
                                        : isActive
                                            ? styles.providerBadgeActive
                                            : (
                                        status?.available
                                            ? styles.providerBadgeAvailable
                                            : styles.providerBadgeUnavailable
                                    )
                                ]}>
                                    <Text style={styles.providerBadgeText}>
                                        {getProviderBadgeLabel(status, isActive)}
                                    </Text>
                                </View>
                            </View>

                            <Text style={styles.providerDescription}>{option.description}</Text>
                            {status && (!status.available || !status.configured || !!status.reason) && (
                                <Text style={styles.providerReason}>{formatProviderReason(status)}</Text>
                            )}
                            {!status && (
                                <Text style={styles.providerReason}>Status not loaded yet. Tap Retry above.</Text>
                            )}

                            {!isActive && (
                                <TouchableOpacity
                                    style={[
                                        styles.providerSwitchButton,
                                        disabled && styles.providerSwitchButtonDisabled
                                    ]}
                                    onPress={() => handleSwitchProvider(option.id)}
                                    disabled={disabled}
                                >
                                    {switchingProvider === option.id ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={styles.providerSwitchButtonText}>
                                            {isUnavailable && option.id === 'cloud'
                                                ? 'Cloud Unavailable'
                                                : (option.id === 'cloud' ? 'Switch to Cloud' : 'Switch to Local')}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                })}
            </View>

            {/* Active Model Section */}
            <View style={styles.section}>
                <Text style={styles.sectionHeader}>Active Model</Text>
                {activeModel ? (
                    <View style={styles.activeModelCard}>
                        <Text style={styles.activeModelName}>
                            {getModelById(activeModel.model_id)?.name || 'Unknown Model'}
                        </Text>
                        <Text style={styles.activeModelInfo}>
                            Size: {formatBytes(activeModel.size_bytes)}
                        </Text>
                    </View>
                ) : (
                    <>
                        <Text style={styles.text}>
                            {activeProvider === 'cloud'
                                ? 'No local fallback model selected'
                                : 'No active model selected'}
                        </Text>
                        {installedModels.length > 0 && (
                            <Text style={styles.smallText}>
                                {activeProvider === 'cloud'
                                    ? 'Optional: select one below for offline fallback.'
                                    : 'Select an installed model below to activate it.'}
                            </Text>
                        )}
                        {installedModels.length === 0 && (
                            <Text style={styles.smallText}>
                                Install a local model below to enable offline chat.
                            </Text>
                        )}
                    </>
                )}
                {activeProvider === 'cloud' && (
                    <Text style={styles.smallText}>
                        Cloud is selected. Local models stay installed for offline fallback.
                    </Text>
                )}
            </View>

            {/* Storage Info */}
            <View style={styles.section}>
                <Text style={styles.sectionHeader}>Storage</Text>
                <Text style={styles.text}>
                    Total Used: {formatBytes(getTotalStorageUsed())}
                </Text>
                <Text style={styles.smallText}>
                    {installedModels.length} model(s) installed
                </Text>
            </View>

            {/* Available Models */}
            <View style={styles.section}>
                <Text style={styles.sectionHeader}>Local Models</Text>
                <Text style={styles.smallText}>
                    Install a model first, then activate it with “Use This Model”.
                </Text>

                {availableModels.map((model) => {
                    const installed = isModelInstalled(model.id);
                    const isActive = activeModel?.model_id === model.id;
                    const isDownloading = downloading === model.id;
                    const modelStatus = getModelStatus(model.id, isDownloading);

                    return (
                        <View key={model.id} style={styles.modelCard}>
                            <View style={styles.modelHeader}>
                                <Text style={styles.modelName}>{model.name}</Text>
                                <View style={[
                                    styles.statusBadge,
                                    modelStatus === 'active' ? styles.statusActive :
                                        modelStatus === 'installed' ? styles.statusInstalled :
                                            modelStatus === 'downloading' ? styles.statusDownloading : styles.statusAvailable
                                ]}>
                                    <Text style={styles.statusBadgeText}>{getStatusLabel(modelStatus)}</Text>
                                </View>
                            </View>

                            <Text style={styles.modelDescription}>{model.description}</Text>
                            <Text style={styles.modelSize}>Size: {formatBytes(model.sizeBytes)}</Text>

                            {isDownloading ? (
                                <View style={styles.downloadProgress}>
                                    <Text style={styles.progressText}>
                                        Downloading... {(downloadProgress * 100).toFixed(0)}%
                                    </Text>
                                    <View style={styles.progressBar}>
                                        <View
                                            style={[
                                                styles.progressFill,
                                                { width: `${downloadProgress * 100}%` }
                                            ]}
                                        />
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.modelActions}>
                                    {!installed ? (
                                        <TouchableOpacity
                                            style={styles.downloadButton}
                                            onPress={() => handleDownloadModel(model.id)}
                                            disabled={!!downloading}
                                        >
                                            <Text style={styles.downloadButtonText}>Install</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <>
                                            {!isActive && (
                                                <TouchableOpacity
                                                    style={styles.switchButton}
                                                    onPress={() => handleSwitchModel(model.id)}
                                                >
                                                    <Text style={styles.switchButtonText}>Use This Model</Text>
                                                </TouchableOpacity>
                                            )}
                                            <TouchableOpacity
                                                style={styles.deleteButton}
                                                onPress={() => handleDeleteModel(model.id)}
                                            >
                                                <Text style={styles.deleteButtonText}>Delete</Text>
                                            </TouchableOpacity>
                                        </>
                                    )}
                                </View>
                            )}
                        </View>
                    );
                })}
            </View>

            {/* Battery Optimization Tip */}
            {activeModel?.model_id === 'phi-3-mini' && (
                <View style={styles.tipBox}>
                    <Text style={styles.tipText}>
                        💡 Tip: Phi-3 uses more battery. Consider running batch operations only while charging.
                    </Text>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        padding: 16
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background
    },
    loadingText: {
        marginTop: 10,
        color: Colors.secondaryText
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        marginTop: 10
    },
    inlineWarning: {
        flex: 1,
        color: Colors.notification,
        fontSize: 12
    },
    inlineWarningRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10
    },
    inlineWarningAction: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '600'
    },
    section: {
        backgroundColor: Colors.card,
        padding: 16,
        borderRadius: 8,
        marginBottom: 16
    },
    sectionHeader: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 12
    },
    text: {
        marginBottom: 4,
        fontSize: 14
    },
    smallText: {
        fontSize: 12,
        color: Colors.textSecondary,
        marginTop: 4
    },
    activeModelCard: {
        padding: 12,
        backgroundColor: Colors.background,
        borderRadius: 6,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary
    },
    providerCard: {
        padding: 12,
        borderRadius: 6,
        backgroundColor: Colors.background,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: Colors.border
    },
    providerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4
    },
    providerName: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text
    },
    providerDescription: {
        fontSize: 12,
        color: Colors.secondaryText,
        marginBottom: 6
    },
    providerReason: {
        fontSize: 12,
        color: Colors.notification,
        marginBottom: 8
    },
    providerBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999
    },
    providerBadgeActive: {
        backgroundColor: '#DCFCE7'
    },
    providerBadgeAvailable: {
        backgroundColor: '#DBEAFE'
    },
    providerBadgeUnavailable: {
        backgroundColor: '#FEE2E2'
    },
    providerBadgeText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#1F2937'
    },
    providerSwitchButton: {
        backgroundColor: Colors.primary,
        borderRadius: 6,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center'
    },
    providerSwitchButtonDisabled: {
        opacity: 0.55
    },
    providerSwitchButtonText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600'
    },
    activeModelName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4
    },
    activeModelInfo: {
        fontSize: 12,
        color: Colors.textSecondary
    },
    modelCard: {
        padding: 12,
        backgroundColor: Colors.background,
        borderRadius: 6,
        marginBottom: 12
    },
    modelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4
    },
    modelName: {
        fontSize: 16,
        fontWeight: '600'
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999
    },
    statusAvailable: {
        backgroundColor: '#E5E7EB'
    },
    statusDownloading: {
        backgroundColor: '#FEF3C7'
    },
    statusInstalled: {
        backgroundColor: '#DBEAFE'
    },
    statusActive: {
        backgroundColor: '#DCFCE7'
    },
    statusBadgeText: {
        color: '#1F2937',
        fontSize: 10,
        fontWeight: '600'
    },
    modelDescription: {
        fontSize: 12,
        color: Colors.textSecondary,
        marginBottom: 4
    },
    modelSize: {
        fontSize: 12,
        color: Colors.textSecondary,
        marginBottom: 8
    },
    modelActions: {
        flexDirection: 'row',
        gap: 8
    },
    downloadButton: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 6,
        flex: 1
    },
    downloadButtonText: {
        color: 'white',
        fontWeight: '600',
        textAlign: 'center',
        fontSize: 14
    },
    switchButton: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 6,
        flex: 1
    },
    switchButtonText: {
        color: 'white',
        fontWeight: '600',
        textAlign: 'center',
        fontSize: 14
    },
    deleteButton: {
        backgroundColor: '#FF3B30',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 6
    },
    deleteButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14
    },
    downloadProgress: {
        marginTop: 8
    },
    progressText: {
        fontSize: 12,
        color: Colors.textSecondary,
        marginBottom: 4
    },
    progressBar: {
        height: 6,
        backgroundColor: Colors.border,
        borderRadius: 3,
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        backgroundColor: Colors.primary
    },
    tipBox: {
        backgroundColor: '#FFF3CD',
        padding: 12,
        borderRadius: 8,
        marginBottom: 20
    },
    tipText: {
        fontSize: 12,
        color: '#856404'
    }
});
