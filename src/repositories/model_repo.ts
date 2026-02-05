import { db } from '../db/client';

export interface ModelSetting {
    id: string;
    model_id: string;
    path: string;
    size_bytes: number;
    installed_at: number;
    is_active: boolean;
}

export const ModelRepo = {
    getActiveModel: async (): Promise<ModelSetting | null> => {
        const result = await db.execute(
            'SELECT * FROM model_settings WHERE is_active = 1 LIMIT 1'
        );

        if (result.rows && result.rows.length > 0) {
            const row = result.rows[0] as any;
            return {
                id: row.id,
                model_id: row.model_id,
                path: row.path,
                size_bytes: row.size_bytes,
                installed_at: row.installed_at,
                is_active: row.is_active === 1
            };
        }
        return null;
    },

    setActiveModel: async (modelId: string, path: string, sizeBytes: number): Promise<void> => {
        const now = Date.now();
        const id = Math.random().toString(36).substring(2, 15);

        await db.transaction(async (tx) => {
            // Deactivate all models
            await tx.execute('UPDATE model_settings SET is_active = 0');

            // Check if model already exists
            const existing = await tx.execute(
                'SELECT id FROM model_settings WHERE model_id = ?',
                [modelId]
            );

            if (existing.rows && existing.rows.length > 0) {
                // Update existing
                await tx.execute(
                    'UPDATE model_settings SET is_active = 1, path = ?, size_bytes = ? WHERE model_id = ?',
                    [path, sizeBytes, modelId]
                );
            } else {
                // Insert new
                await tx.execute(
                    'INSERT INTO model_settings (id, model_id, path, size_bytes, installed_at, is_active) VALUES (?, ?, ?, ?, ?, 1)',
                    [id, modelId, path, sizeBytes, now]
                );
            }
        });
    },

    getInstalledModels: async (): Promise<ModelSetting[]> => {
        const result = await db.execute('SELECT * FROM model_settings ORDER BY installed_at DESC');

        if (!result.rows || result.rows.length === 0) {
            return [];
        }

        return result.rows.map((row: any) => ({
            id: row.id,
            model_id: row.model_id,
            path: row.path,
            size_bytes: row.size_bytes,
            installed_at: row.installed_at,
            is_active: row.is_active === 1
        }));
    },

    deleteModel: async (modelId: string): Promise<void> => {
        await db.execute('DELETE FROM model_settings WHERE model_id = ?', [modelId]);
    }
};
