import { db } from '../db/client';
import { generateId } from '../utils/id';

export interface Fact {
  id: string;
  scope_type: 'thread' | 'space' | 'global';
  scope_id: string | null;
  entity_id: string | null;
  key: string;
  value_json: string;
  unit: string | null;
  effective_at: number;
  source_message_id: string | null;
  created_at: number;
}

export const FactRepo = {
  getLatest: async (scopeType: 'thread' | 'space' | 'global', scopeId: string | null, key: string): Promise<Fact | null> => {
    let sql = 'SELECT * FROM facts WHERE scope_type = ? AND key = ?';
    const params = [scopeType, key];

    if (scopeId) {
      sql += ' AND scope_id = ?';
      params.push(scopeId);
    } else {
      sql += ' AND scope_id IS NULL';
    }

    sql += ' ORDER BY effective_at DESC LIMIT 1';

    const res = await db.execute(sql, params);
    return res.rows?._array?.[0] || null;
  },

  upsert: async (
    scopeType: 'thread' | 'space' | 'global',
    scopeId: string | null,
    key: string,
    value: any,
    unit?: string,
    entityId?: string,
    sourceMessageId?: string,
    effectiveAt?: number
  ) => {
    const id = generateId();
    await db.execute(\`INSERT INTO facts (
        id, scope_type, scope_id, entity_id, key, value_json, unit, effective_at, source_message_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`, [
        id, scopeType, scopeId || null, entityId || null, key, JSON.stringify(value), unit || null, effectiveAt || Date.now(), sourceMessageId || null, Date.now()
    ]);
    return id;
  },
  
  list: async (scopeType: 'thread' | 'space' | 'global', scopeId: string | null): Promise<Fact[]> => {
    let sql = 'SELECT * FROM facts WHERE scope_type = ?';
    const params = [scopeType];
    if (scopeId) {
        sql += ' AND scope_id = ?';
        params.push(scopeId);
    } else {
        sql += ' AND scope_id IS NULL';
    }
    sql += ' ORDER BY effective_at DESC';
    const res = await db.execute(sql, params);
    return res.rows?._array || [];
  }
};
