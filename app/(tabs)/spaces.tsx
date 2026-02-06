import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { SpaceRepo, Space } from '../../src/repositories/space_repo';
import { Colors } from '../../src/constants/Colors';
import { CaptureFAB } from '../../src/components/CaptureFAB';
import { Ionicons } from '@expo/vector-icons';

export default function SpacesScreen() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Space | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const router = useRouter();

  const loadSpaces = useCallback(async () => {
    const data = await SpaceRepo.getAll();
    setSpaces(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSpaces();
    }, [loadSpaces])
  );

  const toggleEdit = () => {
    setIsEditing((prev) => !prev);
  };

  const moveSpace = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= spaces.length) return;

    const current = spaces[index];
    const target = spaces[targetIndex];

    const updated = [...spaces];
    updated[index] = { ...target, sort_order: current.sort_order };
    updated[targetIndex] = { ...current, sort_order: target.sort_order };
    setSpaces(updated);

    try {
      await SpaceRepo.update(current.id, { sort_order: target.sort_order });
      await SpaceRepo.update(target.id, { sort_order: current.sort_order });
    } catch (error) {
      console.error('Failed to reorder spaces:', error);
      Alert.alert('Error', 'Could not reorder spaces.');
      await loadSpaces();
    }
  };

  const openRename = (space: Space) => {
    setRenameTarget(space);
    setRenameValue(space.name);
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
      await SpaceRepo.update(renameTarget.id, { name: trimmed });
      closeRename();
      await loadSpaces();
    } catch (error) {
      console.error('Rename failed:', error);
      Alert.alert('Error', 'Could not rename space.');
    }
  };

  const handleDelete = (space: Space) => {
    Alert.alert(
      'Delete Space',
      `Delete "${space.name}"? This will remove all threads and messages in it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await SpaceRepo.delete(space.id);
              await loadSpaces();
            } catch (error) {
              console.error('Delete failed:', error);
              Alert.alert('Error', 'Could not delete space.');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item, index }: { item: Space; index: number }) => {
    const canMoveUp = index > 0;
    const canMoveDown = index < spaces.length - 1;

    return (
      <View style={styles.item}>
        <TouchableOpacity
          style={styles.itemContent}
          onPress={() => router.push(`/space/${item.id}`)}
          disabled={isEditing}
        >
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.itemDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
        </TouchableOpacity>

        {isEditing && (
          <View style={styles.itemActions}>
            <TouchableOpacity
              style={[styles.actionButton, !canMoveUp && styles.actionDisabled]}
              onPress={() => moveSpace(index, -1)}
              disabled={!canMoveUp}
            >
              <Ionicons name="chevron-up" size={20} color={canMoveUp ? Colors.primary : Colors.secondaryText} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, !canMoveDown && styles.actionDisabled]}
              onPress={() => moveSpace(index, 1)}
              disabled={!canMoveDown}
            >
              <Ionicons name="chevron-down" size={20} color={canMoveDown ? Colors.primary : Colors.secondaryText} />
            </TouchableOpacity>
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
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Spaces',
          headerRight: () => (
            <TouchableOpacity onPress={toggleEdit} style={{ marginRight: 12 }}>
              <Text style={{ color: Colors.primary, fontWeight: '600' }}>
                {isEditing ? 'Done' : 'Edit'}
              </Text>
            </TouchableOpacity>
          )
        }}
      />
      <FlashList
        data={spaces}
        renderItem={renderItem}
        estimatedItemSize={60}
        extraData={isEditing}
        ListEmptyComponent={<Text style={styles.empty}>No spaces yet.</Text>}
      />
      {!isEditing && <CaptureFAB onPress={() => router.push('/space/new')} />}
      <Text style={{ position: 'absolute', bottom: 80, left: 10, fontSize: 10, color: '#888' }}>
        Build: Feb6-1430
      </Text>

      <Modal
        transparent
        visible={!!renameTarget}
        animationType="fade"
        onRequestClose={closeRename}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Rename Space</Text>
              <TextInput
                style={styles.modalInput}
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="Space name"
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
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  itemContent: {
    flex: 1,
    paddingRight: 10
  },
  itemName: {
    fontSize: 18,
    fontWeight: '500'
  },
  itemDate: {
    color: Colors.secondaryText,
    fontSize: 14
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  actionButton: {
    paddingHorizontal: 6,
    paddingVertical: 6
  },
  actionDisabled: {
    opacity: 0.5
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
