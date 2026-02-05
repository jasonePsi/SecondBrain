import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '../../src/constants/Colors';
import { getAllModels, ModelConfig } from '../../src/constants/ModelRegistry';

export default function ModelSelectionScreen() {
    const router = useRouter();
    const [models, setModels] = useState<ModelConfig[]>([]);
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [availableStorage, setAvailableStorage] = useState<number>(0);
    const [loading, setLoading] = useState(true);

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

            // Auto-select recommended model if low storage
            if (freeDisk < 5_000_000_000) {
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

    const handleContinue = () => {
        if (!selectedModel) return;
        router.push({
            pathname: '/onboarding/download',
            params: { modelId: selectedModel }
        });
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
                                {model.batteryImpact === 'low' ? '🔋 Low' : '🔋 Medium'}
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
                    !selectedModel && styles.continueButtonDisabled
                ]}
                onPress={handleContinue}
                disabled={!selectedModel}
            >
                <Text style={styles.continueButtonText}>Download & Continue</Text>
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
