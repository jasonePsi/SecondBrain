import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MessageRepo, MessageSearchHit } from '../../src/repositories/message_repo';
import { Space, SpaceRepo } from '../../src/repositories/space_repo';
import { Thread, ThreadRepo } from '../../src/repositories/thread_repo';
import { useAppTheme } from '../../src/theme/theme';
import { runLayoutFeedback, triggerHaptic, useReducedMotion } from '../../src/services/interaction_feedback';
import { deriveSearchUiState } from '../../src/services/search_ui_state_utils';
import {
    AppButton,
    EmptyStateView,
    GroupedSection,
    InlineBanner,
    ListRow,
    ScreenScaffold,
    SearchField,
    SectionHeader,
    StatusChip
} from '../../src/components/ui';

type SearchType = 'space' | 'thread' | 'message';

type SearchResult = {
    type: SearchType;
    id: string;
    title: string;
    subtitle: string;
    meta?: string;
    navigateTo: string;
};

type SearchSection = {
    type: SearchType;
    title: string;
    subtitle: string;
    data: SearchResult[];
};

const DEBOUNCE_MS = 300;

const rankByStartsWith = <T extends { name?: string; title?: string }>(
    values: T[],
    query: string,
    pickLabel: (value: T) => string
): T[] => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return values;

    return [...values].sort((a, b) => {
        const aLabel = pickLabel(a).toLowerCase();
        const bLabel = pickLabel(b).toLowerCase();
        const aStarts = aLabel.startsWith(normalized) ? 1 : 0;
        const bStarts = bLabel.startsWith(normalized) ? 1 : 0;

        if (aStarts !== bStarts) return bStarts - aStarts;
        return aLabel.localeCompare(bLabel);
    });
};

const formatResultTimestamp = (value: number): string => {
    return new Date(value).toLocaleString();
};

const toRoleLabel = (role: MessageSearchHit['role']): string => {
    if (role === 'assistant') return 'Assistant';
    if (role === 'system') return 'System';
    return 'You';
};

const cleanSnippet = (value: string | null | undefined): string => {
    if (!value) return '';
    return value.replace(/\s+/g, ' ').trim();
};

export default function SearchScreen() {
    const router = useRouter();
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [threads, setThreads] = useState<Thread[]>([]);
    const [messages, setMessages] = useState<MessageSearchHit[]>([]);
    const [messageThreadTitles, setMessageThreadTitles] = useState<Record<string, string>>({});
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resultsQuery, setResultsQuery] = useState('');
    const [searchNonce, setSearchNonce] = useState(0);
    const searchTokenRef = useRef(0);
    const resultsQueryRef = useRef('');

    const cancelInFlightSearch = () => {
        searchTokenRef.current += 1;
    };

    useEffect(() => {
        return () => {
            cancelInFlightSearch();
        };
    }, []);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedQuery(query.trim());
        }, DEBOUNCE_MS);

        return () => clearTimeout(timeout);
    }, [query]);

    useEffect(() => {
        const nextQuery = query.trim();
        if (nextQuery !== resultsQueryRef.current) {
            setError(null);
        }
    }, [query]);

    useEffect(() => {
        const runSearch = async () => {
            if (!debouncedQuery) {
                cancelInFlightSearch();
                setSpaces([]);
                setThreads([]);
                setMessages([]);
                setMessageThreadTitles({});
                setResultsQuery('');
                resultsQueryRef.current = '';
                setError(null);
                setIsSearching(false);
                return;
            }

            const searchToken = ++searchTokenRef.current;
            const queryChanged = resultsQueryRef.current !== debouncedQuery;
            setIsSearching(true);
            setError(null);
            if (queryChanged) {
                setSpaces([]);
                setThreads([]);
                setMessages([]);
                setMessageThreadTitles({});
            }
            try {
                const [spaceRows, threadRows, messageRows] = await Promise.all([
                    SpaceRepo.search(debouncedQuery),
                    ThreadRepo.search(debouncedQuery),
                    MessageRepo.searchSmart(debouncedQuery, 24)
                ]);
                const messageThreadIds = [...new Set(messageRows.map((message) => message.thread_id))];
                const messageThreads = await ThreadRepo.getByIds(messageThreadIds);
                const nextMessageThreadTitles = messageThreads.reduce<Record<string, string>>((acc, thread) => {
                    acc[thread.id] = thread.title;
                    return acc;
                }, {});

                if (searchToken !== searchTokenRef.current) return;
                runLayoutFeedback(reducedMotion);
                setSpaces(rankByStartsWith(spaceRows, debouncedQuery, (item) => item.name));
                setThreads(rankByStartsWith(threadRows, debouncedQuery, (item) => item.title));
                setMessages(messageRows);
                setMessageThreadTitles(nextMessageThreadTitles);
                setResultsQuery(debouncedQuery);
                resultsQueryRef.current = debouncedQuery;
            } catch (err: any) {
                if (searchToken !== searchTokenRef.current) return;
                console.error('Search failed:', err);
                setError('Search is temporarily unavailable. Please try again.');
                setResultsQuery(debouncedQuery);
                resultsQueryRef.current = debouncedQuery;
            } finally {
                if (searchToken !== searchTokenRef.current) return;
                setIsSearching(false);
            }
        };

        runSearch();
    }, [debouncedQuery, searchNonce, reducedMotion]);

    const sections = useMemo(() => {
        const nextSections: SearchSection[] = [];

        if (spaces.length > 0) {
            nextSections.push({
                type: 'space',
                title: 'Spaces',
                subtitle: 'Collections you can open directly.',
                data: spaces.map((space) => ({
                    type: 'space',
                    id: space.id,
                    title: space.name,
                    subtitle: 'Space',
                    meta: `Created ${formatResultTimestamp(space.created_at)}`,
                    navigateTo: `/space/${space.id}`
                }))
            });
        }

        if (threads.length > 0) {
            nextSections.push({
                type: 'thread',
                title: 'Threads',
                subtitle: 'Conversation titles that matched your query.',
                data: threads.map((thread) => ({
                    type: 'thread',
                    id: thread.id,
                    title: thread.title,
                    subtitle: 'Thread',
                    meta: `Created ${formatResultTimestamp(thread.created_at)}`,
                    navigateTo: `/thread/${thread.id}`
                }))
            });
        }

        if (messages.length > 0) {
            nextSections.push({
                type: 'message',
                title: 'Messages',
                subtitle: 'Jump directly to the matched message context.',
                data: messages.map((message) => ({
                    type: 'message',
                    id: message.id,
                    title: cleanSnippet(message.snippet) || 'Message match',
                    subtitle: `Thread: ${messageThreadTitles[message.thread_id] || 'Thread'}`,
                    meta: `${toRoleLabel(message.role)} • ${formatResultTimestamp(message.created_at)} • Opens at match`,
                    navigateTo: `/thread/${message.thread_id}?messageId=${encodeURIComponent(message.id)}`
                }))
            });
        }

        return nextSections;
    }, [spaces, threads, messages, messageThreadTitles]);

    const totalResults = sections.reduce((sum, section) => sum + section.data.length, 0);
    const uiState = deriveSearchUiState({
        query,
        debouncedQuery,
        resultsQuery,
        isSearching,
        error,
        sectionCount: sections.length
    });

    const getIconForType = (
        type: SearchType
    ): React.ComponentProps<typeof Ionicons>['name'] => {
        if (type === 'space') return 'albums-outline';
        if (type === 'thread') return 'chatbubble-outline';
        return 'document-text-outline';
    };

    const getSectionTone = (type: SearchType): 'info' | 'warning' | 'success' | 'neutral' => {
        if (type === 'message') return 'warning';
        if (type === 'space') return 'success';
        return 'info';
    };

    const clearQuery = () => {
        triggerHaptic('selection', reducedMotion);
        cancelInFlightSearch();
        setQuery('');
        setDebouncedQuery('');
        setResultsQuery('');
        resultsQueryRef.current = '';
        setSpaces([]);
        setThreads([]);
        setMessages([]);
        setMessageThreadTitles({});
        setError(null);
        setIsSearching(false);
        runLayoutFeedback(reducedMotion);
    };

    const retrySearch = () => {
        if (!debouncedQuery) return;
        triggerHaptic('selection', reducedMotion);
        cancelInFlightSearch();
        setSearchNonce((prev) => prev + 1);
    };

    const openResult = (item: SearchResult) => {
        triggerHaptic('selection', reducedMotion);
        router.push(item.navigateTo as any);
    };

    const renderItem = (item: SearchResult) => (
        <ListRow
            title={item.title}
            subtitle={item.subtitle}
            meta={item.meta}
            onPress={() => openResult(item)}
            leading={
                <View style={[styles.iconWrap, { backgroundColor: theme.colors.background.grouped }]}>
                    <Ionicons
                        name={getIconForType(item.type)}
                        size={16}
                        color={theme.colors.tint.primary}
                    />
                </View>
            }
            trailing={
                <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
            }
        />
    );

    return (
        <ScreenScaffold>
            <Stack.Screen options={{ title: 'Search' }} />
            <View style={styles.content}>
                <SectionHeader
                    title="Search"
                    subtitle="Find spaces, threads, and message context quickly."
                />
                <SearchField
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search spaces, threads, and messages"
                    searching={isSearching}
                    onClear={clearQuery}
                    accessibilityLabel="Search across spaces, threads, and messages"
                />

                {uiState.showError && (
                    <>
                        <InlineBanner
                            tone="error"
                            message={error || 'Search failed.'}
                            actionLabel="Retry"
                            onActionPress={retrySearch}
                        />
                        <View style={styles.secondaryActions}>
                            <AppButton label="Clear" variant="secondary" onPress={clearQuery} />
                        </View>
                    </>
                )}

                {uiState.showTypingHint && (
                    <Text style={[styles.helperText, { color: theme.colors.text.tertiary }]}>
                        Keep typing to refine results…
                    </Text>
                )}
                {uiState.showSearchingHint && (
                    <Text style={[styles.helperText, { color: theme.colors.text.tertiary }]}>
                        Searching for "{uiState.normalizedQuery}"…
                    </Text>
                )}
                {uiState.normalizedQuery.length > 0 && !uiState.showError && uiState.hasStableResults && (
                    <GroupedSection style={styles.querySummaryCard}>
                        <View style={styles.querySummaryRow}>
                            <Text
                                numberOfLines={1}
                                style={[styles.querySummaryText, { color: theme.colors.text.secondary }]}
                            >
                                Results for "{uiState.normalizedQuery}"
                            </Text>
                            <StatusChip label={`${totalResults}`} tone="info" />
                        </View>
                        <View style={styles.summaryActions}>
                            <AppButton size="sm" label="Clear Search" variant="plain" onPress={clearQuery} />
                        </View>
                    </GroupedSection>
                )}

                {uiState.showIdlePrompt && (
                    <EmptyStateView
                        title="Search your second brain"
                        message="Try names, topics, reminders, or phrases from messages."
                    />
                )}

                {uiState.showNoResults && (
                    <EmptyStateView
                        title="No results"
                        message={`No matches for "${uiState.normalizedQuery}". Try a broader phrase.`}
                        primaryActionLabel="Clear search"
                        onPrimaryAction={clearQuery}
                    />
                )}

                {uiState.showResultList && (
                    <ScrollView
                        style={styles.resultsScroll}
                        contentContainerStyle={styles.listContent}
                        keyboardShouldPersistTaps="handled"
                    >
                        {sections.map((section) => (
                            <View key={section.title} style={styles.sectionBlock}>
                                <SectionHeader
                                    title={section.title}
                                    subtitle={section.subtitle}
                                    trailing={(
                                        <StatusChip
                                            label={String(section.data.length)}
                                            tone={getSectionTone(section.type)}
                                        />
                                    )}
                                />
                                <GroupedSection>
                                    {section.data.map((item, index) => (
                                        <View key={`${item.type}-${item.id}`}>
                                            {renderItem(item)}
                                            {index < section.data.length - 1 && (
                                                <View
                                                    style={[
                                                        styles.separator,
                                                        { backgroundColor: theme.colors.separator.subtle }
                                                    ]}
                                                />
                                            )}
                                        </View>
                                    ))}
                                </GroupedSection>
                            </View>
                        ))}
                    </ScrollView>
                )}
            </View>
        </ScreenScaffold>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
        paddingHorizontal: 14,
        paddingTop: 10
    },
    helperText: {
        marginTop: 8,
        marginBottom: 2,
        fontSize: 12
    },
    secondaryActions: {
        marginTop: 8,
        flexDirection: 'row',
        gap: 8
    },
    querySummaryCard: {
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 10
    },
    querySummaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    querySummaryText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600'
    },
    summaryActions: {
        marginTop: 6,
        flexDirection: 'row'
    },
    resultsScroll: {
        flex: 1
    },
    sectionBlock: {
        marginTop: 14
    },
    listContent: {
        paddingTop: 4,
        paddingBottom: 24
    },
    iconWrap: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center'
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 44
    }
});
