import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Colors } from "../src/constants/Colors";

export default function RootLayout() {
    return (
        <>
            <StatusBar style="dark" />
            <Stack screenOptions={{
                headerShown: true,
                headerStyle: {
                    backgroundColor: Colors.card,
                },
                headerTintColor: Colors.primary,
            }} />
        </>
    );
}
