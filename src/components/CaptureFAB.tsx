import React from 'react';
import { Text, TouchableOpacity, StyleSheet, ViewStyle, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/theme';

interface Props {
    onPress?: () => void;
    onLongPress?: () => void;
    style?: ViewStyle;
    label?: string;
}

export function CaptureFAB({ onPress, onLongPress, style, label = 'New Space' }: Props) {
    const theme = useAppTheme();
    return (
        <TouchableOpacity
            style={[
                styles.fab,
                {
                    backgroundColor: theme.colors.overlay.material,
                    borderColor: theme.colors.separator.subtle
                },
                style
            ]}
            onPress={onPress}
            onLongPress={onLongPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint="Creates a new item"
        >
            <View style={[styles.iconWrap, { backgroundColor: theme.colors.tint.primary }]}>
                <Ionicons name="add" size={20} color={theme.colors.text.inverse} />
            </View>
            <Text style={[styles.label, { color: theme.colors.text.primary }]}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        right: 16,
        bottom: 18,
        minHeight: 52,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.14,
        shadowRadius: 12,
        elevation: 4,
        zIndex: 999
    },
    iconWrap: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center'
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginRight: 2
    }
});
