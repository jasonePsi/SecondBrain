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
            setError(err?.message || 'Could not load memory right now.');
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
                <Text style={styles.cardTitle}>{entity.name}</Text>
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
            <Text style={styles.cardBody}>
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
                <Text style={styles.cardTitle}>{action.text}</Text>
                <Text style={[
                    styles.statusTag,
                    action.status === 'open' ? styles.statusOpen : styles.statusClosed
                ]}>
                    {action.status}
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
            <Text style={styles.header}>Brain</Text>
            <Text style={styles.subtitle}>
                Structured memory from your conversations.
            </Text>
            <Text style={styles.subtitleMeta}>
                {entities.length} entities · {facts.length} facts · {actions.length} open action(s)
            </Text>
            {!!snapshot?.loadedAt && (
                <Text style={styles.loadedAt}>Last refreshed {formatTimestamp(snapshot.loadedAt)}</Text>
            )}

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Entities</Text>
                {entities.length === 0
                    ? <Text style={styles.emptyText}>No entities yet. Keep chatting and memory extraction will populate this section.</Text>
                    : entities.map(renderEntity)}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Facts</Text>
                {facts.length === 0
                    ? <Text style={styles.emptyText}>No facts captured yet.</Text>
                    : facts.map(renderFact)}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Open Actions</Text>
                {actions.length === 0
                    ? <Text style={styles.emptyText}>No open reminders or tasks.</Text>
                    : actions.map(renderAction)}
            </View>

            {!!error && (
                <Text style={styles.inlineError}>Refresh warning: {error}</Text>
            )}
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
    subtitle: {
        marginTop: 4,
        color: Colors.secondaryText,
        fontSize: 13
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
        marginBottom: 8
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
        marginTop: 14,
        color: Colors.notification,
        fontSize: 12
    }
});
