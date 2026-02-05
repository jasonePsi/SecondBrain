import { db } from '../db/client';
import { generateId } from '../utils/id';

export interface FeedItem {
    id: string;
    space_id: string | null;
    type: string;
    ref_id: string;
    scheduled_for: number | null;
    created_at: number;
}

export const FeedRepo = {
    create: async (spaceId: string | null, type: string, refId: string, scheduledFor?: number) => {
        const id = generateId();
        await db.execute('INSERT INTO feed_items (id, space_id, type, ref_id, scheduled_for, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [id, spaceId || null, type, refId, scheduledFor || null, Date.now()]);
        return id;
    },

    getFeed: async (spaceId?: string, limit = 50): Promise<FeedItem[]> => {
        let sql = 'SELECT * FROM feed_items';
        const params: any[] = [];

        if (spaceId) {
            sql += ' WHERE space_id = ?';
            params.push(spaceId);
        }

        // Union with upcoming actions logic is handled by feed_items table being populated.
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        const res = await db.execute(sql, params);
        return (res.rows as FeedItem[]) || [];
    }
};
