import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/theme';
import { GroupedSection, InlineBanner, StatusChip } from '../ui';

type SettingsActiveModelCardProps = {
    title: string;
    body: string;
    statusLabel: string;
    statusTone: 'success' | 'warning' | 'neutral' | 'info';
    warningMessage?: string | null;
    fallbackWarningMessage?: string | null;
};

export function SettingsActiveModelCard({
    title,
    body,
    statusLabel,
    statusTone,
    warningMessage,
    fallbackWarningMessage
}: SettingsActiveModelCardProps) {
    const theme = useAppTheme();

    return (
        <GroupedSection style={styles.infoCard}>
            <View style={styles.infoTopRow}>
                <Text style={[styles.infoTitle, { color: theme.colors.text.primary }]}>
                    {title}
                </Text>
                <StatusChip
                    label={statusLabel}
                    tone={statusTone}
                />
            </View>
            <Text style={[styles.infoBody, { color: theme.colors.text.secondary }]}>
                {body}
            </Text>
            {!!warningMessage && (
                <InlineBanner
                    tone="warning"
                    message={warningMessage}
                />
            )}
            {!!fallbackWarningMessage && (
                <InlineBanner
                    tone="warning"
                    message={fallbackWarningMessage}
                />
            )}
        </GroupedSection>
    );
}

const styles = StyleSheet.create({
    infoCard: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 8
    },
    infoTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10
    },
    infoTitle: {
        fontSize: 15,
        fontWeight: '700',
        flex: 1
    },
    infoBody: {
        fontSize: 13,
        lineHeight: 19
    }
});
