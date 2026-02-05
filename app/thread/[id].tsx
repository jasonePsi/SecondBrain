import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Button } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Message, MessageRepo } from '../../src/repositories/message_repo';
import { ThreadRepo } from '../../src/repositories/thread_repo';
import { Colors } from '../../src/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useSpeechRecognitionEvent, ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export default function ThreadScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [threadTitle, setThreadTitle] = useState('Chat');
    const [isRecording, setIsRecording] = useState(false);

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

    useSpeechRecognitionEvent('onSpeechResults', (event) => {
        const result = event.results[0];
        if (result) {
            setInputText(result.transcript);
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
        await loadMessages();
    };

    const startRecording = async () => {
        try {
            const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
            if (!result.granted) {
                alert('Microphone permission denied');
                return;
            }
            setIsRecording(true);
            ExpoSpeechRecognitionModule.start({
                lang: 'en-US',
                interimResults: true,
                maxAlternatives: 1,
            });
        } catch (e) {
            console.error(e);
        }
    };

    const stopRecording = () => {
        setIsRecording(false);
        ExpoSpeechRecognitionModule.stop();
        if (inputText.trim()) {
            sendMessage();
        }
    };

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

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
            <Stack.Screen options={{ title: threadTitle }} />
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
                    placeholder="Type a message..."
                    multiline
                />
                {inputText.length > 0 ? (
                    <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
                        <Ionicons name="send" size={24} color={Colors.primary} />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        onPressIn={startRecording}
                        onPressOut={stopRecording}
                        style={[styles.micButton, isRecording && styles.micActive]}
                    >
                        <Ionicons name={isRecording ? "mic" : "mic-outline"} size={24} color={isRecording ? "white" : Colors.primary} />
                    </TouchableOpacity>
                )}
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    listContainer: {
        flex: 1
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 10,
        backgroundColor: Colors.card,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        alignItems: 'center'
    },
    input: {
        flex: 1,
        backgroundColor: Colors.background,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        maxHeight: 100,
        marginRight: 10
    },
    sendButton: {
        padding: 5
    },
    micButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: Colors.background // or transparent
    },
    micActive: {
        backgroundColor: Colors.notification
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
        color: '#fff'
    },
    assistantText: {
        color: '#000'
    },
    bubbleMeta: {
        fontSize: 10,
        color: 'rgba(128,128,128, 0.7)',
        marginTop: 4,
        textAlign: 'right'
    }
});
