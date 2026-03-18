import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Thread, ThreadRepo } from '../../src/repositories/thread_repo';
import { SpaceRepo } from '../../src/repositories/space_repo';
import { FeedRepo } from '../../src/repositories/feed_repo';
import { Colors } from '../../src/constants/Colors';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function SpaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spaceName, setSpaceName] = useState('Space');
  const [isNewThreadOpen, setIsNewThreadOpen] = useState(false);
  const [newThreadName, setNewThreadName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Thread | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const space = await SpaceRepo.get(id);
      if (space) setSpaceName(space.name);

      const data = await ThreadRepo.listBySpace(id);
      setThreads(data);
    } catch (err: any) {
      setError(err?.message || 'Could not load threads.');
    } finally {
      setLoading(false);
    }
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
    await FeedRepo.create(id, 'thread_created', newId);
    closeNewThread();
    await loadData();
    router.push(`/thread/${newId}`);
  };

  const toggleEdit = () => {
    setIsEditing((prev) => !prev);
    setRenameTarget(null);
  };

  const openRename = (thread: Thread) => {
    setRenameTarget(thread);
    setRenameValue(thread.title);
  };

  const closeRename = () => {
    setRenameTarget(null);
    setRenameValue('');
  };

  const saveRename = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;

    try {
      await ThreadRepo.update(renameTarget.id, { title: trimmed });
      await FeedRepo.create(id || null, 'thread_updated', renameTarget.id);
      closeRename();
      await loadData();
    } catch (error) {
      console.error('Rename failed:', error);
      Alert.alert('Error', 'Could not rename thread.');
    }
  };

  const handleDelete = (thread: Thread) => {
    Alert.alert(
      'Delete Thread',
      `Delete "${thread.title}"? This will remove all messages in it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ThreadRepo.delete(thread.id);
              await loadData();
            } catch (error) {
              console.error('Delete failed:', error);
              Alert.alert('Error', 'Could not delete thread.');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: Thread }) => (
    <View style={styles.item}>
      <TouchableOpacity
        style={styles.itemContent}
        onPress={() => router.push(`/thread/${item.id}`)}
        disabled={isEditing}
      >
        <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.itemDate}>{new Date(item.created_at).toLocaleString()}</Text>
      </TouchableOpacity>

      {isEditing && (
        <View style={styles.itemActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => openRename(item)}>
            <Ionicons name="pencil" size={18} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleDelete(item)}>
            <Ionicons name="trash" size={18} color={Colors.notification} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: spaceName,
          headerRight: () => (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={openNewThread} style={styles.headerButton}>
                <Ionicons name="add-circle" size={26} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleEdit} style={styles.headerButton}>
                <Ionicons name="ellipsis-horizontal-circle" size={26} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          )
        }}
      />
      <FlashList
        data={threads}
        renderItem={renderItem}
        ListEmptyComponent={(
          loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.empty}>Loading threads…</Text>
            </View>
          ) : (
            <View style={styles.centerState}>
              <Text style={styles.empty}>No threads yet. Create your first thread.</Text>
            </View>
          )
        )}
        ListHeaderComponent={error ? (
          <Text style={styles.inlineError}>Refresh warning: {error}</Text>
        ) : null}
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

      <Modal
        transparent
        visible={!!renameTarget}
        animationType="fade"
        onRequestClose={closeRename}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Rename Thread</Text>
              <TextInput
                style={styles.modalInput}
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="Thread name"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveRename}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalButton} onPress={closeRename}>
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalPrimaryButton]}
                  onPress={saveRename}
                  disabled={!renameValue.trim()}
                >
                  <Text style={[styles.modalButtonText, styles.modalPrimaryText]}>Save</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemContent: {
    flex: 1,
    paddingRight: 10
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
  centerState: {
    marginTop: 40,
    alignItems: 'center'
  },
  inlineError: {
    color: Colors.notification,
    fontSize: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6
  },
  headerButton: {
    marginLeft: 10
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  actionButton: {
    paddingHorizontal: 6,
    paddingVertical: 6
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
