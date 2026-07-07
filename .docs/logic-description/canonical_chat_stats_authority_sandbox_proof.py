"""Sandbox proof for canonical_chat_stats_authority_processing_flow.md.

Run with:
    uv run python .docs/logic-description/canonical_chat_stats_authority_sandbox_proof.py
"""


class CanonicalChatStatsSyncError(RuntimeError):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


def sync_chat_stats_after_mutation(*, avatar, feature_flags, canonical_update=None, storage_available=True):
    result = {
        "fileBackedChatStatsFallback": {
            "available": True,
            "source": "jsonl",
        },
        "canonicalChatStatsUpsert": None,
        "canonicalChatStatsSyncError": None,
        "canonicalAuditInvalidation": {
            "performed": False,
            "reason": None,
        },
    }

    if not avatar:
        result["fileBackedChatStatsFallback"]["available"] = False
        return result

    if feature_flags.get("enabled") and feature_flags.get("chatStats"):
        try:
            result["canonicalChatStatsUpsert"] = canonical_update()
            return result
        except CanonicalChatStatsSyncError as error:
            result["canonicalAuditInvalidation"] = {
                "performed": True,
                "reason": "audit_stale_after_chat_stats_sync_failure",
            }
            result["canonicalChatStatsSyncError"] = error.reason
            return result

    if feature_flags.get("enabled") and storage_available:
        result["canonicalAuditInvalidation"] = {
            "performed": True,
            "reason": "audit_stale_after_chat_stats_change",
        }

    return result


def canonical_read_state(*, feature_flags, storage_supported=True, migration_blocked=False, db_available=True, audit_blocking=False):
    reads_enabled = bool(feature_flags.get("enabled") and feature_flags.get("reads"))
    include_chat_stats = bool(reads_enabled and feature_flags.get("chatStats") and storage_supported and not migration_blocked and db_available and not audit_blocking)
    return {
        "readsEnabled": reads_enabled,
        "chatStatsEnabled": bool(feature_flags.get("chatStats")),
        "auditBlocking": audit_blocking,
        "includeChatStats": include_chat_stats,
    }


def rebuild_chat_stats(*, rows, requested_avatars=None):
    rebuilt = []
    requested = set(requested_avatars) if requested_avatars else None
    for row in rows:
        if requested and row["avatarFilename"] not in requested:
            continue
        rebuilt.append(dict(row))
    return {
        "ok": True,
        "rebuilt": rebuilt,
        "auditInvalidation": {
            "performed": True,
            "reason": "audit_stale_after_chat_stats_rebuild",
        },
    }


def test_missing_avatar_is_noop():
    result = sync_chat_stats_after_mutation(
        avatar="",
        feature_flags={"enabled": True, "chatStats": True},
        canonical_update=lambda: {"ok": True},
    )
    assert result["fileBackedChatStatsFallback"] == {"available": False, "source": "jsonl"}
    assert result["canonicalChatStatsUpsert"] is None
    assert result["canonicalAuditInvalidation"] == {"performed": False, "reason": None}


def test_file_backed_fallback_stays_fresh_before_canonical_reads():
    result = sync_chat_stats_after_mutation(
        avatar="alpha.png",
        feature_flags={"enabled": True, "chatStats": True},
        canonical_update=lambda: {"ok": True, "chatCount": 1},
    )
    assert result["fileBackedChatStatsFallback"] == {"available": True, "source": "jsonl"}
    assert result["canonicalChatStatsUpsert"]["chatCount"] == 1
    assert result["canonicalAuditInvalidation"] == {"performed": False, "reason": None}

    read_state = canonical_read_state(
        feature_flags={"enabled": True, "reads": False, "chatStats": True},
        audit_blocking=False,
    )
    assert read_state["includeChatStats"] is False


def test_enabled_storage_without_chatstats_invalidates_audit():
    result = sync_chat_stats_after_mutation(
        avatar="alpha.png",
        feature_flags={"enabled": True, "chatStats": False},
        canonical_update=None,
        storage_available=True,
    )
    assert result["fileBackedChatStatsFallback"] == {"available": True, "source": "jsonl"}
    assert result["canonicalAuditInvalidation"] == {
        "performed": True,
        "reason": "audit_stale_after_chat_stats_change",
    }


def test_canonical_sync_failure_stales_audit_and_keeps_file_backed_success():
    result = sync_chat_stats_after_mutation(
        avatar="alpha.png",
        feature_flags={"enabled": True, "chatStats": True},
        canonical_update=lambda: (_ for _ in ()).throw(CanonicalChatStatsSyncError("canonical_character_missing")),
    )
    assert result["fileBackedChatStatsFallback"] == {"available": True, "source": "jsonl"}
    assert result["canonicalAuditInvalidation"] == {
        "performed": True,
        "reason": "audit_stale_after_chat_stats_sync_failure",
    }
    assert result["canonicalChatStatsSyncError"] == "canonical_character_missing"


def test_read_authority_requires_reads_chatstats_and_clean_audit():
    active = canonical_read_state(
        feature_flags={"enabled": True, "reads": True, "chatStats": True},
        audit_blocking=False,
    )
    assert active["includeChatStats"] is True

    blocked = canonical_read_state(
        feature_flags={"enabled": True, "reads": True, "chatStats": True},
        audit_blocking=True,
    )
    assert blocked["includeChatStats"] is False


def test_rebuild_invalidates_audit_after_recomputing_rows():
    rebuilt = rebuild_chat_stats(rows=[
        {"avatarFilename": "alpha.png", "chatCount": 1, "chatSizeBytes": 123, "dateLastChatMs": 1700000000000},
        {"avatarFilename": "beta.png", "chatCount": 0, "chatSizeBytes": 0, "dateLastChatMs": 0},
    ], requested_avatars=["alpha.png"])
    assert rebuilt["ok"] is True
    assert rebuilt["rebuilt"] == [
        {"avatarFilename": "alpha.png", "chatCount": 1, "chatSizeBytes": 123, "dateLastChatMs": 1700000000000},
    ]
    assert rebuilt["auditInvalidation"] == {
        "performed": True,
        "reason": "audit_stale_after_chat_stats_rebuild",
    }


def main():
    test_missing_avatar_is_noop()
    test_file_backed_fallback_stays_fresh_before_canonical_reads()
    test_enabled_storage_without_chatstats_invalidates_audit()
    test_canonical_sync_failure_stales_audit_and_keeps_file_backed_success()
    test_read_authority_requires_reads_chatstats_and_clean_audit()
    test_rebuild_invalidates_audit_after_recomputing_rows()


if __name__ == "__main__":
    main()
