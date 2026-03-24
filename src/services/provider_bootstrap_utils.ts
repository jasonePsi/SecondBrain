export type InitialRoute = '/(tabs)/spaces' | '/(tabs)/settings' | '/onboarding/model-selection';

export const resolveCloudProviderInitialRoute = (cloudAvailable: boolean): InitialRoute => {
    return cloudAvailable ? '/(tabs)/spaces' : '/(tabs)/settings';
};

export const resolveLocalProviderInitialRoute = (params: {
    localAvailable: boolean;
    installedModelCount: number;
}): InitialRoute => {
    if (params.localAvailable) return '/(tabs)/spaces';
    if (params.installedModelCount <= 0) return '/onboarding/model-selection';
    return '/(tabs)/settings';
};
