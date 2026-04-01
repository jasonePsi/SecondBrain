import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSearchUiState } from '../src/services/search_ui_state_utils.ts';

test('deriveSearchUiState hides stale settled results while query is still changing', () => {
  const state = deriveSearchUiState({
    query: 'new topic',
    debouncedQuery: 'new',
    resultsQuery: 'new',
    isSearching: false,
    error: null,
    sectionCount: 3
  });

  assert.equal(state.showResultList, false);
  assert.equal(state.showTypingHint, true);
  assert.equal(state.hasStableResults, false);
});

test('deriveSearchUiState exposes stable result list only when query/result are synchronized', () => {
  const state = deriveSearchUiState({
    query: 'project notes',
    debouncedQuery: 'project notes',
    resultsQuery: 'project notes',
    isSearching: false,
    error: null,
    sectionCount: 2
  });

  assert.equal(state.showResultList, true);
  assert.equal(state.showNoResults, false);
  assert.equal(state.showError, false);
});

test('deriveSearchUiState keeps clear/reset state empty even if old results existed', () => {
  const state = deriveSearchUiState({
    query: '',
    debouncedQuery: '',
    resultsQuery: '',
    isSearching: false,
    error: null,
    sectionCount: 3
  });

  assert.equal(state.showIdlePrompt, true);
  assert.equal(state.showResultList, false);
  assert.equal(state.showNoResults, false);
  assert.equal(state.showError, false);
});

test('deriveSearchUiState only shows error once the active query is settled', () => {
  const settledErrorState = deriveSearchUiState({
    query: 'invoices',
    debouncedQuery: 'invoices',
    resultsQuery: 'invoices',
    isSearching: false,
    error: 'Search is unavailable.',
    sectionCount: 0
  });
  assert.equal(settledErrorState.showError, true);

  const staleErrorState = deriveSearchUiState({
    query: 'invoice tax',
    debouncedQuery: 'invoices',
    resultsQuery: 'invoices',
    isSearching: false,
    error: 'Search is unavailable.',
    sectionCount: 0
  });
  assert.equal(staleErrorState.showError, false);
});
