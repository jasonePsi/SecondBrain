export interface SearchUiStateInput {
    query: string;
    debouncedQuery: string;
    resultsQuery: string;
    isSearching: boolean;
    error: string | null;
    sectionCount: number;
}

export interface SearchUiState {
    normalizedQuery: string;
    isQuerySettled: boolean;
    hasStableResults: boolean;
    showError: boolean;
    showResultList: boolean;
    showNoResults: boolean;
    showIdlePrompt: boolean;
    showTypingHint: boolean;
    showSearchingHint: boolean;
}

export const deriveSearchUiState = ({
    query,
    debouncedQuery,
    resultsQuery,
    isSearching,
    error,
    sectionCount
}: SearchUiStateInput): SearchUiState => {
    const normalizedQuery = query.trim();
    const isQuerySettled = normalizedQuery === debouncedQuery;
    const hasStableResults = isQuerySettled && resultsQuery === normalizedQuery;
    const showError = !!error && normalizedQuery.length > 0 && hasStableResults;
    const showResultList = normalizedQuery.length > 0
        && !showError
        && hasStableResults
        && sectionCount > 0;
    const showNoResults = normalizedQuery.length > 0
        && !isSearching
        && !showError
        && hasStableResults
        && sectionCount === 0;
    const showIdlePrompt = normalizedQuery.length === 0;
    const showTypingHint = normalizedQuery.length > 0 && !isQuerySettled;
    const showSearchingHint = isSearching && debouncedQuery.length > 0 && isQuerySettled;

    return {
        normalizedQuery,
        isQuerySettled,
        hasStableResults,
        showError,
        showResultList,
        showNoResults,
        showIdlePrompt,
        showTypingHint,
        showSearchingHint
    };
};
