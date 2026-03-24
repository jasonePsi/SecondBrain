import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { SpaceRepo, Space } from '../../src/repositories/space_repo';
import { Colors } from '../../src/constants/Colors';
import { CaptureFAB } from '../../src/components/CaptureFAB';
import { Ionicons } from '@expo/vector-icons';

export default function SpacesScreen() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Space | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const router = useRouter();

  const loadSpaces = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await SpaceRepo.getAll();
      setSpaces(data);
    } catch (err: any) {
      console.error('Failed to load spaces:', err);
      setError('We could not load your spaces.');
    } finally {
      setLoading(false);
    }
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

  if (error && !loading && spaces.length === 0) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Spaces' }} />
        <View style={styles.fullState}>
          <Text style={styles.errorStateText}>We could not load your spaces.</Text>
          <Text style={styles.errorStateSubtext}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadSpaces}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Spaces',
          headerRight: () => (
            <TouchableOpacity onPress={toggleEdit} style={{ marginRight: 12 }}>
              <Ionicons
                name={isEditing ? 'checkmark-circle' : 'ellipsis-horizontal-circle'}
                size={26}
                color={Colors.primary}
              />
            </TouchableOpacity>
          )
        }}
      />
      <FlashList
        data={spaces}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        extraData={isEditing}
        ListEmptyComponent={(
          loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.empty}>Loading spaces…</Text>
            </View>
          ) : (
            <View style={styles.centerState}>
              <Text style={styles.empty}>No spaces yet. Create your first space to get started.</Text>
              <TouchableOpacity style={styles.emptyActionButton} onPress={() => router.push('/space/new')}>
                <Text style={styles.emptyActionText}>Create Space</Text>
              </TouchableOpacity>
            </View>
          )
        )}
        ListHeaderComponent={(
          <View>
            {!!error && (
              <View style={styles.inlineWarningRow}>
                <Text style={styles.inlineError}>Refresh issue: {error}</Text>
                <TouchableOpacity onPress={loadSpaces}>
                  <Text style={styles.inlineWarningAction}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
            {isEditing && (
              <Text style={styles.inlineHint}>Editing enabled: reorder, rename, or delete spaces. Tap ✓ when done.</Text>
            )}
          </View>
        )}
      />
      {!isEditing && <CaptureFAB onPress={() => router.push('/space/new')} />}

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
              <Text style={styles.modalSubtitle}>Use a short name you can quickly find in search.</Text>
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
  centerState: {
    marginTop: 40,
    alignItems: 'center'
  },
  emptyActionButton: {
    marginTop: 12,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  emptyActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600'
  },
  fullState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  inlineError: {
    flex: 1,
    color: Colors.notification,
    fontSize: 12,
    marginTop: 8
  },
  inlineWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 4
  },
  inlineWarningAction: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600'
  },
  inlineHint: {
    color: Colors.secondaryText,
    fontSize: 12,
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 4
  },
  errorStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text
  },
  errorStateSubtext: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.secondaryText,
    textAlign: 'center',
    paddingHorizontal: 24
  },
  retryButton: {
    marginTop: 14,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600'
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
    marginBottom: 4,
    color: Colors.text
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.secondaryText,
    marginBottom: 10
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
