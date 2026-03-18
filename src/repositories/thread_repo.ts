import { db } from '../db/client';
import { generateId } from '../utils/id';

export interface Thread {
    id: string;
    space_id: string;
    title: string;
    summary_text: string | null;
    summary_updated_at: number | null;
    summary_message_count: number;
    primary_entity_id: string | null;
    created_at: number;
}

const normalizeThreadRow = (row: any): Thread => ({
    id: row.id,
    space_id: row.space_id,
    title: row.title,
    summary_text: row.summary_text ?? null,
    summary_updated_at: row.summary_updated_at ?? null,
    summary_message_count: Number(row.summary_message_count ?? 0),
    primary_entity_id: row.primary_entity_id,
    created_at: row.created_at
});

export const ThreadRepo = {
    listBySpace: async (spaceId: string): Promise<Thread[]> => {
        const res = await db.execute('SELECT * FROM threads WHERE space_id = ? ORDER BY created_at DESC', [spaceId]);
        return ((res.rows as any[]) || []).map(normalizeThreadRow);
    },
    create: async (spaceId: string, title: string) => {
        const id = generateId();
        await db.execute('INSERT INTO threads (id, space_id, title, created_at) VALUES (?, ?, ?, ?)', [id, spaceId, title, Date.now()]);
        return id;
    },
    get: async (id: string): Promise<Thread | null> => {
        const res = await db.execute('SELECT * FROM threads WHERE id = ?', [id]);
        const row = (res.rows as any[])?.[0];
        return row ? normalizeThreadRow(row) : null;
    },
    getByIds: async (ids: string[]): Promise<Thread[]> => {
        if (ids.length === 0) return [];
        const uniqueIds = [...new Set(ids)];
        const placeholders = uniqueIds.map(() => '?').join(', ');
        const res = await db.execute(
            `SELECT * FROM threads WHERE id IN (${placeholders})`,
            uniqueIds
        );
        return ((res.rows as any[]) || []).map(normalizeThreadRow);
    },
    search: async (query: string): Promise<Thread[]> => {
        const res = await db.execute('SELECT * FROM threads WHERE title LIKE ? ORDER BY created_at DESC', [`%${query}%`]);
        return ((res.rows as any[]) || []).map(normalizeThreadRow);
    },
    update: async (
        id: string,
        updates: Partial<Pick<Thread, 'title' | 'summary_text' | 'summary_updated_at' | 'summary_message_count'>>
    ) => {
        const fields: string[] = [];
        const values: Array<string | number | null> = [];

        if (typeof updates.title === 'string' && updates.title.trim().length > 0) {
            fields.push('title = ?');
            values.push(updates.title.trim());
        }
        if (updates.summary_text !== undefined) {
            fields.push('summary_text = ?');
            values.push(updates.summary_text);
        }
        if (updates.summary_updated_at !== undefined) {
            fields.push('summary_updated_at = ?');
            values.push(updates.summary_updated_at);
        }
        if (updates.summary_message_count !== undefined) {
            fields.push('summary_message_count = ?');
            values.push(updates.summary_message_count);
        }

        if (fields.length === 0) return;

        values.push(id);
        await db.execute(`UPDATE threads SET ${fields.join(', ')} WHERE id = ?`, values);
    },
    delete: async (id: string) => {
        await db.transaction(async (tx) => {
            await tx.execute(
                `DELETE FROM feed_items
                 WHERE type LIKE 'action%'
                 AND ref_id IN (
                    SELECT id FROM actions
                    WHERE scope_type = 'thread' AND scope_id = ?
                 )`,
                [id]
            );
            await tx.execute(
                `DELETE FROM feed_items
                 WHERE type = 'fact'
                 AND ref_id IN (
                    SELECT id FROM facts
                    WHERE (scope_type = 'thread' AND scope_id = ?)
                       OR entity_id IN (
                            SELECT id FROM entities WHERE thread_id = ?
                       )
                 )`,
                [id, id]
            );
            await tx.execute(
                `DELETE FROM feed_items
                 WHERE type IN ('thread', 'thread_created', 'thread_updated') AND ref_id = ?`,
                [id]
            );

            await tx.execute(
                `DELETE FROM facts
                 WHERE entity_id IN (
                    SELECT id FROM entities WHERE thread_id = ?
                 )`,
                [id]
            );
            await tx.execute(
                `DELETE FROM facts
                 WHERE scope_type = 'thread' AND scope_id = ?`,
                [id]
            );

            await tx.execute('DELETE FROM entities WHERE thread_id = ?', [id]);
            await tx.execute(
                `DELETE FROM actions
                 WHERE scope_type = 'thread' AND scope_id = ?`,
                [id]
            );
            await tx.execute('DELETE FROM messages WHERE thread_id = ?', [id]);
            await tx.execute('DELETE FROM threads WHERE id = ?', [id]);
        });
    }
};
