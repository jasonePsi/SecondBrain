import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, NativeModules } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Message, MessageRepo } from '../../src/repositories/message_repo';
import { ThreadRepo } from '../../src/repositories/thread_repo';
import { Colors } from '../../src/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useSpeechRecognitionEvent, ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

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

    useEffect(() => {
        const init = async () => {
            if (id) {
                const t = await ThreadRepo.get(id);
                if (t) setThreadTitle(t.title);
                await loadMessages();
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

    // Handle speech results - try multiple event names for robustness
    useSpeechRecognitionEvent('result', (event) => {
        if (event.results && event.results.length > 0) {
            const result = event.results[event.results.length - 1];
            if (result && result[0]) {
                setTranscriptBuffer(result[0].transcript);
            }
        }
    });

    useSpeechRecognitionEvent('speechstart', () => setIsRecording(true));
    useSpeechRecognitionEvent('speechend', () => setIsRecording(false));

    // Handle speech errors
    useSpeechRecognitionEvent('error', (event) => {
        console.error('Speech error:', event);
        setIsRecording(false);
        if (event.error === 'not-allowed') {
            Alert.alert('Permission Required', 'Please allow microphone access in Settings.');
        }
    });

    const loadMessages = async () => {
        if (!id) return;
        const data = await MessageRepo.listByThread(id);
        setMessages(data);
    };

    const sendMessage = async () => {
        if (!id || !inputText.trim()) return;
        await MessageRepo.create(id, 'user', inputText.trim());
        setInputText('');
        setTranscriptBuffer('');
        await loadMessages();
    };

    const toggleLanguage = useCallback(() => {
        setSpeechLang(prev => prev === 'el-GR' ? 'en-US' : 'el-GR');
    }, []);

    const toggleRecording = useCallback(async () => {
        if (isRecording) {
            try {
                await ExpoSpeechRecognitionModule.stop();
            } catch (e) {
                console.error('Stop error:', e);
            }
            setIsRecording(false);
        } else {
            try {
                const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
                if (!result.granted) {
                    Alert.alert('Permission Required', 'Please allow microphone and speech recognition access.');
                    return;
                }
                setTranscriptBuffer('');
                setIsRecording(true);

                // Use selected language, allow server recognition for better mixed language support
                await ExpoSpeechRecognitionModule.start({
                    lang: speechLang,
                    interimResults: true,
                    maxAlternatives: 1,
                    continuous: true,
                    requiresOnDeviceRecognition: false, // Allow server-based for better accuracy
                    addsPunctuation: true, // Auto-punctuate
                });
            } catch (e) {
                console.error('Start error:', e);
                setIsRecording(false);
                Alert.alert('Error', 'Could not start speech recognition. Please try again.');
            }
        }
    }, [isRecording, speechLang]);

    const renderItem = ({ item }: { item: Message }) => {
        const isUser = item.role === 'user';
        return (
            <View style={[styles.bubbleWrapper, isUser ? styles.userWrapper : styles.assistantWrapper]}>
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
                    <Text style={isUser ? styles.userText : styles.assistantText}>{item.text}</Text>
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
                        inverted
                        contentContainerStyle={{ padding: 16 }}
                    />
                </View>
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder={isRecording ? `Listening (${speechLang === 'el-GR' ? 'ΕΛ' : 'EN'})... Tap mic to stop` : "Type or tap mic to speak..."}
                        placeholderTextColor={isRecording ? Colors.notification : Colors.secondaryText}
                        multiline
                    />
                    <TouchableOpacity
                        onPress={toggleLanguage}
                        style={styles.langButton}
                    >
                        <Text style={styles.langText}>{speechLang === 'el-GR' ? '🇬🇷' : '🇬🇧'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={toggleRecording}
                        style={[styles.micButton, isRecording && styles.micActive]}
                    >
                        <Ionicons
                            name={isRecording ? "stop" : "mic"}
                            size={28}
                            color={isRecording ? "white" : Colors.primary}
                        />
                    </TouchableOpacity>
                    {inputText.length > 0 && (
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

