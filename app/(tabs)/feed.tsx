import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter, Stack } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { ActionService } from '../../src/services/ActionService';
import { FeedCard, FeedService } from '../../src/services/FeedService';
import { useAppTheme } from '../../src/theme/theme';
import { runLayoutFeedback, triggerHaptic, useReducedMotion } from '../../src/services/interaction_feedback';
import {
    AppButton,
    EmptyStateView,
    ErrorStateView,
    GroupedSection,
    InlineBanner,
    ListRow,
    LoadingStateView,
    ScreenScaffold,
    SectionHeader,
    StatusChip
} from '../../src/components/ui';

const formatTimestamp = (value: number): string => {
    return new Date(value).toLocaleString();
};

const getTypeLabel = (feedType: string): string => {
    if (feedType === 'action_done') return 'Reminder completed';
    if (feedType === 'action_canceled') return 'Reminder canceled';
    if (feedType === 'action_snoozed') return 'Reminder snoozed';
    if (feedType === 'action_scheduled') return 'Reminder scheduled';
    if (feedType === 'thread_updated') return 'Thread updated';
    if (feedType === 'thread_created') return 'Thread created';
    if (feedType === 'space_created') return 'Space created';
    if (feedType.startsWith('action')) return 'Reminder';
    if (feedType === 'fact') return 'Memory';
    if (feedType.startsWith('thread')) return 'Thread';
    if (feedType.startsWith('space')) return 'Space';
    return 'Activity';
};

const getTypeIcon = (
    feedType: string
): React.ComponentProps<typeof Ionicons>['name'] => {
    if (feedType.startsWith('action')) return 'alarm-outline';
    if (feedType === 'fact') return 'document-text-outline';
    if (feedType.startsWith('thread')) return 'chatbubble-outline';
    if (feedType.startsWith('space')) return 'albums-outline';
    return 'ellipsis-horizontal-circle-outline';
};

const getTypeTone = (feedType: string): 'info' | 'warning' | 'success' => {
    if (feedType.startsWith('action')) return 'warning';
    if (feedType === 'fact') return 'success';
    return 'info';
};

const getStatusTone = (status?: FeedCard['actionStatus']): 'neutral' | 'success' | 'error' => {
    if (status === 'done') return 'success';
    if (status === 'canceled') return 'error';
    return 'neutral';
};

const toActionStatusLabel = (status?: FeedCard['actionStatus']): string | null => {
    if (!status) return null;
    if (status === 'open') return 'Open';
    if (status === 'done') return 'Completed';
    if (status === 'canceled') return 'Canceled';
    return null;
};

export default function FeedScreen() {
    const router = useRouter();
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    const isMountedRef = useRef(true);
    const loadRequestRef = useRef(0);
    const [cards, setCards] = useState<FeedCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatingActionId, setUpdatingActionId] = useState<string | null>(null);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, [reducedMotion]);

    const loadFeed = useCallback(async () => {
        const requestId = ++loadRequestRef.current;
        const canApply = () => isMountedRef.current && requestId === loadRequestRef.current;
        try {
            if (canApply()) {
                setLoading(true);
                setError(null);
            }
            const next = await FeedService.listCards(undefined, 120);
            if (!canApply()) return;
            runLayoutFeedback(reducedMotion);
            setCards(next);
        } catch (err: any) {
            console.error('Feed refresh failed:', err);
            if (canApply()) {
                setError('Activity feed is temporarily unavailable. Please try again.');
            }
        } finally {
            if (canApply()) {
                setLoading(false);
            }
        }
    }, []);

    const handleManualRefresh = useCallback(() => {
        triggerHaptic('selection', reducedMotion);
        loadFeed();
    }, [loadFeed, reducedMotion]);

    useFocusEffect(
        useCallback(() => {
            loadFeed();
        }, [loadFeed])
    );

    const navigateTo = (route?: string) => {
        if (!route) return;
        router.push(route as any);
    };

    const handleActionUpdate = async (
        card: FeedCard,
        status: 'done' | 'canceled'
    ) => {
        if (!card.actionId) return;

        try {
            setUpdatingActionId(card.actionId);
            await ActionService.setActionStatus(card.actionId, status);
            await loadFeed();
            triggerHaptic(status === 'done' ? 'success' : 'warning', reducedMotion);
        } catch (err: any) {
            console.error('Action update failed:', err);
            triggerHaptic('error', reducedMotion);
            Alert.alert('Update Unavailable', 'Could not update this reminder right now. Please try again.');
        } finally {
            setUpdatingActionId(null);
        }
    };

    const renderItem = ({ item }: { item: FeedCard }) => {
        const isActionUpdating = !!item.actionId && updatingActionId === item.actionId;
        const actionStatus = toActionStatusLabel(item.actionStatus);
        const typeLabel = getTypeLabel(item.feedType);
        const metaParts = [item.scopeLabel, formatTimestamp(item.createdAt)].filter(Boolean);

        return (
            <GroupedSection style={styles.feedCard}>
                <ListRow
                    title={item.title}
                    subtitle={item.description}
                    meta={metaParts.join(' • ')}
                    onPress={item.route && !isActionUpdating ? () => navigateTo(item.route) : undefined}
                    disabled={isActionUpdating}
                    leading={(
                        <View style={[styles.iconWrap, { backgroundColor: theme.colors.background.grouped }]}>
                            <Ionicons
                                name={getTypeIcon(item.feedType)}
                                size={16}
                                color={theme.colors.tint.primary}
                            />
                        </View>
                    )}
                    trailing={(
                        <View style={styles.rowTrailing}>
                            <StatusChip label={typeLabel} tone={getTypeTone(item.feedType)} />
                            {!!actionStatus && (
                                <StatusChip
                                    label={actionStatus}
                                    tone={getStatusTone(item.actionStatus)}
                                />
                            )}
                            {!!item.route && (
                                <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
                            )}
                        </View>
                    )}
                />

                {(item.canMarkDone || item.canCancel) && (
                    <View
                        style={[
                            styles.cardActions,
                            { borderTopColor: theme.colors.separator.subtle, backgroundColor: theme.colors.background.grouped }
                        ]}
                    >
                        {!!item.canMarkDone && (
                            <AppButton
                                size="sm"
                                variant="secondary"
                                label={isActionUpdating ? 'Saving…' : 'Mark Done'}
                                onPress={() => handleActionUpdate(item, 'done')}
                                disabled={isActionUpdating}
                            />
                        )}
                        {!!item.canCancel && (
                            <AppButton
                                size="sm"
                                variant="destructive"
                                label={isActionUpdating ? 'Saving…' : 'Cancel'}
                                onPress={() => handleActionUpdate(item, 'canceled')}
                                disabled={isActionUpdating}
                            />
                        )}
                    </View>
                )}
            </GroupedSection>
        );
    };

    if (loading && cards.length === 0) {
        return (
            <ScreenScaffold>
                <LoadingStateView
                    title="Loading activity"
                    message="Collecting updates from reminders and memory."
                />
            </ScreenScaffold>
        );
    }

    if (error && cards.length === 0) {
        return (
            <ScreenScaffold>
                <ErrorStateView
                    title="Feed unavailable"
                    message={error}
                    primaryActionLabel="Retry"
                    onPrimaryAction={handleManualRefresh}
                    secondaryActionLabel="Go to Spaces"
                    onSecondaryAction={() => router.push('/(tabs)/spaces')}
                />
            </ScreenScaffold>
        );
    }

    const openReminderCount = cards.filter((card) => card.canMarkDone || card.canCancel).length;

    return (
        <ScreenScaffold>
            <Stack.Screen
                options={{
                    title: 'Feed',
                    headerRight: () => (
                        <TouchableOpacity
                            onPress={handleManualRefresh}
                            style={styles.headerButton}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Refresh feed"
                            accessibilityHint="Checks for latest activity updates"
                            accessibilityState={{ busy: loading }}
                        >
                            <Ionicons name="refresh" size={20} color={theme.colors.tint.primary} />
                        </TouchableOpacity>
                    )
                }}
            />
            <FlashList
                data={cards}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                    <View style={styles.headerBlock}>
                        <SectionHeader
                            title="Activity Timeline"
                            subtitle="Recent updates from conversations, reminders, and memory."
                        />
                        {cards.length > 0 && (
                            <GroupedSection style={styles.summaryCard}>
                                <View style={styles.summaryRow}>
                                    <StatusChip label={`${cards.length} updates`} tone="info" />
                                    {openReminderCount > 0 && (
                                        <StatusChip label={`${openReminderCount} open reminders`} tone="warning" />
                                    )}
                                </View>
                            </GroupedSection>
                        )}
                        {!!error && (
                            <InlineBanner
                                tone="warning"
                                message={error}
                                actionLabel="Retry"
                                onActionPress={handleManualRefresh}
                            />
                        )}
                        {loading && cards.length > 0 && (
                            <InlineBanner
                                tone="info"
                                message="Refreshing feed…"
                            />
                        )}
                    </View>
                }
                ListEmptyComponent={
                    <EmptyStateView
                        title="No activity yet"
                        message="Start a conversation or capture a reminder. Updates will appear here."
                        primaryActionLabel="Go to Spaces"
                        onPrimaryAction={() => router.push('/(tabs)/spaces')}
                    />
                }
            />
        </ScreenScaffold>
    );
}

const styles = StyleSheet.create({
    headerButton: {
        marginRight: 12,
        minWidth: 40,
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center'
    },
    listContent: {
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 100
    },
    headerBlock: {
        marginBottom: 12,
        gap: 8
    },
    summaryCard: {
        paddingHorizontal: 12,
        paddingVertical: 10
    },
    summaryRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8
    },
    feedCard: {
        marginBottom: 10
    },
    iconWrap: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center'
    },
    rowTrailing: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        maxWidth: 170
    },
    cardActions: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap'
    }
});
