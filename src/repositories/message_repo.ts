import { db } from '../db/client';
import { generateId } from '../utils/id';

export interface Message {
    id: string;
    thread_id: string;
    role: 'user' | 'assistant' | 'system';
    text: string;
    meta_json: string | null;
    created_at: number;
}

export const MessageRepo = {
    listByThread: async (threadId: string, limit = 50, offset = 0): Promise<Message[]> => {
        const res = await db.execute('SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [threadId, limit, offset]);
        return (res.rows as Message[]) || []; // Note: FlashList usually wants newest first if inverted, so DESC is good.
    },
    create: async (threadId: string, role: 'user' | 'assistant' | 'system', text: string, meta?: any) => {
        const id = generateId();
        await db.execute('INSERT INTO messages (id, thread_id, role, text, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [id, threadId, role, text, meta ? JSON.stringify(meta) : null, Date.now()]);
        return id;
    },
    search: async (query: string, limit = 50): Promise<Message[]> => {
        const res = await db.execute('SELECT * FROM messages WHERE text LIKE ? ORDER BY created_at DESC LIMIT ?', [`%${query}%`, limit]);
        return (res.rows as Message[]) || [];
    }
};
