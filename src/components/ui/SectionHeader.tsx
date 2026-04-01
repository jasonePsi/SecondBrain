import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/theme';

type SectionHeaderProps = {
    title: string;
    subtitle?: string;
    trailing?: React.ReactNode;
};

export function SectionHeader({ title, subtitle, trailing }: SectionHeaderProps) {
    const theme = useAppTheme();
    return (
        <View style={styles.wrapper}>
            <View style={styles.textGroup}>
                <Text style={[styles.title, { color: theme.colors.text.primary }]}>{title}</Text>
                {!!subtitle && (
                    <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]}>
                        {subtitle}
                    </Text>
                )}
            </View>
            {!!trailing && <View>{trailing}</View>}
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 8,
        gap: 10
    },
    textGroup: {
        flex: 1
    },
    title: {
        fontSize: 18,
        fontWeight: '700'
    },
    subtitle: {
        marginTop: 2,
        fontSize: 13
    }
});
