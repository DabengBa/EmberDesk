import type { DatabaseSync } from 'node:sqlite';
type Flags = { enabled?: boolean; shadowImport?: boolean; reads?: boolean; writes?: boolean; strict?: boolean; chatStats?: boolean; [key: string]: boolean | undefined };
type Audit = { blocking: boolean; reason?: string | null };
type Repair = { repairKey: string };
type Registry = { get: (key: string) => { listOpenRepairs: (db: DatabaseSync) => Repair[]; getFeatureFlags: () => Flags } };
type Options = { db?: DatabaseSync; sliceKey?: string | null; featureFlags?: Flags; persistedAuditStatus?: Audit | null; phase?: string; listOpenRepairs?: ((db: DatabaseSync) => Repair[]) | null; openRepairCode?: string | null; allowProtocolPending?: boolean; protocolRepairPrefix?: string | null; includeChatStatsPhase?: boolean | null; phaseOrder?: readonly string[] | null; registry?: Registry | null };
type Blocker = { code: string | null; severity: string; details: { sliceKey?: string | null; illegalFlags?: string[]; auditReason?: string | null; auditBlocking?: boolean; repairCount?: number; repairKeys?: string[]; protocolPendingCount?: number } };

const DEFAULT_PHASE_ORDER = Object.freeze(['enabled', 'shadowImport', 'reads', 'writes', 'chatStats']);

function hasEarlierPhaseGap(featureFlags: Flags, flagName: string, phaseOrder: readonly string[] = DEFAULT_PHASE_ORDER) {
    const index = phaseOrder.indexOf(flagName);
    if (index <= 0) {
        return false;
    }
    for (let i = 0; i < index; i += 1) {
        const earlier = phaseOrder[i];
        if (earlier === 'enabled') {
            if (!featureFlags.enabled) {
                return true;
            }
            continue;
        }
        if (!featureFlags[earlier]) {
            return true;
        }
    }
    return false;
}

/**
 * Generic flag legality for a slice.
 * Character flags keep chatStats as an optional later phase.
 * Other slices may omit chatStats.
 */
export function getCanonicalSliceFlagContractStatus(featureFlags: Flags = {}, {
    phaseOrder = null,
}: { phaseOrder?: readonly string[] | null } = {}) {
    const hasChatStats = Object.prototype.hasOwnProperty.call(featureFlags, 'chatStats')
        || (Array.isArray(phaseOrder) && phaseOrder.includes('chatStats'));
    const order = phaseOrder ?? (
        hasChatStats
            ? DEFAULT_PHASE_ORDER
            : Object.freeze(['enabled', 'shadowImport', 'reads', 'writes'])
    );

    const normalized: Flags = {
        enabled: !!featureFlags.enabled,
        shadowImport: !!featureFlags.shadowImport,
        reads: !!featureFlags.reads,
        writes: !!featureFlags.writes,
        strict: !!featureFlags.strict,
    };
    if (order.includes('chatStats')) {
        normalized.chatStats = !!featureFlags.chatStats;
    }

    const illegalFlags = order
        .filter(flagName => flagName !== 'enabled')
        .filter(flagName => normalized[flagName] && hasEarlierPhaseGap(normalized, flagName, order));

    return {
        ok: illegalFlags.length === 0,
        featureFlags: normalized,
        illegalFlags,
        blockingReason: illegalFlags.length
            ? `illegal_flag_combination:${illegalFlags[0]}`
            : null,
    };
}

export function getCanonicalFlagContractStatus(featureFlags: Flags = {}) {
    return getCanonicalSliceFlagContractStatus(featureFlags, {
        phaseOrder: DEFAULT_PHASE_ORDER,
    });
}

function parseRepairDetails(detailsJson: unknown) {
    try {
        return JSON.parse(String(detailsJson ?? '{}'));
    } catch {
        return {};
    }
}

export function listOpenProjectionRepairs(db: DatabaseSync) {
    let rows = [];
    try {
        rows = db.prepare(`
            SELECT
                repair_key,
                repair_type,
                character_id,
                avatar_filename,
                reason,
                details_json,
                created_at_ms,
                updated_at_ms,
                last_attempt_at_ms,
                resolved_at_ms
            FROM projection_repairs
            WHERE resolved_at_ms IS NULL
            ORDER BY created_at_ms ASC, repair_key ASC
        `).all();
    } catch (error) {
        if (String((error as { message?: unknown } | null)?.message ?? '').includes('no such table: projection_repairs')) {
            return [];
        }
        throw error;
    }

    return rows.map(row => ({
        repairKey: String(row.repair_key),
        repairType: String(row.repair_type),
        characterId: row.character_id ? String(row.character_id) : null,
        avatarFilename: String(row.avatar_filename ?? ''),
        reason: String(row.reason ?? ''),
        details: parseRepairDetails(row.details_json),
        createdAtMs: Number(row.created_at_ms ?? 0),
        updatedAtMs: Number(row.updated_at_ms ?? 0),
        lastAttemptAtMs: row.last_attempt_at_ms == null ? null : Number(row.last_attempt_at_ms),
        resolvedAtMs: row.resolved_at_ms == null ? null : Number(row.resolved_at_ms),
    }));
}

/**
 * Build rollback blockers for one slice.
 * Callers inject listOpenRepairs so character and world_info stay isolated.
 */
export function buildCanonicalSliceRollbackBlockers({
    db,
    sliceKey = null,
    featureFlags = {},
    persistedAuditStatus = null,
    phase = 'writes',
    listOpenRepairs = null,
    openRepairCode = null,
    allowProtocolPending = false,
    protocolRepairPrefix = null,
    includeChatStatsPhase = null,
    phaseOrder = null,
    registry = null,
}: Options = {}) {
    let resolvedListOpenRepairs = listOpenRepairs;
    let resolvedOpenRepairCode = openRepairCode;
    let resolvedIncludeChatStatsPhase = includeChatStatsPhase;
    let resolvedFeatureFlags = featureFlags ?? {};
    let resolvedAuditStatus = persistedAuditStatus;

    if (sliceKey && typeof resolvedListOpenRepairs !== 'function') {
        // Dynamic import would be async; use a deferred getter registered at module load
        // by the slice registry to avoid circular ESM initialization issues.
        const activeRegistry = registry ?? getRegisteredDefaultSliceRegistry();
        if (activeRegistry) {
            const slice = activeRegistry.get(sliceKey);
            resolvedListOpenRepairs = (database) => slice.listOpenRepairs(database);
            if (resolvedOpenRepairCode == null) {
                if (sliceKey === 'world_info') {
                    resolvedOpenRepairCode = 'open_world_info_projection_repairs';
                } else if (sliceKey === 'settings') {
                    resolvedOpenRepairCode = 'open_settings_projection_repairs';
                } else if (sliceKey === 'secrets') {
                    resolvedOpenRepairCode = 'open_secret_projection_repairs';
                } else {
                    resolvedOpenRepairCode = 'open_projection_repairs';
                }
            }
            if (resolvedIncludeChatStatsPhase == null) {
                resolvedIncludeChatStatsPhase = sliceKey === 'characters';
            }
            if (!resolvedFeatureFlags || Object.keys(resolvedFeatureFlags).length === 0) {
                resolvedFeatureFlags = slice.getFeatureFlags();
            }
        }
    }

    if (resolvedOpenRepairCode == null) {
        resolvedOpenRepairCode = 'open_projection_repairs';
    }
    if (resolvedIncludeChatStatsPhase == null) {
        resolvedIncludeChatStatsPhase = false;
    }

    const blockers: Blocker[] = [];
    const contractStatus = getCanonicalSliceFlagContractStatus(resolvedFeatureFlags, { phaseOrder });

    if (!contractStatus.ok) {
        blockers.push({
            code: contractStatus.blockingReason,
            severity: 'error',
            details: {
                illegalFlags: contractStatus.illegalFlags,
                sliceKey,
            },
        });
    }

    const phasesRequiringAudit = resolvedIncludeChatStatsPhase
        ? ['reads', 'writes', 'chatStats']
        : ['reads', 'writes'];

    if (phasesRequiringAudit.includes(phase)
        && (!resolvedAuditStatus || resolvedAuditStatus.blocking)) {
        blockers.push({
            code: resolvedAuditStatus?.reason ?? 'audit_not_run',
            severity: 'error',
            details: {
                // Keep machine-readable summary only; never embed full audit payloads.
                auditReason: resolvedAuditStatus?.reason ?? null,
                auditBlocking: resolvedAuditStatus ? !!resolvedAuditStatus.blocking : true,
                sliceKey,
            },
        });
    }

    const phasesRequiringRepairs = resolvedIncludeChatStatsPhase
        ? ['writes', 'chatStats']
        : ['writes'];

    if (phasesRequiringRepairs.includes(phase) && typeof resolvedListOpenRepairs === 'function') {
        const openRepairs = resolvedListOpenRepairs(db!) ?? [];
        // Protocol-managed intents (v1 path keys) are expected while a
        // projection is pending. Normal writes may proceed with their own
        // pending intent; audit/status/downgrade callers pass
        // allowProtocolPending=false and still see them as blockers. Legacy
        // repair rows are never treated as expected.
        const blockingRepairs = allowProtocolPending && protocolRepairPrefix
            ? openRepairs.filter(repair => !String(repair.repairKey).startsWith(protocolRepairPrefix))
            : openRepairs;
        if (blockingRepairs.length > 0) {
            blockers.push({
                code: resolvedOpenRepairCode,
                severity: 'error',
                details: {
                    repairCount: blockingRepairs.length,
                    repairKeys: blockingRepairs.map(repair => repair.repairKey),
                    protocolPendingCount: openRepairs.length - blockingRepairs.length,
                    sliceKey,
                },
            });
        }
    }

    if (resolvedIncludeChatStatsPhase && phase === 'chatStats' && !resolvedFeatureFlags.chatStats) {
        blockers.push({
            code: 'chat_stats_flag_disabled',
            severity: 'error',
            details: {
                sliceKey,
            },
        });
    }

    return {
        ok: blockers.length === 0,
        phase,
        sliceKey,
        blockers,
    };
}

let registeredDefaultSliceRegistry: Registry | null = null;

export function registerDefaultCanonicalStorageSliceRegistry(registry: Registry) {
    registeredDefaultSliceRegistry = registry;
}

function getRegisteredDefaultSliceRegistry() {
    return registeredDefaultSliceRegistry;
}

export function buildCanonicalRollbackBlockers({
    db,
    featureFlags = {},
    persistedAuditStatus = null,
    phase = 'writes',
}: Options = {}) {
    return buildCanonicalSliceRollbackBlockers({
        db,
        sliceKey: 'characters',
        featureFlags,
        persistedAuditStatus,
        phase,
        listOpenRepairs: listOpenProjectionRepairs,
        openRepairCode: 'open_projection_repairs',
        includeChatStatsPhase: true,
        phaseOrder: DEFAULT_PHASE_ORDER,
    });
}
