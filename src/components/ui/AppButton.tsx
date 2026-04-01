import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../theme/theme';
import { resolvePressScale } from '../../services/interaction_feedback_utils';
import { useReducedMotion } from '../../services/interaction_feedback';

type AppButtonVariant = 'primary' | 'secondary' | 'destructive' | 'plain';
type AppButtonSize = 'sm' | 'md';

type AppButtonProps = {
    label: string;
    onPress: () => void;
    variant?: AppButtonVariant;
    size?: AppButtonSize;
    disabled?: boolean;
    loading?: boolean;
};

export function AppButton({
    label,
    onPress,
    variant = 'primary',
    size = 'md',
    disabled,
    loading
}: AppButtonProps) {
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    const isDisabled = !!disabled || !!loading;

    const backgroundColor = variant === 'primary'
        ? theme.colors.tint.primary
        : variant === 'secondary'
            ? theme.colors.background.elevated
            : variant === 'destructive'
                ? theme.colors.destructive.primary
                : 'transparent';

    const borderColor = variant === 'secondary'
        ? theme.colors.separator.subtle
        : 'transparent';

    const textColor = variant === 'primary' || variant === 'destructive'
        ? theme.colors.text.inverse
        : theme.colors.tint.primary;

    return (
        <Pressable
            disabled={isDisabled}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: isDisabled, busy: !!loading }}
            style={({ pressed }) => [
                styles.base,
                size === 'sm' ? styles.small : styles.medium,
                { backgroundColor, borderColor },
                pressed && !isDisabled && {
                    opacity: 0.82,
                    transform: [{ scale: resolvePressScale(true, reducedMotion) }]
                },
                isDisabled && { opacity: 0.55 }
            ]}
        >
            {loading ? (
                <ActivityIndicator size="small" color={textColor} />
            ) : (
                <Text style={[styles.label, { color: textColor }]}>{label}</Text>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    base: {
        borderRadius: 10,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center'
    },
    medium: {
        minHeight: 44,
        paddingHorizontal: 14
    },
    small: {
        minHeight: 36,
        paddingHorizontal: 10
    },
    label: {
        fontSize: 14,
        fontWeight: '600'
    }
});
