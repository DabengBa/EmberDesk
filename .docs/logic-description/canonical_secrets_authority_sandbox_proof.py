"""Reference proof for canonical_secrets_authority_processing_flow.md."""

import hashlib


CANARY = "canonical-secrets-proof-canary"


def value_hash(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def import_records(file_state, existing=None):
    existing = existing or {}
    result = {}
    for key, value in file_state.items():
        if key == "_migrated":
            continue
        if isinstance(value, list):
            records = [dict(record) for record in value]
        else:
            previous = next(
                (
                    record
                    for record in existing.get(key, [])
                    if record["active"] and record["value"] == value
                ),
                None,
            )
            records = [{
                "id": previous["id"] if previous else f"generated-{key}",
                "value": value,
                "label": key,
                "active": True,
            }]
        active_seen = False
        for record in records:
            if record["active"] and active_seen:
                record["active"] = False
            active_seen = active_seen or record["active"]
        if records and not active_seen:
            records[0]["active"] = True
        result[key] = records
    return result


def audit(file_state, db_state, repairs):
    entries = []
    expected = import_records(file_state, db_state)
    for key in sorted(set(expected) | set(db_state)):
        expected_rows = expected.get(key, [])
        actual_rows = db_state.get(key, [])
        expected_view = [
            (row["id"], row["label"], row["active"], value_hash(row["value"]))
            for row in expected_rows
        ]
        actual_view = [
            (row["id"], row["label"], row["active"], value_hash(row["value"]))
            for row in actual_rows
        ]
        if expected_view != actual_view:
            entries.append({
                "key": key,
                "status": "drift",
                "drift": ["value_hash_mismatch"],
                "expected_count": len(expected_rows),
                "actual_count": len(actual_rows),
            })
    for repair_key, repair in repairs.items():
        if not repair["resolved"]:
            entries.append({
                "key": repair["key"],
                "status": "drift",
                "drift": ["open_secret_projection_repair"],
                "repair_key": repair_key,
                "operation": repair["operation"],
                "error_class": repair["error_class"],
            })
    return {
        "scope": "secrets",
        "ok": not entries,
        "blocking": bool(entries),
        "entries": entries,
    }


def write_secret(db_state, key, value, label, record_id):
    for record in db_state.get(key, []):
        record["active"] = False
    db_state.setdefault(key, []).append({
        "id": record_id,
        "value": value,
        "label": label,
        "active": True,
    })


def project(db_state):
    return {
        **{
            key: [dict(record) for record in records]
            for key, records in db_state.items()
        },
        "_migrated": [],
    }


def rollback_blockers(audit_state, repairs):
    open_repairs = [
        repair_key
        for repair_key, repair in repairs.items()
        if not repair["resolved"]
    ]
    blockers = []
    if audit_state["blocking"]:
        blockers.append("audit_blocked")
    if open_repairs:
        blockers.append("open_secret_projection_repairs")
    return {"ok": not blockers, "blockers": blockers}


def main():
    file_state = {
        "api_key_openai": [
            {"id": "old", "value": f"{CANARY}-old", "label": "Old", "active": False},
            {"id": "active", "value": f"{CANARY}-active", "label": "Active", "active": True},
        ],
        "api_key_custom": f"{CANARY}-custom",
        "_migrated": [],
    }
    db_state = import_records(file_state)
    second_import = import_records(file_state, db_state)
    assert second_import == db_state

    clean = audit(file_state, db_state, {})
    assert clean == {"scope": "secrets", "ok": True, "blocking": False, "entries": []}
    assert CANARY not in str(clean)

    write_secret(
        db_state,
        "api_key_openai",
        f"{CANARY}-committed",
        "Committed",
        "committed",
    )
    assert [row["id"] for row in db_state["api_key_openai"] if row["active"]] == ["committed"]

    repairs = {
        "secrets:api_key_openai:committed:write": {
            "key": "api_key_openai",
            "record_id": "committed",
            "operation": "write",
            "error_class": "EISDIR",
            "resolved": False,
        }
    }
    blocked_audit = audit(file_state, db_state, repairs)
    assert blocked_audit["blocking"] is True
    assert CANARY not in str(blocked_audit)
    assert rollback_blockers(blocked_audit, repairs) == {
        "ok": False,
        "blockers": ["audit_blocked", "open_secret_projection_repairs"],
    }

    file_state = project(db_state)
    repairs["secrets:api_key_openai:committed:write"]["resolved"] = True
    repaired_audit = audit(file_state, db_state, repairs)
    assert repaired_audit == {
        "scope": "secrets",
        "ok": True,
        "blocking": False,
        "entries": [],
    }
    assert rollback_blockers(repaired_audit, repairs) == {"ok": True, "blockers": []}


if __name__ == "__main__":
    main()
