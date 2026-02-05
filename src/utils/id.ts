export function generateId(): string {
    // Simple unique ID generator
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}
