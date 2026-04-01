import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAppTheme } from "../src/theme/theme";
import { useReducedMotion } from "../src/services/interaction_feedback";

export default function RootLayout() {
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    return (
        <>
            <StatusBar style={theme.isDark ? "light" : "dark"} />
            <Stack
                screenOptions={{
                    animation: reducedMotion ? 'none' : 'default',
                    headerShown: true,
                    contentStyle: {
                        backgroundColor: theme.colors.background.base
                    },
                    headerShadowVisible: false,
                    headerStyle: {
                        backgroundColor: theme.colors.background.base
                    },
                    headerTitleStyle: {
                        color: theme.colors.text.primary,
                        fontWeight: '600'
                    },
                    headerTintColor: theme.colors.tint.primary
                }}
            />
        </>
    );
}
