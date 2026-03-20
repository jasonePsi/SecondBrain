import { View, Text } from "react-native";
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { runMigrations } from "../src/db/migrations";
import { ModelManager } from "../src/services/ModelManager";
import { LLMService } from "../src/services/LLMService";

type InitialRoute = '/(tabs)/spaces' | '/(tabs)/settings' | '/onboarding/model-selection';

const resolveInitialRoute = async (): Promise<InitialRoute> => {
    const activeProvider = await LLMService.getActiveProvider();
    if (activeProvider === 'cloud') {
        try {
            const cloudStatus = await LLMService.getProviderStatus('cloud');
            if (!cloudStatus.available) {
                console.warn('[AppBootstrap] Cloud provider unavailable during startup', {
                    reason: cloudStatus.reason,
                    detailCode: cloudStatus.detailCode,
                    requestId: cloudStatus.requestId
                });
            }
            return cloudStatus.available ? '/(tabs)/spaces' : '/(tabs)/settings';
        } catch (error: any) {
            console.warn('[AppBootstrap] Cloud status check failed during startup', {
                message: error?.message
            });
            return '/(tabs)/settings';
        }
    }

    const [installedModels, activeModel] = await Promise.all([
        ModelManager.getInstalledModels(),
        ModelManager.getActiveModel()
    ]);

    if (activeModel) return '/(tabs)/spaces';
    if (installedModels.length === 0) return '/onboarding/model-selection';
    return '/(tabs)/settings';
};

export default function Index() {
    const router = useRouter();

    useEffect(() => {
        async function initialize() {
            try {
                console.log('Running database migrations...');
                await runMigrations();
                console.log('Migrations complete');
                const nextRoute = await resolveInitialRoute();
                console.log('Initialization complete, routing to', nextRoute);
                router.replace(nextRoute);
            } catch (error) {
                console.error('Initialization failed:', error);
                // If bootstrap fails, route to Settings so provider/model issues are actionable.
                router.replace('/(tabs)/settings');
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
