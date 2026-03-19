import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    NativeModules,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Message, MessageRepo } from '../../src/repositories/message_repo';
import { ThreadRepo } from '../../src/repositories/thread_repo';
import { FeedRepo } from '../../src/repositories/feed_repo';
import { Colors } from '../../src/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { LLMService, sanitizeAssistantResponse } from '../../src/services/LLMService';
import { MemoryService } from '../../src/services/MemoryService';
import { TurnPostProcessingService } from '../../src/services/TurnPostProcessingService';

type SupportedSpeechLanguage = 'el-GR' | 'en-US';

const MESSAGE_PAGE_SIZE = 50;

const normalizeLocale = (locale: unknown): string | null => {
    if (typeof locale !== 'string') return null;
    const trimmed = locale.trim();
    if (!trimmed) return null;
    return trimmed.replace('_', '-');
};

const getRawDeviceLocale = (): string | null => {
    const intlLocale = typeof Intl !== 'undefined'
        ? normalizeLocale(Intl.DateTimeFormat().resolvedOptions().locale)
        : null;
    if (intlLocale) return intlLocale;

    if (Platform.OS === 'ios') {
        const iosSettings = NativeModules.SettingsManager?.settings || {};
        const appleLocale = normalizeLocale(iosSettings.AppleLocale);
        if (appleLocale) return appleLocale;

        const appleLanguages = iosSettings.AppleLanguages;
        if (Array.isArray(appleLanguages) && appleLanguages.length > 0) {
            const firstLanguage = normalizeLocale(appleLanguages[0]);
            if (firstLanguage) return firstLanguage;
        }
    }

    const i18nLocale = normalizeLocale(NativeModules.I18nManager?.localeIdentifier);
    if (i18nLocale) return i18nLocale;

    return null;
};

const getInitialSpeechLanguage = (): SupportedSpeechLanguage => {
    const locale = getRawDeviceLocale()?.toLowerCase();
    if (!locale) return 'en-US';
    if (locale.startsWith('el')) return 'el-GR';
    return 'en-US';
};

const createTurnId = (): string => {
    const suffix = Math.random().toString(36).slice(2, 9);
    return `turn_${Date.now()}_${suffix}`;
};

const getUserFacingTurnError = (stage?: string): string => {
    if (stage === 'resolve_provider' || stage === 'init_provider') {
        return 'Could not start the selected AI provider. Check Settings and try again.';
    }
    if (stage === 'build_memory_context') {
        return 'Could not prepare conversation context. Please try again.';
    }
    return 'Could not generate a reply right now. Check your provider/model settings and try again.';
};

export default function ThreadScreen() {
    const { id, messageId } = useLocalSearchParams<{ id: string; messageId?: string | string[] }>();
    const router = useRouter();
    const targetMessageId = Array.isArray(messageId)
        ? (messageId[0] || null)
        : (typeof messageId === 'string' && messageId.trim().length > 0 ? messageId : null);

    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [threadTitle, setThreadTitle] = useState('Chat');
    const [threadSpaceId, setThreadSpaceId] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [transcriptBuffer, setTranscriptBuffer] = useState('');
    const [speechLang, setSpeechLang] = useState<SupportedSpeechLanguage>(() => getInitialSpeechLanguage());
    const [isLoading, setIsLoading] = useState(false);
    const [llmReady, setLlmReady] = useState(false);
    const [llmInitError, setLlmInitError] = useState<string | null>(null);
    const llmInitializing = useRef(false);
    const postProcessingQueueRef = useRef<Promise<void>>(Promise.resolve());
    const isMountedRef = useRef(true);
    const inFlightTurnIdRef = useRef<string | null>(null);
    const [micStatus, setMicStatus] = useState('Microphone ready');
    const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
    const lastJumpedMessageIdRef = useRef<string | null>(null);
    const flashListRef = useRef<any>(null);

    const [loadingInitialMessages, setLoadingInitialMessages] = useState(true);
    const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
    const [loadedMessageCount, setLoadedMessageCount] = useState(0);
    const [totalMessageCount, setTotalMessageCount] = useState(0);
    const [hasOlderMessages, setHasOlderMessages] = useState(false);

    const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
    const [renameValue, setRenameValue] = useState('');

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const refreshLoadedMessages = useCallback(async (targetVisibleCount = MESSAGE_PAGE_SIZE) => {
        if (!id || !isMountedRef.current) return;

        const limit = Math.max(
            MESSAGE_PAGE_SIZE,
            targetVisibleCount
        );

        const [totalCount, newestMessages] = await Promise.all([
            MessageRepo.countByThread(id),
            MessageRepo.listByThread(id, limit, 0)
        ]);
        if (!isMountedRef.current) return;

        const chronologicalMessages = [...newestMessages].sort((a, b) => a.created_at - b.created_at);
        setMessages(chronologicalMessages);
        setLoadedMessageCount(newestMessages.length);
        setTotalMessageCount(totalCount);
        setHasOlderMessages(newestMessages.length < totalCount);
    }, [id]);

    const loadInitialMessages = useCallback(async () => {
        if (!id) {
            setLoadingInitialMessages(false);
            return;
        }
        setLoadingInitialMessages(true);
        try {
            let targetVisibleCount = MESSAGE_PAGE_SIZE;
            if (targetMessageId) {
                const targetOffset = await MessageRepo.getOffsetFromNewest(id, targetMessageId);
                if (typeof targetOffset === 'number' && targetOffset >= 0) {
                    targetVisibleCount = Math.max(MESSAGE_PAGE_SIZE, targetOffset + 8);
                }
            }
            await refreshLoadedMessages(targetVisibleCount);
        } finally {
            if (isMountedRef.current) {
                setLoadingInitialMessages(false);
            }
        }
    }, [id, refreshLoadedMessages, targetMessageId]);

    const loadOlderMessages = useCallback(async () => {
        if (!id || loadingOlderMessages || !hasOlderMessages) return;

        setLoadingOlderMessages(true);
        try {
            const olderBatch = await MessageRepo.listByThread(id, MESSAGE_PAGE_SIZE, loadedMessageCount);
            if (olderBatch.length === 0) {
                setHasOlderMessages(false);
                return;
            }

            const chronologicalOlderBatch = [...olderBatch].sort((a, b) => a.created_at - b.created_at);
            const nextLoadedCount = loadedMessageCount + olderBatch.length;

            if (!isMountedRef.current) return;
            setMessages((prev) => [...chronologicalOlderBatch, ...prev]);
            setLoadedMessageCount(nextLoadedCount);
            setHasOlderMessages(nextLoadedCount < totalMessageCount);
        } finally {
            if (isMountedRef.current) {
                setLoadingOlderMessages(false);
            }
        }
    }, [id, loadingOlderMessages, hasOlderMessages, loadedMessageCount, totalMessageCount]);

    useEffect(() => {
        const init = async () => {
            try {
                if (id) {
                    const t = await ThreadRepo.get(id);
                    if (t && isMountedRef.current) {
                        setThreadTitle(t.title);
                        setThreadSpaceId(t.space_id);
                    }
                    await loadInitialMessages();
                }

                if (!llmInitializing.current && !llmReady) {
                    llmInitializing.current = true;
                    try {
                        await LLMService.init();
                        if (isMountedRef.current) {
                            setLlmReady(true);
                            setLlmInitError(null);
                        }
                        console.log('LLM initialized successfully');
                    } catch (error) {
                        console.error('Failed to initialize LLM:', error);
                        if (isMountedRef.current) {
                            setLlmReady(false);
                            setLlmInitError('AI is unavailable. Check provider and model setup in Settings.');
                        }
                    } finally {
                        llmInitializing.current = false;
                    }
                }
            } catch (error) {
                console.error('Failed to initialize thread screen:', error);
                if (isMountedRef.current) {
                    setLlmInitError('Could not load this thread. Pull to retry or reopen the space.');
                }
            }
        };
        init();
    }, [id, loadInitialMessages]);

    useEffect(() => {
        if (transcriptBuffer) {
            setInputText(transcriptBuffer);
        }
    }, [transcriptBuffer]);

    useEffect(() => {
        lastJumpedMessageIdRef.current = null;
        setHighlightedMessageId(null);
    }, [id, targetMessageId]);

    useEffect(() => {
        if (!targetMessageId || messages.length === 0) return;
        if (lastJumpedMessageIdRef.current === targetMessageId) return;

        const targetIndex = messages.findIndex((message) => message.id === targetMessageId);
        if (targetIndex < 0) return;

        lastJumpedMessageIdRef.current = targetMessageId;
        setHighlightedMessageId(targetMessageId);

        const scrollIndex = Math.max(0, targetIndex - 1);
        requestAnimationFrame(() => {
            flashListRef.current?.scrollToIndex({ index: scrollIndex, animated: true });
        });

        const clearHighlightTimeout = setTimeout(() => {
            if (!isMountedRef.current) return;
            setHighlightedMessageId((current) => (
                current === targetMessageId ? null : current
            ));
        }, 3500);

        return () => clearTimeout(clearHighlightTimeout);
    }, [messages, targetMessageId]);

    useSpeechRecognitionEvent('result', (event) => {
        if (event.results && event.results.length > 0) {
            const result = event.results[event.results.length - 1];
            if (result && result.transcript) {
                setTranscriptBuffer(result.transcript);
                setMicStatus('Voice captured');
            }
        }
    });

    useSpeechRecognitionEvent('speechstart', () => {
        setIsRecording(true);
        setMicStatus('Listening…');
    });
    useSpeechRecognitionEvent('speechend', () => {
        setIsRecording(false);
        setMicStatus('Transcribing…');
    });
    useSpeechRecognitionEvent('error', (event) => {
        console.error('Speech error:', event);
        setIsRecording(false);
        setMicStatus('Voice input unavailable');
        if (event.error === 'not-allowed') {
            Alert.alert('Permission Required', 'Please enable microphone access in Settings.');
        }
    });

    const sendMessage = async () => {
        if (!id || !inputText.trim()) return;
        if (isLoading || !!inFlightTurnIdRef.current) return;

        const userMessage = inputText.trim();
        const refreshTargetCount = Math.max(MESSAGE_PAGE_SIZE, loadedMessageCount + 4);
        const turnId = createTurnId();
        const turnStartedAt = Date.now();
        let turnStage: string = 'start';
        let userMessagePersisted = false;
        let assistantMessagePersisted = false;
        let activeProvider: 'local' | 'cloud' = 'local';

        inFlightTurnIdRef.current = turnId;
        setInputText('');
        setTranscriptBuffer('');
        setIsLoading(true);
        setLlmInitError(null);

        console.log('[ThreadTurn] start', {
            turnId,
            threadId: id,
            userChars: userMessage.length
        });

        try {
            if (isRecording) {
                turnStage = 'stop_recording';
                try {
                    await ExpoSpeechRecognitionModule.stop();
                } catch (e: any) {
                    console.error('[ThreadTurn] stop recording failed', { turnId, error: e?.message });
                } finally {
                    setIsRecording(false);
                    setMicStatus('Microphone ready');
                }
            }

            turnStage = 'persist_user_message';
            await MessageRepo.create(id, 'user', userMessage, { turnId });
            userMessagePersisted = true;
            await refreshLoadedMessages(refreshTargetCount);

            turnStage = 'resolve_provider';
            activeProvider = await LLMService.resolveProviderForTurn();

            turnStage = 'init_provider';
            await LLMService.init(activeProvider);
            if (!llmReady && isMountedRef.current) {
                setLlmReady(true);
            }
            if (isMountedRef.current) {
                setLlmInitError(null);
            }

            turnStage = 'build_memory_context';
            const memoryContext = await MemoryService.buildTurnContext(id, userMessage, { turnId });

            turnStage = 'generate_assistant_reply';
            const response = await LLMService.chat(memoryContext.chatMessages, {
                task: 'assistant',
                provider: activeProvider,
                requestId: turnId
            });
            const assistantReply = response && response.trim() ? response.trim() : '...';

            turnStage = 'persist_assistant_reply';
            await MessageRepo.create(id, 'assistant', assistantReply, { turnId, provider: activeProvider });
            assistantMessagePersisted = true;
            await refreshLoadedMessages(refreshTargetCount);

            turnStage = 'queue_post_processing';
            postProcessingQueueRef.current = postProcessingQueueRef.current
                .catch(() => undefined)
                .then(async () => {
                    const postProcessResult = await TurnPostProcessingService.processTurn({
                        threadId: id,
                        spaceId: memoryContext.spaceId,
                        userMessage,
                        assistantMessage: assistantReply,
                        turnId,
                        provider: activeProvider
                    });

                    if (!isMountedRef.current) return;
                    if (
                        postProcessResult.executionReport.executedCount > 0 ||
                        postProcessResult.summary.updated
                    ) {
                        const latestThread = await ThreadRepo.get(id);
                        if (latestThread) {
                            setThreadTitle((current) => (
                                current === latestThread.title ? current : latestThread.title
                            ));
                        }
                    }
                })
                .catch((error) => {
                    console.warn('[ThreadTurn] post-processing queue failed', {
                        turnId,
                        threadId: id,
                        error: error?.message
                    });
                });

            console.log('[ThreadTurn] completed', {
                turnId,
                threadId: id,
                provider: activeProvider,
                elapsedMs: Date.now() - turnStartedAt
            });
        } catch (error: any) {
            console.error('[ThreadTurn] failed', {
                turnId,
                threadId: id,
                provider: activeProvider,
                stage: turnStage,
                message: error?.message
            });

            if (userMessagePersisted && !assistantMessagePersisted) {
                try {
                    await MessageRepo.create(
                        id,
                        'assistant',
                        'I hit a temporary issue while replying. Please try again in a moment.',
                        { turnId, fallback: true, stage: turnStage, provider: activeProvider }
                    );
                    await refreshLoadedMessages(refreshTargetCount);
                    assistantMessagePersisted = true;
                } catch (fallbackError: any) {
                    console.error('[ThreadTurn] fallback assistant message failed', {
                        turnId,
                        message: fallbackError?.message
                    });
                }
            }

            if (!userMessagePersisted && isMountedRef.current) {
                setInputText(userMessage);
            }

            if (turnStage === 'resolve_provider' || turnStage === 'init_provider') {
                if (isMountedRef.current) {
                    setLlmReady(false);
                    setLlmInitError('AI is unavailable. Check provider and model setup in Settings.');
                }
            }

            if (isMountedRef.current) {
                Alert.alert('Reply Unavailable', getUserFacingTurnError(turnStage));
            }
        } finally {
            if (inFlightTurnIdRef.current === turnId) {
                inFlightTurnIdRef.current = null;
            }
            if (isMountedRef.current) {
                setIsLoading(false);
            }
        }
    };

    const toggleLanguage = useCallback(() => {
        setSpeechLang((prev) => prev === 'el-GR' ? 'en-US' : 'el-GR');
    }, []);

    const toggleRecording = useCallback(async () => {
        if (isRecording) {
            try {
                await ExpoSpeechRecognitionModule.stop();
                setMicStatus('Microphone ready');
            } catch (e: any) {
                console.error('Stop error:', e);
                setMicStatus('Could not stop microphone');
            }
            setIsRecording(false);
        } else {
            try {
                setMicStatus('Checking microphone permission…');
                const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
                if (!result.granted) {
                    Alert.alert('Permission Required', 'Please allow microphone and speech recognition access.');
                    setMicStatus('Microphone permission denied');
                    return;
                }
                setTranscriptBuffer('');
                setIsRecording(true);
                setMicStatus('Starting microphone…');

                await ExpoSpeechRecognitionModule.start({
                    lang: speechLang,
                    interimResults: true,
                    maxAlternatives: 1,
                    continuous: true,
                    requiresOnDeviceRecognition: false,
                    addsPunctuation: true,
                });
            } catch (e: any) {
                console.error('Start error:', e);
                setIsRecording(false);
                setMicStatus('Could not start microphone');
                Alert.alert('Error', 'Could not start speech recognition.');
            }
        }
    }, [isRecording, speechLang]);

    const renderItem = ({ item }: { item: Message }) => {
        const isUser = item.role === 'user';
        const displayText = isUser ? item.text : sanitizeAssistantResponse(item.text);
        const isHighlighted = highlightedMessageId === item.id;
        return (
            <View style={[styles.bubbleWrapper, isUser ? styles.userWrapper : styles.assistantWrapper]}>
                <View style={[
                    styles.bubble,
                    isUser ? styles.userBubble : styles.assistantBubble,
                    isHighlighted && styles.highlightedBubble
                ]}>
                    <Text style={isUser ? styles.userText : styles.assistantText}>{displayText}</Text>
                    <Text style={styles.bubbleMeta}>{item.role}</Text>
                </View>
            </View>
        );
    };

    const openRenameModal = () => {
        setRenameValue(threadTitle);
        setIsRenameModalVisible(true);
    };

    const closeRenameModal = () => {
        setRenameValue('');
        setIsRenameModalVisible(false);
    };

    const saveRename = async () => {
        const trimmed = renameValue.trim();
        if (!trimmed || !id) return;

        try {
            await ThreadRepo.update(id, { title: trimmed });
            await FeedRepo.create(threadSpaceId, 'thread_updated', id);
            setThreadTitle(trimmed);
            closeRenameModal();
        } catch (error) {
            console.error('Rename failed:', error);
            Alert.alert('Rename Failed', 'Could not rename this thread.');
        }
    };

    const handleDelete = () => {
        Alert.alert(
            'Delete Thread',
            'Are you sure you want to delete this thread? This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        if (id) {
                            await ThreadRepo.delete(id);
                            router.back();
                        }
                    }
                }
            ]
        );
    };

    const handleSettings = () => {
        Alert.alert(
            'Thread Options',
            'Choose an action',
            [
                { text: 'Rename', onPress: openRenameModal },
                { text: 'Delete', onPress: handleDelete, style: 'destructive' },
                { text: 'Cancel', style: 'cancel' }
            ]
        );
    };

    const renderListHeader = () => {
        if (totalMessageCount === 0) return null;
        const remaining = Math.max(0, totalMessageCount - loadedMessageCount);

        return (
            <View style={styles.historyHeader}>
                {hasOlderMessages ? (
                    <TouchableOpacity
                        style={styles.loadOlderButton}
                        onPress={loadOlderMessages}
                        disabled={loadingOlderMessages}
                    >
                        {loadingOlderMessages ? (
                            <ActivityIndicator size="small" color={Colors.primary} />
                        ) : (
                            <Text style={styles.loadOlderText}>Load older messages ({remaining} left)</Text>
                        )}
                    </TouchableOpacity>
                ) : (
                    <Text style={styles.historyInfoText}>Showing full history</Text>
                )}

                <Text style={styles.historyMetaText}>
                    {messages.length} of {totalMessageCount} message(s) loaded
                </Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <KeyboardAvoidingView
                style={styles.keyboardContainer}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <Stack.Screen
                    options={{
                        title: threadTitle,
                        headerRight: () => (
                            <TouchableOpacity onPress={handleSettings} style={{ marginRight: 10 }}>
                                <Ionicons name="ellipsis-horizontal-circle" size={28} color={Colors.primary} />
                            </TouchableOpacity>
                        )
                    }}
                />
                <View style={styles.listContainer}>
                    {loadingInitialMessages ? (
                        <View style={styles.loadingMessagesContainer}>
                            <ActivityIndicator size="small" color={Colors.primary} />
                            <Text style={styles.loadingMessagesText}>Loading conversation...</Text>
                        </View>
                    ) : (
                        <FlashList
                            ref={flashListRef}
                            data={messages}
                            renderItem={renderItem}
                            contentContainerStyle={{ padding: 16 }}
                            ListHeaderComponent={renderListHeader}
                            ListEmptyComponent={<Text style={styles.emptyText}>No messages yet. Start the conversation below.</Text>}
                        />
                    )}
                </View>
                <View style={styles.inputContainer}>
                    {!!llmInitError && (
                        <View style={styles.llmErrorBanner}>
                            <Text style={styles.llmErrorText}>{llmInitError}</Text>
                            <TouchableOpacity onPress={() => router.push('/(tabs)/settings')}>
                                <Text style={styles.llmErrorAction}>Open Settings</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {isLoading && (
                        <Text style={styles.turnStatusText}>Generating reply…</Text>
                    )}
                    {micStatus !== 'Microphone ready' && (
                        <Text style={styles.micStatusText}>{micStatus}</Text>
                    )}
                    <View style={styles.composerRow}>
                        <TextInput
                            style={styles.input}
                            value={inputText}
                            onChangeText={setInputText}
                            placeholder={
                                isLoading
                                    ? 'Generating reply…'
                                    : isRecording
                                        ? 'Listening…'
                                        : 'Type a message or use the mic'
                            }
                            placeholderTextColor={isRecording ? Colors.notification : Colors.secondaryText}
                            multiline
                            editable={!isLoading}
                        />
                        <TouchableOpacity
                            onPress={toggleLanguage}
                            style={styles.langButton}
                            disabled={isLoading}
                        >
                            <Text style={styles.langText}>{speechLang === 'el-GR' ? '🇬🇷' : '🇬🇧'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={toggleRecording}
                            style={[styles.micButton, isRecording && styles.micActive]}
                            disabled={isLoading}
                        >
                            <Ionicons
                                name={isRecording ? 'stop' : 'mic'}
                                size={28}
                                color={isRecording ? 'white' : (isLoading ? Colors.secondaryText : Colors.primary)}
                            />
                        </TouchableOpacity>
                        {isLoading ? (
                            <View style={styles.sendButton}>
                                <ActivityIndicator size="small" color={Colors.primary} />
                            </View>
                        ) : inputText.trim().length > 0 && (
                            <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
                                <Ionicons name="send" size={28} color={Colors.primary} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </KeyboardAvoidingView>

            <Modal
                transparent
                visible={isRenameModalVisible}
                animationType="fade"
                onRequestClose={closeRenameModal}
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
                                <TouchableOpacity style={styles.modalButton} onPress={closeRenameModal}>
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
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    keyboardContainer: {
        flex: 1,
    },
    listContainer: {
        flex: 1
    },
    loadingMessagesContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8
    },
    loadingMessagesText: {
        fontSize: 13,
        color: Colors.secondaryText
    },
    emptyText: {
        textAlign: 'center',
        color: Colors.secondaryText,
        marginTop: 30
    },
    historyHeader: {
        marginBottom: 12,
        alignItems: 'center',
        gap: 6
    },
    loadOlderButton: {
        borderWidth: 1,
        borderColor: Colors.primary,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#EEF6FF'
    },
    loadOlderText: {
        color: Colors.primary,
        fontSize: 13,
        fontWeight: '600'
    },
    historyInfoText: {
        fontSize: 12,
        color: Colors.secondaryText
    },
    historyMetaText: {
        fontSize: 11,
        color: Colors.secondaryText
    },
    inputContainer: {
        padding: 12,
        paddingBottom: 10,
        backgroundColor: Colors.card,
        borderTopWidth: 1,
        borderTopColor: Colors.border
    },
    composerRow: {
        flexDirection: 'row',
        alignItems: 'flex-end'
    },
    llmErrorBanner: {
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FECACA',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 8
    },
    llmErrorText: {
        color: '#991B1B',
        fontSize: 12
    },
    llmErrorAction: {
        marginTop: 4,
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '600'
    },
    turnStatusText: {
        fontSize: 12,
        color: Colors.secondaryText,
        marginBottom: 6
    },
    input: {
        flex: 1,
        backgroundColor: Colors.background,
        borderRadius: 24,
        paddingHorizontal: 20,
        paddingVertical: 14,
        fontSize: 17,
        minHeight: 52,
        maxHeight: 150,
        marginRight: 10,
        color: Colors.text,
    },
    micStatusText: {
        fontSize: 11,
        color: Colors.secondaryText,
        marginBottom: 6
    },
    sendButton: {
        padding: 10,
        marginLeft: 4,
    },
    langButton: {
        padding: 8,
        marginRight: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    langText: {
        fontSize: 24,
    },
    micButton: {
        padding: 12,
        borderRadius: 26,
        backgroundColor: Colors.background,
        width: 52,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
    },
    micActive: {
        backgroundColor: Colors.notification,
    },
    bubbleWrapper: {
        width: '100%',
        marginBottom: 10,
        flexDirection: 'row'
    },
    userWrapper: {
        justifyContent: 'flex-end'
    },
    assistantWrapper: {
        justifyContent: 'flex-start'
    },
    bubble: {
        maxWidth: '80%',
        padding: 12,
        borderRadius: 16,
    },
    userBubble: {
        backgroundColor: Colors.primary,
        borderBottomRightRadius: 4
    },
    assistantBubble: {
        backgroundColor: Colors.card,
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: Colors.border
    },
    highlightedBubble: {
        borderColor: Colors.primary,
        borderWidth: 2
    },
    userText: {
        color: '#fff',
        fontSize: 16,
    },
    assistantText: {
        color: Colors.text,
        fontSize: 16,
    },
    bubbleMeta: {
        fontSize: 10,
        color: 'rgba(128,128,128, 0.7)',
        marginTop: 4,
        textAlign: 'right'
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
