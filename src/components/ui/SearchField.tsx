import React from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';

type SearchFieldProps = {
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    searching?: boolean;
    onClear?: () => void;
    accessibilityLabel?: string;
};

export function SearchField({
    value,
    onChangeText,
    placeholder,
    searching = false,
    onClear,
    accessibilityLabel = 'Search'
}: SearchFieldProps) {
    const theme = useAppTheme();
    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.colors.background.surface,
                    borderColor: theme.colors.separator.subtle
                }
            ]}
        >
            <Ionicons name="search" size={18} color={theme.colors.text.tertiary} style={styles.icon} />
            <TextInput
                style={[styles.input, { color: theme.colors.text.primary }]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={theme.colors.text.tertiary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel={accessibilityLabel}
            />
            {searching && <ActivityIndicator size="small" color={theme.colors.tint.primary} style={styles.spinner} />}
            {value.length > 0 && !!onClear && (
                <TouchableOpacity
                    onPress={onClear}
                    style={styles.clearButton}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search query"
                    accessibilityHint="Clears the current text and results"
                    hitSlop={6}
                >
                    <Ionicons name="close-circle" size={18} color={theme.colors.text.tertiary} />
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 1,
        minHeight: 46,
        paddingHorizontal: 10
    },
    icon: {
        marginRight: 8
    },
    input: {
        flex: 1,
        fontSize: 16,
        paddingVertical: 10
    },
    spinner: {
        marginRight: 6
    },
    clearButton: {
        minWidth: 32,
        minHeight: 32,
        alignItems: 'center',
        justifyContent: 'center'
    }
});
