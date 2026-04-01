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
    executeAssistantTurn,
    getAssistantFallbackReplyForStage,
    getUserFacingTurnErrorForStage,
    type InFlightTurnState,
    isCloudAssistantReplyFailureStage,
    isProviderIssueTurnFailure,
    logTurnPostProcessingStage,
    shouldBlockProviderRetryForThread,
    shouldBlockSendForThread,
    shouldResetProviderReadinessForStage,
    TURN_POST_PROCESSING_STAGES,
    TURN_STAGES,
    type TurnStage
} from '../../src/services/assistant_turn_utils';
import {
    buildHistorySnapshotFromNewest,
    mergeOlderHistoryBatch,
    resolveJumpBehavior,
    resolveInitialVisibleCount,
    resolveMutationRefreshVisibleCount,
    shouldLoadOlderHistory
} from '../../src/services/thread_history_utils';
import { toUserFacingProviderMessage } from '../../src/services/provider_status_copy_utils';
import { debugLog } from '../../src/services/runtime_log';
import { runLayoutFeedback, triggerHaptic, useReducedMotion } from '../../src/services/interaction_feedback';
import { AppButton, InlineBanner } from '../../src/components/ui';
import { ThreadMessageBubble } from '../../src/components/thread/ThreadMessageBubble';

type SupportedSpeechLanguage = 'el-GR' | 'en-US';
type TurnProvider = 'local' | 'cloud';
type JumpHint = {
    kind: 'found' | 'older' | 'missing';
    text: string;
};

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

const getTurnStatusText = (
    stage: TurnStage | null,
    provider: TurnProvider | null
): string => {
    if (stage === TURN_STAGES.PERSIST_USER_MESSAGE) return 'Saving your message…';
    if (stage === TURN_STAGES.RESOLVE_PROVIDER) return 'Selecting AI provider…';
    if (stage === TURN_STAGES.INIT_PROVIDER) return 'Starting AI provider…';
    if (stage === TURN_STAGES.BUILD_MEMORY_CONTEXT) return 'Preparing conversation context…';
    if (stage === TURN_STAGES.GENERATE_ASSISTANT_REPLY) {
        if (provider === 'cloud') return 'Waiting for cloud response…';
        return 'Generating reply…';
    }
    if (stage === TURN_STAGES.PERSIST_ASSISTANT_REPLY) return 'Saving assistant reply…';
    if (stage === TURN_STAGES.QUEUE_POST_PROCESSING) return 'Finalizing memory updates…';
    return 'Assistant is replying…';
};

const toSafeErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message.trim().length > 0) return error.message.trim();
    if (typeof error === 'string' && error.trim().length > 0) return error.trim();
    if (
        error
        && typeof error === 'object'
        && 'message' in error
        && typeof (error as { message?: unknown }).message === 'string'
        && (error as { message: string }).message.trim().length > 0
    ) {
        return (error as { message: string }).message.trim();
    }
    return fallback;
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
    const [activeTurnStage, setActiveTurnStage] = useState<TurnStage | null>(null);
    const [activeTurnProvider, setActiveTurnProvider] = useState<TurnProvider | null>(null);
    const llmInitializing = useRef(false);
    const postProcessingQueueRef = useRef<Promise<void>>(Promise.resolve());
    const isMountedRef = useRef(true);
    const activeThreadIdRef = useRef<string | null>(id || null);
    const inFlightTurnRef = useRef<InFlightTurnState | null>(null);
    const providerRetryRequestRef = useRef(0);
    const speechOperationRequestRef = useRef(0);
    const [micStatus, setMicStatus] = useState('Microphone ready');
    const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
    const [jumpHint, setJumpHint] = useState<JumpHint | null>(null);
    const lastJumpedMessageIdRef = useRef<string | null>(null);
    const flashListRef = useRef<any>(null);
    const historySyncRequestRef = useRef(0);

    const [loadingInitialMessages, setLoadingInitialMessages] = useState(true);
    const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
    const [loadedMessageCount, setLoadedMessageCount] = useState(0);
    const loadedMessageCountRef = useRef(0);
    const [totalMessageCount, setTotalMessageCount] = useState(0);
    const [hasOlderMessages, setHasOlderMessages] = useState(false);
    const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
    const [historyLoadErrorSource, setHistoryLoadErrorSource] = useState<'initial' | 'older' | null>(null);

    const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [savingRename, setSavingRename] = useState(false);
    const reducedMotion = useReducedMotion();
    const providerUnavailable = !!llmInitError && !llmReady && !retryingProvider;
    const interactionDisabled = isLoading || retryingProvider;

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            providerRetryRequestRef.current += 1;
            speechOperationRequestRef.current += 1;
        };
    }, []);

    useEffect(() => {
        loadedMessageCountRef.current = loadedMessageCount;
    }, [loadedMessageCount]);

    useEffect(() => {
        providerRetryRequestRef.current += 1;
        speechOperationRequestRef.current += 1;
        activeThreadIdRef.current = id || null;
        const inFlight = inFlightTurnRef.current;
        if (!inFlight || inFlight.threadId !== id) {
            setIsLoading(false);
        }
        setRetryingProvider(false);
        setActiveTurnStage(null);
        setActiveTurnProvider(null);
        setMicStatus('Microphone ready');
        if (isRecording) {
            Promise.resolve(ExpoSpeechRecognitionModule.stop()).catch((error: unknown) => {
                console.warn('[ThreadSpeech] stop on thread change failed', {
                    threadId: id,
                    message: toSafeErrorMessage(error, 'Could not stop microphone on thread change')
                });
            });
            setIsRecording(false);
        }
    }, [id]);

    const isCurrentThreadActive = useCallback((threadId: string): boolean => {
        return isMountedRef.current && activeThreadIdRef.current === threadId;
    }, []);

    const canApplyThreadEventState = useCallback((): boolean => {
        return !!id && isCurrentThreadActive(id);
    }, [id, isCurrentThreadActive]);

    const refreshLoadedMessages = useCallback(async (
        threadId: string,
        targetVisibleCount = MESSAGE_PAGE_SIZE,
        options?: { requestId?: number }
    ) => {
        if (!threadId) return;
        const requestId = options?.requestId ?? (++historySyncRequestRef.current);

        const limit = Math.max(
            MESSAGE_PAGE_SIZE,
            targetVisibleCount
        );

        const [totalCount, newestMessages] = await Promise.all([
            MessageRepo.countByThread(threadId),
            MessageRepo.listByThread(threadId, limit, 0)
        ]);
        if (!isCurrentThreadActive(threadId)) return;
        if (requestId !== historySyncRequestRef.current) return;

        const snapshot = buildHistorySnapshotFromNewest(newestMessages, totalCount);
        runLayoutFeedback(reducedMotion);
        setMessages(snapshot.messages);
        setLoadedMessageCount(snapshot.loadedMessageCount);
        setTotalMessageCount(snapshot.totalMessageCount);
        setHasOlderMessages(snapshot.hasOlderMessages);
        setHistoryLoadError(null);
        setHistoryLoadErrorSource(null);
    }, [isCurrentThreadActive, reducedMotion]);

    const loadInitialMessages = useCallback(async () => {
        const threadId = id;
        if (!threadId) {
            setLoadingInitialMessages(false);
            return;
        }
        const requestId = ++historySyncRequestRef.current;
        if (isCurrentThreadActive(threadId)) {
            setLoadingInitialMessages(true);
        }
        try {
            let targetOffset: number | null = null;
            if (targetMessageId) {
                const resolvedTargetOffset = await MessageRepo.getOffsetFromNewest(threadId, targetMessageId);
                targetOffset = typeof resolvedTargetOffset === 'number' && resolvedTargetOffset >= 0
                    ? resolvedTargetOffset
                    : null;
            }
            const targetVisibleCount = resolveInitialVisibleCount(MESSAGE_PAGE_SIZE, targetOffset, 8);
            await refreshLoadedMessages(
                threadId,
                targetVisibleCount,
                { requestId }
            );
        } catch (error) {
            console.warn('[ThreadHistory] initial load failed', {
                threadId,
                message: toSafeErrorMessage(error, 'Initial history load failed')
            });
            if (isCurrentThreadActive(threadId)) {
                if (requestId !== historySyncRequestRef.current) return;
                setHistoryLoadError('Could not load conversation history right now.');
                setHistoryLoadErrorSource('initial');
            }
        } finally {
            if (isCurrentThreadActive(threadId)) {
                if (requestId !== historySyncRequestRef.current) return;
                setLoadingInitialMessages(false);
            }
        }
    }, [id, isCurrentThreadActive, refreshLoadedMessages, targetMessageId]);

    const loadOlderMessages = useCallback(async () => {
        const threadId = id;
        if (!shouldLoadOlderHistory({
            threadId,
            loadingOlderMessages,
            hasOlderMessages,
            turnInFlight: shouldBlockSendForThread(threadId, inFlightTurnRef.current, isLoading)
                || retryingProvider
        })) {
            return;
        }
        const requestId = ++historySyncRequestRef.current;

        setLoadingOlderMessages(true);
        try {
            const olderBatch = await MessageRepo.listByThread(threadId, MESSAGE_PAGE_SIZE, loadedMessageCount);
            if (olderBatch.length === 0) {
                if (isCurrentThreadActive(threadId)) {
                    if (requestId !== historySyncRequestRef.current) return;
                    setHasOlderMessages(false);
                    setHistoryLoadError(null);
                    setHistoryLoadErrorSource(null);
                }
                return;
            }

            if (!isCurrentThreadActive(threadId)) return;
            if (requestId !== historySyncRequestRef.current) return;

            const snapshot = mergeOlderHistoryBatch({
                existingMessages: messages,
                olderBatch,
                loadedMessageCount,
                totalMessageCount
            });
            runLayoutFeedback(reducedMotion);
            setMessages(snapshot.messages);
            setLoadedMessageCount(snapshot.loadedMessageCount);
            setTotalMessageCount(snapshot.totalMessageCount);
            setHasOlderMessages(snapshot.hasOlderMessages);
            setHistoryLoadError(null);
            setHistoryLoadErrorSource(null);
        } catch (error) {
            console.warn('[ThreadHistory] older load failed', {
                threadId,
                loadedMessageCount,
                message: toSafeErrorMessage(error, 'Older history load failed')
            });
            if (isCurrentThreadActive(threadId)) {
                if (requestId !== historySyncRequestRef.current) return;
                setHistoryLoadError('Could not load earlier messages. Please retry.');
                setHistoryLoadErrorSource('older');
            }
        } finally {
            if (isCurrentThreadActive(threadId)) {
                setLoadingOlderMessages(false);
            }
        }
    }, [
        hasOlderMessages,
        id,
        isCurrentThreadActive,
        isLoading,
        loadedMessageCount,
        loadingOlderMessages,
        messages,
        retryingProvider,
        totalMessageCount,
        reducedMotion
    ]);

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
                        debugLog('[Thread] LLM initialized successfully', { threadId });
                    } catch (error) {
                        console.warn('[Thread] LLM init failed', {
                            threadId,
                            message: toSafeErrorMessage(error, 'LLM init failed')
                        });
                        if (!threadId || isCurrentThreadActive(threadId)) {
                            setLlmReady(false);
                            setLlmInitError(toUserFacingProviderMessage(error));
                        }
                    } finally {
                        llmInitializing.current = false;
                    }
                }
            } catch (error) {
                console.error('[Thread] screen initialization failed', {
                    threadId: id,
                    message: toSafeErrorMessage(error, 'Thread initialization failed')
                });
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
        setJumpHint(null);
    }, [id, targetMessageId]);

    useEffect(() => {
        if (!targetMessageId) return;
        const jumpBehavior = resolveJumpBehavior({
            messages,
            targetMessageId,
            lastJumpedMessageId: lastJumpedMessageIdRef.current,
            loadingInitialMessages,
            loadingOlderMessages,
            hasOlderMessages
        });
        if (jumpBehavior.kind === 'none' || jumpBehavior.kind === 'wait') return;
        if (jumpBehavior.kind === 'hint') {
            setJumpHint({
                kind: jumpBehavior.hint,
                text: jumpBehavior.text
            });
            return;
        }
        const targetIndex = jumpBehavior.index;

        lastJumpedMessageIdRef.current = targetMessageId;
        setHighlightedMessageId(targetMessageId);
        setJumpHint({
            kind: 'found',
            text: 'Jumped to the matching message from search.'
        });
        triggerHaptic('selection', reducedMotion);

        const scrollIndex = Math.max(0, targetIndex - 1);
        requestAnimationFrame(() => {
            flashListRef.current?.scrollToIndex({ index: scrollIndex, animated: true });
        });

        const clearHighlightTimeout = setTimeout(() => {
            if (!isMountedRef.current) return;
            setHighlightedMessageId((current) => (
                current === targetMessageId ? null : current
            ));
            setJumpHint((current) => (
                current?.kind === 'found' ? null : current
            ));
        }, 3500);

        return () => clearTimeout(clearHighlightTimeout);
    }, [hasOlderMessages, loadingInitialMessages, loadingOlderMessages, messages, targetMessageId, reducedMotion]);

    useSpeechRecognitionEvent('result', (event) => {
        if (!canApplyThreadEventState()) return;
        if (event.results && event.results.length > 0) {
            const result = event.results[event.results.length - 1];
            if (result && result.transcript) {
                setTranscriptBuffer(result.transcript);
                setMicStatus('Voice captured');
            }
        }
    });

    useSpeechRecognitionEvent('speechstart', () => {
        if (!canApplyThreadEventState()) return;
        setIsRecording(true);
        setMicStatus('Listening…');
    });
    useSpeechRecognitionEvent('speechend', () => {
        if (!canApplyThreadEventState()) return;
        setIsRecording(false);
        setMicStatus('Processing voice…');
    });
    useSpeechRecognitionEvent('error', (event) => {
        if (!canApplyThreadEventState()) return;
        console.warn('[ThreadSpeech] speech recognition error', {
            threadId: id,
            code: typeof event?.error === 'string' ? event.error : 'unknown',
            message: toSafeErrorMessage(
                event?.message || event?.error,
                'Speech recognition failed'
            )
        });
        setIsRecording(false);
        setMicStatus('Voice input unavailable');
        if (event.error === 'not-allowed') {
            Alert.alert('Permission Required', 'Please enable microphone access in Settings.');
        }
    });

    const enqueueTurnPostProcessing = useCallback((params: {
        turnId: string;
        threadId: string;
        provider?: TurnProvider;
        spaceId: string | null;
        userMessage: string;
        assistantMessage: string;
        canApplyTurnState: () => boolean;
    }) => {
        logTurnPostProcessingStage(TURN_POST_PROCESSING_STAGES.QUEUED, {
            turnId: params.turnId,
            threadId: params.threadId,
            provider: params.provider,
            detail: 'assistant reply persisted'
        });

        postProcessingQueueRef.current = postProcessingQueueRef.current
            .catch(() => undefined)
            .then(async () => {
                logTurnPostProcessingStage(TURN_POST_PROCESSING_STAGES.RUNNING, {
                    turnId: params.turnId,
                    threadId: params.threadId,
                    provider: params.provider
                });
                const postProcessResult = await TurnPostProcessingService.processTurn({
                    threadId: params.threadId,
                    spaceId: params.spaceId,
                    userMessage: params.userMessage,
                    assistantMessage: params.assistantMessage,
                    turnId: params.turnId,
                    provider: params.provider
                });

                debugLog('[ThreadTurn] post-processing finished', {
                    turnId: params.turnId,
                    threadId: params.threadId,
                    provider: params.provider,
                    extractedOps: postProcessResult.extraction.ops.length,
                    droppedOps: postProcessResult.extraction.diagnostics.droppedOpsCount,
                    executedOps: postProcessResult.executionReport.executedCount,
                    failedOps: postProcessResult.executionReport.failedCount,
                    summaryUpdated: postProcessResult.summary.updated
                });
                logTurnPostProcessingStage(TURN_POST_PROCESSING_STAGES.COMPLETED, {
                    turnId: params.turnId,
                    threadId: params.threadId,
                    provider: params.provider,
                    detail: postProcessResult.executionReport.failedCount > 0
                        ? 'completed with failed ops'
                        : 'completed'
                });

                if (!params.canApplyTurnState()) return;
                if (
                    postProcessResult.executionReport.executedCount > 0 ||
                    postProcessResult.summary.updated
                ) {
                    try {
                        const latestThread = await ThreadRepo.get(params.threadId);
                        if (latestThread) {
                            setThreadTitle((current) => (
                                current === latestThread.title ? current : latestThread.title
                            ));
                        }
                    } catch (error: any) {
                        console.warn('[ThreadTurn] post-processing UI refresh failed', {
                            turnId: params.turnId,
                            threadId: params.threadId,
                            message: error?.message
                        });
                    }
                }
            })
            .catch((error) => {
                logTurnPostProcessingStage(TURN_POST_PROCESSING_STAGES.FAILED, {
                    turnId: params.turnId,
                    threadId: params.threadId,
                    provider: params.provider,
                    detail: error?.message
                });
                console.warn('[ThreadTurn] post-processing queue failed', {
                    turnId: params.turnId,
                    threadId: params.threadId,
                    stage: TURN_STAGES.QUEUE_POST_PROCESSING,
                    error: error?.message
                });
            });
    }, []);

    const sendMessage = async () => {
        if (!id) return;
        const userMessage = inputText.trim();
        if (!userMessage) return;
        if (retryingProvider) {
            if (isCurrentThreadActive(id)) {
                setMicStatus('Retrying AI connection…');
            }
            return;
        }
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
            debugLog('[ThreadTurn] send ignored', {
                threadId: id,
                reason: isLoading ? 'loading' : 'in_flight_turn',
                inFlightTurnId: inFlightTurnRef.current?.turnId || null,
                inFlightStage: inFlightTurnRef.current?.stage || null,
                inFlightProvider: inFlightTurnRef.current?.provider || null
            });
            if (isCurrentThreadActive(id)) {
                setMicStatus('Assistant is finishing the previous reply…');
            }
            return;
        }

        const threadId = id;
        const turnId = createTurnId();
        const turnStartedAt = Date.now();
        const canApplyTurnState = (): boolean => isCurrentThreadActive(threadId);
        let turnOutcome: 'completed' | 'failed' = 'completed';
        let userMessagePersisted = false;
        let assistantMessagePersisted = false;
        let activeProvider: TurnProvider | undefined;
        let finalStage: TurnStage = TURN_STAGES.START;

        const refreshMessagesAfterMutation = async (
            stage: TurnStage,
            detail: string
        ): Promise<void> => {
            try {
                const targetVisibleCount = resolveMutationRefreshVisibleCount(
                    loadedMessageCountRef.current,
                    MESSAGE_PAGE_SIZE,
                    4
                );
                await refreshLoadedMessages(threadId, targetVisibleCount);
            } catch (error: unknown) {
                console.warn('[ThreadTurn] refresh after mutation failed', {
                    turnId,
                    threadId,
                    stage,
                    detail,
                    message: toSafeErrorMessage(error, 'Refresh after mutation failed')
                });
            }
        };

        setInputText('');
        setTranscriptBuffer('');
        setIsLoading(true);
        setLlmInitError(null);
        setActiveTurnStage(TURN_STAGES.START);
        setActiveTurnProvider(null);

        debugLog('[ThreadTurn] start', {
            turnId,
            threadId,
            userChars: userMessage.length
        });

        const turnResult = await executeAssistantTurn({
            turnId,
            threadId,
            startedAt: turnStartedAt,
            inFlightTurnRef,
            isRecording,
            onStateChange: ({ stage, provider }) => {
                if (!canApplyTurnState()) return;
                setActiveTurnStage(stage);
                setActiveTurnProvider((provider as TurnProvider | undefined) || null);
            },
            stopRecording: async () => {
                try {
                    await ExpoSpeechRecognitionModule.stop();
                } catch (error: unknown) {
                    console.warn('[ThreadTurn] stop recording failed', {
                        turnId,
                        message: toSafeErrorMessage(error, 'Stop recording failed')
                    });
                } finally {
                    if (canApplyTurnState()) {
                        setIsRecording(false);
                        setMicStatus('Microphone ready');
                    }
                }
            },
            persistUserMessage: async () => {
                await MessageRepo.create(threadId, 'user', userMessage, { turnId });
                await refreshMessagesAfterMutation(
                    TURN_STAGES.PERSIST_USER_MESSAGE,
                    'user_message_persisted'
                );
            },
            resolveProvider: async () => {
                const provider = await LLMService.resolveProviderForTurn();
                debugLog('[ThreadTurn] provider resolved', {
                    turnId,
                    threadId,
                    provider
                });
                return provider as TurnProvider;
            },
            initProvider: async (provider) => {
                await LLMService.init(provider);
                if (!llmReady && canApplyTurnState()) {
                    setLlmReady(true);
                }
                if (canApplyTurnState()) {
                    setLlmInitError(null);
                }
            },
            buildMemoryContext: async () => {
                return await MemoryService.buildTurnContext(threadId, userMessage, { turnId });
            },
            generateAssistantReply: async (provider, memoryContext) => {
                const response = await LLMService.chat(memoryContext.chatMessages, {
                    task: 'assistant',
                    provider,
                    requestId: turnId
                });
                return response && response.trim() ? response.trim() : '...';
            },
            persistAssistantReply: async (assistantReply, provider) => {
                await MessageRepo.create(threadId, 'assistant', assistantReply, { turnId, provider });
                await refreshMessagesAfterMutation(
                    TURN_STAGES.PERSIST_ASSISTANT_REPLY,
                    'assistant_message_persisted'
                );
            },
            queuePostProcessing: ({ provider, memoryContext, assistantReply }) => {
                enqueueTurnPostProcessing({
                    turnId,
                    threadId,
                    provider,
                    spaceId: memoryContext.spaceId,
                    userMessage,
                    assistantMessage: assistantReply,
                    canApplyTurnState
                });
            }
        });

        activeProvider = turnResult.provider as TurnProvider | undefined;
        userMessagePersisted = turnResult.userMessagePersisted;
        assistantMessagePersisted = turnResult.assistantMessagePersisted;
        finalStage = turnResult.outcome === 'completed' ? turnResult.stage : TURN_STAGES.FAILED;

        if (turnResult.outcome === 'completed') {
            triggerHaptic('success', reducedMotion);
            debugLog('[ThreadTurn] completed', {
                turnId,
                threadId,
                provider: activeProvider,
                finalStage: turnResult.stage,
                elapsedMs: Date.now() - turnStartedAt
            });
        } else {
            turnOutcome = 'failed';
            triggerHaptic('error', reducedMotion);
            const failedAtStage = turnResult.stage;
            console.error('[ThreadTurn] failed', {
                turnId,
                threadId,
                provider: activeProvider,
                stage: failedAtStage,
                message: toSafeErrorMessage(turnResult.error, 'Turn failed')
            });

            if (userMessagePersisted && !assistantMessagePersisted) {
                try {
                    await MessageRepo.create(
                        threadId,
                        'assistant',
                        getAssistantFallbackReplyForStage(failedAtStage),
                        { turnId, fallback: true, stage: failedAtStage, provider: activeProvider }
                    );
                    assistantMessagePersisted = true;
                    await refreshMessagesAfterMutation(
                        TURN_STAGES.FAILED,
                        'assistant_fallback_persisted'
                    );
                } catch (fallbackError: unknown) {
                    console.error('[ThreadTurn] fallback assistant message failed', {
                        turnId,
                        message: toSafeErrorMessage(fallbackError, 'Fallback assistant message failed')
                    });
                }
            }

            if (!userMessagePersisted && canApplyTurnState()) {
                setInputText(userMessage);
            }

            const providerErrorMessage = toUserFacingProviderMessage(turnResult.error);
            const shouldResetProviderReadiness = shouldResetProviderReadinessForStage(failedAtStage);
            const isCloudGenerationFailure = isCloudAssistantReplyFailureStage(activeProvider, failedAtStage);
            const isProviderIssue = isProviderIssueTurnFailure(activeProvider, failedAtStage);
            if (shouldResetProviderReadiness) {
                if (canApplyTurnState()) {
                    setLlmReady(false);
                    setLlmInitError(providerErrorMessage);
                }
            } else if (canApplyTurnState() && isCloudGenerationFailure) {
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
        }

        const isCurrentThread = canApplyTurnState();
        if (isCurrentThread) {
            setIsLoading(false);
            setActiveTurnStage(null);
            setActiveTurnProvider(null);
        }

        debugLog('[ThreadTurn] finalized', {
            turnId,
            threadId,
            provider: activeProvider,
            outcome: turnOutcome,
            finalStage,
            userMessagePersisted,
            assistantMessagePersisted,
            isCurrentThread,
            elapsedMs: Date.now() - turnStartedAt
        });
    };

    const toggleLanguage = useCallback(() => {
        setSpeechLang((prev) => {
            const next = prev === 'el-GR' ? 'en-US' : 'el-GR';
            setMicStatus(next === 'el-GR' ? 'Mic language: Greek (el-GR)' : 'Mic language: English (en-US)');
            triggerHaptic('selection', reducedMotion);
            return next;
        });
    }, [reducedMotion]);

    const retryInitializeProvider = useCallback(async () => {
        const threadId = id;
        if (!threadId) return;
        const blockedByInFlightTurn = shouldBlockProviderRetryForThread(
            threadId,
            inFlightTurnRef.current,
            isLoading
        );
        const requestId = ++providerRetryRequestRef.current;
        const canApplyRetryState = (): boolean => {
            return (
                isCurrentThreadActive(threadId)
                && requestId === providerRetryRequestRef.current
            );
        };
        if (blockedByInFlightTurn) {
            if (canApplyRetryState()) {
                setMicStatus('Assistant is finishing the previous reply…');
            }
            return;
        }
        if (llmInitializing.current || retryingProvider) {
            return;
        }
        try {
            if (canApplyRetryState()) {
                setRetryingProvider(true);
                setMicStatus('Retrying AI connection…');
                setLlmInitError(null);
            }
            await LLMService.init();
            if (!canApplyRetryState()) return;
            setLlmReady(true);
            setMicStatus('AI ready');
            triggerHaptic('success', reducedMotion);
        } catch (error) {
            if (!canApplyRetryState()) return;
            setLlmReady(false);
            setLlmInitError(toUserFacingProviderMessage(error));
            triggerHaptic('error', reducedMotion);
        } finally {
            if (canApplyRetryState()) {
                setRetryingProvider(false);
            }
        }
    }, [id, isCurrentThreadActive, isLoading, retryingProvider, reducedMotion]);

    const toggleRecording = useCallback(async () => {
        const threadId = id;
        if (!threadId) return;
        const requestId = ++speechOperationRequestRef.current;
        const canApplySpeechState = (): boolean => {
            return (
                isCurrentThreadActive(threadId)
                && requestId === speechOperationRequestRef.current
            );
        };

        if (isRecording) {
            try {
                await ExpoSpeechRecognitionModule.stop();
                if (canApplySpeechState()) {
                    setMicStatus('Microphone ready');
                    triggerHaptic('selection', reducedMotion);
                }
            } catch (e: unknown) {
                console.warn('[ThreadSpeech] stop failed', {
                    threadId,
                    message: toSafeErrorMessage(e, 'Could not stop microphone')
                });
                if (canApplySpeechState()) {
                    setMicStatus('Could not stop microphone');
                    triggerHaptic('error', reducedMotion);
                }
            }
            if (canApplySpeechState()) {
                setIsRecording(false);
            }
        } else {
            try {
                if (canApplySpeechState()) {
                    setMicStatus('Checking microphone permission…');
                }
                const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
                if (!canApplySpeechState()) return;
                if (!result.granted) {
                    Alert.alert('Permission Required', 'Please allow microphone and speech recognition access.');
                    setMicStatus('Microphone permission denied');
                    triggerHaptic('warning', reducedMotion);
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
            } catch (e: unknown) {
                console.warn('[ThreadSpeech] start failed', {
                    threadId,
                    message: toSafeErrorMessage(e, 'Could not start microphone')
                });
                if (canApplySpeechState()) {
                    setIsRecording(false);
                    setMicStatus('Could not start microphone');
                    Alert.alert('Voice Input Unavailable', 'Could not start speech input. Please try again.');
                    triggerHaptic('error', reducedMotion);
                }
            }
        }
    }, [id, isCurrentThreadActive, isRecording, speechLang, reducedMotion]);

    const renderItem = ({ item }: { item: Message }) => {
        const displayText = item.role === 'user' ? item.text : sanitizeAssistantResponse(item.text);
        const isHighlighted = highlightedMessageId === item.id;
        return (
            <ThreadMessageBubble
                message={item}
                displayText={displayText}
                highlighted={isHighlighted}
            />
        );
    };

    const openRenameModal = () => {
        setRenameValue(threadTitle);
        setIsRenameModalVisible(true);
    };

    const closeRenameModal = () => {
        if (savingRename) return;
        setRenameValue('');
        setIsRenameModalVisible(false);
    };

    const saveRename = async () => {
        const trimmed = renameValue.trim();
        if (!trimmed || !id) return;

        try {
            setSavingRename(true);
            await ThreadRepo.update(id, { title: trimmed });
            await FeedRepo.create(threadSpaceId, 'thread_updated', id);
            setThreadTitle(trimmed);
            closeRenameModal();
            triggerHaptic('success', reducedMotion);
        } catch (error) {
            console.warn('[Thread] rename failed', {
                threadId: id,
                message: toSafeErrorMessage(error, 'Rename failed')
            });
            Alert.alert('Rename Failed', 'Could not rename this thread.');
            triggerHaptic('error', reducedMotion);
        } finally {
            setSavingRename(false);
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
                                triggerHaptic('warning', reducedMotion);
                                await ThreadRepo.delete(id);
                                triggerHaptic('success', reducedMotion);
                                router.back();
                            } catch (error) {
                                console.warn('[Thread] delete failed', {
                                    threadId: id,
                                    message: toSafeErrorMessage(error, 'Delete failed')
                                });
                                Alert.alert('Delete Failed', 'Could not delete this thread.');
                                triggerHaptic('error', reducedMotion);
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

    const retryHistoryLoad = useCallback(() => {
        if (historyLoadErrorSource === 'older') {
            loadOlderMessages();
            return;
        }
        loadInitialMessages();
    }, [historyLoadErrorSource, loadInitialMessages, loadOlderMessages]);

    const renderListHeader = () => {
        const hasHistoryHeaderContent = totalMessageCount > 0 || !!historyLoadError || !!jumpHint;
        if (!hasHistoryHeaderContent) return null;
        const remaining = Math.max(0, totalMessageCount - loadedMessageCount);
        const blockOlderLoad = shouldBlockSendForThread(
            id,
            inFlightTurnRef.current,
            isLoading
        ) || retryingProvider;

        return (
            <View style={styles.historyHeader}>
                {!!jumpHint && (
                    <View style={styles.jumpHintCard}>
                        <Text style={[
                            styles.jumpHintText,
                            jumpHint.kind === 'missing' && styles.jumpHintMissingText
                        ]}>
                            {jumpHint.text}
                        </Text>
                        {(jumpHint.kind === 'older' && hasOlderMessages) ? (
                            <AppButton
                                size="sm"
                                variant="secondary"
                                label={loadingOlderMessages ? 'Loading…' : 'Load earlier'}
                                onPress={loadOlderMessages}
                                disabled={loadingOlderMessages || blockOlderLoad}
                                loading={loadingOlderMessages}
                            />
                        ) : (
                            <AppButton
                                size="sm"
                                variant="secondary"
                                label="Dismiss"
                                onPress={() => setJumpHint(null)}
                            />
                        )}
                    </View>
                )}
                {!!historyLoadError && (
                    <InlineBanner
                        tone="error"
                        message={historyLoadError}
                        actionLabel={historyLoadErrorSource === 'older' ? 'Retry older messages' : 'Retry'}
                        onActionPress={retryHistoryLoad}
                    />
                )}
                {totalMessageCount > 0 && (
                    <View style={styles.historyMetaCard}>
                        {hasOlderMessages ? (
                            <AppButton
                                size="sm"
                                variant="secondary"
                                label={loadingOlderMessages
                                    ? 'Loading earlier messages…'
                                    : blockOlderLoad
                                        ? 'Finish current reply first'
                                        : `Load earlier messages (${remaining} remaining)`}
                                onPress={loadOlderMessages}
                                disabled={loadingOlderMessages || blockOlderLoad}
                                loading={loadingOlderMessages}
                            />
                        ) : (
                            <Text style={styles.historyInfoText}>All messages loaded</Text>
                        )}
                        <Text style={styles.historyMetaText}>
                            {messages.length} of {totalMessageCount} message(s) loaded
                        </Text>
                    </View>
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
                            <TouchableOpacity
                                onPress={handleSettings}
                                style={styles.headerButton}
                                accessibilityRole="button"
                                accessibilityLabel="Thread options"
                                accessibilityHint="Opens rename and delete actions"
                            >
                                <Ionicons name="ellipsis-horizontal-circle" size={24} color={Colors.primary} />
                            </TouchableOpacity>
                        )
                    }}
                />
                <View style={styles.listContainer}>
                    {loadingInitialMessages ? (
                        <View style={styles.loadingMessagesContainer}>
                            <ActivityIndicator size="small" color={Colors.primary} />
                            <Text style={styles.loadingMessagesText}>Loading conversation history…</Text>
                        </View>
                    ) : (
                        <FlashList
                            ref={flashListRef}
                            data={messages}
                            keyExtractor={(item) => item.id}
                            renderItem={renderItem}
                            contentContainerStyle={styles.messageListContent}
                            ListHeaderComponent={renderListHeader}
                            ListEmptyComponent={(
                                <View style={styles.emptyStateContainer}>
                                    <Text style={styles.emptyText}>
                                        {historyLoadErrorSource === 'initial'
                                            ? 'Conversation is unavailable right now. Retry to continue.'
                                            : 'No messages yet. Send a message to get started.'}
                                    </Text>
                                    {historyLoadErrorSource === 'initial' && (
                                        <AppButton
                                            size="sm"
                                            label="Retry history load"
                                            onPress={retryHistoryLoad}
                                        />
                                    )}
                                </View>
                            )}
                        />
                    )}
                </View>
                <View style={styles.inputContainer}>
                    {!!llmInitError && (
                        <View style={styles.llmErrorBanner}>
                            <Text style={styles.llmErrorTitle}>AI is currently unavailable</Text>
                            <Text style={styles.llmErrorText}>{llmInitError}</Text>
                            <View style={styles.llmErrorActionsRow}>
                                <AppButton
                                    size="sm"
                                    variant="secondary"
                                    label={retryingProvider ? 'Retrying…' : 'Retry AI'}
                                    onPress={retryInitializeProvider}
                                    disabled={retryingProvider}
                                    loading={retryingProvider}
                                />
                                <AppButton
                                    size="sm"
                                    variant="secondary"
                                    label="Open Settings"
                                    onPress={() => router.push('/(tabs)/settings')}
                                />
                            </View>
                        </View>
                    )}
                    {isLoading && (
                        <Text style={styles.turnStatusText}>
                            {getTurnStatusText(activeTurnStage, activeTurnProvider)}
                        </Text>
                    )}
                    {retryingProvider && !isLoading && (
                        <Text style={styles.turnStatusText}>Reconnecting AI…</Text>
                    )}
                    {providerUnavailable && !isLoading && !retryingProvider && (
                        <Text style={styles.turnStatusText}>Sending is disabled until AI is available.</Text>
                    )}
                    {micStatus !== 'Microphone ready' && (
                        <Text style={styles.micStatusText}>{micStatus}</Text>
                    )}
                    <View style={styles.composerRow}>
                        <TextInput
                            style={styles.input}
                            value={inputText}
                            onChangeText={setInputText}
                            accessibilityLabel="Message composer"
                            accessibilityHint="Type your message to the assistant"
                            placeholder={
                                providerUnavailable
                                    ? 'AI unavailable. Open Settings to restore provider/model setup'
                                    : retryingProvider
                                    ? 'Retrying AI connection…'
                                    : isLoading
                                    ? 'Generating reply…'
                                    : isRecording
                                        ? 'Listening…'
                                        : 'Type a message or use the mic'
                            }
                            placeholderTextColor={isRecording ? Colors.notification : Colors.secondaryText}
                            multiline
                            editable={!interactionDisabled}
                        />
                        <TouchableOpacity
                            onPress={toggleLanguage}
                            style={styles.langButton}
                            disabled={interactionDisabled}
                            accessibilityRole="button"
                            accessibilityLabel={`Mic language ${speechLang === 'el-GR' ? 'Greek' : 'English'}`}
                            accessibilityHint="Double tap to switch microphone language"
                        >
                            <Text style={styles.langText}>{speechLang === 'el-GR' ? 'EL' : 'EN'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={toggleRecording}
                            style={[styles.micButton, isRecording && styles.micActive]}
                            disabled={interactionDisabled || providerUnavailable}
                            accessibilityRole="button"
                            accessibilityLabel={isRecording ? 'Stop voice input' : 'Start voice input'}
                            accessibilityHint={providerUnavailable
                                ? 'Voice input is unavailable until AI recovers'
                                : 'Double tap to dictate a message'}
                        >
                            <Ionicons
                                name={isRecording ? 'stop' : 'mic'}
                                size={28}
                                color={isRecording
                                    ? 'white'
                                    : (interactionDisabled || providerUnavailable
                                        ? Colors.secondaryText
                                        : Colors.primary)}
                            />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={sendMessage}
                            style={[
                                styles.sendButton,
                                (providerUnavailable || inputText.trim().length === 0 || interactionDisabled) && styles.sendButtonDisabled
                            ]}
                            disabled={providerUnavailable || inputText.trim().length === 0 || interactionDisabled}
                            accessibilityRole="button"
                            accessibilityLabel="Send message"
                            accessibilityHint={providerUnavailable
                                ? 'Open Settings to restore AI and send messages'
                                : 'Sends your message to the assistant'}
                        >
                            {interactionDisabled ? (
                                <ActivityIndicator size="small" color={Colors.primary} />
                            ) : (
                                <Ionicons
                                    name="send"
                                    size={22}
                                    color={(providerUnavailable || inputText.trim().length === 0)
                                        ? Colors.secondaryText
                                        : Colors.primary}
                                />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>

            <Modal
                transparent
                visible={isRenameModalVisible}
                animationType={reducedMotion ? 'none' : 'fade'}
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
                                <AppButton label="Cancel" variant="secondary" onPress={closeRenameModal} />
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
    headerButton: {
        marginRight: 10
    },
    listContainer: {
        flex: 1
    },
    messageListContent: {
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 18
    },
    loadingMessagesContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10
    },
    loadingMessagesText: {
        fontSize: 14,
        color: Colors.secondaryText
    },
    emptyStateContainer: {
        alignItems: 'center',
        gap: 10,
        marginTop: 28
    },
    emptyText: {
        textAlign: 'center',
        color: Colors.secondaryText,
        fontSize: 14
    },
    historyHeader: {
        marginBottom: 12,
        gap: 8
    },
    jumpHintCard: {
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: Colors.card,
        borderRadius: 12,
        padding: 10,
        gap: 8
    },
    jumpHintText: {
        color: Colors.secondaryText,
        fontSize: 13
    },
    jumpHintMissingText: {
        color: Colors.notification
    },
    historyMetaCard: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: Colors.card,
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 12
    },
    historyInfoText: {
        fontSize: 13,
        color: Colors.secondaryText
    },
    historyMetaText: {
        fontSize: 12,
        color: Colors.secondaryText
    },
    inputContainer: {
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 10,
        backgroundColor: Colors.background,
        borderTopWidth: 1,
        borderTopColor: Colors.border
    },
    llmErrorBanner: {
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FECACA',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 8
    },
    llmErrorText: {
        color: '#991B1B',
        fontSize: 13
    },
    llmErrorTitle: {
        color: '#7F1D1D',
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 4
    },
    llmErrorActionsRow: {
        marginTop: 8,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8
    },
    turnStatusText: {
        fontSize: 13,
        color: Colors.secondaryText,
        marginBottom: 6
    },
    composerRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 18,
        backgroundColor: Colors.card,
        paddingHorizontal: 8,
        paddingVertical: 6
    },
    input: {
        flex: 1,
        backgroundColor: 'transparent',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 16,
        minHeight: 42,
        maxHeight: 150,
        marginRight: 6,
        color: Colors.text,
    },
    micStatusText: {
        fontSize: 12,
        color: Colors.secondaryText,
        marginBottom: 6
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: Colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6
    },
    sendButtonDisabled: {
        opacity: 0.55
    },
    langButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: Colors.background,
        marginRight: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    langText: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.secondaryText
    },
    micButton: {
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 20,
        backgroundColor: Colors.background,
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    micActive: {
        backgroundColor: Colors.notification,
        borderColor: Colors.notification
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
        borderRadius: 14,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 16
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: '700',
        marginBottom: 4,
        color: Colors.text
    },
    modalSubtitle: {
        fontSize: 13,
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
        gap: 8
    }
});
