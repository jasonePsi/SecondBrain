import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/theme';
import { AppButton, GroupedSection } from '../ui';

type ThreadProviderBannerProps = {
    message: string;
    retryingProvider: boolean;
    retryDisabled: boolean;
    onRetry: () => void;
    onOpenSettings: () => void;
};

export function ThreadProviderBanner({
    message,
    retryingProvider,
    retryDisabled,
    onRetry,
    onOpenSettings
}: ThreadProviderBannerProps) {
    const theme = useAppTheme();

    return (
        <GroupedSection
            style={[
                styles.card,
                {
                    borderColor: `${theme.colors.status.error}55`,
                    backgroundColor: `${theme.colors.status.error}12`
                }
            ]}
        >
            <Text style={[styles.title, { color: theme.colors.status.error }]}>
                AI is currently unavailable
            </Text>
            <Text style={[styles.message, { color: theme.colors.text.secondary }]}>
                {message}
            </Text>
            <View style={styles.actions}>
                <AppButton
                    size="sm"
                    variant="secondary"
                    label={retryingProvider ? 'Retrying…' : (retryDisabled ? 'Finish current reply first' : 'Retry AI')}
                    onPress={onRetry}
                    disabled={retryDisabled}
                    loading={retryingProvider}
                />
                <AppButton
                    size="sm"
                    variant="secondary"
                    label="Open Settings"
                    onPress={onOpenSettings}
                />
            </View>
        </GroupedSection>
    );
}

const styles = StyleSheet.create({
    card: {
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 11
    },
    title: {
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 4
    },
    message: {
        fontSize: 13,
        lineHeight: 18
    },
    actions: {
        marginTop: 9,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8
    }
});
