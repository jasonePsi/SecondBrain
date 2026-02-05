import { db } from '../db/client';
import { generateId } from '../utils/id';

export interface Space {
    id: string;
    name: string;
    created_at: number;
}

export const SpaceRepo = {
    getAll: async (): Promise<Space[]> => {
        const res = await db.execute('SELECT * FROM spaces ORDER BY name ASC');
        return (res.rows as Space[]) || [];
    },
    create: async (name: string) => {
        const id = generateId();
        await db.execute('INSERT INTO spaces (id, name, created_at) VALUES (?, ?, ?)', [id, name, Date.now()]);
        return id;
    },
    search: async (query: string): Promise<Space[]> => {
        const res = await db.execute('SELECT * FROM spaces WHERE name LIKE ? ORDER BY name ASC', [`%${query}%`]);
        return (res.rows as Space[]) || [];
    }
};
