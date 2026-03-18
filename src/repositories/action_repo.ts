import { db } from '../db/client';
import { generateId } from '../utils/id';
import { safeJsonParse, stableJsonStringify } from './json_utils';
import { parseScheduledForValue } from './action_utils';

export interface Action {
  id: string;
  scope_type: string;
  scope_id: string | null;
  type: 'reminder' | 'followup' | 'task';
  payload_json: string;
  schedule_json: string | null;
  scheduled_for: number | null;
  status: 'open' | 'snoozed' | 'done' | 'canceled';
  notification_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface ReminderPayload {
  text?: string;
}

export interface ReminderSchedule {
  timestamp?: number | string;
}

const normalizeActionRow = (row: any): Action => ({
  id: row.id,
  scope_type: row.scope_type,
  scope_id: row.scope_id,
  type: row.type,
  payload_json: row.payload_json,
  schedule_json: row.schedule_json,
  scheduled_for: row.scheduled_for ?? null,
  status: row.status,
  notification_id: row.notification_id,
  created_at: row.created_at,
  updated_at: row.updated_at
});

export const parseActionPayload = <T>(action: Action, fallback: T): T => {
  return safeJsonParse<T>(action.payload_json, fallback);
};

export const parseActionSchedule = <T>(action: Action, fallback: T): T => {
  return safeJsonParse<T>(action.schedule_json, fallback);
};

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
    const now = Date.now();
    const scheduleJson = schedule ? stableJsonStringify(schedule) : null;
    const scheduledFor = scheduleJson ? parseScheduledForValue(safeJsonParse(scheduleJson, {})) : null;

    await db.execute(`INSERT INTO actions (
        id, scope_type, scope_id, type, payload_json, schedule_json, scheduled_for, status, notification_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      id,
      scopeType,
      scopeId || null,
      type,
      stableJsonStringify(payload),
      scheduleJson,
      scheduledFor,
      'open',
      notificationId || null,
      now,
      now
    ]);
    return id;
  },

  getById: async (id: string): Promise<Action | null> => {
    const res = await db.execute('SELECT * FROM actions WHERE id = ? LIMIT 1', [id]);
    const row = (res.rows as any[])?.[0];
    return row ? normalizeActionRow(row) : null;
  },

  getByIds: async (ids: string[]): Promise<Action[]> => {
    if (ids.length === 0) return [];
    const uniqueIds = [...new Set(ids)];
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const res = await db.execute(
      `SELECT * FROM actions WHERE id IN (${placeholders})`,
      uniqueIds
    );
    return ((res.rows as any[]) || []).map(normalizeActionRow);
  },

  listUpcoming: async (limit = 20): Promise<Action[]> => {
    const res = await db.execute(
      `SELECT * FROM actions
       WHERE status = ? AND scheduled_for IS NOT NULL
       ORDER BY scheduled_for ASC, created_at ASC
       LIMIT ?`,
      ['open', limit]
    );
    return ((res.rows as any[]) || []).map(normalizeActionRow);
  },

  listOpenReminders: async (): Promise<Action[]> => {
    const res = await db.execute(
      `SELECT * FROM actions
       WHERE status = ? AND type = ?
       ORDER BY scheduled_for ASC, created_at ASC`,
      ['open', 'reminder']
    );
    return ((res.rows as any[]) || []).map(normalizeActionRow);
  },

  listOpenRemindersWithNotification: async (): Promise<Action[]> => {
    const res = await db.execute(
      `SELECT * FROM actions
       WHERE status = ? AND type = ? AND notification_id IS NOT NULL
       ORDER BY scheduled_for ASC, created_at ASC`,
      ['open', 'reminder']
    );
    return ((res.rows as any[]) || []).map(normalizeActionRow);
  },

  listOpenActionsWithNotification: async (): Promise<Action[]> => {
    const res = await db.execute(
      `SELECT * FROM actions
       WHERE status = ? AND notification_id IS NOT NULL
       ORDER BY created_at ASC`,
      ['open']
    );
    return ((res.rows as any[]) || []).map(normalizeActionRow);
  },

  listOpen: async (limit = 100): Promise<Action[]> => {
    const res = await db.execute(
      `SELECT * FROM actions
       WHERE status = ?
       ORDER BY
         CASE WHEN scheduled_for IS NULL THEN 1 ELSE 0 END ASC,
         scheduled_for ASC,
         created_at DESC
       LIMIT ?`,
      ['open', limit]
    );
    return ((res.rows as any[]) || []).map(normalizeActionRow);
  },

  listOpenByScope: async (
    scopeType: string,
    scopeId: string | null,
    limit = 20
  ): Promise<Action[]> => {
    let sql = `SELECT * FROM actions WHERE status = ? AND scope_type = ?`;
    const params: Array<string | number | null> = ['open', scopeType];

    if (scopeId) {
      sql += ' AND scope_id = ?';
      params.push(scopeId);
    } else {
      sql += ' AND scope_id IS NULL';
    }

    sql += ` ORDER BY
      CASE WHEN scheduled_for IS NULL THEN 1 ELSE 0 END ASC,
      scheduled_for ASC,
      created_at ASC
      LIMIT ?`;
    params.push(limit);

    const res = await db.execute(sql, params);
    return ((res.rows as any[]) || []).map(normalizeActionRow);
  },

  updateNotificationId: async (id: string, notificationId: string | null) => {
    await db.execute(
      'UPDATE actions SET notification_id = ?, updated_at = ? WHERE id = ?',
      [notificationId, Date.now(), id]
    );
  },

  updateSchedule: async (id: string, schedule: ReminderSchedule | null) => {
    const scheduleJson = schedule ? stableJsonStringify(schedule) : null;
    const scheduledFor = scheduleJson ? parseScheduledForValue(safeJsonParse(scheduleJson, {})) : null;
    await db.execute(
      'UPDATE actions SET schedule_json = ?, scheduled_for = ?, updated_at = ? WHERE id = ?',
      [scheduleJson, scheduledFor, Date.now(), id]
    );
  },

  markStatus: async (id: string, status: 'done' | 'canceled' | 'snoozed') => {
    await db.execute('UPDATE actions SET status = ?, updated_at = ? WHERE id = ?', [status, Date.now(), id]);
  }
};
