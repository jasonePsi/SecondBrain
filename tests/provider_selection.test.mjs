import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProviderFromSetting } from '../src/services/ai/provider_selection.ts';

test('resolveProviderFromSetting accepts valid provider ids', () => {
  assert.equal(resolveProviderFromSetting('local', 'cloud'), 'local');
  assert.equal(resolveProviderFromSetting('cloud', 'local'), 'cloud');
});

test('resolveProviderFromSetting falls back for invalid values', () => {
  assert.equal(resolveProviderFromSetting('invalid', 'local'), 'local');
  assert.equal(resolveProviderFromSetting(' Local ', 'cloud'), 'cloud');
  assert.equal(resolveProviderFromSetting('CLOUD', 'local'), 'local');
  assert.equal(resolveProviderFromSetting(null, 'cloud'), 'cloud');
  assert.equal(resolveProviderFromSetting(undefined, 'local'), 'local');
});
