import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { Message } from '../../repositories/message_repo';
import { useAppTheme } from '../../theme/theme';
import { useReducedMotion } from '../../services/interaction_feedback';

type ThreadMessageBubbleProps = {
    message: Message;
    displayText: string;
    highlighted?: boolean;
};

const formatMessageTime = (value: number): string => {
    return new Date(value).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
};

export function ThreadMessageBubble({
    message,
    displayText,
    highlighted = false
}: ThreadMessageBubbleProps) {
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    const isUser = message.role === 'user';
    const highlightProgress = useRef(new Animated.Value(highlighted ? 1 : 0)).current;

    useEffect(() => {
        if (highlighted) {
            if (reducedMotion) {
                highlightProgress.setValue(1);
                return;
            }
            Animated.sequence([
                Animated.timing(highlightProgress, {
                    toValue: 1,
                    duration: 140,
                    useNativeDriver: true
                }),
                Animated.timing(highlightProgress, {
                    toValue: 0,
                    duration: 380,
                    useNativeDriver: true
                })
            ]).start();
            return;
        }

        Animated.timing(highlightProgress, {
            toValue: 0,
            duration: reducedMotion ? 0 : 120,
            useNativeDriver: true
        }).start();
    }, [highlightProgress, highlighted, reducedMotion]);

    const animatedScale = highlightProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, reducedMotion ? 1 : 1.012]
    });

    return (
        <View style={[styles.wrapper, isUser ? styles.userWrapper : styles.assistantWrapper]}>
            <Animated.View
                style={[
                    styles.bubble,
                    {
                        transform: [{ scale: animatedScale }],
                        backgroundColor: isUser ? theme.colors.tint.primary : theme.colors.background.surface,
                        borderColor: isUser ? theme.colors.tint.primary : theme.colors.separator.subtle
                    },
                    isUser ? styles.userBubble : styles.assistantBubble,
                    highlighted && { borderColor: theme.colors.tint.primary, borderWidth: 2 }
                ]}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${isUser ? 'You' : 'Assistant'} at ${formatMessageTime(message.created_at)}. ${displayText}`}
            >
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.highlightRing,
                        {
                            opacity: highlightProgress,
                            borderColor: theme.colors.tint.primary
                        }
                    ]}
                />
                <Text
                    style={[
                        isUser ? styles.userText : styles.assistantText,
                        { color: isUser ? theme.colors.text.inverse : theme.colors.text.primary }
                    ]}
                >
                    {displayText}
                </Text>
                <Text
                    style={[
                        styles.bubbleMeta,
                        { color: isUser ? 'rgba(255,255,255,0.86)' : theme.colors.text.tertiary }
                    ]}
                >
                    {isUser ? 'You' : 'Assistant'} · {formatMessageTime(message.created_at)}
                </Text>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
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
        maxWidth: '86%',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 18,
        overflow: 'hidden'
    },
    userBubble: {
        borderBottomRightRadius: 6
    },
    assistantBubble: {
        borderBottomLeftRadius: 6,
        borderWidth: 1,
    },
    highlightRing: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 2,
        borderRadius: 18
    },
    userText: {
        fontSize: 16,
        lineHeight: 22
    },
    assistantText: {
        fontSize: 16,
        lineHeight: 22
    },
    bubbleMeta: {
        fontSize: 11,
        marginTop: 8
    }
});
