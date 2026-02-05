import { db } from '../db/client';
import { generateId } from '../utils/id';

export interface Action {
  id: string;
  scope_type: string;
  scope_id: string | null;
  type: 'reminder' | 'followup' | 'task';
  payload_json: string;
  schedule_json: string | null;
  status: 'open' | 'snoozed' | 'done' | 'canceled';
  notification_id: string | null;
  created_at: number;
  updated_at: number;
}

export const ActionRepo = {
  create: async (
    scopeType: string,
    scopeId: string | null,
    type: 'reminder' | 'followup' | 'task',
    payload: any,
    schedule: any,
    notificationId?: string
  ) => {
    const id = generateId();
    await db.execute(`INSERT INTO actions (
        id, scope_type, scope_id, type, payload_json, schedule_json, status, notification_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      id, scopeType, scopeId || null, type, JSON.stringify(payload), schedule ? JSON.stringify(schedule) : null, 'open', notificationId || null, Date.now(), Date.now()
    ]);
    return id;
  },

  listUpcoming: async (limit = 20): Promise<Action[]> => {
    const res = await db.execute('SELECT * FROM actions WHERE status = ? ORDER BY created_at ASC LIMIT ?', ['open', limit]);
    return (res.rows as Action[]) || [];
  },

  markStatus: async (id: string, status: 'done' | 'canceled' | 'snoozed') => {
    await db.execute('UPDATE actions SET status = ?, updated_at = ? WHERE id = ?', [status, Date.now(), id]);
  }
};
