import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/theme';
import { useReducedMotion } from '../../services/interaction_feedback';
import { resolvePressScale } from '../../services/interaction_feedback_utils';

type ListRowProps = {
    title: string;
    subtitle?: string;
    meta?: string;
    onPress?: () => void;
    disabled?: boolean;
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
};

export function ListRow({
    title,
    subtitle,
    meta,
    onPress,
    disabled,
    leading,
    trailing
}: ListRowProps) {
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    const accessibilityLabel = [title, subtitle, meta].filter(Boolean).join('. ');
    const content = (
        <View style={styles.rowContent}>
            {!!leading && <View style={styles.leading}>{leading}</View>}
            <View style={styles.textWrapper}>
                <Text numberOfLines={2} style={[styles.title, { color: theme.colors.text.primary }]}>
                    {title}
                </Text>
                {!!subtitle && (
                    <Text numberOfLines={3} style={[styles.subtitle, { color: theme.colors.text.secondary }]}>
                        {subtitle}
                    </Text>
                )}
                {!!meta && (
                    <Text style={[styles.meta, { color: theme.colors.text.tertiary }]}>{meta}</Text>
                )}
            </View>
            {!!trailing && <View style={styles.trailing}>{trailing}</View>}
        </View>
    );

    if (!onPress) {
        return (
            <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel}>
                {content}
            </View>
        );
    }

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ disabled: !!disabled }}
            accessibilityHint="Opens details"
            hitSlop={6}
            style={({ pressed }) => [
                styles.row,
                pressed && !disabled && {
                    transform: [{ scale: resolvePressScale(true, reducedMotion) }]
                },
                pressed && !disabled && { backgroundColor: theme.colors.interactive.pressed },
                disabled && styles.disabled
            ]}
        >
            {content}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        minHeight: 68,
        paddingHorizontal: 14,
        paddingVertical: 12,
        justifyContent: 'center'
    },
    rowContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    textWrapper: {
        flex: 1
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        lineHeight: 22
    },
    subtitle: {
        marginTop: 2,
        fontSize: 13,
        lineHeight: 18
    },
    meta: {
        marginTop: 4,
        fontSize: 11
    },
    leading: {
        alignItems: 'center',
        justifyContent: 'center'
    },
    trailing: {
        marginLeft: 8,
        alignItems: 'flex-end'
    },
    disabled: {
        opacity: 0.55
    }
});
