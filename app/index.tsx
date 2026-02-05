import { View, Text } from "react-native";
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { runMigrations } from "../src/db/migrations";
import { ModelManager } from "../src/services/ModelManager";

export default function Index() {
    const router = useRouter();

    useEffect(() => {
        async function initialize() {
            try {
                console.log('Running database migrations...');
                await runMigrations();
                console.log('Migrations complete');

                // Check if a model is installed
                const activeModel = await ModelManager.getActiveModel();

                if (!activeModel) {
                    console.log('No model installed, redirecting to onboarding...');
                    router.replace('/onboarding/model-selection');
                } else {
                    console.log('Model installed, redirecting to app...');
                    router.replace('/(tabs)/spaces');
                }
            } catch (error) {
                console.error('Initialization failed:', error);
                // Still try to continue to onboarding
                router.replace('/onboarding/model-selection');
            }
        }
        initialize();
    }, []);

    return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text>Second Brain Mobile (Initializing...)</Text>
        </View>
    );
}
