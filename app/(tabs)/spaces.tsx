import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Space, SpaceRepo } from '../../src/repositories/space_repo';
import { CaptureFAB } from '../../src/components/CaptureFAB';
import { useAppTheme } from '../../src/theme/theme';
import { runLayoutFeedback, triggerHaptic, useReducedMotion } from '../../src/services/interaction_feedback';
import {
    AppButton,
    EmptyStateView,
    ErrorStateView,
    GroupedSection,
    InlineBanner,
    ListRow,
    LoadingStateView,
    ScreenScaffold,
    SectionHeader
} from '../../src/components/ui';

export default function SpacesScreen() {
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    const isMountedRef = useRef(true);
    const loadRequestRef = useRef(0);
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [renameTarget, setRenameTarget] = useState<Space | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [savingRename, setSavingRename] = useState(false);
    const [deletingSpaceId, setDeletingSpaceId] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const loadSpaces = useCallback(async () => {
        const requestId = ++loadRequestRef.current;
        const canApply = () => isMountedRef.current && requestId === loadRequestRef.current;
        try {
            if (canApply()) {
                setLoading(true);
                setError(null);
            }
            const data = await SpaceRepo.getAll();
            if (!canApply()) return;
            runLayoutFeedback(reducedMotion);
            setSpaces(data);
        } catch (err: any) {
            console.error('Failed to load spaces:', err);
            if (canApply()) {
                setError('Spaces are temporarily unavailable. Please try again.');
            }
        } finally {
            if (canApply()) {
                setLoading(false);
            }
        }
    }, [reducedMotion]);

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
        runLayoutFeedback(reducedMotion);
        setSpaces(updated);

        try {
            await SpaceRepo.update(current.id, { sort_order: target.sort_order });
            await SpaceRepo.update(target.id, { sort_order: current.sort_order });
        } catch (moveError) {
            console.error('Failed to reorder spaces:', moveError);
            Alert.alert('Error', 'Could not reorder spaces.');
            await loadSpaces();
            triggerHaptic('error', reducedMotion);
        }
    };

    const openRename = (space: Space) => {
        setRenameTarget(space);
        setRenameValue(space.name);
    };

    const closeRename = () => {
        if (savingRename) return;
        setRenameTarget(null);
        setRenameValue('');
    };

    const saveRename = async () => {
        if (!renameTarget) return;
        const trimmed = renameValue.trim();
        if (!trimmed) return;

        try {
            setSavingRename(true);
            await SpaceRepo.update(renameTarget.id, { name: trimmed });
            closeRename();
            await loadSpaces();
            triggerHaptic('success', reducedMotion);
        } catch (renameError) {
            console.error('Rename failed:', renameError);
            Alert.alert('Error', 'Could not rename space.');
            triggerHaptic('error', reducedMotion);
        } finally {
            setSavingRename(false);
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
                            triggerHaptic('warning', reducedMotion);
                            setDeletingSpaceId(space.id);
                            await SpaceRepo.delete(space.id);
                            await loadSpaces();
                            triggerHaptic('success', reducedMotion);
                        } catch (deleteError) {
                            console.error('Delete failed:', deleteError);
                            Alert.alert('Error', 'Could not delete space.');
                            triggerHaptic('error', reducedMotion);
                        } finally {
                            setDeletingSpaceId(null);
                        }
                    }
                }
            ]
        );
    };

    const renderRowActions = (item: Space, index: number) => {
        if (!isEditing) return null;
        const canMoveUp = index > 0;
        const canMoveDown = index < spaces.length - 1;
        const isDeleting = deletingSpaceId === item.id;
        const actionLocked = isDeleting || savingRename;

        return (
            <View
                style={[
                    styles.rowActions,
                    {
                        borderTopColor: theme.colors.separator.subtle,
                        backgroundColor: theme.colors.background.grouped
                    }
                ]}
            >
                <AppButton
                    size="sm"
                    variant="secondary"
                    label="Up"
                    onPress={() => moveSpace(index, -1)}
                    disabled={!canMoveUp || actionLocked}
                />
                <AppButton
                    size="sm"
                    variant="secondary"
                    label="Down"
                    onPress={() => moveSpace(index, 1)}
                    disabled={!canMoveDown || actionLocked}
                />
                <AppButton
                    size="sm"
                    variant="secondary"
                    label="Rename"
                    onPress={() => openRename(item)}
                    disabled={actionLocked}
                />
                <AppButton
                    size="sm"
                    variant="destructive"
                    label={isDeleting ? 'Deleting…' : 'Delete'}
                    onPress={() => handleDelete(item)}
                    disabled={actionLocked}
                    loading={isDeleting}
                />
            </View>
        );
    };

    const renderItem = ({ item, index }: { item: Space; index: number }) => {
        const isDeleting = deletingSpaceId === item.id;

        return (
            <GroupedSection style={styles.spaceCard}>
                <ListRow
                    title={item.name}
                    subtitle={new Date(item.created_at).toLocaleDateString()}
                    onPress={() => router.push(`/space/${item.id}`)}
                    disabled={isEditing || isDeleting}
                    trailing={(
                        <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={theme.colors.text.tertiary}
                        />
                    )}
                />
                {renderRowActions(item, index)}
            </GroupedSection>
        );
    };

    if (error && !loading && spaces.length === 0) {
        return (
            <ScreenScaffold>
                <Stack.Screen options={{ title: 'Spaces' }} />
                <ErrorStateView
                    title="Spaces unavailable"
                    message="Try again, or create a new space."
                    primaryActionLabel="Retry"
                    onPrimaryAction={loadSpaces}
                    secondaryActionLabel="Create Space"
                    onSecondaryAction={() => router.push('/space/new')}
                />
            </ScreenScaffold>
        );
    }

    return (
        <ScreenScaffold>
            <Stack.Screen
                options={{
                    title: 'Spaces',
                    headerRight: () => (
                        <TouchableOpacity
                            onPress={toggleEdit}
                            style={{ marginRight: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel={isEditing ? 'Done editing spaces' : 'Edit spaces'}
                            accessibilityHint={isEditing ? 'Stops editing mode' : 'Shows rename and delete controls'}
                        >
                            <Ionicons
                                name={isEditing ? 'checkmark-circle' : 'ellipsis-horizontal-circle'}
                                size={24}
                                color={theme.colors.tint.primary}
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
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={(
                    <View style={styles.headerBlock}>
                        <SectionHeader
                            title="Your Spaces"
                            subtitle={isEditing ? 'Reorder, rename, or delete spaces.' : 'Choose a space to continue.'}
                        />
                        {!!error && (
                            <InlineBanner
                                tone="warning"
                                message={error}
                                actionLabel="Retry"
                                onActionPress={loadSpaces}
                            />
                        )}
                        {loading && spaces.length > 0 && (
                            <InlineBanner tone="info" message="Refreshing spaces…" />
                        )}
                    </View>
                )}
                ListEmptyComponent={(
                    loading ? (
                        <LoadingStateView
                            title="Loading spaces"
                            message="Gathering your latest workspace list."
                        />
                    ) : (
                        <EmptyStateView
                            title="No spaces yet"
                            message="Create your first space to start organizing your second brain."
                            primaryActionLabel="Create Space"
                            onPrimaryAction={() => router.push('/space/new')}
                        />
                    )
                )}
            />

            {!isEditing && <CaptureFAB label="New Space" onPress={() => router.push('/space/new')} />}

            <Modal
                transparent
                visible={!!renameTarget}
                animationType={reducedMotion ? 'none' : 'fade'}
                onRequestClose={closeRename}
            >
                <View style={[styles.modalOverlay, { backgroundColor: theme.colors.overlay.scrim }]}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <View
                            style={[
                                styles.modalCard,
                                {
                                    backgroundColor: theme.colors.background.surface,
                                    borderColor: theme.colors.separator.subtle
                                }
                            ]}
                        >
                            <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>Rename Space</Text>
                            <Text style={[styles.modalSubtitle, { color: theme.colors.text.secondary }]}>
                                Use a short name you can quickly find in search.
                            </Text>
                            <TextInput
                                style={[
                                    styles.modalInput,
                                    {
                                        borderColor: theme.colors.separator.subtle,
                                        color: theme.colors.text.primary,
                                        backgroundColor: theme.colors.background.base
                                    }
                                ]}
                                value={renameValue}
                                onChangeText={setRenameValue}
                                placeholder="Space name"
                                placeholderTextColor={theme.colors.text.tertiary}
                                autoFocus
                                returnKeyType="done"
                                onSubmitEditing={saveRename}
                            />
                            <View style={styles.modalActions}>
                                <AppButton label="Cancel" variant="secondary" onPress={closeRename} />
                                <AppButton
                                    label={savingRename ? 'Saving…' : 'Save'}
                                    onPress={saveRename}
                                    disabled={!renameValue.trim() || savingRename}
                                    loading={savingRename}
                                />
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </ScreenScaffold>
    );
}

const styles = StyleSheet.create({
    listContent: {
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 100
    },
    headerBlock: {
        marginBottom: 12,
        gap: 8
    },
    spaceCard: {
        marginBottom: 10
    },
    rowActions: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap'
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24
    },
    modalCard: {
        width: '100%',
        borderRadius: 14,
        borderWidth: 1,
        padding: 16
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: '700',
        marginBottom: 4
    },
    modalSubtitle: {
        fontSize: 13,
        marginBottom: 10
    },
    modalInput: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
        marginBottom: 14
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8
    }
});
