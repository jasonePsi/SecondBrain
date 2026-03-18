import { View, Text } from "react-native";
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { runMigrations } from "../src/db/migrations";
import { ModelManager } from "../src/services/ModelManager";
import { LLMService } from "../src/services/LLMService";

export default function Index() {
    const router = useRouter();

    useEffect(() => {
        async function initialize() {
            try {
                console.log('Running database migrations...');
                await runMigrations();
                console.log('Migrations complete');

                const activeProvider = await LLMService.getActiveProvider();
                if (activeProvider === 'cloud') {
                    const cloudStatus = await LLMService.getProviderStatus('cloud');
                    if (cloudStatus.available) {
                        console.log('Cloud provider selected and available, redirecting to app...');
                        router.replace('/(tabs)/spaces');
                    } else {
                        console.log('Cloud provider selected but unavailable, redirecting to settings...');
                        router.replace('/(tabs)/settings');
                    }
                    return;
                }

                const installedModels = await ModelManager.getInstalledModels();
                const activeModel = await ModelManager.getActiveModel();

                if (activeModel) {
                    console.log('Active model found, redirecting to app...');
                    router.replace('/(tabs)/spaces');
                } else if (installedModels.length === 0) {
                    console.log('No installed model found, redirecting to onboarding...');
                    router.replace('/onboarding/model-selection');
                } else {
                    console.log('Installed models found but no active model, redirecting to settings...');
                    router.replace('/(tabs)/settings');
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
