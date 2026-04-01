import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/theme';

type ScreenScaffoldProps = {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
    edges?: Edge[];
    padded?: boolean;
};

export function ScreenScaffold({
    children,
    style,
    contentStyle,
    edges = ['left', 'right'],
    padded = false
}: ScreenScaffoldProps) {
    const theme = useAppTheme();
    return (
        <SafeAreaView
            edges={edges}
            style={[styles.container, { backgroundColor: theme.colors.background.base }, style]}
        >
            <View
                style={[
                    styles.content,
                    padded && styles.padded,
                    contentStyle
                ]}
            >
                {children}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1
    },
    content: {
        flex: 1
    },
    padded: {
        paddingHorizontal: 16
    }
});
