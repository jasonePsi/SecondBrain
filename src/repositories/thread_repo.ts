import { db } from '../db/client';
import { generateId } from '../utils/id';

export interface Thread {
    id: string;
    space_id: string;
    title: string;
    primary_entity_id: string | null;
    created_at: number;
}

export const ThreadRepo = {
    listBySpace: async (spaceId: string): Promise<Thread[]> => {
        const res = await db.execute('SELECT * FROM threads WHERE space_id = ? ORDER BY created_at DESC', [spaceId]);
        return (res.rows as Thread[]) || [];
    },
    create: async (spaceId: string, title: string) => {
        const id = generateId();
        await db.execute('INSERT INTO threads (id, space_id, title, created_at) VALUES (?, ?, ?, ?)', [id, spaceId, title, Date.now()]);
        return id;
    },
    get: async (id: string): Promise<Thread | null> => {
        const res = await db.execute('SELECT * FROM threads WHERE id = ?', [id]);
        return (res.rows as Thread[])?.[0] || null;
    },
    search: async (query: string): Promise<Thread[]> => {
        const res = await db.execute('SELECT * FROM threads WHERE title LIKE ? ORDER BY created_at DESC', [`%${query}%`]);
        return (res.rows as Thread[]) || [];
    },
    update: async (id: string, updates: Partial<Pick<Thread, 'title'>>) => {
        if (updates.title) {
            await db.execute('UPDATE threads SET title = ? WHERE id = ?', [updates.title, id]);
        }
    },
    delete: async (id: string) => {
        await db.execute('DELETE FROM threads WHERE id = ?', [id]);
        await db.execute('DELETE FROM messages WHERE thread_id = ?', [id]); // Cascade delete messages
    }
};
