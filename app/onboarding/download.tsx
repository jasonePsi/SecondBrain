import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getModelById } from '../../src/constants/ModelRegistry';
import { ModelManager } from '../../src/services/ModelManager';
import { useAppTheme } from '../../src/theme/theme';
import { triggerHaptic, useReducedMotion } from '../../src/services/interaction_feedback';
import {
    AppButton,
    GroupedSection,
    InlineBanner,
    ScreenScaffold,
    SectionHeader,
    StatusChip
} from '../../src/components/ui';

const toUserFacingDownloadError = (error: unknown): string => {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message.trim();
    }
    if (typeof error === 'string' && error.trim().length > 0) {
        return error.trim();
    }
    return 'Installation failed';
};

const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0.0 GB';
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
};

export default function DownloadScreen() {
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    const router = useRouter();
    const params = useLocalSearchParams();
    const modelId = params.modelId as string;

    const [progress, setProgress] = useState(0);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [complete, setComplete] = useState(false);
    const hasStartedRef = useRef(false);

    useEffect(() => {
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;
        startDownload();
    }, []);

    const startDownload = async () => {
        if (downloading) return;
        try {
            setDownloading(true);
            setError(null);
            setComplete(false);

            const modelConfig = getModelById(modelId);
            if (!modelConfig) {
                throw new Error('Selected model could not be found. Return to model selection and choose again.');
            }

            await ModelManager.downloadModel(modelId, (p) => {
                setProgress(p);
            }, { activate: true });
            setComplete(true);
            setDownloading(false);
            triggerHaptic('success', reducedMotion);

            setTimeout(() => {
                router.replace('/');
            }, 1500);
        } catch (err: any) {
            console.error('Download failed:', err);
            setError(toUserFacingDownloadError(err));
            setDownloading(false);
            setComplete(false);
            triggerHaptic('error', reducedMotion);
        }
    };

    const handleRetry = () => {
        triggerHaptic('selection', reducedMotion);
        setProgress(0);
        setError(null);
        hasStartedRef.current = true;
        startDownload();
    };

    const handleBack = () => {
        triggerHaptic('selection', reducedMotion);
        router.replace('/onboarding/model-selection');
    };

    const modelConfig = getModelById(modelId);
    const downloadedBytes = modelConfig ? modelConfig.sizeBytes * progress : 0;

    const stageLabel = complete
        ? 'Ready'
        : error
            ? 'Needs Attention'
            : downloading
                ? 'Installing'
                : 'Preparing';
    const stageTitle = complete
        ? 'Model Ready'
        : error
            ? 'Install Interrupted'
            : 'Installing Local Model';
    const stageSubtitle = complete
        ? 'Setup is complete. Opening your spaces now.'
        : error
            ? 'Setup stopped before completion. Retry or return to model selection.'
            : 'SecondBrain is preparing your on-device model.';
    const progressTitle = complete ? 'Installation complete' : (downloading ? 'Download progress' : 'Preparing download');
    const actionHint = downloading && !error && !complete
        ? 'Back is disabled while setup is running.'
        : 'You can return and adjust your model choice at any time.';

    return (
        <ScreenScaffold>
            <Stack.Screen options={{ title: 'Model Install' }} />
            <View style={styles.content}>
                <SectionHeader
                    title={stageTitle}
                    subtitle={stageSubtitle}
                    trailing={<StatusChip label={stageLabel} tone={complete ? 'success' : error ? 'warning' : 'info'} />}
                />

                {!!modelConfig && (
                    <GroupedSection style={styles.modelCard}>
                        <Text style={[styles.modelName, { color: theme.colors.text.primary }]}>
                            {modelConfig.name}
                        </Text>
                        <Text style={[styles.modelMeta, { color: theme.colors.text.secondary }]}>
                            {formatBytes(modelConfig.sizeBytes)} • {modelConfig.category === 'fast' ? 'Fast profile' : 'Smart profile'}
                        </Text>
                    </GroupedSection>
                )}

                <GroupedSection style={styles.progressCard}>
                    <Text style={[styles.progressTitle, { color: theme.colors.text.primary }]}>
                        {progressTitle}
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
                                    width: `${Math.max(0, Math.min(100, progress * 100))}%`,
                                    backgroundColor: theme.colors.tint.primary
                                }
                            ]}
                        />
                    </View>
                    <Text style={[styles.progressMeta, { color: theme.colors.text.secondary }]}>
                        {(progress * 100).toFixed(1)}% • {formatBytes(downloadedBytes)} / {formatBytes(modelConfig?.sizeBytes || 0)}
                    </Text>
                    {downloading && (
                        <View style={styles.spinnerRow}>
                            <ActivityIndicator size="small" color={theme.colors.tint.primary} />
                            <Text style={[styles.spinnerText, { color: theme.colors.text.tertiary }]}>
                                Keep this screen open. Download, validation, and activation continue automatically.
                            </Text>
                        </View>
                    )}
                </GroupedSection>

                {complete && (
                    <InlineBanner
                        tone="info"
                        message="Model installed and activated. Opening Spaces…"
                    />
                )}

                {!!error && (
                    <InlineBanner
                        tone="error"
                        message={error}
                        actionLabel="Retry"
                        onActionPress={handleRetry}
                    />
                )}

                <GroupedSection style={styles.actionCard}>
                    {!!error && (
                        <AppButton
                            label="Try Download Again"
                            onPress={handleRetry}
                        />
                    )}
                    <AppButton
                        label="Back to Model Selection"
                        variant="secondary"
                        onPress={handleBack}
                        disabled={downloading && !error && !complete}
                    />
                    <Text style={[styles.actionHint, { color: theme.colors.text.tertiary }]}>
                        {actionHint}
                    </Text>
                </GroupedSection>
            </View>
        </ScreenScaffold>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 26,
        gap: 10
    },
    modelCard: {
        paddingHorizontal: 12,
        paddingVertical: 12
    },
    modelName: {
        fontSize: 16,
        fontWeight: '700'
    },
    modelMeta: {
        marginTop: 4,
        fontSize: 13
    },
    progressCard: {
        paddingHorizontal: 12,
        paddingVertical: 12
    },
    progressTitle: {
        fontSize: 15,
        fontWeight: '700'
    },
    progressTrack: {
        marginTop: 10,
        height: 10,
        borderRadius: 999,
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        borderRadius: 999
    },
    progressMeta: {
        marginTop: 8,
        fontSize: 13
    },
    spinnerRow: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    spinnerText: {
        flex: 1,
        fontSize: 12
    },
    actionCard: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 8
    },
    actionHint: {
        fontSize: 12
    }
});
