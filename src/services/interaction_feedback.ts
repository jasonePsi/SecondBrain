import { useEffect, useState } from 'react';
import {
    AccessibilityInfo,
    LayoutAnimation,
    Platform,
    UIManager,
    Vibration
} from 'react-native';
import {
    FeedbackHapticKind,
    resolveHapticPattern,
    resolveMotionDurationMs,
    shouldEnableHaptics
} from './interaction_feedback_utils';

let layoutAnimationConfigured = false;
let reducedMotionObserved = false;
let reducedMotionValue = false;
let reducedMotionResolved = false;
let reducedMotionSubscription: { remove?: () => void } | null = null;
const reducedMotionListeners = new Set<(value: boolean) => void>();

const enableLayoutAnimationIfSupported = () => {
    if (layoutAnimationConfigured) return;
    layoutAnimationConfigured = true;

    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
};

const emitReducedMotion = (value: boolean) => {
    reducedMotionValue = value;
    reducedMotionResolved = true;
    reducedMotionListeners.forEach((listener) => listener(value));
};

const ensureReducedMotionObserver = () => {
    if (reducedMotionObserved) return;
    reducedMotionObserved = true;

    AccessibilityInfo.isReduceMotionEnabled()
        .then((value) => emitReducedMotion(!!value))
        .catch(() => emitReducedMotion(false));

    reducedMotionSubscription = AccessibilityInfo.addEventListener?.(
        'reduceMotionChanged',
        (value) => emitReducedMotion(!!value)
    ) || null;
};

export const useReducedMotion = (): boolean => {
    const [reducedMotion, setReducedMotion] = useState(reducedMotionValue);

    useEffect(() => {
        ensureReducedMotionObserver();
        reducedMotionListeners.add(setReducedMotion);
        if (reducedMotionResolved) {
            setReducedMotion(reducedMotionValue);
        }
        return () => {
            reducedMotionListeners.delete(setReducedMotion);
        };
    }, []);

    return reducedMotion;
};

export const runLayoutFeedback = (
    reducedMotion: boolean,
    durationMs = 180
): void => {
    const duration = resolveMotionDurationMs(durationMs, reducedMotion);
    if (duration <= 0) return;

    enableLayoutAnimationIfSupported();
    LayoutAnimation.configureNext({
        duration,
        create: { type: 'easeInEaseOut', property: 'opacity' },
        update: { type: 'easeInEaseOut' },
        delete: { type: 'easeInEaseOut', property: 'opacity' }
    });
};

export const triggerHaptic = (
    kind: FeedbackHapticKind,
    reducedMotion: boolean
): void => {
    if (!shouldEnableHaptics({ reducedMotion, platform: Platform.OS })) return;
    const pattern = resolveHapticPattern(kind, reducedMotion);
    if (pattern === null) return;

    try {
        Vibration.vibrate(pattern);
    } catch {
        // Best-effort feedback only.
    }
};

export const cleanupInteractionFeedback = (): void => {
    reducedMotionListeners.clear();
    reducedMotionSubscription?.remove?.();
    reducedMotionSubscription = null;
    reducedMotionObserved = false;
};
