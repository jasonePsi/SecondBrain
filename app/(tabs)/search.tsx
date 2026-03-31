import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    SectionList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/Colors';
import { MessageRepo, MessageSearchHit } from '../../src/repositories/message_repo';
import { Space, SpaceRepo } from '../../src/repositories/space_repo';
import { Thread, ThreadRepo } from '../../src/repositories/thread_repo';

type SearchType = 'space' | 'thread' | 'message';

type SearchResult = {
    type: SearchType;
    id: string;
    title: string;
    subtitle: string;
    snippet?: string;
    navigateTo: string;
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

const toMessageTitle = (message: MessageSearchHit): string => {
    const text = message.text.replace(/\s+/g, ' ').trim();
    if (text.length <= 72) return text;
    return `${text.slice(0, 71).trimEnd()}…`;
};

const formatResultTimestamp = (value: number): string => {
    return new Date(value).toLocaleString();
};

export default function SearchScreen() {
    const router = useRouter();
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
    const normalizedQuery = query.trim();
    const isQuerySettled = normalizedQuery === debouncedQuery;
    const hasStableResults = isQuerySettled && resultsQuery === normalizedQuery;
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
            } finally {
                if (searchToken !== searchTokenRef.current) return;
                setIsSearching(false);
            }
        };

        runSearch();
    }, [debouncedQuery, searchNonce]);

    const sections = useMemo(() => {
        const nextSections: Array<{ title: string; data: SearchResult[] }> = [];

        if (spaces.length > 0) {
            nextSections.push({
                title: `Spaces (${spaces.length})`,
                data: spaces.map((space) => ({
                    type: 'space',
                    id: space.id,
                    title: space.name,
                    subtitle: 'Space',
                    navigateTo: `/space/${space.id}`
                }))
            });
        }

        if (threads.length > 0) {
            nextSections.push({
                title: `Threads (${threads.length})`,
                data: threads.map((thread) => ({
                    type: 'thread',
                    id: thread.id,
                    title: thread.title,
                    subtitle: 'Thread',
                    navigateTo: `/thread/${thread.id}`
                }))
            });
        }

        if (messages.length > 0) {
            nextSections.push({
                title: `Messages (${messages.length})`,
                data: messages.map((message) => ({
                    type: 'message',
                    id: message.id,
                    title: toMessageTitle(message),
                    subtitle: `${message.role === 'assistant' ? 'Assistant' : 'You'} in ${messageThreadTitles[message.thread_id] || 'Thread'} • ${formatResultTimestamp(message.created_at)}`,
                    snippet: message.snippet,
                    navigateTo: `/thread/${message.thread_id}?messageId=${encodeURIComponent(message.id)}`
                }))
            });
        }

        return nextSections;
    }, [spaces, threads, messages, messageThreadTitles]);

    const getIconForType = (
        type: SearchType
    ): React.ComponentProps<typeof Ionicons>['name'] => {
        if (type === 'space') return 'grid-outline';
        if (type === 'thread') return 'chatbubble-outline';
        return 'document-text-outline';
    };

    const clearQuery = () => {
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
    };

    const retrySearch = () => {
        if (!debouncedQuery) return;
        cancelInFlightSearch();
        setSearchNonce((prev) => prev + 1);
    };

    const renderItem = ({ item }: { item: SearchResult }) => (
        <TouchableOpacity
            style={styles.resultItem}
            onPress={() => router.push(item.navigateTo as any)}
        >
            <Ionicons
                name={getIconForType(item.type)}
                size={22}
                color={Colors.primary}
                style={styles.resultIcon}
            />
            <View style={styles.resultText}>
                <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.resultSubtitle}>{item.subtitle}</Text>
                {!!item.snippet && (
                    <Text style={styles.resultSnippet} numberOfLines={2}>
                        {item.snippet}
                    </Text>
                )}
                {item.type === 'message' && (
                    <Text style={styles.resultRouteHint}>Opens directly at this message</Text>
                )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={Colors.secondaryText} style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search spaces, threads, and messages"
                    placeholderTextColor={Colors.secondaryText}
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                {isSearching && <ActivityIndicator size="small" color={Colors.primary} style={styles.spinner} />}
                {query.length > 0 && (
                    <TouchableOpacity onPress={clearQuery}>
                        <Ionicons name="close-circle" size={20} color={Colors.secondaryText} />
                    </TouchableOpacity>
                )}
            </View>

            {!!error && (
                <View style={styles.errorRow}>
                    <Text style={styles.errorText}>{error}</Text>
                    <View style={styles.errorActionsRow}>
                        <TouchableOpacity onPress={retrySearch}>
                            <Text style={styles.errorAction}>Retry</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={clearQuery}>
                            <Text style={styles.errorAction}>Clear</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {normalizedQuery.length > 0 && !isQuerySettled && (
                <Text style={styles.searchingText}>Keep typing to search…</Text>
            )}
            {isSearching && debouncedQuery.length > 0 && isQuerySettled && (
                <Text style={styles.searchingText}>Searching for "{normalizedQuery}"…</Text>
            )}
            {!!normalizedQuery && !isSearching && sections.length > 0 && hasStableResults && (
                <Text style={styles.searchingText}>
                    {sections.reduce((sum, section) => sum + section.data.length, 0)} result(s) for "{normalizedQuery}"
                </Text>
            )}

            {!normalizedQuery && (
                <View style={styles.emptyState}>
                    <Ionicons name="search" size={46} color={Colors.border} />
                    <Text style={styles.emptyTitle}>Search your second brain</Text>
                    <Text style={styles.emptyText}>Try names, topics, reminders, or phrases from messages.</Text>
                </View>
            )}

            {!!normalizedQuery && !isSearching && sections.length === 0 && hasStableResults && !error && (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No results</Text>
                    <Text style={styles.emptyText}>No matches for "{normalizedQuery}". Try a broader phrase.</Text>
                    <TouchableOpacity onPress={clearQuery} style={styles.emptyActionButton}>
                        <Text style={styles.emptyActionText}>Clear search</Text>
                    </TouchableOpacity>
                </View>
            )}

            {sections.length > 0 && hasStableResults && (
                <SectionList
                    sections={sections}
                    keyExtractor={(item) => `${item.type}-${item.id}`}
                    renderItem={renderItem}
                    renderSectionHeader={({ section }) => (
                        <Text style={styles.sectionHeader}>{section.title}</Text>
                    )}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="handled"
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.card,
        margin: 16,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border
    },
    searchIcon: {
        marginRight: 8
    },
    spinner: {
        marginRight: 8
    },
    searchInput: {
        flex: 1,
        paddingVertical: 14,
        fontSize: 16,
        color: Colors.text
    },
    errorText: {
        flex: 1,
        color: Colors.notification,
        fontSize: 12
    },
    errorAction: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '600'
    },
    errorActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    errorRow: {
        marginHorizontal: 16,
        marginBottom: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    searchingText: {
        marginHorizontal: 16,
        marginBottom: 4,
        color: Colors.secondaryText,
        fontSize: 12
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 20
    },
    sectionHeader: {
        fontSize: 13,
        fontWeight: '700',
        color: Colors.secondaryText,
        marginTop: 12,
        marginBottom: 8
    },
    resultItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: Colors.card,
        padding: 12,
        borderRadius: 10,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: Colors.border
    },
    resultIcon: {
        marginTop: 2,
        marginRight: 10
    },
    resultText: {
        flex: 1
    },
    resultTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text
    },
    resultSubtitle: {
        marginTop: 2,
        fontSize: 12,
        color: Colors.secondaryText
    },
    resultSnippet: {
        marginTop: 4,
        fontSize: 12,
        color: Colors.secondaryText
    },
    resultRouteHint: {
        marginTop: 4,
        fontSize: 11,
        color: Colors.primary
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 30
    },
    emptyTitle: {
        marginTop: 14,
        fontSize: 18,
        fontWeight: '700',
        color: Colors.text
    },
    emptyText: {
        marginTop: 6,
        fontSize: 14,
        color: Colors.secondaryText,
        textAlign: 'center'
    },
    emptyActionButton: {
        marginTop: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: Colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 7
    },
    emptyActionText: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '600'
    }
});
