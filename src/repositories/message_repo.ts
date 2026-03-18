import { db } from '../db/client';
import { generateId } from '../utils/id';
import { buildFtsMatchQuery, buildMessageSnippet } from './message_search_utils';

export interface Message {
    id: string;
    thread_id: string;
    role: 'user' | 'assistant' | 'system';
    text: string;
    meta_json: string | null;
    created_at: number;
}

export interface MessageSearchHit extends Message {
    snippet: string;
    score: number;
}

const normalizeMessageRow = (row: any): Message => ({
    id: row.id,
    thread_id: row.thread_id,
    role: row.role,
    text: row.text,
    meta_json: row.meta_json,
    created_at: row.created_at
});

export const MessageRepo = {
    countByThread: async (threadId: string): Promise<number> => {
        const res = await db.execute('SELECT COUNT(*) as count FROM messages WHERE thread_id = ?', [threadId]);
        const count = (res.rows as any[])?.[0]?.count;
        return typeof count === 'number' ? count : Number(count || 0);
    },

    listByThread: async (threadId: string, limit = 50, offset = 0): Promise<Message[]> => {
        const res = await db.execute('SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [threadId, limit, offset]);
        return ((res.rows as any[]) || []).map(normalizeMessageRow);
    },

    listRecentChronological: async (threadId: string, limit = 12): Promise<Message[]> => {
        const rows = await MessageRepo.listByThread(threadId, limit, 0);
        return [...rows].sort((a, b) => a.created_at - b.created_at);
    },

    listOlderByThread: async (threadId: string, offset: number, limit = 80): Promise<Message[]> => {
        return await MessageRepo.listByThread(threadId, limit, offset);
    },

    create: async (threadId: string, role: 'user' | 'assistant' | 'system', text: string, meta?: any) => {
        const id = generateId();
        await db.execute('INSERT INTO messages (id, thread_id, role, text, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [id, threadId, role, text, meta ? JSON.stringify(meta) : null, Date.now()]);
        return id;
    },

    getById: async (id: string): Promise<Message | null> => {
        const res = await db.execute('SELECT * FROM messages WHERE id = ? LIMIT 1', [id]);
        const row = (res.rows as any[])?.[0];
        return row ? normalizeMessageRow(row) : null;
    },

    getByIds: async (ids: string[]): Promise<Message[]> => {
        if (ids.length === 0) return [];
        const uniqueIds = [...new Set(ids)];
        const placeholders = uniqueIds.map(() => '?').join(', ');
        const res = await db.execute(
            `SELECT * FROM messages WHERE id IN (${placeholders})`,
            uniqueIds
        );
        return ((res.rows as any[]) || []).map(normalizeMessageRow);
    },

    searchSmart: async (query: string, limit = 50): Promise<MessageSearchHit[]> => {
        const trimmed = query.trim();
        if (!trimmed) return [];

        const ftsQuery = buildFtsMatchQuery(trimmed);
        if (!ftsQuery) {
            const fallback = await MessageRepo.search(trimmed, limit);
            return fallback.map((message, index) => ({
                ...message,
                snippet: buildMessageSnippet(message.text),
                score: index + 1
            }));
        }

        try {
            const res = await db.execute(
                `SELECT
                    m.*,
                    snippet(messages_fts, 2, '', '', ' ... ', 12) as snippet_text,
                    bm25(messages_fts) as rank_score
                 FROM messages_fts
                 INNER JOIN messages m ON m.id = messages_fts.id
                 WHERE messages_fts MATCH ?
                 ORDER BY rank_score ASC, m.created_at DESC
                 LIMIT ?`,
                [ftsQuery, limit]
            );

            return ((res.rows as any[]) || []).map((row: any) => ({
                ...normalizeMessageRow(row),
                snippet: typeof row.snippet_text === 'string' && row.snippet_text.trim().length > 0
                    ? row.snippet_text
                    : buildMessageSnippet(row.text || ''),
                score: typeof row.rank_score === 'number' ? row.rank_score : Number(row.rank_score || 0)
            }));
        } catch (error) {
            console.warn('[MessageRepo] FTS search failed, falling back to LIKE search', error);
            const fallback = await MessageRepo.search(trimmed, limit);
            return fallback.map((message, index) => ({
                ...message,
                snippet: buildMessageSnippet(message.text),
                score: index + 1
            }));
        }
    },

    search: async (query: string, limit = 50): Promise<Message[]> => {
        const res = await db.execute('SELECT * FROM messages WHERE text LIKE ? ORDER BY created_at DESC LIMIT ?', [`%${query}%`, limit]);
        return ((res.rows as any[]) || []).map(normalizeMessageRow);
    }
};
