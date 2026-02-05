import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, SectionList } from 'react-native';
import { useRouter } from 'expo-router';
import { SpaceRepo, Space } from '../../src/repositories/space_repo';
import { ThreadRepo, Thread } from '../../src/repositories/thread_repo';
import { MessageRepo, Message } from '../../src/repositories/message_repo';
import { Colors } from '../../src/constants/Colors';
import { Ionicons } from '@expo/vector-icons';

type SearchResult = {
    type: 'space' | 'thread' | 'message';
    id: string;
    title: string;
    subtitle?: string;
    navigateTo: string;
};

export default function SearchScreen() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const router = useRouter();

    const performSearch = async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const [spaces, threads, messages] = await Promise.all([
                SpaceRepo.search(searchQuery),
                ThreadRepo.search(searchQuery),
                MessageRepo.search(searchQuery, 20),
            ]);

            const combined: SearchResult[] = [
                ...spaces.map((s: Space) => ({
                    type: 'space' as const,
                    id: s.id,
                    title: s.name,
                    subtitle: 'Space',
                    navigateTo: `/space/${s.id}`,
                })),
                ...threads.map((t: Thread) => ({
                    type: 'thread' as const,
                    id: t.id,
                    title: t.title,
                    subtitle: 'Thread',
                    navigateTo: `/thread/${t.id}`,
                })),
                ...messages.map((m: Message) => ({
                    type: 'message' as const,
                    id: m.id,
                    title: m.text.substring(0, 60) + (m.text.length > 60 ? '...' : ''),
                    subtitle: `Message (${m.role})`,
                    navigateTo: `/thread/${m.thread_id}`,
                })),
            ];

            setResults(combined);
        } catch (e) {
            console.error('Search failed:', e);
        } finally {
            setIsSearching(false);
        }
    };

    const handleQueryChange = (text: string) => {
        setQuery(text);
        performSearch(text);
    };

    const getIconForType = (type: 'space' | 'thread' | 'message'): React.ComponentProps<typeof Ionicons>['name'] => {
        switch (type) {
            case 'space': return 'grid-outline';
            case 'thread': return 'chatbubble-outline';
            case 'message': return 'document-text-outline';
        }
    };

    const renderItem = ({ item }: { item: SearchResult }) => (
        <TouchableOpacity
            style={styles.resultItem}
            onPress={() => router.push(item.navigateTo as any)}
        >
            <Ionicons name={getIconForType(item.type)} size={24} color={Colors.primary} style={styles.resultIcon} />
            <View style={styles.resultText}>
                <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.resultSubtitle}>{item.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={Colors.secondaryText} style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search spaces, threads, messages..."
                    placeholderTextColor={Colors.secondaryText}
                    value={query}
                    onChangeText={handleQueryChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => handleQueryChange('')}>
                        <Ionicons name="close-circle" size={20} color={Colors.secondaryText} />
                    </TouchableOpacity>
                )}
            </View>

            {results.length === 0 && query.length > 0 && !isSearching && (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No results found for "{query}"</Text>
                </View>
            )}

            {results.length === 0 && query.length === 0 && (
                <View style={styles.emptyState}>
                    <Ionicons name="search" size={48} color={Colors.border} />
                    <Text style={styles.emptyText}>Search your Second Brain</Text>
                    <Text style={styles.emptySubtext}>Find spaces, threads, and messages</Text>
                </View>
            )}

            {results.length > 0 && (
                <SectionList
                    sections={[{ title: 'Results', data: results }]}
                    keyExtractor={(item) => `${item.type}-${item.id}`}
                    renderItem={renderItem}
                    renderSectionHeader={() => null}
                    contentContainerStyle={styles.listContent}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.card,
        margin: 16,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 14,
        fontSize: 16,
        color: Colors.text,
    },
    listContent: {
        paddingHorizontal: 16,
    },
    resultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.card,
        padding: 14,
        borderRadius: 10,
        marginBottom: 8,
    },
    resultIcon: {
        marginRight: 12,
    },
    resultText: {
        flex: 1,
    },
    resultTitle: {
        fontSize: 16,
        fontWeight: '500',
        color: Colors.text,
    },
    resultSubtitle: {
        fontSize: 12,
        color: Colors.secondaryText,
        marginTop: 2,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        fontSize: 16,
        color: Colors.secondaryText,
        marginTop: 16,
        textAlign: 'center',
    },
    emptySubtext: {
        fontSize: 14,
        color: Colors.border,
        marginTop: 4,
    },
});
