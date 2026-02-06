import { db } from '../db/client';
import { generateId } from '../utils/id';

export interface Space {
    id: string;
    name: string;
    created_at: number;
    sort_order: number;
}

export const SpaceRepo = {
    getAll: async (): Promise<Space[]> => {
        const res = await db.execute('SELECT * FROM spaces ORDER BY sort_order ASC, created_at ASC');
        return (res.rows as Space[]) || [];
    },
    create: async (name: string) => {
        const id = generateId();
        const now = Date.now();
        const maxRes = await db.execute('SELECT MAX(sort_order) as max_order FROM spaces');
        const maxOrder = Number((maxRes.rows as any[])?.[0]?.max_order ?? -1);
        const nextOrder = Number.isFinite(maxOrder) ? maxOrder + 1 : 0;

        await db.execute(
            'INSERT INTO spaces (id, name, created_at, sort_order) VALUES (?, ?, ?, ?)',
            [id, name, now, nextOrder]
        );
        return id;
    },
    get: async (id: string): Promise<Space | null> => {
        const res = await db.execute('SELECT * FROM spaces WHERE id = ? LIMIT 1', [id]);
        return (res.rows as Space[])?.[0] || null;
    },
    update: async (id: string, updates: Partial<Pick<Space, 'name' | 'sort_order'>>) => {
        const fields: string[] = [];
        const values: Array<string | number> = [];

        if (updates.name !== undefined) {
            fields.push('name = ?');
            values.push(updates.name);
        }

        if (updates.sort_order !== undefined) {
            fields.push('sort_order = ?');
            values.push(updates.sort_order);
        }

        if (fields.length === 0) return;

        values.push(id);
        await db.execute(`UPDATE spaces SET ${fields.join(', ')} WHERE id = ?`, values);
    },
    delete: async (id: string) => {
        await db.transaction(async (tx) => {
            await tx.execute(
                'DELETE FROM messages WHERE thread_id IN (SELECT id FROM threads WHERE space_id = ?)',
                [id]
            );
            await tx.execute('DELETE FROM threads WHERE space_id = ?', [id]);
            await tx.execute('DELETE FROM spaces WHERE id = ?', [id]);
        });
    },
    search: async (query: string): Promise<Space[]> => {
        const res = await db.execute(
            'SELECT * FROM spaces WHERE name LIKE ? ORDER BY sort_order ASC, created_at ASC',
            [`%${query}%`]
        );
        return (res.rows as Space[]) || [];
    }
};
