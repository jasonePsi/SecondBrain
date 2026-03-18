import React, { useCallback, useState } from 'react';
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

export default function FeedScreen() {
    const router = useRouter();
    const [cards, setCards] = useState<FeedCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatingActionId, setUpdatingActionId] = useState<string | null>(null);

    const loadFeed = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const next = await FeedService.listCards(undefined, 120);
            setCards(next);
        } catch (err: any) {
            setError(err?.message || 'Could not load feed.');
        } finally {
            setLoading(false);
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
            Alert.alert('Action Update Failed', err?.message || 'Could not update this action.');
        } finally {
            setUpdatingActionId(null);
        }
    };

    const renderItem = ({ item }: { item: FeedCard }) => {
        const isActionUpdating = !!item.actionId && updatingActionId === item.actionId;

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => navigateTo(item.route)}
                disabled={!item.route}
            >
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.description}</Text>
                {!!item.scopeLabel && (
                    <Text style={styles.cardMeta}>{item.scopeLabel}</Text>
                )}
                <Text style={styles.cardMeta}>{formatTimestamp(item.createdAt)}</Text>

                {(item.canMarkDone || item.canCancel) && (
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.doneButton]}
                            onPress={() => handleActionUpdate(item, 'done')}
                            disabled={isActionUpdating || !item.canMarkDone}
                        >
                            <Text style={styles.actionButtonText}>
                                {isActionUpdating ? 'Updating…' : 'Mark Done'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.cancelButton]}
                            onPress={() => handleActionUpdate(item, 'canceled')}
                            disabled={isActionUpdating || !item.canCancel}
                        >
                            <Text style={styles.actionButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </TouchableOpacity>
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
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyTitle}>No activity yet</Text>
                        <Text style={styles.emptyText}>
                            Start a conversation or capture a reminder to populate your feed.
                        </Text>
                    </View>
                }
                ListHeaderComponent={error ? (
                    <Text style={styles.inlineError}>Refresh warning: {error}</Text>
                ) : null}
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
    cardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.text
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
    inlineError: {
        marginBottom: 8,
        color: Colors.notification,
        fontSize: 12
    }
});
