import { db } from './client';
import { generateId } from '../utils/id'; // Need to create this

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
  CREATE INDEX IF NOT EXISTS idx_facts_lookup ON facts(scope_type, scope_id, key, effective_at DESC);
  CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status, type);
  CREATE INDEX IF NOT EXISTS idx_feed_space ON feed_items(space_id, created_at DESC);
`;

export async function runMigrations() {
  // Create migrations table
  await db.execute('CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, ran_at INTEGER NOT NULL)');

  const result = await db.execute('SELECT MAX(version) as version FROM migrations');
  const currentVersion = (result.rows as any[])?.[0]?.version || 0;

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
}
