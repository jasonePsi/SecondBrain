const readEnvFlag = (name: string): boolean => {
    const env = (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env;
    const raw = env?.[name];
    if (typeof raw !== 'string') return false;
    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

export const isDebugLoggingEnabled = (): boolean => {
    const devFlag = (globalThis as { __DEV__?: unknown }).__DEV__;
    if (devFlag === true) return true;
    return readEnvFlag('SECOND_BRAIN_DEBUG_LOGS') || readEnvFlag('EXPO_PUBLIC_DEBUG_LOGS');
};

export const debugLog = (message?: unknown, ...optionalParams: unknown[]): void => {
    if (!isDebugLoggingEnabled()) return;
    console.log(message, ...optionalParams);
};
