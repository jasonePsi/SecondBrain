import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '../../src/constants/Colors';
import { getAllModels, ModelConfig } from '../../src/constants/ModelRegistry';
import { ModelManager } from '../../src/services/ModelManager';

export default function ModelSelectionScreen() {
    const router = useRouter();
    const [models, setModels] = useState<ModelConfig[]>([]);
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [availableStorage, setAvailableStorage] = useState<number>(0);
    const [installedModelIds, setInstalledModelIds] = useState<Set<string>>(new Set());
    const [activeModelId, setActiveModelId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const allModels = getAllModels();
            setModels(allModels);

            // Get available storage (FreeDiskStorage on iOS)
            const freeDisk = await FileSystem.getFreeDiskStorageAsync();
            setAvailableStorage(freeDisk);

            const installedModels = await ModelManager.getInstalledModels();
            const activeModel = await ModelManager.getActiveModel();
            const installedIds = new Set(installedModels.map((model) => model.model_id));

            setInstalledModelIds(installedIds);
            setActiveModelId(activeModel?.model_id || null);

            if (activeModel?.model_id) {
                setSelectedModel(activeModel.model_id);
            } else if (installedModels.length > 0) {
                setSelectedModel(installedModels[0].model_id);
            } else if (freeDisk < 5_000_000_000) {
                // Auto-select lighter model if storage is tight.
                setSelectedModel('llama-3.2-1b');
            }
        } catch (error) {
            console.error('Error loading model data:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatBytes = (bytes: number): string => {
        return (bytes / 1_000_000_000).toFixed(1) + ' GB';
    };

    const formatBatteryImpact = (impact: ModelConfig['batteryImpact']) => {
        if (impact === 'low') return '🔋 Low';
        if (impact === 'medium') return '🔋 Medium';
        return '🔋 High';
    };

    const getModelStatus = (modelId: string): 'active' | 'installed' | 'available' => {
        if (activeModelId === modelId) return 'active';
        if (installedModelIds.has(modelId)) return 'installed';
        return 'available';
    };

    const handleContinue = async () => {
        if (!selectedModel) return;

        const isInstalled = installedModelIds.has(selectedModel);
        try {
            setSubmitting(true);
            if (isInstalled) {
                await ModelManager.setActiveModel(selectedModel);
                router.replace('/');
                return;
            }

            router.push({
                pathname: '/onboarding/download',
                params: { modelId: selectedModel }
            });
        } catch (error: any) {
            Alert.alert('Model Setup Failed', error?.message || 'Could not activate selected model.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            <Text style={styles.title}>Choose Your Brain</Text>
            <Text style={styles.subtitle}>
                Select a language model that fits your needs. You can change this later.
            </Text>

            <View style={styles.storageInfo}>
                <Text style={styles.storageText}>
                    Available Storage: {formatBytes(availableStorage)}
                </Text>
            </View>

            {models.map((model) => (
                <TouchableOpacity
                    key={model.id}
                    style={[
                        styles.modelCard,
                        selectedModel === model.id && styles.modelCardSelected
                    ]}
                    onPress={() => setSelectedModel(model.id)}
                >
                    <View style={styles.modelHeader}>
                        <View style={styles.modelTitleRow}>
                            <Text style={styles.modelName}>{model.name}</Text>
                            <View style={[
                                styles.categoryBadge,
                                model.category === 'fast' ? styles.fastBadge : styles.smartBadge
                            ]}>
                                <Text style={styles.categoryText}>
                                    {model.category === 'fast' ? '⚡ Fast' : '🧠 Smart'}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.statusRow}>
                            <View style={[
                                styles.statusBadge,
                                getModelStatus(model.id) === 'active' ? styles.statusActive :
                                    getModelStatus(model.id) === 'installed' ? styles.statusInstalled : styles.statusAvailable
                            ]}>
                                <Text style={styles.statusBadgeText}>
                                    {getModelStatus(model.id) === 'active' ? 'Active' :
                                        getModelStatus(model.id) === 'installed' ? 'Installed' : 'Available'}
                                </Text>
                            </View>
                        </View>
                        <Text style={styles.modelDescription}>{model.description}</Text>
                    </View>

                    <View style={styles.modelStats}>
                        <View style={styles.statRow}>
                            <Text style={styles.statLabel}>Size:</Text>
                            <Text style={styles.statValue}>{formatBytes(model.sizeBytes)}</Text>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={styles.statLabel}>Speed:</Text>
                            <View style={styles.ratingBar}>
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <View
                                        key={i}
                                        style={[
                                            styles.ratingDot,
                                            i <= model.speedRating && styles.ratingDotFilled
                                        ]}
                                    />
                                ))}
                            </View>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={styles.statLabel}>Quality:</Text>
                            <View style={styles.ratingBar}>
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <View
                                        key={i}
                                        style={[
                                            styles.ratingDot,
                                            i <= model.qualityRating && styles.ratingDotFilled
                                        ]}
                                    />
                                ))}
                            </View>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={styles.statLabel}>Battery:</Text>
                            <Text style={styles.statValue}>
                                {formatBatteryImpact(model.batteryImpact)}
                            </Text>
                        </View>
                    </View>

                    {availableStorage < model.sizeBytes * 1.5 && (
                        <View style={styles.warningBox}>
                            <Text style={styles.warningText}>
                                ⚠️ Low storage. This model may not download successfully.
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
            ))}

            <TouchableOpacity
                style={[
                    styles.continueButton,
                    (!selectedModel || submitting) && styles.continueButtonDisabled
                ]}
                onPress={handleContinue}
                disabled={!selectedModel || submitting}
            >
                <Text style={styles.continueButtonText}>
                    {selectedModel && installedModelIds.has(selectedModel)
                        ? 'Use Selected Model'
                        : 'Download & Continue'}
                </Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background
    },
    contentContainer: {
        padding: 20,
        paddingTop: 60
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        marginBottom: 8
    },
    subtitle: {
        fontSize: 16,
        color: Colors.textSecondary,
        marginBottom: 24
    },
    storageInfo: {
        backgroundColor: Colors.card,
        padding: 12,
        borderRadius: 8,
        marginBottom: 20
    },
    storageText: {
        fontSize: 14,
        color: Colors.textSecondary
    },
    modelCard: {
        backgroundColor: Colors.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: 'transparent'
    },
    modelCardSelected: {
        borderColor: Colors.primary
    },
    modelHeader: {
        marginBottom: 12
    },
    modelTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8
    },
    modelName: {
        fontSize: 20,
        fontWeight: 'bold'
    },
    categoryBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12
    },
    fastBadge: {
        backgroundColor: '#4CAF50'
    },
    smartBadge: {
        backgroundColor: '#2196F3'
    },
    categoryText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600'
    },
    modelDescription: {
        fontSize: 14,
        color: Colors.textSecondary
    },
    statusRow: {
        flexDirection: 'row',
        marginBottom: 8
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999
    },
    statusAvailable: {
        backgroundColor: '#E5E7EB'
    },
    statusInstalled: {
        backgroundColor: '#DBEAFE'
    },
    statusActive: {
        backgroundColor: '#DCFCE7'
    },
    statusBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#1F2937'
    },
    modelStats: {
        gap: 8
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    statLabel: {
        fontSize: 14,
        color: Colors.textSecondary,
        width: 80
    },
    statValue: {
        fontSize: 14,
        fontWeight: '500'
    },
    ratingBar: {
        flexDirection: 'row',
        gap: 4
    },
    ratingDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: Colors.border
    },
    ratingDotFilled: {
        backgroundColor: Colors.primary
    },
    warningBox: {
        marginTop: 12,
        padding: 8,
        backgroundColor: '#FFF3CD',
        borderRadius: 6
    },
    warningText: {
        fontSize: 12,
        color: '#856404'
    },
    continueButton: {
        backgroundColor: Colors.primary,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 40
    },
    continueButtonDisabled: {
        backgroundColor: Colors.border,
        opacity: 0.5
    },
    continueButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600'
    }
});
