import { withCanonicalTransaction } from './canonical-sqlite.js';

const migrationBlockers = new WeakMap();

const SCHEMA_MIGRATIONS_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at_ms INTEGER NOT NULL
    );
`;

const INITIAL_PHASE_ONE_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        avatar_filename TEXT NOT NULL UNIQUE,
        internal_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        card_json TEXT NOT NULL,
        shallow_json TEXT NOT NULL,
        world_name TEXT NOT NULL DEFAULT '',
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        deleted_at_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS character_chat_stats (
        character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
        chat_count INTEGER NOT NULL DEFAULT 0,
        chat_size_bytes INTEGER NOT NULL DEFAULT 0,
        date_last_chat_ms INTEGER NOT NULL DEFAULT 0,
        stats_updated_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projection_repairs (
        repair_key TEXT PRIMARY KEY,
        repair_type TEXT NOT NULL,
        character_id TEXT,
        avatar_filename TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        last_attempt_at_ms INTEGER,
        resolved_at_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS characters_avatar_filename_idx
        ON characters (avatar_filename);
    CREATE INDEX IF NOT EXISTS characters_display_name_idx
        ON characters (display_name);
    CREATE INDEX IF NOT EXISTS characters_world_name_idx
        ON characters (world_name);
    CREATE INDEX IF NOT EXISTS character_chat_stats_last_chat_idx
        ON character_chat_stats (date_last_chat_ms);
    CREATE INDEX IF NOT EXISTS projection_repairs_open_idx
        ON projection_repairs (resolved_at_ms, repair_type);
`;

export const CANONICAL_SQLITE_MIGRATIONS = Object.freeze([
    Object.freeze({
        version: 1,
        name: 'phase_one_character_metadata_and_chat_stats',
        sql: INITIAL_PHASE_ONE_SCHEMA_SQL,
    }),
    Object.freeze({
        version: 2,
        name: 'canonical_audit_state',
        sql: `
            CREATE TABLE IF NOT EXISTS canonical_audit_state (
                audit_scope TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                reason TEXT,
                blocking INTEGER NOT NULL DEFAULT 1,
                drift_count INTEGER NOT NULL DEFAULT 0,
                error_count INTEGER NOT NULL DEFAULT 0,
                entry_count INTEGER NOT NULL DEFAULT 0,
                audited_at_ms INTEGER NOT NULL,
                details_json TEXT NOT NULL DEFAULT '{}'
            );
        `,
    }),
    Object.freeze({
        version: 3,
        name: 'world_info_authority',
        sql: `
            CREATE TABLE IF NOT EXISTS world_books (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                payload_json TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                source_mtime_ms INTEGER NOT NULL DEFAULT 0,
                source_size_bytes INTEGER NOT NULL DEFAULT 0,
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                deleted_at_ms INTEGER
            );

            CREATE TABLE IF NOT EXISTS world_book_entries (
                id TEXT PRIMARY KEY,
                world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
                entry_key TEXT NOT NULL,
                uid INTEGER,
                key_json TEXT NOT NULL DEFAULT '[]',
                keysecondary_json TEXT NOT NULL DEFAULT '[]',
                content TEXT NOT NULL DEFAULT '',
                comment TEXT NOT NULL DEFAULT '',
                order_value INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                selective INTEGER NOT NULL DEFAULT 0,
                constant INTEGER NOT NULL DEFAULT 0,
                position INTEGER,
                role INTEGER,
                probability INTEGER,
                depth INTEGER,
                extensions_json TEXT NOT NULL DEFAULT '{}',
                payload_json TEXT NOT NULL DEFAULT '{}',
                updated_at_ms INTEGER NOT NULL,
                deleted_at_ms INTEGER,
                UNIQUE(world_book_id, entry_key)
            );

            CREATE TABLE IF NOT EXISTS world_info_projection_repairs (
                repair_key TEXT PRIMARY KEY,
                world_book_id TEXT,
                world_name TEXT NOT NULL,
                reason TEXT NOT NULL,
                details_json TEXT NOT NULL DEFAULT '{}',
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                last_attempt_at_ms INTEGER,
                resolved_at_ms INTEGER
            );

            CREATE INDEX IF NOT EXISTS world_books_name_idx
                ON world_books (name);
            CREATE INDEX IF NOT EXISTS world_book_entries_book_order_idx
                ON world_book_entries (world_book_id, order_value, entry_key);
            CREATE INDEX IF NOT EXISTS world_info_projection_repairs_open_idx
                ON world_info_projection_repairs (resolved_at_ms, world_name);
        `,
    }),
    Object.freeze({
        version: 4,
        name: 'settings_document_authority',
        sql: `
            CREATE TABLE IF NOT EXISTS settings_documents (
                user_id TEXT PRIMARY KEY,
                revision INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                updated_at_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings_snapshots (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                source_revision INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                created_at_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings_projection_repairs (
                repair_key TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                reason TEXT NOT NULL,
                details_json TEXT NOT NULL DEFAULT '{}',
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                last_attempt_at_ms INTEGER,
                resolved_at_ms INTEGER
            );

            CREATE INDEX IF NOT EXISTS settings_snapshots_user_created_idx
                ON settings_snapshots (user_id, created_at_ms DESC);
            CREATE INDEX IF NOT EXISTS settings_projection_repairs_open_idx
                ON settings_projection_repairs (resolved_at_ms, user_id);
        `,
    }),
    Object.freeze({
        version: 5,
        name: 'secrets_authority',
        sql: `
            CREATE TABLE IF NOT EXISTS secret_records (
                id TEXT PRIMARY KEY,
                secret_key TEXT NOT NULL,
                value TEXT NOT NULL,
                label TEXT NOT NULL DEFAULT 'Unlabeled',
                active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS secret_records_one_active_per_key_idx
                ON secret_records (secret_key)
                WHERE active = 1;
            CREATE INDEX IF NOT EXISTS secret_records_key_idx
                ON secret_records (secret_key, active DESC, created_at_ms ASC, id ASC);

            CREATE TABLE IF NOT EXISTS secret_migration_markers (
                marker_key TEXT PRIMARY KEY,
                source_hash TEXT NOT NULL DEFAULT '',
                imported_at_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS secret_projection_repairs (
                repair_key TEXT PRIMARY KEY,
                secret_key TEXT NOT NULL,
                record_id TEXT,
                operation TEXT NOT NULL,
                error_class TEXT NOT NULL,
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                last_attempt_at_ms INTEGER,
                resolved_at_ms INTEGER
            );

            CREATE INDEX IF NOT EXISTS secret_projection_repairs_open_idx
                ON secret_projection_repairs (resolved_at_ms, secret_key);
        `,
    }),
    Object.freeze({
        version: 6,
        name: 'managed_media_authority',
        sql: `
            CREATE TABLE IF NOT EXISTS managed_blobs (
                id TEXT PRIMARY KEY,
                content_hash TEXT NOT NULL UNIQUE,
                size_bytes INTEGER NOT NULL,
                media_type TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                lifecycle_state TEXT NOT NULL DEFAULT 'active',
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                deleted_at_ms INTEGER
            );

            CREATE TABLE IF NOT EXISTS media_references (
                id TEXT PRIMARY KEY,
                blob_id TEXT NOT NULL REFERENCES managed_blobs(id) ON DELETE RESTRICT,
                owner_type TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                role TEXT NOT NULL,
                display_name TEXT NOT NULL DEFAULT '',
                compatibility_path TEXT NOT NULL UNIQUE,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                deleted_at_ms INTEGER
            );

            CREATE TABLE IF NOT EXISTS media_folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                thumbnail_file TEXT NOT NULL DEFAULT '',
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                deleted_at_ms INTEGER
            );

            CREATE TABLE IF NOT EXISTS media_folder_memberships (
                folder_id TEXT NOT NULL REFERENCES media_folders(id) ON DELETE CASCADE,
                media_reference_id TEXT NOT NULL REFERENCES media_references(id) ON DELETE CASCADE,
                created_at_ms INTEGER NOT NULL,
                PRIMARY KEY (folder_id, media_reference_id)
            );

            CREATE TABLE IF NOT EXISTS managed_media_repairs (
                repair_key TEXT PRIMARY KEY,
                blob_id TEXT REFERENCES managed_blobs(id) ON DELETE SET NULL,
                media_reference_id TEXT REFERENCES media_references(id) ON DELETE SET NULL,
                operation TEXT NOT NULL,
                reason TEXT NOT NULL,
                details_json TEXT NOT NULL DEFAULT '{}',
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                last_attempt_at_ms INTEGER,
                resolved_at_ms INTEGER
            );

            CREATE INDEX IF NOT EXISTS managed_blobs_lifecycle_idx
                ON managed_blobs (lifecycle_state, deleted_at_ms);
            CREATE INDEX IF NOT EXISTS media_references_blob_idx
                ON media_references (blob_id, deleted_at_ms);
            CREATE INDEX IF NOT EXISTS media_references_owner_idx
                ON media_references (owner_type, owner_id, deleted_at_ms);
            CREATE INDEX IF NOT EXISTS media_folder_memberships_reference_idx
                ON media_folder_memberships (media_reference_id);
            CREATE INDEX IF NOT EXISTS managed_media_repairs_open_idx
                ON managed_media_repairs (resolved_at_ms, operation);
        `,
    }),
    Object.freeze({
        version: 7,
        name: 'canonical_chat_foundation',
        sql: `
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                owner_type TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                source_key TEXT NOT NULL,
                source_path TEXT NOT NULL,
                display_name TEXT NOT NULL,
                header_payload_json TEXT NOT NULL,
                source_jsonl TEXT NOT NULL,
                source_mtime_ms INTEGER NOT NULL DEFAULT 0,
                source_size_bytes INTEGER NOT NULL DEFAULT 0,
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                UNIQUE(owner_type, owner_id, source_key),
                UNIQUE(owner_type, owner_id, source_path)
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
                message_order INTEGER NOT NULL,
                identity_key TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at_ms INTEGER,
                UNIQUE(session_id, message_order),
                UNIQUE(session_id, identity_key)
            );

            CREATE TABLE IF NOT EXISTS chat_message_swipes (
                message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
                swipe_order INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                PRIMARY KEY (message_id, swipe_order)
            );

            CREATE TABLE IF NOT EXISTS chat_attachment_refs (
                message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
                blob_id TEXT NOT NULL REFERENCES managed_blobs(id) ON DELETE RESTRICT,
                role TEXT NOT NULL,
                compatibility_json TEXT NOT NULL DEFAULT '{}',
                PRIMARY KEY (message_id, blob_id, role, compatibility_json)
            );

            CREATE INDEX IF NOT EXISTS chat_sessions_owner_path_idx
                ON chat_sessions (owner_type, owner_id, source_path);
            CREATE INDEX IF NOT EXISTS chat_messages_session_order_idx
                ON chat_messages (session_id, message_order);
            CREATE INDEX IF NOT EXISTS chat_attachment_refs_blob_idx
                ON chat_attachment_refs (blob_id);
        `,
    }),
]);

export class CanonicalMigrationBlockedError extends Error {
    /**
     * @param {string} message
     * @param {ReturnType<typeof buildBlockedStatus>} status
     */
    constructor(message, status) {
        super(message);
        this.name = 'CanonicalMigrationBlockedError';
        this.status = status;
    }
}

function ensureSchemaMigrationsTable(db) {
    db.exec(SCHEMA_MIGRATIONS_TABLE_SQL);
}

function getAppliedMigrations(db) {
    ensureSchemaMigrationsTable(db);
    return db.prepare('SELECT version, name FROM schema_migrations ORDER BY version ASC').all().map(row => ({
        version: Number(row.version),
        name: String(row.name),
    }));
}

function getAppliedVersions(db) {
    return getAppliedMigrations(db).map(row => row.version);
}

function getTargetVersion(migrations) {
    if (migrations.length === 0) {
        return 0;
    }
    return Number(migrations[migrations.length - 1].version);
}

function getCurrentVersion(db) {
    const versions = getAppliedVersions(db);
    return versions.length === 0 ? 0 : versions[versions.length - 1];
}

function getCurrentVersionFromAppliedMigrations(appliedMigrations) {
    return appliedMigrations.length === 0
        ? 0
        : appliedMigrations[appliedMigrations.length - 1].version;
}

function validateMigrationCatalog(migrations) {
    let lastVersion = 0;
    for (const migration of migrations) {
        if (!Number.isInteger(migration.version) || migration.version <= 0) {
            throw new Error(`Canonical SQLite migration version must be a positive integer: ${migration.version}`);
        }
        if (migration.version <= lastVersion) {
            throw new Error(`Canonical SQLite migrations must be strictly ordered: ${migration.version}`);
        }
        if (typeof migration.name !== 'string' || migration.name.length === 0) {
            throw new Error(`Canonical SQLite migration ${migration.version} is missing a stable name`);
        }
        if (typeof migration.sql !== 'string' || migration.sql.length === 0) {
            throw new Error(`Canonical SQLite migration ${migration.version} is missing SQL`);
        }
        lastVersion = migration.version;
    }
}

function buildOkStatus({ currentVersion, targetVersion, appliedVersions }) {
    return {
        ok: true,
        blockedReason: null,
        currentVersion,
        targetVersion,
        appliedVersions,
        failedVersion: null,
        failedName: null,
        errorMessage: null,
    };
}

function buildBlockedStatus({
    currentVersion,
    targetVersion,
    appliedVersions = [],
    failedVersion = null,
    failedName = null,
    errorMessage,
}) {
    const blockerDetail = failedVersion && failedName
        ? `migration ${failedVersion} (${failedName})`
        : 'migration status';
    return {
        ok: false,
        blockedReason: `Canonical SQLite blocked by ${blockerDetail}: ${errorMessage}`,
        currentVersion,
        targetVersion,
        appliedVersions,
        failedVersion,
        failedName,
        errorMessage,
    };
}

function getAppliedMigrationJournalError(appliedMigrations, migrations) {
    for (let index = 0; index < appliedMigrations.length; index += 1) {
        const applied = appliedMigrations[index];
        const expected = migrations[index];

        if (!expected) {
            return `applied migration ${applied.version} (${applied.name}) is not present in the current catalog`;
        }

        if (applied.version !== expected.version) {
            return `applied migration journal diverges at position ${index + 1}: expected version ${expected.version} (${expected.name}) but found version ${applied.version} (${applied.name})`;
        }

        if (applied.name !== expected.name) {
            return `applied migration journal diverges at version ${applied.version}: expected name ${expected.name} but found ${applied.name}`;
        }
    }

    return null;
}

function rememberMigrationStatus(db, status) {
    if (status.ok) {
        migrationBlockers.delete(db);
        return status;
    }
    migrationBlockers.set(db, status);
    return status;
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{
 *   migrations?: Array<{version: number, name: string, sql: string}>,
 *   strict?: boolean,
 *   nowMs?: number,
 * }} [options]
 */
export function runCanonicalMigrations(db, options = {}) {
    const migrations = options.migrations ?? CANONICAL_SQLITE_MIGRATIONS;
    const strict = !!options.strict;
    const nowMs = Number.isInteger(options.nowMs) ? options.nowMs : Date.now();

    validateMigrationCatalog(migrations);
    ensureSchemaMigrationsTable(db);

    const targetVersion = getTargetVersion(migrations);
    const existingAppliedMigrations = getAppliedMigrations(db);
    const existingAppliedVersions = existingAppliedMigrations.map(row => row.version);
    const currentVersion = getCurrentVersionFromAppliedMigrations(existingAppliedMigrations);
    if (currentVersion > targetVersion) {
        const status = rememberMigrationStatus(db, buildBlockedStatus({
            currentVersion,
            targetVersion,
            appliedVersions: existingAppliedVersions,
            errorMessage: `database schema version ${currentVersion} is newer than supported target ${targetVersion}`,
        }));
        if (strict) {
            throw new CanonicalMigrationBlockedError(status.blockedReason, status);
        }
        return status;
    }

    const appliedMigrationJournalError = getAppliedMigrationJournalError(existingAppliedMigrations, migrations);
    if (appliedMigrationJournalError) {
        const status = rememberMigrationStatus(db, buildBlockedStatus({
            currentVersion,
            targetVersion,
            appliedVersions: existingAppliedVersions,
            errorMessage: appliedMigrationJournalError,
        }));
        if (strict) {
            throw new CanonicalMigrationBlockedError(status.blockedReason, status);
        }
        return status;
    }

    const pendingMigrations = migrations.slice(existingAppliedMigrations.length);
    const appliedVersions = [];

    for (const migration of pendingMigrations) {
        try {
            withCanonicalTransaction(db, txnDb => {
                txnDb.exec(migration.sql);
                txnDb.prepare(`
                    INSERT INTO schema_migrations (version, name, applied_at_ms)
                    VALUES (?, ?, ?)
                `).run(migration.version, migration.name, nowMs);
            });
            appliedVersions.push(migration.version);
        } catch (error) {
            const status = rememberMigrationStatus(db, buildBlockedStatus({
                currentVersion: getCurrentVersion(db),
                targetVersion,
                appliedVersions,
                failedVersion: migration.version,
                failedName: migration.name,
                errorMessage: String(error?.message ?? error ?? ''),
            }));
            if (strict) {
                throw new CanonicalMigrationBlockedError(status.blockedReason, status);
            }
            return status;
        }
    }

    const status = buildOkStatus({
        currentVersion: getCurrentVersion(db),
        targetVersion,
        appliedVersions,
    });
    return rememberMigrationStatus(db, status);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{
 *   migrations?: Array<{version: number, name: string, sql: string}>,
 *   strict?: boolean,
 * }} [options]
 */
export function getCanonicalMigrationStatus(db, options = {}) {
    const migrations = options.migrations ?? CANONICAL_SQLITE_MIGRATIONS;
    validateMigrationCatalog(migrations);

    const rememberedStatus = migrationBlockers.get(db);
    if (rememberedStatus) {
        return rememberedStatus;
    }

    const targetVersion = getTargetVersion(migrations);
    const appliedMigrations = getAppliedMigrations(db);
    const appliedVersions = appliedMigrations.map(row => row.version);
    const currentVersion = getCurrentVersionFromAppliedMigrations(appliedMigrations);
    if (currentVersion > targetVersion) {
        return buildBlockedStatus({
            currentVersion,
            targetVersion,
            appliedVersions,
            errorMessage: `database schema version ${currentVersion} is newer than supported target ${targetVersion}`,
        });
    }

    const appliedMigrationJournalError = getAppliedMigrationJournalError(appliedMigrations, migrations);
    if (appliedMigrationJournalError) {
        return buildBlockedStatus({
            currentVersion,
            targetVersion,
            appliedVersions,
            errorMessage: appliedMigrationJournalError,
        });
    }

    return buildOkStatus({
        currentVersion,
        targetVersion,
        appliedVersions,
    });
}
