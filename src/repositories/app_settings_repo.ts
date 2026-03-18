import { db } from '../db/client';

export const AppSettingsRepo = {
    getString: async (key: string): Promise<string | null> => {
        const result = await db.execute(
            'SELECT value FROM app_settings WHERE key = ? LIMIT 1',
            [key]
        );
        const value = (result.rows as any[])?.[0]?.value;
        return typeof value === 'string' ? value : null;
    },

    setString: async (key: string, value: string): Promise<void> => {
        const now = Date.now();
        await db.transaction(async (tx) => {
            const existing = await tx.execute(
                'SELECT key FROM app_settings WHERE key = ? LIMIT 1',
                [key]
            );

            if (existing.rows && existing.rows.length > 0) {
                await tx.execute(
                    'UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?',
                    [value, now, key]
                );
                return;
            }

            await tx.execute(
                'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
                [key, value, now]
            );
        });
    }
};
