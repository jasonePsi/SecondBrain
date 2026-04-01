import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from './AppButton';
import { useAppTheme } from '../../theme/theme';

type InlineBannerTone = 'info' | 'warning' | 'error';

type InlineBannerProps = {
    tone?: InlineBannerTone;
    message: string;
    actionLabel?: string;
    onActionPress?: () => void;
};

export function InlineBanner({
    tone = 'info',
    message,
    actionLabel,
    onActionPress
}: InlineBannerProps) {
    const theme = useAppTheme();
    const toneColor = tone === 'error'
        ? theme.colors.status.error
        : tone === 'warning'
            ? theme.colors.status.warning
            : theme.colors.status.info;

    return (
        <View style={[styles.container, { backgroundColor: `${toneColor}14`, borderColor: `${toneColor}33` }]}>
            <Text style={[styles.message, { color: toneColor }]}>{message}</Text>
            {!!actionLabel && !!onActionPress && (
                <AppButton
                    label={actionLabel}
                    size="sm"
                    variant="plain"
                    onPress={onActionPress}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    message: {
        flex: 1,
        fontSize: 13
    }
});
