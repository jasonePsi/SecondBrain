import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { CaptureFAB } from '../../src/components/CaptureFAB';
import { Colors } from '../../src/constants/Colors';
import { ActionService } from '../../src/services/ActionService';
import { FeedCard, FeedService } from '../../src/services/FeedService';

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

const toActionStatusLabel = (status?: FeedCard['actionStatus']): string | null => {
    if (!status) return null;
    if (status === 'open') return 'Open';
    if (status === 'done') return 'Completed';
    if (status === 'canceled') return 'Canceled';
    return null;
};

export default function FeedScreen() {
    const router = useRouter();
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
    }, []);

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
            setCards(next);
        } catch (err: any) {
            console.error('Feed refresh failed:', err);
            if (canApply()) {
                setError('Activity is temporarily unavailable. Please try again.');
            }
        } finally {
            if (canApply()) {
                setLoading(false);
            }
        }
    }, []);

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
        } catch (err: any) {
            console.error('Action update failed:', err);
            Alert.alert('Update Failed', 'Could not update this reminder right now.');
        } finally {
            setUpdatingActionId(null);
        }
    };

    const renderItem = ({ item }: { item: FeedCard }) => {
        const isActionUpdating = !!item.actionId && updatingActionId === item.actionId;
        const cardContent = (
            <>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.typeTag}>{getTypeLabel(item.feedType)}</Text>
                <Text style={styles.cardBody} numberOfLines={3}>{item.description}</Text>
                {!!item.scopeLabel && (
                    <Text style={styles.cardMeta}>{item.scopeLabel}</Text>
                )}
                {!!toActionStatusLabel(item.actionStatus) && (
                    <Text style={styles.cardMeta}>Status: {toActionStatusLabel(item.actionStatus)}</Text>
                )}
                <Text style={styles.cardMeta}>{formatTimestamp(item.createdAt)}</Text>
                {!!item.route && (
                    <Text style={styles.routeHint}>Open context</Text>
                )}
            </>
        );

        return (
            <View style={styles.card}>
                {item.route ? (
                    <TouchableOpacity
                        style={styles.cardTouchable}
                        onPress={() => navigateTo(item.route)}
                    >
                        {cardContent}
                    </TouchableOpacity>
                ) : (
                    <View style={styles.cardTouchable}>{cardContent}</View>
                )}

                {(item.canMarkDone || item.canCancel) && (
                    <View style={styles.actionRow}>
                        {!!item.canMarkDone && (
                            <TouchableOpacity
                                style={[styles.actionButton, styles.doneButton]}
                                onPress={() => handleActionUpdate(item, 'done')}
                                disabled={isActionUpdating}
                            >
                                <Text style={styles.actionButtonText}>
                                    {isActionUpdating ? 'Saving…' : 'Mark Done'}
                                </Text>
                            </TouchableOpacity>
                        )}
                        {!!item.canCancel && (
                            <TouchableOpacity
                                style={[styles.actionButton, styles.cancelButton]}
                                onPress={() => handleActionUpdate(item, 'canceled')}
                                disabled={isActionUpdating}
                            >
                                <Text style={styles.actionButtonText}>
                                    {isActionUpdating ? 'Saving…' : 'Cancel'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>
        );
    };

    if (loading && cards.length === 0) {
        return (
            <View style={styles.centerState}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.stateText}>Loading activity feed…</Text>
            </View>
        );
    }

    if (error && cards.length === 0) {
        return (
            <View style={styles.centerState}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadFeed}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlashList
                data={cards}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyTitle}>No activity yet</Text>
                        <Text style={styles.emptyText}>
                            Start a conversation or capture a reminder. Your recent activity will appear here.
                        </Text>
                        <TouchableOpacity
                            style={styles.emptyActionButton}
                            onPress={() => router.push('/(tabs)/spaces')}
                        >
                            <Text style={styles.emptyActionText}>Go to Spaces</Text>
                        </TouchableOpacity>
                    </View>
                }
                ListHeaderComponent={(
                    <View style={styles.inlineHeaderState}>
                        <View style={styles.headerRow}>
                            <Text style={styles.headerTitle}>Feed</Text>
                            <TouchableOpacity onPress={loadFeed} style={styles.refreshButton}>
                                <Text style={styles.refreshButtonText}>Refresh</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.headerSubtitle}>
                            Recent updates from conversations, reminders, and memory.
                        </Text>
                        {!!error && (
                            <View style={styles.inlineWarningRow}>
                                <Text style={styles.inlineError}>Refresh issue: {error}</Text>
                                <TouchableOpacity onPress={loadFeed}>
                                    <Text style={styles.inlineWarningAction}>Retry</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {loading && cards.length > 0 && (
                            <Text style={styles.inlineLoading}>Refreshing feed…</Text>
                        )}
                    </View>
                )}
            />
            <CaptureFAB onPress={() => router.push('/space/new')} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background
    },
    listContent: {
        padding: 12,
        paddingBottom: 90
    },
    centerState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
        gap: 10,
        paddingHorizontal: 26
    },
    stateText: {
        color: Colors.secondaryText
    },
    errorText: {
        color: Colors.notification,
        textAlign: 'center'
    },
    retryButton: {
        marginTop: 8,
        backgroundColor: Colors.primary,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 8
    },
    retryButtonText: {
        color: '#fff',
        fontWeight: '600'
    },
    card: {
        backgroundColor: Colors.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 12,
        marginBottom: 10
    },
    cardTouchable: {
        borderRadius: 10
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.text
    },
    typeTag: {
        alignSelf: 'flex-start',
        marginTop: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: '#EEF6FF',
        color: Colors.primary,
        fontSize: 11,
        fontWeight: '600'
    },
    cardBody: {
        marginTop: 5,
        fontSize: 14,
        color: Colors.text
    },
    cardMeta: {
        marginTop: 4,
        color: Colors.secondaryText,
        fontSize: 12
    },
    actionRow: {
        marginTop: 10,
        flexDirection: 'row',
        gap: 8
    },
    routeHint: {
        marginTop: 6,
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '600'
    },
    actionButton: {
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 8
    },
    doneButton: {
        backgroundColor: '#DCFCE7'
    },
    cancelButton: {
        backgroundColor: '#FEE2E2'
    },
    actionButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#1F2937'
    },
    emptyState: {
        marginTop: 60,
        alignItems: 'center',
        paddingHorizontal: 24
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.text
    },
    emptyText: {
        marginTop: 8,
        fontSize: 14,
        textAlign: 'center',
        color: Colors.secondaryText
    },
    emptyActionButton: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: Colors.primary,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7
    },
    emptyActionText: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '600'
    },
    inlineError: {
        flex: 1,
        color: Colors.notification,
        fontSize: 12
    },
    inlineWarningRow: {
        marginBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    inlineWarningAction: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '600'
    },
    inlineLoading: {
        marginBottom: 8,
        color: Colors.secondaryText,
        fontSize: 12
    },
    inlineHeaderState: {
        minHeight: 4,
        marginBottom: 6
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: 2
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    refreshButton: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: Colors.card,
        borderWidth: 1,
        borderColor: Colors.border
    },
    refreshButtonText: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '600'
    },
    headerSubtitle: {
        color: Colors.secondaryText,
        fontSize: 12,
        marginBottom: 6
    }
});
