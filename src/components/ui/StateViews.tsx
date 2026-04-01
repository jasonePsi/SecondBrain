import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AppButton } from './AppButton';
import { useAppTheme } from '../../theme/theme';

type BaseStateProps = {
    title: string;
    message?: string;
    primaryActionLabel?: string;
    onPrimaryAction?: () => void;
    secondaryActionLabel?: string;
    onSecondaryAction?: () => void;
};

export function LoadingStateView({ title, message }: Pick<BaseStateProps, 'title' | 'message'>) {
    const theme = useAppTheme();
    return (
        <View style={styles.center}>
            <ActivityIndicator size="small" color={theme.colors.tint.primary} />
            <Text style={[styles.title, { color: theme.colors.text.primary }]}>{title}</Text>
            {!!message && <Text style={[styles.message, { color: theme.colors.text.secondary }]}>{message}</Text>}
        </View>
    );
}

export function EmptyStateView({
    title,
    message,
    primaryActionLabel,
    onPrimaryAction
}: BaseStateProps) {
    const theme = useAppTheme();
    return (
        <View style={styles.center}>
            <Text style={[styles.title, { color: theme.colors.text.primary }]}>{title}</Text>
            {!!message && <Text style={[styles.message, { color: theme.colors.text.secondary }]}>{message}</Text>}
            {!!primaryActionLabel && !!onPrimaryAction && (
                <AppButton label={primaryActionLabel} variant="secondary" onPress={onPrimaryAction} />
            )}
        </View>
    );
}

export function ErrorStateView({
    title,
    message,
    primaryActionLabel,
    onPrimaryAction,
    secondaryActionLabel,
    onSecondaryAction
}: BaseStateProps) {
    const theme = useAppTheme();
    return (
        <View style={styles.center}>
            <Text style={[styles.title, { color: theme.colors.status.error }]}>{title}</Text>
            {!!message && <Text style={[styles.message, { color: theme.colors.text.secondary }]}>{message}</Text>}
            <View style={styles.actionRow}>
                {!!primaryActionLabel && !!onPrimaryAction && (
                    <AppButton label={primaryActionLabel} variant="primary" onPress={onPrimaryAction} />
                )}
                {!!secondaryActionLabel && !!onSecondaryAction && (
                    <AppButton label={secondaryActionLabel} variant="secondary" onPress={onSecondaryAction} />
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        gap: 8
    },
    title: {
        fontSize: 17,
        fontWeight: '700',
        textAlign: 'center'
    },
    message: {
        fontSize: 14,
        textAlign: 'center'
    },
    actionRow: {
        marginTop: 8,
        flexDirection: 'row',
        gap: 8
    }
});
