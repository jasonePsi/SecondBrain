import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Colors } from '../../src/constants/Colors';
import { ModelManager } from '../../src/services/ModelManager';
import { getAllModels, getModelById, ModelConfig } from '../../src/constants/ModelRegistry';
import { ModelSetting } from '../../src/repositories/model_repo';

export default function SettingsScreen() {
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

    const loadData = async () => {
        try {
            setLoading(true);
            const active = await ModelManager.getActiveModel();
            const installed = await ModelManager.getInstalledModels();
            const all = getAllModels();

            setActiveModel(active);
            setInstalledModels(installed);
            setAvailableModels(all);
        } catch (error) {
            console.error('Error loading model data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadModel = async (modelId: string) => {
        try {
            setDownloading(modelId);
            setDownloadProgress(0);

            await ModelManager.downloadModel(modelId, (progress) => {
                setDownloadProgress(progress);
            });

            Alert.alert('Success', 'Model downloaded successfully!');
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
            // Check if model is installed
            const installed = await ModelManager.isInstalled(modelId);

            if (!installed) {
                // Ask user if they want to download
                Alert.alert(
                    'Model Not Installed',
                    'This model needs to be downloaded first. Download now?',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Download',
                            onPress: () => handleDownloadModel(modelId)
                        }
                    ]
                );
                return;
            }

            // Switch to model
            await ModelManager.setActiveModel(modelId);
            Alert.alert('Success', 'Model switched successfully!');
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
                            await ModelManager.deleteModel(modelId);
                            Alert.alert('Success', 'Model deleted successfully');
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

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.header}>Settings</Text>

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
                    <Text style={styles.text}>No active model selected</Text>
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
                <Text style={styles.sectionHeader}>Available Models</Text>

                {availableModels.map((model) => {
                    const installed = isModelInstalled(model.id);
                    const isActive = activeModel?.model_id === model.id;
                    const isDownloading = downloading === model.id;

                    return (
                        <View key={model.id} style={styles.modelCard}>
                            <View style={styles.modelHeader}>
                                <Text style={styles.modelName}>{model.name}</Text>
                                {isActive && (
                                    <View style={styles.activeBadge}>
                                        <Text style={styles.activeBadgeText}>Active</Text>
                                    </View>
                                )}
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
                                        >
                                            <Text style={styles.downloadButtonText}>Download</Text>
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
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        marginTop: 10
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
    activeBadge: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4
    },
    activeBadgeText: {
        color: 'white',
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
