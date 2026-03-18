import { db } from '../db/client';

export interface Entity {
    id: string;
    thread_id: string | null;
    type: string;
    name: string;
    created_at: number;
}

const normalizeEntityRow = (row: any): Entity => ({
    id: row.id,
    thread_id: row.thread_id ?? null,
    type: row.type,
    name: row.name,
    created_at: row.created_at
});

export const EntityRepo = {
    listRecent: async (limit = 120): Promise<Entity[]> => {
        const res = await db.execute(
            `SELECT * FROM entities
             ORDER BY created_at DESC
             LIMIT ?`,
            [limit]
        );
        return ((res.rows as any[]) || []).map(normalizeEntityRow);
    },

    listByThread: async (threadId: string): Promise<Entity[]> => {
        const res = await db.execute(
            `SELECT * FROM entities
             WHERE thread_id = ?
             ORDER BY created_at DESC`,
            [threadId]
        );
        return ((res.rows as any[]) || []).map(normalizeEntityRow);
    }
};
