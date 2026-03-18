export interface ReminderScheduleLike {
    timestamp?: number | string | null;
}

export const parseScheduledForValue = (schedule: unknown): number | null => {
    if (!schedule || typeof schedule !== 'object') return null;
    const rawTimestamp = (schedule as ReminderScheduleLike).timestamp;
    if (typeof rawTimestamp === 'number' && Number.isFinite(rawTimestamp)) {
        return rawTimestamp;
    }
    if (typeof rawTimestamp === 'string') {
        const parsed = Number(rawTimestamp);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};
