import { db } from '../db/client';
import { generateId } from '../utils/id';
import { normalizeNullableString, stableJsonStringify } from './json_utils';
import { hasFactChanged } from './fact_utils';

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

export interface FactWriteResult {
  factId: string;
  inserted: boolean;
}

type FactScopeType = Fact['scope_type'];

const normalizeFactRow = (row: any): Fact => ({
  id: row.id,
  scope_type: row.scope_type,
  scope_id: row.scope_id,
  entity_id: row.entity_id,
  key: row.key,
  value_json: row.value_json,
  unit: row.unit,
  effective_at: row.effective_at,
  source_message_id: row.source_message_id,
  created_at: row.created_at
});

export const FactRepo = {
  getLatest: async (
    scopeType: FactScopeType,
    scopeId: string | null,
    key: string,
    entityId: string | null = null
  ): Promise<Fact | null> => {
    let sql = 'SELECT * FROM facts WHERE scope_type = ? AND key = ?';
    const params: Array<string | null> = [scopeType, key];

    if (scopeId) {
      sql += ' AND scope_id = ?';
      params.push(scopeId);
    } else {
      sql += ' AND scope_id IS NULL';
    }

    if (entityId) {
      sql += ' AND entity_id = ?';
      params.push(entityId);
    } else {
      sql += ' AND entity_id IS NULL';
    }

    sql += ' ORDER BY effective_at DESC LIMIT 1';

    const res = await db.execute(sql, params);
    const row = (res.rows as any[])?.[0];
    return row ? normalizeFactRow(row) : null;
  },

  getByIds: async (ids: string[]): Promise<Fact[]> => {
    if (ids.length === 0) return [];
    const uniqueIds = [...new Set(ids)];
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const res = await db.execute(
      `SELECT * FROM facts WHERE id IN (${placeholders})`,
      uniqueIds
    );
    return ((res.rows as any[]) || []).map(normalizeFactRow);
  },

  appendIfChanged: async (
    scopeType: FactScopeType,
    scopeId: string | null,
    key: string,
    value: any,
    unit?: string,
    entityId?: string,
    sourceMessageId?: string,
    effectiveAt?: number
  ): Promise<FactWriteResult> => {
    const normalizedScopeId = scopeId || null;
    const normalizedEntityId = entityId || null;
    const normalizedUnit = normalizeNullableString(unit);
    const normalizedValue = stableJsonStringify(value);

    const latest = await FactRepo.getLatest(scopeType, normalizedScopeId, key, normalizedEntityId);
    if (latest) {
      const changed = hasFactChanged({
        latestValueJson: latest.value_json,
        latestUnit: latest.unit,
        nextValue: value,
        nextUnit: unit
      });
      if (!changed) {
        return { factId: latest.id, inserted: false };
      }
    }

    const id = generateId();
    const now = Date.now();
    await db.execute(`INSERT INTO facts (
        id, scope_type, scope_id, entity_id, key, value_json, unit, effective_at, source_message_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      id,
      scopeType,
      normalizedScopeId,
      normalizedEntityId,
      key,
      normalizedValue,
      normalizedUnit,
      effectiveAt || now,
      sourceMessageId || null,
      now
    ]);
    return { factId: id, inserted: true };
  },

  list: async (scopeType: FactScopeType, scopeId: string | null): Promise<Fact[]> => {
    let sql = 'SELECT * FROM facts WHERE scope_type = ?';
    const params: Array<string | null> = [scopeType];
    if (scopeId) {
      sql += ' AND scope_id = ?';
      params.push(scopeId);
    } else {
      sql += ' AND scope_id IS NULL';
    }
    sql += ' ORDER BY effective_at DESC';
    const res = await db.execute(sql, params);
    return ((res.rows as any[]) || []).map(normalizeFactRow);
  },

  listRecent: async (limit = 200): Promise<Fact[]> => {
    const res = await db.execute(
      `SELECT * FROM facts
       ORDER BY effective_at DESC, created_at DESC
       LIMIT ?`,
      [limit]
    );
    return ((res.rows as any[]) || []).map(normalizeFactRow);
  }
};
