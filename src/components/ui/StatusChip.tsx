import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/theme';

type StatusTone = 'info' | 'success' | 'warning' | 'error' | 'neutral';

type StatusChipProps = {
    label: string;
    tone?: StatusTone;
};

export function StatusChip({ label, tone = 'neutral' }: StatusChipProps) {
    const theme = useAppTheme();
    const color = tone === 'info'
        ? theme.colors.status.info
        : tone === 'success'
            ? theme.colors.status.success
            : tone === 'warning'
                ? theme.colors.status.warning
                : tone === 'error'
                    ? theme.colors.status.error
                    : theme.colors.text.tertiary;

    const backgroundColor = tone === 'neutral'
        ? theme.colors.background.grouped
        : `${color}1F`;

    return (
        <View style={[styles.chip, { backgroundColor }]}>
            <Text style={[styles.label, { color }]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    chip: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: 'flex-start'
    },
    label: {
        fontSize: 11,
        fontWeight: '600'
    }
});
