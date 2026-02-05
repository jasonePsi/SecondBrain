import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Button } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Thread, ThreadRepo } from '../../src/repositories/thread_repo';
import { SpaceRepo } from '../../src/repositories/space_repo';
import { Colors } from '../../src/constants/Colors';
import { useFocusEffect } from '@expo/router';

export default function SpaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [spaceName, setSpaceName] = useState('Space');

  const loadData = async () => {
    if (!id) return;
    // For MVP, SpaceRepo doesn't have get(id), we use list. 
    // We should implement SpaceRepo.get(id) or just mock name lookup from list.
    const spaces = await SpaceRepo.getAll();
    const space = spaces.find(s => s.id === id);
    if (space) setSpaceName(space.name);

    const data = await ThreadRepo.listBySpace(id);
    setThreads(data);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [id])
  );

  const createThread = async () => {
    if (!id) return;
    const newId = await ThreadRepo.create(id, \`New Thread \${new Date().toLocaleTimeString()}\`);
      await loadData();
      router.push(\`/thread/\${newId}\`);
  };

  const renderItem = ({ item }: { item: Thread }) => (
    <TouchableOpacity 
      style={styles.item}
      onPress={() => router.push(\`/thread/\${item.id}\`)}
    >
      <Text style={styles.itemTitle}>{item.title}</Text>
      <Text style={styles.itemDate}>{new Date(item.created_at).toLocaleString()}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: spaceName, headerRight: () => <Button title="New" onPress={createThread} /> }} />
      <FlashList
        data={threads}
        renderItem={renderItem}
        estimatedItemSize={60}
        ListEmptyComponent={<Text style={styles.empty}>No threads found.</Text>}
      />
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
  itemTitle: {
      fontSize: 16,
      fontWeight: '600',
  },
  itemDate: {
      color: Colors.secondaryText,
      fontSize: 12,
      marginTop: 4
  },
  empty: {
      textAlign: 'center',
      marginTop: 20,
      color: Colors.secondaryText
  }
});
