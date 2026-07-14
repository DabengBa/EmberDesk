import { expect } from '@jest/globals';

import { CANONICAL_SQLITE_MIGRATIONS } from '../../src/canonical-sqlite-migrations.js';

export function expectCanonicalDomainSchema(db, { migrationName, tables }) {
    const migration = CANONICAL_SQLITE_MIGRATIONS.find(candidate => candidate.name === migrationName);
    expect(migration).toBeDefined();
    expect(db.prepare(`
        SELECT version, name
        FROM schema_migrations
        WHERE name = ?
    `).get(migrationName)).toEqual({
        version: migration.version,
        name: migrationName,
    });

    for (const table of tables) {
        expect(db.prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = ? AND name = ?
        `).get('table', table)).toEqual({ name: table });
    }
}
