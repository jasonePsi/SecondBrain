import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, Button } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Thread, ThreadRepo } from '../../src/repositories/thread_repo';
import { SpaceRepo } from '../../src/repositories/space_repo';
import { Colors } from '../../src/constants/Colors';
import { useFocusEffect } from 'expo-router';

export default function SpaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [spaceName, setSpaceName] = useState('Space');
  const [isNewThreadOpen, setIsNewThreadOpen] = useState(false);
  const [newThreadName, setNewThreadName] = useState('');

  const loadData = useCallback(async () => {
    if (!id) return;
    const space = await SpaceRepo.get(id);
    if (space) setSpaceName(space.name);

    const data = await ThreadRepo.listBySpace(id);
    setThreads(data);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const openNewThread = () => {
    setNewThreadName('');
    setIsNewThreadOpen(true);
  };

  const closeNewThread = () => {
    setIsNewThreadOpen(false);
    setNewThreadName('');
  };

  const createThread = async () => {
    if (!id) return;
    const trimmed = newThreadName.trim();
    const title = trimmed || `New Thread ${new Date().toLocaleTimeString()}`;
    const newId = await ThreadRepo.create(id, title);
    closeNewThread();
    await loadData();
    router.push(`/thread/${newId}`);
  };

  const renderItem = ({ item }: { item: Thread }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => router.push(`/thread/${item.id}`)}
    >
      <Text style={styles.itemTitle}>{item.title}</Text>
      <Text style={styles.itemDate}>{new Date(item.created_at).toLocaleString()}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: spaceName, headerRight: () => <Button title="New" onPress={openNewThread} /> }} />
      <FlashList
        data={threads}
        renderItem={renderItem}
        estimatedItemSize={60}
        ListEmptyComponent={<Text style={styles.empty}>No threads found.</Text>}
      />

      <Modal
        transparent
        visible={isNewThreadOpen}
        animationType="fade"
        onRequestClose={closeNewThread}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>New Thread</Text>
              <TextInput
                style={styles.modalInput}
                value={newThreadName}
                onChangeText={setNewThreadName}
                placeholder="Thread name (optional)"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={createThread}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalButton} onPress={closeNewThread}>
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalPrimaryButton]}
                  onPress={createThread}
                >
                  <Text style={[styles.modalButtonText, styles.modalPrimaryText]}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: Colors.text
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: Colors.background,
    marginBottom: 16
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  modalButtonText: {
    fontSize: 15,
    color: Colors.text
  },
  modalPrimaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8
  },
  modalPrimaryText: {
    color: 'white',
    fontWeight: '600'
  }
});
