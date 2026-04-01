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
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Thread, ThreadRepo } from '../../src/repositories/thread_repo';
import { FeedRepo } from '../../src/repositories/feed_repo';
import { SpaceRepo } from '../../src/repositories/space_repo';
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
    SectionHeader,
    StatusChip
} from '../../src/components/ui';

const toThreadSummarySubtitle = (thread: Thread): string => {
    const summary = thread.summary_text?.trim();
    if (summary && summary.length > 0) return summary;
    return 'No summary yet. Open this thread to continue the conversation.';
};

const toThreadMeta = (thread: Thread): string => {
    const summaryCount = thread.summary_message_count;
    const summaryLabel = summaryCount > 0
        ? `${summaryCount} summarized messages`
        : 'No summarized messages';
    return `${summaryLabel} • Created ${new Date(thread.created_at).toLocaleString()}`;
};

export default function SpaceDetailScreen() {
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const isMountedRef = useRef(true);
    const loadRequestRef = useRef(0);
    const [threads, setThreads] = useState<Thread[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [spaceName, setSpaceName] = useState('Space');
    const [isNewThreadOpen, setIsNewThreadOpen] = useState(false);
    const [newThreadName, setNewThreadName] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [renameTarget, setRenameTarget] = useState<Thread | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [creatingThread, setCreatingThread] = useState(false);
    const [savingRename, setSavingRename] = useState(false);
    const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const loadData = useCallback(async () => {
        if (!id) return;
        const requestId = ++loadRequestRef.current;
        const canApply = () => isMountedRef.current && requestId === loadRequestRef.current;
        try {
            if (canApply()) {
                setLoading(true);
                setError(null);
            }
            const space = await SpaceRepo.get(id);
            if (!canApply()) return;
            if (space) setSpaceName(space.name);

            const data = await ThreadRepo.listBySpace(id);
            if (!canApply()) return;
            runLayoutFeedback(reducedMotion);
            setThreads(data);
        } catch (err: any) {
            console.error('Failed to load space detail:', err);
            if (canApply()) {
                setError('Threads are temporarily unavailable in this space.');
            }
        } finally {
            if (canApply()) {
                setLoading(false);
            }
        }
    }, [id, reducedMotion]);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const openNewThread = () => {
        if (isEditing) return;
        triggerHaptic('selection', reducedMotion);
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
        const title = trimmed || 'Untitled Thread';
        try {
            setCreatingThread(true);
            const newId = await ThreadRepo.create(id, title);
            await FeedRepo.create(id, 'thread_created', newId);
            closeNewThread();
            await loadData();
            triggerHaptic('success', reducedMotion);
            router.push(`/thread/${newId}`);
        } catch (createError) {
            console.error('Create thread failed:', createError);
            Alert.alert('Thread Creation Unavailable', 'Could not create this thread right now. Please try again.');
            triggerHaptic('error', reducedMotion);
        } finally {
            setCreatingThread(false);
        }
    };

    const toggleEdit = () => {
        triggerHaptic('selection', reducedMotion);
        setIsEditing((prev) => !prev);
        setRenameTarget(null);
    };

    const openRename = (thread: Thread) => {
        triggerHaptic('selection', reducedMotion);
        setRenameTarget(thread);
        setRenameValue(thread.title);
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
            await ThreadRepo.update(renameTarget.id, { title: trimmed });
            await FeedRepo.create(id || null, 'thread_updated', renameTarget.id);
            closeRename();
            await loadData();
            triggerHaptic('success', reducedMotion);
        } catch (renameError) {
            console.error('Rename failed:', renameError);
            Alert.alert('Rename Unavailable', 'Could not rename this thread right now. Please try again.');
            triggerHaptic('error', reducedMotion);
        } finally {
            setSavingRename(false);
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
                            triggerHaptic('warning', reducedMotion);
                            setDeletingThreadId(thread.id);
                            await ThreadRepo.delete(thread.id);
                            await loadData();
                            triggerHaptic('success', reducedMotion);
                        } catch (deleteError) {
                            console.error('Delete failed:', deleteError);
                            Alert.alert('Delete Unavailable', 'Could not delete this thread right now. Please try again.');
                            triggerHaptic('error', reducedMotion);
                        } finally {
                            setDeletingThreadId(null);
                        }
                    }
                }
            ]
        );
    };

    const renderRowActions = (thread: Thread) => {
        if (!isEditing) return null;
        const deleting = deletingThreadId === thread.id;

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
                    label="Rename"
                    onPress={() => openRename(thread)}
                    disabled={deleting}
                />
                <AppButton
                    size="sm"
                    variant="destructive"
                    label={deleting ? 'Deleting…' : 'Delete'}
                    onPress={() => handleDelete(thread)}
                    disabled={deleting}
                    loading={deleting}
                />
            </View>
        );
    };

    const renderItem = ({ item }: { item: Thread }) => (
        <GroupedSection style={styles.threadCard}>
            <ListRow
                title={item.title}
                subtitle={toThreadSummarySubtitle(item)}
                meta={toThreadMeta(item)}
                onPress={() => router.push(`/thread/${item.id}`)}
                disabled={isEditing || deletingThreadId === item.id}
                leading={(
                    <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={18}
                        color={theme.colors.tint.primary}
                    />
                )}
                trailing={(
                    <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={theme.colors.text.tertiary}
                    />
                )}
            />
            {renderRowActions(item)}
        </GroupedSection>
    );

    if (error && !loading && threads.length === 0) {
        return (
            <ScreenScaffold>
                <Stack.Screen options={{ title: spaceName }} />
                <ErrorStateView
                    title="Threads unavailable"
                    message="Try again, or return to Spaces."
                    primaryActionLabel="Retry"
                    onPrimaryAction={loadData}
                    secondaryActionLabel="Go to Spaces"
                    onSecondaryAction={() => router.replace('/(tabs)/spaces')}
                />
            </ScreenScaffold>
        );
    }

    return (
        <ScreenScaffold>
            <Stack.Screen
                options={{
                    title: spaceName,
                    headerRight: () => (
                        <View style={styles.headerActions}>
                            {!isEditing && (
                                <TouchableOpacity
                                    onPress={openNewThread}
                                    style={styles.headerButton}
                                    hitSlop={8}
                                    accessibilityRole="button"
                                    accessibilityLabel="Create thread"
                                    accessibilityHint="Opens the new thread sheet"
                                >
                                    <Ionicons name="add-circle" size={24} color={theme.colors.tint.primary} />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                onPress={toggleEdit}
                                style={styles.headerButton}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel={isEditing ? 'Done editing threads' : 'Edit threads'}
                                accessibilityHint={isEditing ? 'Stops editing mode' : 'Shows rename and delete controls'}
                                accessibilityState={{ selected: isEditing }}
                            >
                                <Ionicons
                                    name={isEditing ? 'checkmark-circle' : 'ellipsis-horizontal-circle'}
                                    size={24}
                                    color={theme.colors.tint.primary}
                                />
                            </TouchableOpacity>
                        </View>
                    )
                }}
            />
            <FlashList
                data={threads}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={(
                    <View style={styles.headerBlock}>
                        <SectionHeader
                            title="Threads"
                            subtitle={isEditing ? 'Rename or delete threads.' : 'Continue a conversation or start a new one.'}
                            trailing={(
                                <AppButton
                                    size="sm"
                                    label="New Thread"
                                    onPress={openNewThread}
                                    disabled={isEditing}
                                />
                            )}
                        />
                        {threads.length > 0 && (
                            <GroupedSection style={styles.summaryCard}>
                                <View style={styles.summaryRow}>
                                    <StatusChip label={`${threads.length} threads`} tone="info" />
                                    {isEditing && <StatusChip label="Editing" tone="warning" />}
                                </View>
                            </GroupedSection>
                        )}
                        {!!error && (
                            <InlineBanner
                                tone="warning"
                                message={error}
                                actionLabel="Retry"
                                onActionPress={() => {
                                    triggerHaptic('selection', reducedMotion);
                                    loadData();
                                }}
                            />
                        )}
                        {loading && threads.length > 0 && (
                            <InlineBanner tone="info" message="Refreshing threads…" />
                        )}
                    </View>
                )}
                ListEmptyComponent={(
                    loading ? (
                        <LoadingStateView
                            title="Loading threads"
                            message="Gathering conversations in this space."
                        />
                    ) : (
                        <EmptyStateView
                            title="No threads yet"
                            message="Create your first thread to start chatting."
                            primaryActionLabel="Create Thread"
                            onPrimaryAction={openNewThread}
                        />
                    )
                )}
            />

            <Modal
                transparent
                visible={isNewThreadOpen}
                animationType={reducedMotion ? 'none' : 'fade'}
                onRequestClose={closeNewThread}
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
                            <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>New Thread</Text>
                            <Text style={[styles.modalSubtitle, { color: theme.colors.text.secondary }]}>
                                Give it a name now, or rename it later.
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
                                value={newThreadName}
                                onChangeText={setNewThreadName}
                                placeholder="Thread name (optional)"
                                placeholderTextColor={theme.colors.text.tertiary}
                                autoFocus
                                returnKeyType="done"
                                onSubmitEditing={createThread}
                            />
                            <View style={styles.modalActions}>
                                <AppButton label="Cancel" variant="secondary" onPress={closeNewThread} />
                                <AppButton
                                    label={creatingThread ? 'Creating…' : 'Create'}
                                    onPress={createThread}
                                    loading={creatingThread}
                                />
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

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
                            <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>Rename Thread</Text>
                            <Text style={[styles.modalSubtitle, { color: theme.colors.text.secondary }]}>
                                Use a clear title so this thread is easy to find.
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
                                placeholder="Thread name"
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
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 6
    },
    headerButton: {
        marginLeft: 10,
        minWidth: 40,
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center'
    },
    listContent: {
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 24
    },
    headerBlock: {
        marginBottom: 12,
        gap: 8
    },
    summaryCard: {
        paddingHorizontal: 12,
        paddingVertical: 10
    },
    summaryRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8
    },
    threadCard: {
        marginBottom: 10
    },
    rowActions: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        gap: 8
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
