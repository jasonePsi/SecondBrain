import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/Colors';
import {
    BrainActionCard,
    BrainEntityCard,
    BrainFactCard,
    BrainService,
    BrainSnapshot
} from '../../src/services/BrainService';

const formatTimestamp = (value: number | null | undefined): string => {
    if (!value) return 'Unknown time';
    return new Date(value).toLocaleString();
};

export default function BrainScreen() {
    const router = useRouter();
    const [snapshot, setSnapshot] = useState<BrainSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadSnapshot = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const next = await BrainService.getSnapshot();
            setSnapshot(next);
        } catch (err: any) {
            console.error('Brain refresh failed:', err);
            setError('Memory is temporarily unavailable. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadSnapshot();
        }, [loadSnapshot])
    );

    const navigateTo = (route?: string) => {
        if (!route) return;
        router.push(route as any);
    };

    const renderEntity = (entity: BrainEntityCard) => (
        <TouchableOpacity
            key={entity.id}
            style={styles.card}
            onPress={() => navigateTo(entity.route)}
            disabled={!entity.route}
        >
            <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>{entity.name}</Text>
                <Text style={styles.cardTag}>{entity.type}</Text>
            </View>
            <Text style={styles.cardMeta}>Scope: {entity.scopeLabel}</Text>
            <Text style={styles.cardMeta}>Captured {formatTimestamp(entity.createdAt)}</Text>
            {!!entity.route && (
                <View style={styles.routeHintRow}>
                    <Text style={styles.routeHintText}>Open context</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                </View>
            )}
        </TouchableOpacity>
    );

    const renderFact = (fact: BrainFactCard) => (
        <TouchableOpacity
            key={fact.id}
            style={styles.card}
            onPress={() => navigateTo(fact.route)}
            disabled={!fact.route}
        >
            <Text style={styles.cardTitle}>{fact.key}</Text>
            <Text style={styles.cardBody} numberOfLines={3}>
                {fact.value}
                {fact.unit ? ` ${fact.unit}` : ''}
            </Text>
            <Text style={styles.cardMeta}>Scope: {fact.scopeLabel}</Text>
            <Text style={styles.cardMeta}>Updated {formatTimestamp(fact.effectiveAt)}</Text>
            {!!fact.route && (
                <View style={styles.routeHintRow}>
                    <Text style={styles.routeHintText}>Open context</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                </View>
            )}
        </TouchableOpacity>
    );

    const renderAction = (action: BrainActionCard) => (
        <TouchableOpacity
            key={action.id}
            style={styles.card}
            onPress={() => navigateTo(action.route)}
            disabled={!action.route}
        >
            <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={2}>{action.text}</Text>
                <Text style={[
                    styles.statusTag,
                    action.status === 'open' ? styles.statusOpen : styles.statusClosed
                ]}>
                    {action.status === 'open' ? 'Open' : action.status}
                </Text>
            </View>
            <Text style={styles.cardMeta}>Scope: {action.scopeLabel}</Text>
            <Text style={styles.cardMeta}>
                {action.scheduledFor
                    ? `Scheduled ${formatTimestamp(action.scheduledFor)}`
                    : `Created ${formatTimestamp(action.createdAt)}`}
            </Text>
            {!!action.route && (
                <View style={styles.routeHintRow}>
                    <Text style={styles.routeHintText}>Open context</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                </View>
            )}
        </TouchableOpacity>
    );

    if (loading && !snapshot) {
        return (
            <View style={styles.centerState}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.stateText}>Loading memory…</Text>
            </View>
        );
    }

    if (error && !snapshot) {
        return (
            <View style={styles.centerState}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadSnapshot}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const entities = snapshot?.entities || [];
    const facts = snapshot?.facts || [];
    const actions = snapshot?.actions || [];

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.headerRow}>
                <Text style={styles.header}>Brain</Text>
                <TouchableOpacity onPress={loadSnapshot} style={styles.refreshButton}>
                    <Text style={styles.refreshButtonText}>Refresh</Text>
                </TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>
                Structured memory captured from your conversations.
            </Text>
            <Text style={styles.subtitleHint}>
                Tap any card to open the related thread or space.
            </Text>
            <Text style={styles.subtitleMeta}>
                {entities.length} entities · {facts.length} facts · {actions.length} open action(s)
            </Text>
            {!!snapshot?.loadedAt && (
                <Text style={styles.loadedAt}>Last refreshed {formatTimestamp(snapshot.loadedAt)}</Text>
            )}
            {loading && !!snapshot && (
                <Text style={styles.loadingInline}>Refreshing memory…</Text>
            )}
            {!!error && (
                <View style={styles.inlineWarningRow}>
                    <Text style={styles.inlineError}>Refresh issue: {error}</Text>
                    <TouchableOpacity onPress={loadSnapshot}>
                        <Text style={styles.inlineWarningAction}>Retry</Text>
                    </TouchableOpacity>
                </View>
            )}
            {entities.length === 0 && facts.length === 0 && actions.length === 0 && (
                <View style={styles.globalEmptyCard}>
                    <Text style={styles.globalEmptyTitle}>Memory is empty for now</Text>
                    <Text style={styles.globalEmptyText}>
                        Start a conversation in a space and capture a few facts or reminders. They will appear here automatically.
                    </Text>
                    <TouchableOpacity
                        style={styles.globalEmptyAction}
                        onPress={() => router.push('/(tabs)/spaces')}
                    >
                        <Text style={styles.globalEmptyActionText}>Go to Spaces</Text>
                    </TouchableOpacity>
                </View>
            )}

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Entities ({entities.length})</Text>
                <Text style={styles.sectionHint}>People, places, and named things from your conversations.</Text>
                {entities.length === 0
                    ? <Text style={styles.emptyText}>No entities yet. Keep chatting and memory extraction will populate this section.</Text>
                    : entities.map(renderEntity)}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Facts ({facts.length})</Text>
                <Text style={styles.sectionHint}>Key details your assistant has captured.</Text>
                {facts.length === 0
                    ? <Text style={styles.emptyText}>No facts captured yet. Mention concrete details in a thread to populate this list.</Text>
                    : facts.map(renderFact)}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Open Actions ({actions.length})</Text>
                <Text style={styles.sectionHint}>Reminders and tasks that are still open.</Text>
                {actions.length === 0
                    ? <Text style={styles.emptyText}>No open reminders or tasks yet.</Text>
                    : actions.map(renderAction)}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background
    },
    content: {
        padding: 16,
        paddingBottom: 28
    },
    centerState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: Colors.background,
        paddingHorizontal: 22
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
    header: {
        fontSize: 24,
        fontWeight: '700',
        color: Colors.text
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
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
    subtitle: {
        marginTop: 4,
        color: Colors.secondaryText,
        fontSize: 13
    },
    subtitleHint: {
        marginTop: 2,
        color: Colors.secondaryText,
        fontSize: 12
    },
    subtitleMeta: {
        marginTop: 2,
        color: Colors.secondaryText,
        fontSize: 12
    },
    loadedAt: {
        marginTop: 2,
        color: Colors.secondaryText,
        fontSize: 12
    },
    loadingInline: {
        marginTop: 6,
        color: Colors.secondaryText,
        fontSize: 12
    },
    globalEmptyCard: {
        marginTop: 12,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: Colors.card
    },
    globalEmptyTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.text
    },
    globalEmptyText: {
        marginTop: 6,
        fontSize: 12,
        color: Colors.secondaryText
    },
    globalEmptyAction: {
        marginTop: 10,
        alignSelf: 'flex-start',
        backgroundColor: Colors.primary,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6
    },
    globalEmptyActionText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600'
    },
    section: {
        marginTop: 16,
        backgroundColor: Colors.card,
        borderRadius: 12,
        padding: 12
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: 4
    },
    sectionHint: {
        fontSize: 12,
        color: Colors.secondaryText,
        marginBottom: 6
    },
    emptyText: {
        color: Colors.secondaryText,
        fontSize: 13
    },
    card: {
        backgroundColor: Colors.background,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 10,
        marginTop: 8
    },
    cardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
        flex: 1
    },
    cardTag: {
        backgroundColor: '#E6EEF9',
        color: '#1E3A8A',
        borderRadius: 999,
        overflow: 'hidden',
        paddingHorizontal: 8,
        paddingVertical: 2,
        fontSize: 11,
        fontWeight: '600'
    },
    statusTag: {
        borderRadius: 999,
        overflow: 'hidden',
        paddingHorizontal: 8,
        paddingVertical: 2,
        fontSize: 11,
        fontWeight: '600'
    },
    statusOpen: {
        backgroundColor: '#DCFCE7',
        color: '#166534'
    },
    statusClosed: {
        backgroundColor: '#E5E7EB',
        color: '#374151'
    },
    cardBody: {
        fontSize: 14,
        color: Colors.text,
        marginTop: 4
    },
    cardMeta: {
        marginTop: 3,
        fontSize: 12,
        color: Colors.secondaryText
    },
    routeHintRow: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2
    },
    routeHintText: {
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
        marginTop: 8,
        marginBottom: 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    inlineWarningAction: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '600'
    }
});
