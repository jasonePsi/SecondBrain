import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../src/constants/Colors';
import { ModelManager } from '../../src/services/ModelManager';
import { getModelById } from '../../src/constants/ModelRegistry';

export default function DownloadScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const modelId = params.modelId as string;

    const [progress, setProgress] = useState(0);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [complete, setComplete] = useState(false);

    useEffect(() => {
        startDownload();
    }, []);

    const startDownload = async () => {
        try {
            setDownloading(true);
            setError(null);

            const modelConfig = getModelById(modelId);
            if (!modelConfig) {
                throw new Error('Model not found');
            }

            console.log(`Starting download for ${modelConfig.name}...`);

            await ModelManager.downloadModel(modelId, (p) => {
                setProgress(p);
            }, { activate: true });

            console.log('Download complete!');
            setComplete(true);
            setDownloading(false);

            // Navigate to app after short delay
            setTimeout(() => {
                router.replace('/');
            }, 1500);
        } catch (err: any) {
            console.error('Download failed:', err);
            setError(err.message || 'Download failed');
            setDownloading(false);
        }
    };

    const handleRetry = () => {
        setProgress(0);
        setError(null);
        startDownload();
    };

    const handleSkip = () => {
        router.replace('/onboarding/model-selection');
    };

    const modelConfig = getModelById(modelId);
    const formatBytes = (bytes: number) => (bytes / 1_000_000_000).toFixed(1) + ' GB';

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>
                    {complete ? 'Installed & Active' : downloading ? 'Downloading Model' : 'Download Failed'}
                </Text>

                {modelConfig && (
                    <Text style={styles.modelName}>{modelConfig.name}</Text>
                )}

                {downloading && (
                    <>
                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBg}>
                                <View
                                    style={[
                                        styles.progressBarFill,
                                        { width: `${progress * 100}%` }
                                    ]}
                                />
                            </View>
                            <Text style={styles.progressText}>
                                {(progress * 100).toFixed(1)}%
                            </Text>
                        </View>

                        {modelConfig && (
                            <Text style={styles.sizeText}>
                                {formatBytes(modelConfig.sizeBytes * progress)} / {formatBytes(modelConfig.sizeBytes)}
                            </Text>
                        )}

                        <ActivityIndicator
                            size="large"
                            color={Colors.primary}
                            style={styles.spinner}
                        />

                        <Text style={styles.infoText}>
                            This may take a few minutes depending on your connection.
                            {'\n'}Please keep the app open.
                        </Text>
                    </>
                )}

                {complete && (
                    <>
                        <Text style={styles.successText}>
                            Model installed and activated. Redirecting to your app...
                        </Text>
                    </>
                )}

                {error && (
                    <>
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>❌ {error}</Text>
                        </View>

                        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                            <Text style={styles.retryButtonText}>Retry Download</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                            <Text style={styles.skipButtonText}>Back to Model Selection</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        padding: 20
    },
    content: {
        alignItems: 'center'
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 12,
        textAlign: 'center'
    },
    modelName: {
        fontSize: 18,
        color: Colors.textSecondary,
        marginBottom: 32
    },
    progressContainer: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 16
    },
    progressBarBg: {
        width: '100%',
        height: 12,
        backgroundColor: Colors.border,
        borderRadius: 6,
        overflow: 'hidden',
        marginBottom: 8
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: Colors.primary,
        borderRadius: 6
    },
    progressText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: Colors.primary
    },
    sizeText: {
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 24
    },
    spinner: {
        marginVertical: 24
    },
    infoText: {
        fontSize: 14,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 20
    },
    successText: {
        fontSize: 16,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginTop: 24
    },
    errorBox: {
        backgroundColor: '#FFEBEE',
        padding: 16,
        borderRadius: 8,
        marginBottom: 24,
        width: '100%'
    },
    errorText: {
        color: '#C62828',
        textAlign: 'center',
        fontSize: 14
    },
    retryButton: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 8,
        marginBottom: 12,
        width: '100%',
        alignItems: 'center'
    },
    retryButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600'
    },
    skipButton: {
        paddingVertical: 12,
        width: '100%',
        alignItems: 'center'
    },
    skipButtonText: {
        color: Colors.textSecondary,
        fontSize: 14
    }
});
