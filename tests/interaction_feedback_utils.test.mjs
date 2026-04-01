import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveHapticPattern,
  resolveMotionDurationMs,
  resolvePressScale,
  shouldEnableHaptics
} from '../src/services/interaction_feedback_utils.ts';

test('resolveMotionDurationMs returns zero when reduced motion is enabled', () => {
  assert.equal(resolveMotionDurationMs(180, true), 0);
});

test('resolveMotionDurationMs clamps invalid and oversized durations', () => {
  assert.equal(resolveMotionDurationMs(Number.NaN, false), 0);
  assert.equal(resolveMotionDurationMs(999, false), 600);
});

test('resolvePressScale keeps full scale when not pressed or reduced motion is enabled', () => {
  assert.equal(resolvePressScale(false, false), 1);
  assert.equal(resolvePressScale(true, true), 1);
});

test('resolvePressScale applies subtle press scale when motion is enabled', () => {
  assert.equal(resolvePressScale(true, false), 0.985);
});

test('shouldEnableHaptics only enables haptics on supported mobile platforms', () => {
  assert.equal(shouldEnableHaptics({ reducedMotion: true, platform: 'ios' }), false);
  assert.equal(shouldEnableHaptics({ reducedMotion: false, platform: 'ios' }), true);
  assert.equal(shouldEnableHaptics({ reducedMotion: false, platform: 'android' }), true);
  assert.equal(shouldEnableHaptics({ reducedMotion: false, platform: 'web' }), false);
});

test('resolveHapticPattern returns deterministic patterns by feedback kind', () => {
  assert.equal(resolveHapticPattern('selection', false), 8);
  assert.deepEqual(resolveHapticPattern('success', false), [0, 10]);
  assert.deepEqual(resolveHapticPattern('warning', false), [0, 8, 28, 8]);
  assert.deepEqual(resolveHapticPattern('error', false), [0, 14, 24, 10]);
  assert.equal(resolveHapticPattern('success', true), null);
});
