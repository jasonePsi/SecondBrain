import React from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';

type SupportedSpeechLanguage = 'el-GR' | 'en-US';

type ThreadComposerProps = {
    value: string;
    onChangeText: (value: string) => void;
    onSend: () => void;
    onToggleLanguage: () => void;
    onToggleRecording: () => void;
    speechLanguage: SupportedSpeechLanguage;
    isRecording: boolean;
    interactionDisabled: boolean;
    providerUnavailable: boolean;
    sendDisabled: boolean;
    showSendingActivity: boolean;
    placeholder: string;
    statusText: string | null;
    micStatusText: string | null;
};

export function ThreadComposer({
    value,
    onChangeText,
    onSend,
    onToggleLanguage,
    onToggleRecording,
    speechLanguage,
    isRecording,
    interactionDisabled,
    providerUnavailable,
    sendDisabled,
    showSendingActivity,
    placeholder,
    statusText,
    micStatusText
}: ThreadComposerProps) {
    const theme = useAppTheme();

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.colors.background.base,
                    borderTopColor: theme.colors.separator.subtle
                }
            ]}
        >
            {!!statusText && (
                <Text style={[styles.statusText, { color: theme.colors.text.secondary }]}>
                    {statusText}
                </Text>
            )}

            {!!micStatusText && (
                <Text style={[styles.micStatusText, { color: theme.colors.text.tertiary }]}> 
                    {micStatusText}
                </Text>
            )}

            <View
                style={[
                    styles.composerRow,
                    {
                        borderColor: theme.colors.separator.subtle,
                        backgroundColor: theme.colors.background.surface
                    }
                ]}
            >
                <TextInput
                    style={[styles.input, { color: theme.colors.text.primary }]}
                    value={value}
                    onChangeText={onChangeText}
                    accessibilityLabel="Message composer"
                    accessibilityHint="Type your message to the assistant"
                    placeholder={placeholder}
                    placeholderTextColor={isRecording ? theme.colors.status.error : theme.colors.text.tertiary}
                    multiline
                    editable={!interactionDisabled}
                />

                <TouchableOpacity
                    onPress={onToggleLanguage}
                    style={[
                        styles.languageButton,
                        {
                            borderColor: theme.colors.separator.subtle,
                            backgroundColor: theme.colors.background.base
                        }
                    ]}
                    disabled={interactionDisabled}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Mic language ${speechLanguage === 'el-GR' ? 'Greek' : 'English'}`}
                    accessibilityHint="Double tap to switch microphone language"
                    accessibilityState={{ disabled: interactionDisabled }}
                >
                    <Text style={[styles.languageText, { color: theme.colors.text.secondary }]}> 
                        {speechLanguage === 'el-GR' ? 'EL' : 'EN'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={onToggleRecording}
                    style={[
                        styles.micButton,
                        {
                            borderColor: isRecording ? theme.colors.status.error : theme.colors.separator.subtle,
                            backgroundColor: isRecording ? theme.colors.status.error : theme.colors.background.base
                        }
                    ]}
                    disabled={interactionDisabled || providerUnavailable}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={isRecording ? 'Stop voice input' : 'Start voice input'}
                    accessibilityHint={providerUnavailable
                        ? 'Voice input is unavailable until AI recovers'
                        : 'Double tap to dictate a message'}
                    accessibilityState={{ disabled: interactionDisabled || providerUnavailable, busy: isRecording }}
                >
                    <Ionicons
                        name={isRecording ? 'stop' : 'mic'}
                        size={24}
                        color={isRecording
                            ? theme.colors.text.inverse
                            : (interactionDisabled || providerUnavailable
                                ? theme.colors.text.tertiary
                                : theme.colors.tint.primary)}
                    />
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={onSend}
                    style={[
                        styles.sendButton,
                        {
                            borderColor: theme.colors.separator.subtle,
                            backgroundColor: theme.colors.background.base
                        },
                        sendDisabled && styles.sendButtonDisabled
                    ]}
                    disabled={sendDisabled}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                    accessibilityHint={providerUnavailable
                        ? 'Open Settings to restore AI and send messages'
                        : 'Sends your message to the assistant'}
                    accessibilityState={{ disabled: sendDisabled, busy: showSendingActivity }}
                >
                    {showSendingActivity ? (
                        <ActivityIndicator size="small" color={theme.colors.tint.primary} />
                    ) : (
                        <Ionicons
                            name="send"
                            size={20}
                            color={sendDisabled ? theme.colors.text.tertiary : theme.colors.tint.primary}
                        />
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 10,
        borderTopWidth: 1
    },
    statusText: {
        fontSize: 13,
        marginBottom: 6
    },
    micStatusText: {
        fontSize: 12,
        marginBottom: 6
    },
    composerRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        borderWidth: 1,
        borderRadius: 18,
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
        lineHeight: 22,
        minHeight: 42,
        maxHeight: 150,
        marginRight: 6
    },
    languageButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        marginRight: 6,
        alignItems: 'center',
        justifyContent: 'center'
    },
    languageText: {
        fontSize: 11,
        fontWeight: '700'
    },
    micButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center'
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6
    },
    sendButtonDisabled: {
        opacity: 0.55
    }
});
