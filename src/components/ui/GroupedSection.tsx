import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/theme';

type GroupedSectionProps = {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
};

export function GroupedSection({ children, style }: GroupedSectionProps) {
    const theme = useAppTheme();
    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.colors.background.surface,
                    borderColor: theme.colors.separator.subtle
                },
                style
            ]}
        >
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 14,
        borderWidth: 1,
        overflow: 'hidden'
    }
});
