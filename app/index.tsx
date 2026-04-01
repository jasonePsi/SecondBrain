import { useEffect } from "react";
import { useRouter } from "expo-router";
import { runMigrations } from "../src/db/migrations";
import { ModelManager } from "../src/services/ModelManager";
import { LLMService } from "../src/services/LLMService";
import {
    InitialRoute,
    resolveCloudProviderInitialRoute,
    resolveLocalProviderInitialRoute
} from "../src/services/provider_bootstrap_utils";
import {
    resolveFallbackActiveModelId,
    shouldAttemptLocalFallbackActivation
} from "../src/services/model_manager_utils";
import { formatProviderStatusReason } from "../src/services/provider_status_copy_utils";
import { debugLog } from "../src/services/runtime_log";
import { ScreenScaffold, LoadingStateView } from "../src/components/ui";

const resolveInitialRoute = async (): Promise<InitialRoute> => {
    const activeProvider = await LLMService.getActiveProvider();
    if (activeProvider === 'cloud') {
        try {
            const cloudStatus = await LLMService.getProviderStatus('cloud');
            if (!cloudStatus.available) {
                console.warn('[AppBootstrap] Cloud provider unavailable during startup', {
                    reason: formatProviderStatusReason(cloudStatus, {
                        includeDiagnostics: true
                    }),
                    configured: cloudStatus.configured
                });
            }
            return resolveCloudProviderInitialRoute(cloudStatus);
        } catch (error: any) {
            console.warn('[AppBootstrap] Cloud status check failed during startup', {
                message: error?.message
            });
            return '/(tabs)/settings';
        }
    }

    const installedModels = await ModelManager.getInstalledModels();
    const usableInstalledModels = [] as typeof installedModels;
    for (const model of installedModels) {
        if (await ModelManager.isInstalled(model.model_id)) {
            usableInstalledModels.push(model);
        }
    }
    let localStatus = await LLMService.getProviderStatus('local');

    if (shouldAttemptLocalFallbackActivation({
        localProviderAvailable: localStatus.available,
        localStatusDetailCode: localStatus.detailCode,
        usableInstalledModelCount: usableInstalledModels.length
    })) {
        const fallbackModelId = resolveFallbackActiveModelId(true, usableInstalledModels);
        if (fallbackModelId) {
            try {
                debugLog('[AppBootstrap] local provider unavailable, activating fallback model', {
                    detailCode: localStatus.detailCode,
                    fallbackModelId
                });
                await ModelManager.setActiveModel(fallbackModelId);
                await LLMService.release();
                localStatus = await LLMService.getProviderStatus('local');
            } catch (error: any) {
                console.warn('[AppBootstrap] Failed to activate fallback local model during startup', {
                    fallbackModelId,
                    message: error?.message
                });
            }
        }
    }

    if (localStatus.available) return '/(tabs)/spaces';
    console.warn('[AppBootstrap] Local provider unavailable during startup', {
        reason: formatProviderStatusReason(localStatus, {
            includeDiagnostics: true
        }),
        usableInstalledModelCount: usableInstalledModels.length
    });
    return resolveLocalProviderInitialRoute({
        localStatusAvailable: localStatus.available,
        usableInstalledModelCount: usableInstalledModels.length
    });
};

export default function Index() {
    const router = useRouter();

    useEffect(() => {
        async function initialize() {
            try {
                debugLog('[AppBootstrap] running migrations');
                await runMigrations();
                debugLog('[AppBootstrap] migrations complete');
                const nextRoute = await resolveInitialRoute();
                debugLog('[AppBootstrap] initialization complete', { nextRoute });
                router.replace(nextRoute);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error || 'unknown');
                console.error('[AppBootstrap] initialization failed', { message });
                // If bootstrap fails, route to Settings so provider/model issues are actionable.
                router.replace('/(tabs)/settings');
            }
        }
        initialize();
    }, []);

    return (
        <ScreenScaffold edges={['left', 'right', 'top', 'bottom']}>
            <LoadingStateView
                title="Preparing SecondBrain"
                message="Checking migrations, provider status, and startup route."
            />
        </ScreenScaffold>
    );
}
