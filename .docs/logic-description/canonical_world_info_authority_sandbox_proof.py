"""Reference proof for canonical_world_info_authority_processing_flow.md."""


def run_shadow_import(files):
    return {
        name: {
            "payload": payload.copy(),
            "deleted": False,
        }
        for name, payload in files.items()
    }


def audit_world_info(files, db_rows):
    entries = []

    for name, payload in files.items():
        row = db_rows.get(name)
        if row is None or row.get("deleted"):
            entries.append({"world": name, "status": "drift", "drift": ["missing_db_world_info"]})
            continue
        if row["payload"] != payload:
            entries.append({"world": name, "status": "drift", "drift": ["payload_mismatch"]})

    for name, row in db_rows.items():
        if not row.get("deleted") and name not in files:
            entries.append({"world": name, "status": "drift", "drift": ["missing_projection_file"]})

    return {
        "ok": len(entries) == 0,
        "scope": "world_info",
        "blocking": len(entries) > 0,
        "entries": entries,
    }


def can_db_first_read(flags, audit):
    if not flags["enabled"] or not flags["reads"]:
        return {"source": "files", "reason": "canonical_reads_disabled"}
    if audit["blocking"]:
        if flags["strict"]:
            return {"source": "error", "reason": "audit_blocked"}
        return {"source": "files", "reason": "audit_blocked"}
    return {"source": "canonical", "reason": None}


def file_backed_edit(files, audit_state, name, payload):
    files[name] = payload.copy()
    return {
        **audit_state,
        "blocking": True,
        "reason": "audit_stale_after_world_info_file_write",
    }


def canonical_edit(db_rows, files, repairs, name, payload, projection_ok):
    db_rows[name] = {"payload": payload.copy(), "deleted": False}
    if projection_ok:
        files[name] = payload.copy()
        return {"ok": True, "repair": None}

    repair_key = f"world_info:{name}:edit"
    repairs[repair_key] = {"world": name, "operation": "edit", "resolved": False}
    return {"ok": False, "repair": repair_key}


def repair_projection(db_rows, files, repairs, repair_key):
    repair = repairs[repair_key]
    row = db_rows[repair["world"]]
    files[repair["world"]] = row["payload"].copy()
    repair["resolved"] = True
    return {"audit": {"scope": "world_info", "blocking": True, "reason": "audit_stale_after_world_info_projection_repair"}}


def canonical_delete(db_rows, files, repairs, name, projection_ok):
    db_rows[name]["deleted"] = True
    if projection_ok:
        files.pop(name, None)
        return {"ok": True, "repair": None}

    repair_key = f"world_info:{name}:delete"
    repairs[repair_key] = {"world": name, "operation": "delete", "resolved": False}
    return {"ok": False, "repair": repair_key}


def repair_delete_projection(files, repairs, repair_key):
    repair = repairs[repair_key]
    files.pop(repair["world"], None)
    repair["resolved"] = True
    return {"audit": {"scope": "world_info", "blocking": True, "reason": "audit_stale_after_world_info_projection_repair"}}


def rollback_blockers(repairs):
    open_world_info_repairs = [
        repair_key
        for repair_key, repair in repairs.items()
        if not repair["resolved"]
    ]
    return {
        "ok": len(open_world_info_repairs) == 0,
        "blockers": open_world_info_repairs,
    }


def main():
    files = {
        "Lorebook": {"entries": {"one": {"content": "file"}}},
    }
    db_rows = run_shadow_import(files)
    clean_audit = audit_world_info(files, db_rows)
    assert clean_audit == {"ok": True, "scope": "world_info", "blocking": False, "entries": []}

    assert can_db_first_read(
        {"enabled": True, "reads": True, "strict": False},
        clean_audit,
    ) == {"source": "canonical", "reason": None}

    stale_after_file_write = file_backed_edit(
        files,
        clean_audit,
        "Lorebook",
        {"entries": {"one": {"content": "file-backed edit"}}},
    )
    assert stale_after_file_write == {
        "ok": True,
        "scope": "world_info",
        "blocking": True,
        "entries": [],
        "reason": "audit_stale_after_world_info_file_write",
    }

    files["Lorebook"] = {"entries": {"one": {"content": "changed outside db"}}}
    drift_audit = audit_world_info(files, db_rows)
    assert drift_audit["blocking"] is True
    assert drift_audit["entries"][0]["drift"] == ["payload_mismatch"]
    assert can_db_first_read(
        {"enabled": True, "reads": True, "strict": False},
        drift_audit,
    ) == {"source": "files", "reason": "audit_blocked"}
    assert can_db_first_read(
        {"enabled": True, "reads": True, "strict": True},
        drift_audit,
    ) == {"source": "error", "reason": "audit_blocked"}

    repairs = {}
    edit = canonical_edit(
        db_rows,
        files,
        repairs,
        "Lorebook",
        {"entries": {"one": {"content": "canonical edit"}}},
        projection_ok=False,
    )
    assert edit == {"ok": False, "repair": "world_info:Lorebook:edit"}
    assert db_rows["Lorebook"]["payload"]["entries"]["one"]["content"] == "canonical edit"
    assert files["Lorebook"]["entries"]["one"]["content"] == "changed outside db"
    assert rollback_blockers(repairs) == {"ok": False, "blockers": ["world_info:Lorebook:edit"]}

    repair_result = repair_projection(db_rows, files, repairs, "world_info:Lorebook:edit")
    assert repairs["world_info:Lorebook:edit"]["resolved"] is True
    assert files["Lorebook"] == db_rows["Lorebook"]["payload"]
    assert repair_result == {
        "audit": {
            "scope": "world_info",
            "blocking": True,
            "reason": "audit_stale_after_world_info_projection_repair",
        }
    }

    delete = canonical_delete(db_rows, files, repairs, "Lorebook", projection_ok=False)
    assert delete == {"ok": False, "repair": "world_info:Lorebook:delete"}
    assert db_rows["Lorebook"]["deleted"] is True
    assert files["Lorebook"] == {"entries": {"one": {"content": "canonical edit"}}}
    assert rollback_blockers(repairs) == {"ok": False, "blockers": ["world_info:Lorebook:delete"]}

    delete_repair_result = repair_delete_projection(files, repairs, "world_info:Lorebook:delete")
    assert repairs["world_info:Lorebook:delete"]["resolved"] is True
    assert "Lorebook" not in files
    assert delete_repair_result == {
        "audit": {
            "scope": "world_info",
            "blocking": True,
            "reason": "audit_stale_after_world_info_projection_repair",
        }
    }
    assert rollback_blockers(repairs) == {"ok": True, "blockers": []}


if __name__ == "__main__":
    main()
