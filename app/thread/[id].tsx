import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, KeyboardAvoidingView, NativeModules, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Message, MessageRepo } from '../../src/repositories/message_repo';
import { ThreadRepo } from '../../src/repositories/thread_repo';
import { Colors } from '../../src/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { ChatMessage, LLMService, sanitizeAssistantResponse } from '../../src/services/LLMService';

// Get device language
const deviceLocale = Platform.OS === 'ios'
    ? NativeModules.SettingsManager?.settings?.AppleLocale ||
    NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] || 'el-GR'
    : 'el-GR';

// Determine if device is Greek or not
const isGreekDevice = deviceLocale.startsWith('el');

export default function ThreadScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [threadTitle, setThreadTitle] = useState('Chat');
    const [isRecording, setIsRecording] = useState(false);
    const [transcriptBuffer, setTranscriptBuffer] = useState('');
    const [speechLang, setSpeechLang] = useState<'el-GR' | 'en-US'>(isGreekDevice ? 'el-GR' : 'en-US'); // Default to device language
    const [isLoading, setIsLoading] = useState(false);
    const [llmReady, setLlmReady] = useState(false);
    const llmInitializing = useRef(false);
    const [micStatus, setMicStatus] = useState('Idle');

    useEffect(() => {
        const init = async () => {
            if (id) {
                const t = await ThreadRepo.get(id);
                if (t) setThreadTitle(t.title);
                await loadMessages();
            }

            // Initialize LLM if not already
            if (!llmInitializing.current && !llmReady) {
                llmInitializing.current = true;
                try {
                    await LLMService.init();
                    setLlmReady(true);
                    console.log('LLM initialized successfully');
                } catch (error) {
                    console.error('Failed to initialize LLM:', error);
                    Alert.alert('AI Error', 'Could not initialize AI model. Please check Settings.');
                } finally {
                    llmInitializing.current = false;
                }
            }
        };
        init();
    }, [id]);

    // Update input when transcript changes
    useEffect(() => {
        if (transcriptBuffer) {
            setInputText(transcriptBuffer);
        }
    }, [transcriptBuffer]);

    // Handle speech results
    useSpeechRecognitionEvent('result', (event) => {
        if (event.results && event.results.length > 0) {
            const result = event.results[event.results.length - 1];
            if (result && result.transcript) {
                setTranscriptBuffer(result.transcript);
                setMicStatus('Heard: ' + result.transcript.substring(0, 15) + '...');
            }
        }
    });

    useSpeechRecognitionEvent('speechstart', () => {
        setIsRecording(true);
        setMicStatus('Listening...');
    });
    useSpeechRecognitionEvent('speechend', () => {
        setIsRecording(false);
        setMicStatus('Processing...');
    });
    useSpeechRecognitionEvent('error', (event) => {
        console.error('Speech error:', event);
        setIsRecording(false);
        setMicStatus('Error: ' + event.error + ' - ' + event.message);
        if (event.error === 'not-allowed') {
            Alert.alert('Permission Required', 'Please enable microphone access in Settings.');
        }
    });

    const loadMessages = async () => {
        if (!id) return;
        const data = await MessageRepo.listByThread(id);
        // Chronological order for normal list (oldest -> newest)
        const sorted = [...data].sort((a, b) => a.created_at - b.created_at);
        setMessages(sorted);
    };

    const sendMessage = async () => {
        if (!id || !inputText.trim()) return;

        const userMessage = inputText.trim();
        setInputText('');
        setTranscriptBuffer('');
        setIsLoading(true);

        try {
            if (isRecording) {
                try {
                    await ExpoSpeechRecognitionModule.stop();
                } catch (e: any) {
                    console.error('Stop error:', e);
                } finally {
                    setIsRecording(false);
                    setMicStatus('Stopped');
                }
            }

            // Save user message
            await MessageRepo.create(id, 'user', userMessage);
            await loadMessages();

            // Ensure correct model is loaded (re-init if model changed)
            try {
                await LLMService.init();
                if (!llmReady) setLlmReady(true);
            } catch (e) {
                throw new Error('AI model not ready. Please check Settings.');
            }

            // Build conversation context
            const currentMessages = await MessageRepo.listByThread(id);
            // Get last messages (newest first in repo, so take first immediately)
            // But we need them in chronological order for the prompt
            const contextMessages = [...currentMessages]
                .sort((a, b) => a.created_at - b.created_at) // Chronological (Old -> New)
                .slice(-6); // Keep context short for small local models

            const cleanedContext = contextMessages
                .map((msg) => {
                    if (msg.role !== 'assistant') return msg;
                    return { ...msg, text: sanitizeAssistantResponse(msg.text) };
                })
                .filter((msg) => msg.text.trim().length > 0);

            const systemPrompt = [
                'You are a helpful assistant for a personal knowledge base.',
                'Reply in the same language as the user. Be concise.',
                'Do not invent facts like phone numbers, names, or dates.',
                'If information is missing, say you do not know and ask a follow-up question.',
                'Only output the answer; no labels or special tokens.'
            ].join(' ');
            const chatMessages: ChatMessage[] = [
                { role: 'system', content: systemPrompt },
                ...cleanedContext.map((msg) => ({
                    role: msg.role,
                    content: msg.text
                }))
            ];

            const response = await LLMService.chat(chatMessages);

            // Save AI response
            if (response && response.trim()) {
                await MessageRepo.create(id, 'assistant', response.trim());
            } else {
                await MessageRepo.create(id, 'assistant', '...');
            }

            await loadMessages();
        } catch (error: any) {
            console.error('Error sending message:', error);
            Alert.alert('Error', error.message || 'Failed to get AI response.');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleLanguage = useCallback(() => {
        setSpeechLang(prev => prev === 'el-GR' ? 'en-US' : 'el-GR');
    }, []);

    const toggleRecording = useCallback(async () => {
        if (isRecording) {
            try {
                await ExpoSpeechRecognitionModule.stop();
                setMicStatus('Stopped');
            } catch (e: any) {
                console.error('Stop error:', e);
                setMicStatus('Stop error: ' + e.message);
            }
            setIsRecording(false);
        } else {
            try {
                setMicStatus('Requesting perms...');
                const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
                if (!result.granted) {
                    Alert.alert('Permission Required', 'Please allow microphone and speech recognition access.');
                    setMicStatus('Perm denied');
                    return;
                }
                setTranscriptBuffer('');
                setIsRecording(true);
                setMicStatus('Starting...');

                // Use selected language
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
                setMicStatus('Start error: ' + e.message);
                Alert.alert('Error', 'Could not start speech recognition.');
            }
        }
    }, [isRecording, speechLang]);

    const renderItem = ({ item }: { item: Message }) => {
        const isUser = item.role === 'user';
        const displayText = isUser ? item.text : sanitizeAssistantResponse(item.text);
        return (
            <View style={[styles.bubbleWrapper, isUser ? styles.userWrapper : styles.assistantWrapper]}>
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
                    <Text style={isUser ? styles.userText : styles.assistantText}>{displayText}</Text>
                    <Text style={styles.bubbleMeta}>{item.role}</Text>
                </View>
            </View>
        );
    };

    const handleRename = () => {
        Alert.prompt(
            "Rename Thread",
            "Enter a new name for this thread:",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Save",
                    onPress: async (newName?: string) => {
                        if (newName && newName.trim() && id) {
                            await ThreadRepo.update(id, { title: newName.trim() });
                            setThreadTitle(newName.trim());
                        }
                    }
                }
            ],
            "plain-text",
            threadTitle
        );
    };

    const handleDelete = () => {
        Alert.alert(
            "Delete Thread",
            "Are you sure you want to delete this thread? This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        if (id) {
                            await ThreadRepo.delete(id);
                            router.back(); // Go back to space
                        }
                    }
                }
            ]
        );
    };

    const handleSettings = () => {
        Alert.alert(
            "Thread Options",
            "Choose an action",
            [
                { text: "Rename", onPress: handleRename },
                { text: "Delete", onPress: handleDelete, style: "destructive" },
                { text: "Cancel", style: "cancel" }
            ]
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
                    <FlashList
                        data={messages}
                        renderItem={renderItem}
                        estimatedItemSize={80}
                        contentContainerStyle={{ padding: 16 }}
                    />
                </View>
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder={isRecording ? `Listening... ${micStatus}` : "Type or tap mic..."}
                        placeholderTextColor={isRecording ? Colors.notification : Colors.secondaryText}
                        multiline
                        editable={!isLoading}
                    />
                    {micStatus !== 'Idle' && <Text style={{ fontSize: 10, color: 'gray', position: 'absolute', top: -15, left: 12 }}>{micStatus}</Text>}
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
                            name={isRecording ? "stop" : "mic"}
                            size={28}
                            color={isRecording ? "white" : (isLoading ? Colors.secondaryText : Colors.primary)}
                        />
                    </TouchableOpacity>
                    {isLoading ? (
                        <View style={styles.sendButton}>
                            <ActivityIndicator size="small" color={Colors.primary} />
                        </View>
                    ) : inputText.length > 0 && (
                        <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
                            <Ionicons name="send" size={28} color={Colors.primary} />
                        </TouchableOpacity>
                    )}
                </View>
            </KeyboardAvoidingView>
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
    inputContainer: {
        flexDirection: 'row',
        padding: 12,
        paddingBottom: 10,
        backgroundColor: Colors.card,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        alignItems: 'flex-end'
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
    userText: {
        color: '#fff',
        fontSize: 16,
    },
    assistantText: {
        color: '#000',
        fontSize: 16,
    },
    bubbleMeta: {
        fontSize: 10,
        color: 'rgba(128,128,128, 0.7)',
        marginTop: 4,
        textAlign: 'right'
    }
});

