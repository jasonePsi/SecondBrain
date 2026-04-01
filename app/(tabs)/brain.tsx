import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
    BrainActionCard,
    BrainEntityCard,
    BrainFactCard,
    BrainService,
    BrainSnapshot
} from '../../src/services/BrainService';
import { useAppTheme } from '../../src/theme/theme';
import { runLayoutFeedback, triggerHaptic, useReducedMotion } from '../../src/services/interaction_feedback';
import {
    AppButton,
    ErrorStateView,
    GroupedSection,
    InlineBanner,
    ListRow,
    LoadingStateView,
    ScreenScaffold,
    SectionHeader,
    StatusChip
} from '../../src/components/ui';

const formatTimestamp = (value: number | null | undefined): string => {
    if (!value) return 'Unknown time';
    return new Date(value).toLocaleString();
};

const getEntityIcon = (type: string): React.ComponentProps<typeof Ionicons>['name'] => {
    const normalized = type.toLowerCase();
    if (normalized.includes('person')) return 'person-outline';
    if (normalized.includes('place')) return 'location-outline';
    if (normalized.includes('org')) return 'business-outline';
    return 'pricetag-outline';
};

const getActionTone = (status: BrainActionCard['status']): 'success' | 'error' | 'neutral' => {
    if (status === 'done') return 'success';
    if (status === 'canceled') return 'error';
    return 'neutral';
};

type BrainSectionProps<T> = {
    title: string;
    subtitle: string;
    items: T[];
    renderRow: (item: T, index: number) => React.ReactNode;
    emptyCopy: string;
    tone?: 'info' | 'warning' | 'error';
};

function BrainSection<T>({
    title,
    subtitle,
    items,
    renderRow,
    emptyCopy,
    tone = 'info'
}: BrainSectionProps<T>) {
    const theme = useAppTheme();
    return (
        <View style={styles.sectionBlock}>
            <SectionHeader
                title={title}
                subtitle={subtitle}
                trailing={<StatusChip label={String(items.length)} tone={tone} />}
            />
            {items.length === 0 ? (
                <GroupedSection style={styles.emptyGroup}>
                    <Text style={[styles.sectionEmptyText, { color: theme.colors.text.secondary }]}>
                        {emptyCopy}
                    </Text>
                </GroupedSection>
            ) : (
                <GroupedSection>
                    {items.map((item, index) => (
                        <View key={index}>
                            {renderRow(item, index)}
                            {index < items.length - 1 && (
                                <View style={[styles.separator, { backgroundColor: theme.colors.separator.subtle }]} />
                            )}
                        </View>
                    ))}
                </GroupedSection>
            )}
        </View>
    );
}

export default function BrainScreen() {
    const router = useRouter();
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    const isMountedRef = useRef(true);
    const loadRequestRef = useRef(0);
    const [snapshot, setSnapshot] = useState<BrainSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, [reducedMotion]);

    const loadSnapshot = useCallback(async (options?: { feedback?: boolean }) => {
        const requestId = ++loadRequestRef.current;
        const canApply = () => isMountedRef.current && requestId === loadRequestRef.current;
        try {
            if (canApply()) {
                setLoading(true);
                setError(null);
            }
            const next = await BrainService.getSnapshot();
            if (!canApply()) return;
            runLayoutFeedback(reducedMotion);
            setSnapshot(next);
            if (options?.feedback) {
                triggerHaptic('selection', reducedMotion);
            }
        } catch (err: any) {
            console.error('Brain refresh failed:', err);
            if (canApply()) {
                setError('Memory view is temporarily unavailable. Please try again.');
            }
            if (options?.feedback) {
                triggerHaptic('error', reducedMotion);
            }
        } finally {
            if (canApply()) {
                setLoading(false);
            }
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

    if (loading && !snapshot) {
        return (
            <ScreenScaffold>
                <LoadingStateView
                    title="Loading memory"
                    message="Gathering entities, facts, and open reminders."
                />
            </ScreenScaffold>
        );
    }

    if (error && !snapshot) {
        return (
            <ScreenScaffold>
                <ErrorStateView
                    title="Memory unavailable"
                    message={error}
                    primaryActionLabel="Retry"
                    onPrimaryAction={() => loadSnapshot({ feedback: true })}
                    secondaryActionLabel="Go to Spaces"
                    onSecondaryAction={() => router.push('/(tabs)/spaces')}
                />
            </ScreenScaffold>
        );
    }

    const entities = snapshot?.entities || [];
    const facts = snapshot?.facts || [];
    const actions = snapshot?.actions || [];
    const isCompletelyEmpty = entities.length === 0 && facts.length === 0 && actions.length === 0;

    return (
        <ScreenScaffold>
            <Stack.Screen
                options={{
                    title: 'Brain',
                    headerRight: () => (
                        <TouchableOpacity
                            onPress={() => loadSnapshot({ feedback: true })}
                            style={styles.refreshButton}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Refresh memory snapshot"
                            accessibilityHint="Reloads entities, facts, and reminders"
                            accessibilityState={{ busy: loading }}
                        >
                            <Ionicons name="refresh" size={20} color={theme.colors.tint.primary} />
                        </TouchableOpacity>
                    )
                }}
            />
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.headerBlock}>
                    <SectionHeader
                        title="Structured Memory"
                        subtitle="A live snapshot of entities, facts, and open reminders from your conversations."
                    />
                    <GroupedSection style={styles.summaryCard}>
                        <View style={styles.summaryRow}>
                            <StatusChip label={`${entities.length} Entities`} />
                            <StatusChip label={`${facts.length} Facts`} />
                            <StatusChip label={`${actions.length} Open Actions`} tone="warning" />
                        </View>
                        {!!snapshot?.loadedAt && (
                            <Text style={[styles.summaryMeta, { color: theme.colors.text.tertiary }]}>
                                Updated {formatTimestamp(snapshot.loadedAt)}
                            </Text>
                        )}
                    </GroupedSection>
                    {!!error && (
                        <InlineBanner
                            tone="warning"
                            message={error}
                            actionLabel="Retry"
                            onActionPress={() => loadSnapshot({ feedback: true })}
                        />
                    )}
                    {loading && !!snapshot && (
                        <InlineBanner
                            tone="info"
                            message="Refreshing memory…"
                        />
                    )}
                </View>

                {isCompletelyEmpty ? (
                    <GroupedSection style={styles.globalEmptyCard}>
                        <Text style={[styles.globalEmptyTitle, { color: theme.colors.text.primary }]}>
                            Memory is empty for now
                        </Text>
                        <Text style={[styles.globalEmptyText, { color: theme.colors.text.secondary }]}>
                            Start a conversation and capture a few facts or reminders. They will appear here automatically.
                        </Text>
                        <View style={styles.globalEmptyAction}>
                            <AppButton
                                label="Go to Spaces"
                                variant="secondary"
                                onPress={() => router.push('/(tabs)/spaces')}
                            />
                        </View>
                    </GroupedSection>
                ) : (
                    <>
                        <BrainSection<BrainEntityCard>
                            title="Entities"
                            subtitle="People, places, organizations, and named things."
                            items={entities}
                            emptyCopy="No entities yet. Keep chatting and this section will fill in."
                            renderRow={(entity) => (
                                <ListRow
                                    title={entity.name}
                                    subtitle={entity.type}
                                    meta={`${entity.scopeLabel} • Captured ${formatTimestamp(entity.createdAt)}`}
                                    onPress={entity.route ? () => navigateTo(entity.route) : undefined}
                                    leading={(
                                        <Ionicons
                                            name={getEntityIcon(entity.type)}
                                            size={18}
                                            color={theme.colors.tint.primary}
                                        />
                                    )}
                                    trailing={entity.route ? (
                                        <Ionicons
                                            name="chevron-forward"
                                            size={16}
                                            color={theme.colors.text.tertiary}
                                        />
                                    ) : undefined}
                                />
                            )}
                        />

                        <BrainSection<BrainFactCard>
                            title="Facts"
                            subtitle="Concrete details captured so they are easy to recall."
                            items={facts}
                            emptyCopy="No facts captured yet. Mention concrete details in a thread."
                            renderRow={(fact) => (
                                <ListRow
                                    title={fact.key}
                                    subtitle={`${fact.value}${fact.unit ? ` ${fact.unit}` : ''}`}
                                    meta={`Updated ${formatTimestamp(fact.effectiveAt)} • ${fact.scopeLabel}`}
                                    onPress={fact.route ? () => navigateTo(fact.route) : undefined}
                                    leading={(
                                        <Ionicons
                                            name="document-text-outline"
                                            size={18}
                                            color={theme.colors.tint.primary}
                                        />
                                    )}
                                    trailing={fact.route ? (
                                        <Ionicons
                                            name="chevron-forward"
                                            size={16}
                                            color={theme.colors.text.tertiary}
                                        />
                                    ) : undefined}
                                />
                            )}
                        />

                        <BrainSection<BrainActionCard>
                            title="Open Actions"
                            subtitle="Reminders and tasks waiting on action."
                            items={actions}
                            emptyCopy="No open reminders or tasks right now."
                            tone="warning"
                            renderRow={(action) => (
                                <ListRow
                                    title={action.text}
                                    subtitle={action.scopeLabel}
                                    meta={action.scheduledFor
                                        ? `Scheduled ${formatTimestamp(action.scheduledFor)}`
                                        : `Created ${formatTimestamp(action.createdAt)}`}
                                    onPress={action.route ? () => navigateTo(action.route) : undefined}
                                    leading={(
                                        <Ionicons
                                            name="alarm-outline"
                                            size={18}
                                            color={theme.colors.status.warning}
                                        />
                                    )}
                                    trailing={(
                                        <View style={styles.actionTrailing}>
                                            <StatusChip
                                                label={action.status === 'open' ? 'Open' : action.status}
                                                tone={getActionTone(action.status)}
                                            />
                                            {action.route && (
                                                <Ionicons
                                                    name="chevron-forward"
                                                    size={16}
                                                    color={theme.colors.text.tertiary}
                                                />
                                            )}
                                        </View>
                                    )}
                                />
                            )}
                        />
                    </>
                )}
            </ScrollView>
        </ScreenScaffold>
    );
}

const styles = StyleSheet.create({
    refreshButton: {
        marginRight: 12,
        minWidth: 40,
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center'
    },
    content: {
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 30
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
        gap: 6
    },
    summaryMeta: {
        marginTop: 8,
        fontSize: 12
    },
    sectionBlock: {
        marginTop: 14
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 44
    },
    emptyGroup: {
        paddingHorizontal: 12,
        paddingVertical: 12
    },
    sectionEmptyText: {
        fontSize: 13
    },
    actionTrailing: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    globalEmptyCard: {
        paddingHorizontal: 12,
        paddingVertical: 14
    },
    globalEmptyTitle: {
        fontSize: 16,
        fontWeight: '700'
    },
    globalEmptyText: {
        marginTop: 6,
        fontSize: 13
    },
    globalEmptyAction: {
        marginTop: 12,
        alignSelf: 'flex-start'
    }
});
