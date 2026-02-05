import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { FeedRepo, FeedItem } from '../../src/repositories/feed_repo';
import { Colors } from '../../src/constants/Colors';
import { runMigrations } from '../../src/db/migrations';
import { CaptureFAB } from '../../src/components/CaptureFAB';

export default function FeedScreen() {
    const [items, setItems] = useState<FeedItem[]>([]);

    useEffect(() => {
        // Run migrations once on mount (hacky but works for MVP local dev)
        const init = async () => {
            await runMigrations();
            await loadFeed();
        };
        init();
    }, []);

    const loadFeed = async () => {
        const data = await FeedRepo.getFeed();
        setItems(data);
    };

    const renderItem = ({ item }: { item: FeedItem }) => (
        <View style={styles.item}>
            <Text style={styles.itemType}>{item.type}</Text>
            <Text style={styles.itemDate}>{new Date(item.created_at).toLocaleString()}</Text>
            <Text>Ref: {item.ref_id}</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <FlashList
                data={items}
                renderItem={renderItem}
                estimatedItemSize={50}
                ListEmptyComponent={<Text style={styles.empty}>No feed items yet. Capture something!</Text>}
            />
            <CaptureFAB onPress={() => console.log('Capture Tapped')} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    item: {
        padding: 16,
        backgroundColor: Colors.card,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    itemType: {
        fontWeight: 'bold',
        marginBottom: 4,
    },
    itemDate: {
        color: Colors.secondaryText,
        fontSize: 12
    },
    empty: {
        textAlign: 'center',
        marginTop: 20,
        color: Colors.secondaryText
    }
});
