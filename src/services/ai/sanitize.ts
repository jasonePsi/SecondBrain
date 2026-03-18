export const sanitizeAssistantResponse = (text: string): string => {
    let cleaned = text || '';
    const tokenRegex = /<\|[^>]+?\|>/g;
    const firstTokenIndex = cleaned.search(tokenRegex);

    if (firstTokenIndex >= 0) {
        cleaned = cleaned.slice(0, firstTokenIndex);
    }

    cleaned = cleaned.replace(tokenRegex, '');

    const lines = cleaned.split('\n');
    const filtered = lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (/^-\s*\[?ask\]?:/i.test(trimmed)) return false;
        if (/^-\s*response:/i.test(trimmed)) return false;
        if (/^\[?ask\]?:/i.test(trimmed)) return false;
        if (/^response:/i.test(trimmed)) return false;
        return true;
    });

    cleaned = filtered.join('\n').replace(/\n{3,}/g, '\n\n');
    return cleaned.trim();
};
