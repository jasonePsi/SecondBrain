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
import {
    getAssistantFallbackReplyForStage,
    getUserFacingTurnErrorForStage,
    logTurnPostProcessingStage,
    logTurnStageTransition,
    shouldBlockSendForThread,
    shouldResetProviderReadinessForStage,
    TURN_POST_PROCESSING_STAGES,
    TURN_STAGES,
    type TurnStage
} from '../../src/services/assistant_turn_utils';

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

const toUserFacingProviderMessage = (error: unknown): string => {
    const raw = error instanceof Error
        ? error.message
        : typeof error === 'string'
            ? error
            : '';
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
        const detailCode = trimmed.match(/^\[([A-Z0-9_]+)\]/)?.[1];
        const withoutCodeAndTrace = trimmed
            .replace(/^\[[A-Z0-9_]+\]\s*/, '')
            .replace(/\s*\((trace|request) [^)]+\)\s*$/i, '')
            .trim();

        if (detailCode === 'CLOUD_PROXY_URL_MISSING') {
            return 'Cloud proxy URL is missing. Set EXPO_PUBLIC_AI_PROXY_BASE_URL and retry.';
        }
        if (detailCode === 'PROXY_NOT_CONFIGURED') {
            return 'Cloud proxy is reachable but not configured. Set OPENAI_API_KEY on the proxy and retry.';
        }
        if (detailCode === 'CLOUD_PROXY_UNREACHABLE') {
            return 'Cloud proxy is unreachable. Verify URL/network and that backend-proxy is running.';
        }
        if (detailCode === 'CLOUD_PROXY_HEALTH_HTTP_ERROR') {
            return 'Cloud proxy health check failed. Verify proxy URL and server status.';
        }
        if (/timed out/i.test(withoutCodeAndTrace)) {
            return 'Cloud request timed out. Check network/proxy latency and try again.';
        }

        return withoutCodeAndTrace;
    }
    return 'AI is unavailable. Check provider and model setup in Settings.';
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
    const [retryingProvider, setRetryingProvider] = useState(false);
    const [llmReady, setLlmReady] = useState(false);
    const [llmInitError, setLlmInitError] = useState<string | null>(null);
    const llmInitializing = useRef(false);
    const postProcessingQueueRef = useRef<Promise<void>>(Promise.resolve());
    const isMountedRef = useRef(true);
    const activeThreadIdRef = useRef<string | null>(id || null);
    const inFlightTurnRef = useRef<{ threadId: string; turnId: string } | null>(null);
    const [micStatus, setMicStatus] = useState('Microphone ready');
    const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
    const lastJumpedMessageIdRef = useRef<string | null>(null);
    const flashListRef = useRef<any>(null);

    const [loadingInitialMessages, setLoadingInitialMessages] = useState(true);
    const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
    const [loadedMessageCount, setLoadedMessageCount] = useState(0);
    const [totalMessageCount, setTotalMessageCount] = useState(0);
    const [hasOlderMessages, setHasOlderMessages] = useState(false);
    const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);

    const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
    const [renameValue, setRenameValue] = useState('');

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        activeThreadIdRef.current = id || null;
        const inFlight = inFlightTurnRef.current;
        if (!inFlight || inFlight.threadId !== id) {
            setIsLoading(false);
        }
    }, [id]);

    const isCurrentThreadActive = useCallback((threadId: string): boolean => {
        return isMountedRef.current && activeThreadIdRef.current === threadId;
    }, []);

    const refreshLoadedMessages = useCallback(async (
        threadId: string,
        targetVisibleCount = MESSAGE_PAGE_SIZE
    ) => {
        if (!threadId) return;

        const limit = Math.max(
            MESSAGE_PAGE_SIZE,
            targetVisibleCount
        );

        const [totalCount, newestMessages] = await Promise.all([
            MessageRepo.countByThread(threadId),
            MessageRepo.listByThread(threadId, limit, 0)
        ]);
        if (!isCurrentThreadActive(threadId)) return;

        const chronologicalMessages = [...newestMessages].sort((a, b) => a.created_at - b.created_at);
        setMessages(chronologicalMessages);
        setLoadedMessageCount(newestMessages.length);
        setTotalMessageCount(totalCount);
        setHasOlderMessages(newestMessages.length < totalCount);
        setHistoryLoadError(null);
    }, [isCurrentThreadActive]);

    const loadInitialMessages = useCallback(async () => {
        const threadId = id;
        if (!threadId) {
            setLoadingInitialMessages(false);
            return;
        }
        if (isCurrentThreadActive(threadId)) {
            setLoadingInitialMessages(true);
        }
        try {
            let targetVisibleCount = MESSAGE_PAGE_SIZE;
            if (targetMessageId) {
                const targetOffset = await MessageRepo.getOffsetFromNewest(threadId, targetMessageId);
                if (typeof targetOffset === 'number' && targetOffset >= 0) {
                    targetVisibleCount = Math.max(MESSAGE_PAGE_SIZE, targetOffset + 8);
                }
            }
            await refreshLoadedMessages(threadId, targetVisibleCount);
        } catch (error) {
            console.error('Failed to load initial thread messages:', error);
            if (isCurrentThreadActive(threadId)) {
                setHistoryLoadError('Could not load conversation history right now.');
            }
        } finally {
            if (isCurrentThreadActive(threadId)) {
                setLoadingInitialMessages(false);
            }
        }
    }, [id, isCurrentThreadActive, refreshLoadedMessages, targetMessageId]);

    const loadOlderMessages = useCallback(async () => {
        const threadId = id;
        if (!threadId || loadingOlderMessages || !hasOlderMessages) return;

        setLoadingOlderMessages(true);
        try {
            const olderBatch = await MessageRepo.listByThread(threadId, MESSAGE_PAGE_SIZE, loadedMessageCount);
            if (olderBatch.length === 0) {
                if (isCurrentThreadActive(threadId)) {
                    setHasOlderMessages(false);
                }
                return;
            }

            const chronologicalOlderBatch = [...olderBatch].sort((a, b) => a.created_at - b.created_at);
            const nextLoadedCount = loadedMessageCount + olderBatch.length;

            if (!isCurrentThreadActive(threadId)) return;
            setMessages((prev) => [...chronologicalOlderBatch, ...prev]);
            setLoadedMessageCount(nextLoadedCount);
            setHasOlderMessages(nextLoadedCount < totalMessageCount);
            setHistoryLoadError(null);
        } catch (error) {
            console.error('Failed to load older thread messages:', error);
            if (isCurrentThreadActive(threadId)) {
                setHistoryLoadError('Could not load earlier messages. Please retry.');
            }
        } finally {
            if (isCurrentThreadActive(threadId)) {
                setLoadingOlderMessages(false);
            }
        }
    }, [hasOlderMessages, id, isCurrentThreadActive, loadedMessageCount, loadingOlderMessages, totalMessageCount]);

    useEffect(() => {
        const init = async () => {
            try {
                const threadId = id;
                if (threadId) {
                    const t = await ThreadRepo.get(threadId);
                    if (t && isCurrentThreadActive(threadId)) {
                        setThreadTitle(t.title);
                        setThreadSpaceId(t.space_id);
                    }
                    await loadInitialMessages();
                }

                if (!llmInitializing.current && !llmReady) {
                    llmInitializing.current = true;
                    try {
                        await LLMService.init();
                        if (!threadId || isCurrentThreadActive(threadId)) {
                            setLlmReady(true);
                            setLlmInitError(null);
                        }
                        console.log('LLM initialized successfully');
                    } catch (error) {
                        console.error('Failed to initialize LLM:', error);
                        if (!threadId || isCurrentThreadActive(threadId)) {
                            setLlmReady(false);
                            setLlmInitError(toUserFacingProviderMessage(error));
                        }
                    } finally {
                        llmInitializing.current = false;
                    }
                }
            } catch (error) {
                console.error('Failed to initialize thread screen:', error);
                if (!id || isCurrentThreadActive(id)) {
                    setLlmInitError('Could not load this thread. Go back and reopen it, or try again later.');
                }
            }
        };
        init();
    }, [id, isCurrentThreadActive, loadInitialMessages]);

    useEffect(() => {
        if (transcriptBuffer) {
            setInputText(transcriptBuffer);
        }
    }, [transcriptBuffer]);

    useEffect(() => {
        if (micStatus === 'Microphone ready' || isRecording) return;
        const timeout = setTimeout(() => {
            if (!isMountedRef.current) return;
            setMicStatus('Microphone ready');
        }, 2200);
        return () => clearTimeout(timeout);
    }, [micStatus, isRecording]);

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
        setMicStatus('Processing voice…');
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
        if (!id) return;
        const userMessage = inputText.trim();
        if (!userMessage) return;
        if (llmInitError && !llmReady) {
            Alert.alert(
                'AI Unavailable',
                llmInitError || 'Open Settings to fix provider/model setup, then try again.',
                [
                    { text: 'Not now', style: 'cancel' },
                    { text: 'Open Settings', onPress: () => router.push('/(tabs)/settings') }
                ]
            );
            return;
        }
        const blockedByInFlight = shouldBlockSendForThread(id, inFlightTurnRef.current, isLoading);
        if (blockedByInFlight) {
            console.log('[ThreadTurn] send ignored', {
                threadId: id,
                reason: isLoading ? 'loading' : 'in_flight_turn',
                inFlightTurnId: inFlightTurnRef.current?.turnId || null
            });
            if (isCurrentThreadActive(id)) {
                setMicStatus('Assistant is still replying…');
            }
            return;
        }

        const threadId = id;
        const refreshTargetCount = Math.max(MESSAGE_PAGE_SIZE, loadedMessageCount + 4);
        const turnId = createTurnId();
        const turnStartedAt = Date.now();
        let turnStage: TurnStage = TURN_STAGES.START;
        let turnOutcome: 'completed' | 'failed' = 'completed';
        let userMessagePersisted = false;
        let assistantMessagePersisted = false;
        let activeProvider: 'local' | 'cloud' | undefined;
        const advanceStage = (next: TurnStage, detail?: string): TurnStage => {
            turnStage = logTurnStageTransition(turnStage, next, {
                turnId,
                threadId,
                provider: activeProvider,
                detail
            });
            return turnStage;
        };

        inFlightTurnRef.current = { threadId, turnId };
        const canApplyTurnState = (): boolean => isCurrentThreadActive(threadId);
        setInputText('');
        setTranscriptBuffer('');
        setIsLoading(true);
        setLlmInitError(null);

        console.log('[ThreadTurn] start', {
            turnId,
            threadId,
            userChars: userMessage.length
        });

        try {
            if (isRecording) {
                advanceStage(TURN_STAGES.STOP_RECORDING);
                try {
                    await ExpoSpeechRecognitionModule.stop();
                } catch (e: any) {
                    console.error('[ThreadTurn] stop recording failed', { turnId, error: e?.message });
                } finally {
                    if (canApplyTurnState()) {
                        setIsRecording(false);
                        setMicStatus('Microphone ready');
                    }
                }
            }

            advanceStage(TURN_STAGES.PERSIST_USER_MESSAGE);
            await MessageRepo.create(threadId, 'user', userMessage, { turnId });
            userMessagePersisted = true;
            await refreshLoadedMessages(threadId, refreshTargetCount);

            advanceStage(TURN_STAGES.RESOLVE_PROVIDER);
            activeProvider = await LLMService.resolveProviderForTurn();

            advanceStage(TURN_STAGES.INIT_PROVIDER);
            await LLMService.init(activeProvider);
            if (!llmReady && canApplyTurnState()) {
                setLlmReady(true);
            }
            if (canApplyTurnState()) {
                setLlmInitError(null);
            }

            advanceStage(TURN_STAGES.BUILD_MEMORY_CONTEXT);
            const memoryContext = await MemoryService.buildTurnContext(threadId, userMessage, { turnId });

            advanceStage(TURN_STAGES.GENERATE_ASSISTANT_REPLY);
            const response = await LLMService.chat(memoryContext.chatMessages, {
                task: 'assistant',
                provider: activeProvider,
                requestId: turnId
            });
            const assistantReply = response && response.trim() ? response.trim() : '...';

            advanceStage(TURN_STAGES.PERSIST_ASSISTANT_REPLY);
            await MessageRepo.create(threadId, 'assistant', assistantReply, { turnId, provider: activeProvider });
            assistantMessagePersisted = true;
            await refreshLoadedMessages(threadId, refreshTargetCount);

            advanceStage(TURN_STAGES.QUEUE_POST_PROCESSING);
            logTurnPostProcessingStage(TURN_POST_PROCESSING_STAGES.QUEUED, {
                turnId,
                threadId,
                provider: activeProvider,
                detail: 'assistant reply persisted'
            });
            postProcessingQueueRef.current = postProcessingQueueRef.current
                .catch(() => undefined)
                .then(async () => {
                    logTurnPostProcessingStage(TURN_POST_PROCESSING_STAGES.RUNNING, {
                        turnId,
                        threadId,
                        provider: activeProvider
                    });
                    const postProcessResult = await TurnPostProcessingService.processTurn({
                        threadId,
                        spaceId: memoryContext.spaceId,
                        userMessage,
                        assistantMessage: assistantReply,
                        turnId,
                        provider: activeProvider
                    });

                    console.log('[ThreadTurn] post-processing finished', {
                        turnId,
                        threadId,
                        provider: activeProvider,
                        extractedOps: postProcessResult.extraction.ops.length,
                        droppedOps: postProcessResult.extraction.diagnostics.droppedOpsCount,
                        executedOps: postProcessResult.executionReport.executedCount,
                        failedOps: postProcessResult.executionReport.failedCount,
                        summaryUpdated: postProcessResult.summary.updated
                    });
                    logTurnPostProcessingStage(TURN_POST_PROCESSING_STAGES.COMPLETED, {
                        turnId,
                        threadId,
                        provider: activeProvider,
                        detail: postProcessResult.executionReport.failedCount > 0
                            ? 'completed with failed ops'
                            : 'completed'
                    });

                    if (!canApplyTurnState()) return;
                    if (
                        postProcessResult.executionReport.executedCount > 0 ||
                        postProcessResult.summary.updated
                    ) {
                        const latestThread = await ThreadRepo.get(threadId);
                        if (latestThread) {
                            setThreadTitle((current) => (
                                current === latestThread.title ? current : latestThread.title
                            ));
                        }
                    }
                })
                .catch((error) => {
                    logTurnPostProcessingStage(TURN_POST_PROCESSING_STAGES.FAILED, {
                        turnId,
                        threadId,
                        provider: activeProvider,
                        detail: error?.message
                    });
                    console.warn('[ThreadTurn] post-processing queue failed', {
                        turnId,
                        threadId,
                        stage: TURN_STAGES.QUEUE_POST_PROCESSING,
                        error: error?.message
                    });
                });

            advanceStage(TURN_STAGES.COMPLETED);
            console.log('[ThreadTurn] completed', {
                turnId,
                threadId,
                provider: activeProvider,
                finalStage: turnStage,
                elapsedMs: Date.now() - turnStartedAt
            });
        } catch (error: any) {
            turnOutcome = 'failed';
            const failedAtStage = turnStage;
            advanceStage(TURN_STAGES.FAILED, error?.message);
            console.error('[ThreadTurn] failed', {
                turnId,
                threadId,
                provider: activeProvider,
                stage: failedAtStage,
                message: error?.message
            });

            if (userMessagePersisted && !assistantMessagePersisted) {
                try {
                    await MessageRepo.create(
                        threadId,
                        'assistant',
                        getAssistantFallbackReplyForStage(failedAtStage),
                        { turnId, fallback: true, stage: failedAtStage, provider: activeProvider }
                    );
                    await refreshLoadedMessages(threadId, refreshTargetCount);
                    assistantMessagePersisted = true;
                } catch (fallbackError: any) {
                    console.error('[ThreadTurn] fallback assistant message failed', {
                        turnId,
                        message: fallbackError?.message
                    });
                }
            }

            if (!userMessagePersisted && canApplyTurnState()) {
                setInputText(userMessage);
            }

            const providerErrorMessage = toUserFacingProviderMessage(error);
            const isProviderIssue =
                shouldResetProviderReadinessForStage(failedAtStage)
                || (
                    activeProvider === 'cloud'
                    && failedAtStage === TURN_STAGES.GENERATE_ASSISTANT_REPLY
                );
            if (shouldResetProviderReadinessForStage(failedAtStage)) {
                if (canApplyTurnState()) {
                    setLlmReady(false);
                    setLlmInitError(providerErrorMessage);
                }
            } else if (
                canApplyTurnState()
                && activeProvider === 'cloud'
                && failedAtStage === TURN_STAGES.GENERATE_ASSISTANT_REPLY
            ) {
                // Keep cloud failure reason visible in-thread so retries are actionable.
                setLlmInitError(providerErrorMessage);
            }

            if (canApplyTurnState()) {
                const alertMessage = isProviderIssue
                    ? providerErrorMessage
                    : getUserFacingTurnErrorForStage(failedAtStage);
                const alertButtons = isProviderIssue
                    ? [
                        { text: 'Not now', style: 'cancel' as const },
                        { text: 'Open Settings', onPress: () => router.push('/(tabs)/settings') }
                    ]
                    : [{ text: 'OK', style: 'cancel' as const }];
                Alert.alert(
                    'Reply Unavailable',
                    alertMessage,
                    alertButtons
                );
            }
        } finally {
            const isCurrentThread = canApplyTurnState();
            if (
                inFlightTurnRef.current?.turnId === turnId
                && inFlightTurnRef.current?.threadId === threadId
            ) {
                inFlightTurnRef.current = null;
            }
            if (isCurrentThread) {
                setIsLoading(false);
            }
            console.log('[ThreadTurn] finalized', {
                turnId,
                threadId,
                provider: activeProvider,
                outcome: turnOutcome,
                finalStage: turnStage,
                userMessagePersisted,
                assistantMessagePersisted,
                isCurrentThread,
                elapsedMs: Date.now() - turnStartedAt
            });
        }
    };

    const toggleLanguage = useCallback(() => {
        setSpeechLang((prev) => {
            const next = prev === 'el-GR' ? 'en-US' : 'el-GR';
            setMicStatus(next === 'el-GR' ? 'Voice language: Greek' : 'Voice language: English');
            return next;
        });
    }, []);

    const retryInitializeProvider = useCallback(async () => {
        try {
            setRetryingProvider(true);
            setLlmInitError(null);
            await LLMService.init();
            if (!isMountedRef.current) return;
            setLlmReady(true);
            setMicStatus('Microphone ready');
        } catch (error) {
            if (!isMountedRef.current) return;
            setLlmReady(false);
            setLlmInitError(toUserFacingProviderMessage(error));
        } finally {
            if (isMountedRef.current) {
                setRetryingProvider(false);
            }
        }
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
                            try {
                                await ThreadRepo.delete(id);
                                router.back();
                            } catch (error) {
                                console.error('Delete failed:', error);
                                Alert.alert('Delete Failed', 'Could not delete this thread.');
                            }
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
        const hasHistoryHeaderContent = totalMessageCount > 0 || !!historyLoadError;
        if (!hasHistoryHeaderContent) return null;
        const remaining = Math.max(0, totalMessageCount - loadedMessageCount);

        return (
            <View style={styles.historyHeader}>
                {!!historyLoadError && (
                    <View style={styles.historyErrorRow}>
                        <Text style={styles.historyErrorText}>{historyLoadError}</Text>
                        <TouchableOpacity onPress={loadInitialMessages}>
                            <Text style={styles.historyErrorAction}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                )}
                {totalMessageCount > 0 && (
                    <>
                        {hasOlderMessages ? (
                            <TouchableOpacity
                                style={styles.loadOlderButton}
                                onPress={loadOlderMessages}
                                disabled={loadingOlderMessages}
                            >
                                {loadingOlderMessages ? (
                                    <ActivityIndicator size="small" color={Colors.primary} />
                                ) : (
                                    <Text style={styles.loadOlderText}>Load earlier messages ({remaining} remaining)</Text>
                                )}
                            </TouchableOpacity>
                        ) : (
                            <Text style={styles.historyInfoText}>All messages loaded</Text>
                        )}

                        <Text style={styles.historyMetaText}>
                            {messages.length} of {totalMessageCount} message(s) loaded
                        </Text>
                    </>
                )}
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
                            <Text style={styles.loadingMessagesText}>Loading conversation…</Text>
                        </View>
                    ) : (
                        <FlashList
                            ref={flashListRef}
                            data={messages}
                            keyExtractor={(item) => item.id}
                            estimatedItemSize={110}
                            renderItem={renderItem}
                            contentContainerStyle={{ padding: 16 }}
                            ListHeaderComponent={renderListHeader}
                            ListEmptyComponent={<Text style={styles.emptyText}>No messages yet. Send a message to get started.</Text>}
                        />
                    )}
                </View>
                <View style={styles.inputContainer}>
                    {!!llmInitError && (
                        <View style={styles.llmErrorBanner}>
                            <Text style={styles.llmErrorText}>{llmInitError}</Text>
                            <View style={styles.llmErrorActionsRow}>
                                <TouchableOpacity onPress={retryInitializeProvider} disabled={retryingProvider}>
                                    <Text style={styles.llmErrorAction}>
                                        {retryingProvider ? 'Retrying…' : 'Retry AI'}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => router.push('/(tabs)/settings')}>
                                    <Text style={styles.llmErrorAction}>Open Settings</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                    {isLoading && (
                        <Text style={styles.turnStatusText}>Assistant is replying…</Text>
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
                                llmInitError && !llmReady
                                    ? 'AI unavailable. Open settings to fix provider/model setup'
                                    : isLoading
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
                            <Text style={styles.modalSubtitle}>Choose a name that is easy to find later in search.</Text>
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
    historyErrorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 8
    },
    historyErrorText: {
        color: Colors.notification,
        fontSize: 12
    },
    historyErrorAction: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '600'
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
    llmErrorActionsRow: {
        marginTop: 4,
        flexDirection: 'row',
        gap: 14
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
        marginBottom: 6,
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
