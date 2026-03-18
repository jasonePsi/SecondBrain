import { db } from './client';

const TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY NOT NULL,
    space_id TEXT NOT NULL,
    title TEXT NOT NULL,
    summary_text TEXT,
    summary_updated_at INTEGER,
    summary_message_count INTEGER NOT NULL DEFAULT 0,
    primary_entity_id TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(space_id) REFERENCES spaces(id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    thread_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    meta_json TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(thread_id) REFERENCES threads(id)
  );
  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY NOT NULL,
    thread_id TEXT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS facts (
    id TEXT PRIMARY KEY NOT NULL,
    scope_type TEXT NOT NULL,
    scope_id TEXT,
    entity_id TEXT,
    key TEXT NOT NULL,
    value_json TEXT,
    unit TEXT,
    effective_at INTEGER NOT NULL,
    source_message_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY NOT NULL,
    scope_type TEXT NOT NULL,
    scope_id TEXT,
    type TEXT NOT NULL,
    payload_json TEXT,
    schedule_json TEXT,
    scheduled_for INTEGER,
    status TEXT NOT NULL,
    notification_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feed_items (
    id TEXT PRIMARY KEY NOT NULL,
    space_id TEXT,
    type TEXT NOT NULL,
    ref_id TEXT,
    scheduled_for INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_facts_lookup ON facts(scope_type, scope_id, key, effective_at DESC);
  CREATE INDEX IF NOT EXISTS idx_facts_scope_entity_key_effective ON facts(scope_type, scope_id, entity_id, key, effective_at DESC);
  CREATE INDEX IF NOT EXISTS idx_actions_status_scheduled ON actions(status, scheduled_for ASC, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_actions_scope ON actions(scope_type, scope_id);
  CREATE INDEX IF NOT EXISTS idx_actions_notification ON actions(notification_id);
  CREATE INDEX IF NOT EXISTS idx_threads_space_created ON threads(space_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages(thread_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_entities_thread ON entities(thread_id);
  CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status, type);
  CREATE INDEX IF NOT EXISTS idx_feed_space ON feed_items(space_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feed_ref_type ON feed_items(type, ref_id);
`;

const parseScheduledForFromScheduleJson = (raw: unknown): number | null => {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;

  try {
    const parsed = JSON.parse(raw);
    const timestamp = (parsed && typeof parsed === 'object')
      ? (parsed as { timestamp?: unknown }).timestamp
      : null;

    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
      return timestamp;
    }
    if (typeof timestamp === 'string') {
      const numeric = Number(timestamp);
      return Number.isFinite(numeric) ? numeric : null;
    }
  } catch {
    return null;
  }

  return null;
};

export async function runMigrations() {
  // Create migrations table
  await db.execute('CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, ran_at INTEGER NOT NULL)');

  const result = await db.execute('SELECT MAX(version) as version FROM migrations');
  const currentVersion = Number((result.rows as any[])?.[0]?.version || 0);

  console.log('Current DB Version:', currentVersion);

  if (currentVersion < 1) {
    console.log('Running Migration 1: Schema...');
    await db.transaction(async (tx) => {
      // Simple splitting by semicolon (naive but works for this SQL)
      const statements = TABLES_SQL.split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const statement of statements) {
        await tx.execute(statement);
      }
      await tx.execute('INSERT INTO migrations (version, ran_at) VALUES (?, ?)', [1, Date.now()]);
    });
  }

  if (currentVersion < 2) {
    console.log('Running Migration 2: Seed Spaces...');
    // We need unique IDs. 
    // Since we don't have uuid package, we'll use a simple random string generator in utils or here.
    // For now, let's just use hardcoded IDs or simple logic.
    const spaces = ['Personal', 'Work', 'Gym', 'Recipes'];
    const now = Date.now();

    await db.transaction(async (tx) => {
      for (const name of spaces) {
        // Generate a simple ID
        const id = Math.random().toString(36).substring(2, 15);
        await tx.execute('INSERT INTO spaces (id, name, created_at) VALUES (?, ?, ?)', [id, name, now]);
      }
      await tx.execute('INSERT INTO migrations (version, ran_at) VALUES (?, ?)', [2, Date.now()]);
    });
  }

  if (currentVersion < 3) {
    console.log('Running Migration 3: Model Settings...');
    await db.transaction(async (tx) => {
      await tx.execute(`
        CREATE TABLE IF NOT EXISTS model_settings (
          id TEXT PRIMARY KEY NOT NULL,
          model_id TEXT NOT NULL,
          path TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          installed_at INTEGER NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 0
        )
      `);
      await tx.execute('INSERT INTO migrations (version, ran_at) VALUES (?, ?)', [3, Date.now()]);
    });
  }

  if (currentVersion < 4) {
    console.log('Running Migration 4: Space ordering...');
    await db.transaction(async (tx) => {
      const tableInfo = await tx.execute('PRAGMA table_info(spaces)');
      const columns = (tableInfo.rows as any[]).map((row) => row.name);

      if (!columns.includes('sort_order')) {
        await tx.execute('ALTER TABLE spaces ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
      }

      const res = await tx.execute('SELECT id FROM spaces ORDER BY name ASC, created_at ASC');
      let order = 0;
      for (const row of res.rows as any[]) {
        await tx.execute('UPDATE spaces SET sort_order = ? WHERE id = ?', [order, row.id]);
        order += 1;
      }

      await tx.execute('INSERT INTO migrations (version, ran_at) VALUES (?, ?)', [4, Date.now()]);
    });
  }

  if (currentVersion < 5) {
    console.log('Running Migration 5: Action scheduling + integrity indexes...');
    await db.transaction(async (tx) => {
      const actionTableInfo = await tx.execute('PRAGMA table_info(actions)');
      const actionColumns = (actionTableInfo.rows as any[]).map((row) => row.name);

      if (!actionColumns.includes('scheduled_for')) {
        await tx.execute('ALTER TABLE actions ADD COLUMN scheduled_for INTEGER');
      }

      const actionRows = await tx.execute(
        'SELECT id, schedule_json, scheduled_for FROM actions WHERE schedule_json IS NOT NULL'
      );
      for (const row of actionRows.rows as any[]) {
        if (row.scheduled_for !== null && row.scheduled_for !== undefined) {
          continue;
        }

        const scheduledFor = parseScheduledForFromScheduleJson(row.schedule_json);
        if (scheduledFor === null) {
          continue;
        }

        await tx.execute(
          'UPDATE actions SET scheduled_for = ? WHERE id = ?',
          [scheduledFor, row.id]
        );
      }

      await tx.execute(
        'CREATE INDEX IF NOT EXISTS idx_facts_scope_entity_key_effective ON facts(scope_type, scope_id, entity_id, key, effective_at DESC)'
      );
      await tx.execute(
        'CREATE INDEX IF NOT EXISTS idx_actions_status_scheduled ON actions(status, scheduled_for ASC, created_at ASC)'
      );
      await tx.execute(
        'CREATE INDEX IF NOT EXISTS idx_actions_scope ON actions(scope_type, scope_id)'
      );
      await tx.execute(
        'CREATE INDEX IF NOT EXISTS idx_actions_notification ON actions(notification_id)'
      );
      await tx.execute(
        'CREATE INDEX IF NOT EXISTS idx_threads_space_created ON threads(space_id, created_at DESC)'
      );
      await tx.execute(
        'CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages(thread_id, created_at DESC)'
      );
      await tx.execute(
        'CREATE INDEX IF NOT EXISTS idx_entities_thread ON entities(thread_id)'
      );
      await tx.execute(
        'CREATE INDEX IF NOT EXISTS idx_feed_ref_type ON feed_items(type, ref_id)'
      );

      await tx.execute('INSERT INTO migrations (version, ran_at) VALUES (?, ?)', [5, Date.now()]);
    });
  }

  if (currentVersion < 6) {
    console.log('Running Migration 6: Thread summaries...');
    await db.transaction(async (tx) => {
      const threadTableInfo = await tx.execute('PRAGMA table_info(threads)');
      const threadColumns = (threadTableInfo.rows as any[]).map((row) => row.name);

      if (!threadColumns.includes('summary_text')) {
        await tx.execute('ALTER TABLE threads ADD COLUMN summary_text TEXT');
      }
      if (!threadColumns.includes('summary_updated_at')) {
        await tx.execute('ALTER TABLE threads ADD COLUMN summary_updated_at INTEGER');
      }
      if (!threadColumns.includes('summary_message_count')) {
        await tx.execute('ALTER TABLE threads ADD COLUMN summary_message_count INTEGER NOT NULL DEFAULT 0');
      }

      await tx.execute(
        'UPDATE threads SET summary_message_count = 0 WHERE summary_message_count IS NULL'
      );
      await tx.execute('INSERT INTO migrations (version, ran_at) VALUES (?, ?)', [6, Date.now()]);
    });
  }

  if (currentVersion < 7) {
    console.log('Running Migration 7: App settings...');
    await db.transaction(async (tx) => {
      await tx.execute(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT,
          updated_at INTEGER NOT NULL
        )
      `);

      await tx.execute('INSERT INTO migrations (version, ran_at) VALUES (?, ?)', [7, Date.now()]);
    });
  }

  if (currentVersion < 8) {
    console.log('Running Migration 8: Message search FTS...');
    try {
      await db.transaction(async (tx) => {
        await tx.execute(`
          CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
          USING fts5(id UNINDEXED, thread_id UNINDEXED, text)
        `);

        await tx.execute('DELETE FROM messages_fts');
        await tx.execute(`
          INSERT INTO messages_fts (id, thread_id, text)
          SELECT id, thread_id, text FROM messages
        `);

        await tx.execute('DROP TRIGGER IF EXISTS messages_ai');
        await tx.execute('DROP TRIGGER IF EXISTS messages_ad');
        await tx.execute('DROP TRIGGER IF EXISTS messages_au');

        await tx.execute(`
          CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
            INSERT INTO messages_fts (id, thread_id, text)
            VALUES (new.id, new.thread_id, new.text);
          END
        `);

        await tx.execute(`
          CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
            DELETE FROM messages_fts WHERE id = old.id;
          END
        `);

        await tx.execute(`
          CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
            DELETE FROM messages_fts WHERE id = old.id;
            INSERT INTO messages_fts (id, thread_id, text)
            VALUES (new.id, new.thread_id, new.text);
          END
        `);

        await tx.execute('INSERT INTO migrations (version, ran_at) VALUES (?, ?)', [8, Date.now()]);
      });
    } catch (error) {
      console.warn('Migration 8 skipped (FTS unavailable). Falling back to LIKE search.', error);
      await db.execute('INSERT INTO migrations (version, ran_at) VALUES (?, ?)', [8, Date.now()]);
    }
  }
}
