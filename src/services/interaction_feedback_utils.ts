export type FeedbackHapticKind = 'selection' | 'success' | 'warning' | 'error';

const clampDuration = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(600, Math.round(value)));
};

export const resolveMotionDurationMs = (
    baseDurationMs: number,
    reducedMotion: boolean
): number => {
    if (reducedMotion) return 0;
    return clampDuration(baseDurationMs);
};

export const resolvePressScale = (
    pressed: boolean,
    reducedMotion: boolean
): number => {
    if (!pressed || reducedMotion) return 1;
    return 0.985;
};

export const shouldEnableHaptics = (input: {
    reducedMotion: boolean;
    platform: string;
}): boolean => {
    if (input.reducedMotion) return false;
    return input.platform === 'ios' || input.platform === 'android';
};

export const resolveHapticPattern = (
    kind: FeedbackHapticKind,
    reducedMotion: boolean
): number | number[] | null => {
    if (reducedMotion) return null;

    if (kind === 'selection') return 8;
    if (kind === 'success') return [0, 10];
    if (kind === 'warning') return [0, 8, 28, 8];
    return [0, 14, 24, 10];
};
