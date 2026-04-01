import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ModelConfig } from '../../constants/ModelRegistry';
import type { SettingsModelStatus } from '../../services/settings_lifecycle_utils';
import { useAppTheme } from '../../theme/theme';
import { AppButton, GroupedSection, InlineBanner, StatusChip } from '../ui';

type ModelActionState = {
    showInstallAction: boolean;
    installActionLabel: 'Install' | 'Reinstall' | null;
    showActivateAction: boolean;
    activateActionLabel: 'Use This Model' | 'Set as Fallback' | null;
    showDeleteAction: boolean;
};

type SettingsModelCardProps = {
    model: ModelConfig;
    status: SettingsModelStatus;
    statusLabel: string;
    statusTone: 'neutral' | 'success' | 'warning' | 'info';
    categoryLabel: string;
    categoryTone: 'info' | 'warning';
    meta: string;
    actionState: ModelActionState;
    isDownloading: boolean;
    downloadProgress: number;
    disableInstall: boolean;
    onInstall: () => void;
    onActivate: () => void;
    onDelete: () => void;
};

export function SettingsModelCard({
    model,
    status,
    statusLabel,
    statusTone,
    categoryLabel,
    categoryTone,
    meta,
    actionState,
    isDownloading,
    downloadProgress,
    disableInstall,
    onInstall,
    onActivate,
    onDelete
}: SettingsModelCardProps) {
    const theme = useAppTheme();

    return (
        <GroupedSection style={styles.modelCard}>
            <View style={styles.modelTopRow}>
                <View style={styles.modelNameRow}>
                    <Text style={[styles.modelName, { color: theme.colors.text.primary }]}>
                        {model.name}
                    </Text>
                    <StatusChip
                        label={categoryLabel}
                        tone={categoryTone}
                    />
                </View>
                <StatusChip
                    label={statusLabel}
                    tone={statusTone}
                />
            </View>

            <Text style={[styles.modelDescription, { color: theme.colors.text.secondary }]}>
                {model.description}
            </Text>

            <Text style={[styles.modelMeta, { color: theme.colors.text.tertiary }]}>
                {meta}
            </Text>

            {status === 'missing' && (
                <InlineBanner
                    tone="warning"
                    message="Local file missing. Reinstall or choose another model."
                />
            )}

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
                            onPress={onInstall}
                            disabled={disableInstall}
                        />
                    )}
                    {actionState.showActivateAction && actionState.activateActionLabel && (
                        <AppButton
                            size="sm"
                            label={actionState.activateActionLabel}
                            onPress={onActivate}
                        />
                    )}
                    {actionState.showDeleteAction && (
                        <AppButton
                            size="sm"
                            variant="destructive"
                            label="Delete"
                            onPress={onDelete}
                        />
                    )}
                </View>
            )}
        </GroupedSection>
    );
}

const styles = StyleSheet.create({
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
    }
});
