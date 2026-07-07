function hasEarlierPhaseGap(featureFlags, flagName) {
    switch (flagName) {
        case 'shadowImport':
            return !featureFlags.enabled;
        case 'reads':
            return !featureFlags.shadowImport;
        case 'writes':
            return !featureFlags.reads;
        case 'chatStats':
            return !featureFlags.writes;
        default:
            return false;
    }
}

export function getCanonicalFlagContractStatus(featureFlags = {}) {
    const normalized = {
        enabled: !!featureFlags.enabled,
        shadowImport: !!featureFlags.shadowImport,
        reads: !!featureFlags.reads,
        writes: !!featureFlags.writes,
        chatStats: !!featureFlags.chatStats,
        strict: !!featureFlags.strict,
    };

    const illegalFlags = ['shadowImport', 'reads', 'writes', 'chatStats']
        .filter(flagName => normalized[flagName] && hasEarlierPhaseGap(normalized, flagName));

    return {
        ok: illegalFlags.length === 0,
        featureFlags: normalized,
        illegalFlags,
        blockingReason: illegalFlags.length
            ? `illegal_flag_combination:${illegalFlags[0]}`
            : null,
    };
}

function parseRepairDetails(detailsJson) {
    try {
        return JSON.parse(String(detailsJson ?? '{}'));
    } catch {
        return {};
    }
}

export function listOpenProjectionRepairs(db) {
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
        if (String(error?.message ?? '').includes('no such table: projection_repairs')) {
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

export function buildCanonicalRollbackBlockers({
    db,
    featureFlags = {},
    persistedAuditStatus = null,
    phase = 'writes',
}) {
    const blockers = [];
    const contractStatus = getCanonicalFlagContractStatus(featureFlags);

    if (!contractStatus.ok) {
        blockers.push({
            code: contractStatus.blockingReason,
            severity: 'error',
            details: {
                illegalFlags: contractStatus.illegalFlags,
            },
        });
    }

    if ((phase === 'reads' || phase === 'writes' || phase === 'chatStats')
        && (!persistedAuditStatus || persistedAuditStatus.blocking)) {
        blockers.push({
            code: persistedAuditStatus?.reason ?? 'audit_not_run',
            severity: 'error',
            details: {
                auditStatus: persistedAuditStatus ?? null,
            },
        });
    }

    if (phase === 'writes' || phase === 'chatStats') {
        const openRepairs = listOpenProjectionRepairs(db);
        if (openRepairs.length > 0) {
            blockers.push({
                code: 'open_projection_repairs',
                severity: 'error',
                details: {
                    repairCount: openRepairs.length,
                    repairKeys: openRepairs.map(repair => repair.repairKey),
                },
            });
        }
    }

    if (phase === 'chatStats' && !featureFlags.chatStats) {
        blockers.push({
            code: 'chat_stats_flag_disabled',
            severity: 'error',
            details: {},
        });
    }

    return {
        ok: blockers.length === 0,
        phase,
        blockers,
    };
}

