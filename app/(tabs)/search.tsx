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

export default function SearchScreen() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [threads, setThreads] = useState<Thread[]>([]);
    const [messages, setMessages] = useState<MessageSearchHit[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const searchTokenRef = useRef(0);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedQuery(query.trim());
        }, DEBOUNCE_MS);

        return () => clearTimeout(timeout);
    }, [query]);

    useEffect(() => {
        const runSearch = async () => {
            if (!debouncedQuery) {
                setSpaces([]);
                setThreads([]);
                setMessages([]);
                setError(null);
                return;
            }

            const searchToken = ++searchTokenRef.current;
            setIsSearching(true);
            setError(null);
            try {
                const [spaceRows, threadRows, messageRows] = await Promise.all([
                    SpaceRepo.search(debouncedQuery),
                    ThreadRepo.search(debouncedQuery),
                    MessageRepo.searchSmart(debouncedQuery, 24)
                ]);

                if (searchToken !== searchTokenRef.current) return;
                setSpaces(rankByStartsWith(spaceRows, debouncedQuery, (item) => item.name));
                setThreads(rankByStartsWith(threadRows, debouncedQuery, (item) => item.title));
                setMessages(messageRows);
            } catch (err: any) {
                if (searchToken !== searchTokenRef.current) return;
                setError(err?.message || 'Search failed.');
            } finally {
                if (searchToken !== searchTokenRef.current) return;
                setIsSearching(false);
            }
        };

        runSearch();
    }, [debouncedQuery]);

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
                    subtitle: `Message (${message.role})`,
                    snippet: message.snippet,
                    navigateTo: `/thread/${message.thread_id}`
                }))
            });
        }

        return nextSections;
    }, [spaces, threads, messages]);

    const getIconForType = (
        type: SearchType
    ): React.ComponentProps<typeof Ionicons>['name'] => {
        if (type === 'space') return 'grid-outline';
        if (type === 'thread') return 'chatbubble-outline';
        return 'document-text-outline';
    };

    const clearQuery = () => {
        setQuery('');
        setDebouncedQuery('');
        setError(null);
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
                <Text style={styles.errorText}>Search warning: {error}</Text>
            )}

            {!debouncedQuery && (
                <View style={styles.emptyState}>
                    <Ionicons name="search" size={46} color={Colors.border} />
                    <Text style={styles.emptyTitle}>Search your second brain</Text>
                    <Text style={styles.emptyText}>Try names, topics, reminders, or phrases from messages.</Text>
                </View>
            )}

            {!!debouncedQuery && !isSearching && sections.length === 0 && (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No results</Text>
                    <Text style={styles.emptyText}>No matches for "{debouncedQuery}".</Text>
                </View>
            )}

            {sections.length > 0 && (
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
        marginHorizontal: 16,
        marginBottom: 6,
        color: Colors.notification,
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
    }
});
