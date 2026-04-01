import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/theme';
import {
    resolveHistoryLoadActionLabel,
    resolveJumpHintAction,
    type ThreadJumpHintKind
} from '../../services/thread_ui_state_utils';
import { AppButton, GroupedSection, InlineBanner, StatusChip } from '../ui';

export type ThreadJumpHint = {
    kind: ThreadJumpHintKind;
    text: string;
};

type ThreadHistoryHeaderProps = {
    jumpHint: ThreadJumpHint | null;
    hasOlderMessages: boolean;
    loadingOlderMessages: boolean;
    blockOlderLoad: boolean;
    onLoadOlder: () => void;
    onDismissJumpHint: () => void;
    historyLoadError: string | null;
    historyLoadErrorSource: 'initial' | 'older' | null;
    onRetryHistory: () => void;
    totalMessageCount: number;
    loadedMessageCount: number;
    visibleMessageCount: number;
};

export function ThreadHistoryHeader({
    jumpHint,
    hasOlderMessages,
    loadingOlderMessages,
    blockOlderLoad,
    onLoadOlder,
    onDismissJumpHint,
    historyLoadError,
    historyLoadErrorSource,
    onRetryHistory,
    totalMessageCount,
    loadedMessageCount,
    visibleMessageCount
}: ThreadHistoryHeaderProps) {
    const theme = useAppTheme();
    const hasContent = totalMessageCount > 0 || !!historyLoadError || !!jumpHint;
    if (!hasContent) return null;

    const remainingOlderCount = Math.max(0, totalMessageCount - loadedMessageCount);
    const jumpAction = jumpHint
        ? resolveJumpHintAction({
            jumpHintKind: jumpHint.kind,
            hasOlderMessages,
            loadingOlderMessages,
            blockOlderLoad
        })
        : null;

    return (
        <View style={styles.container}>
            {!!jumpHint && !!jumpAction && (
                <GroupedSection style={styles.jumpCard}>
                    <View style={styles.jumpHeaderRow}>
                        <StatusChip
                            label={jumpHint.kind === 'found'
                                ? 'Matched message'
                                : jumpHint.kind === 'older'
                                    ? 'Earlier history'
                                    : 'Message missing'}
                            tone={jumpHint.kind === 'found'
                                ? 'info'
                                : jumpHint.kind === 'older'
                                    ? 'warning'
                                    : 'error'}
                        />
                    </View>
                    <Text
                        style={[
                            styles.jumpText,
                            {
                                color: jumpHint.kind === 'missing'
                                    ? theme.colors.status.error
                                    : theme.colors.text.secondary
                            }
                        ]}
                    >
                        {jumpHint.text}
                    </Text>
                    <View style={styles.jumpActions}>
                        <AppButton
                            size="sm"
                            variant="secondary"
                            label={jumpAction.label}
                            onPress={jumpAction.mode === 'load' ? onLoadOlder : onDismissJumpHint}
                            disabled={jumpAction.disabled}
                            loading={jumpAction.loading}
                        />
                        {jumpAction.mode === 'load' && (
                            <AppButton
                                size="sm"
                                variant="plain"
                                label="Dismiss"
                                onPress={onDismissJumpHint}
                            />
                        )}
                    </View>
                </GroupedSection>
            )}

            {!!historyLoadError && (
                <InlineBanner
                    tone="error"
                    message={historyLoadError}
                    actionLabel={historyLoadErrorSource === 'older' ? 'Retry older messages' : 'Retry'}
                    onActionPress={onRetryHistory}
                />
            )}

            {totalMessageCount > 0 && (
                <GroupedSection style={styles.historyCard}>
                    {hasOlderMessages ? (
                        <AppButton
                            size="sm"
                            variant="secondary"
                            label={resolveHistoryLoadActionLabel({
                                loadingOlderMessages,
                                blockOlderLoad,
                                remainingOlderCount
                            })}
                            onPress={onLoadOlder}
                            disabled={loadingOlderMessages || blockOlderLoad}
                            loading={loadingOlderMessages}
                        />
                    ) : (
                        <Text style={[styles.historyInfoText, { color: theme.colors.text.secondary }]}>
                            All messages loaded
                        </Text>
                    )}
                    <Text style={[styles.historyMetaText, { color: theme.colors.text.tertiary }]}> 
                        {visibleMessageCount} of {totalMessageCount} message(s) loaded
                    </Text>
                </GroupedSection>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 12,
        gap: 8
    },
    jumpCard: {
        paddingHorizontal: 12,
        paddingVertical: 10
    },
    jumpHeaderRow: {
        marginBottom: 6,
        flexDirection: 'row',
        justifyContent: 'space-between'
    },
    jumpText: {
        fontSize: 13,
        lineHeight: 18
    },
    jumpActions: {
        marginTop: 10,
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap'
    },
    historyCard: {
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 6
    },
    historyInfoText: {
        fontSize: 13
    },
    historyMetaText: {
        fontSize: 12
    }
});
