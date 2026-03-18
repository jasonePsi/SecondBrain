import { open } from '@op-engineering/op-sqlite';

const DB_NAME = 'second_brain.sqlite';

// Single shared SQLite connection used by repositories/services.
export const db = open({
    name: DB_NAME,
});
