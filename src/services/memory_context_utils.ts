export interface BudgetMessage {
    role: string;
    content: string;
}

export const clipText = (text: string, maxChars = 240): string => {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars - 1).trimEnd() + '…';
};

export const estimateContextMessageChars = (message: BudgetMessage): number => {
    return message.role.length + message.content.length + 8;
};

export const selectMessagesWithinCharBudget = <T extends BudgetMessage>(
    messages: T[],
    budget: {
        maxChars: number;
        reservedChars: number;
    }
): { selectedMessages: T[]; usedChars: number; droppedCount: number } => {
    const selected: T[] = [];
    let usedChars = budget.reservedChars;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        const estimatedChars = estimateContextMessageChars(message);
        if (usedChars + estimatedChars > budget.maxChars) {
            continue;
        }

        selected.unshift(message);
        usedChars += estimatedChars;
    }

    return {
        selectedMessages: selected,
        usedChars,
        droppedCount: Math.max(0, messages.length - selected.length)
    };
};
