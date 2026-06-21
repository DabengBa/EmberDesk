"""Sandbox proof for main_chat_generation_control_bridge_processing_flow.md.

Run with:
    uv run python .docs/logic-description/main_chat_generation_control_bridge_sandbox_proof.py
"""


PHASES = {
    "idle",
    "streaming",
    "recoveringPrimary",
    "recoveringFallback",
    "stopped",
    "completed",
    "error",
}


def normalize_metadata(input_data):
    active_message_id = input_data.get("activeMessageId")
    recovery_status_label = input_data.get("recoveryStatusLabel")
    return {
        "activeMessageId": active_message_id if isinstance(active_message_id, int) and active_message_id >= 0 else None,
        "recoveryStatusLabel": recovery_status_label if isinstance(recovery_status_label, str) and recovery_status_label else None,
        "failureRetryVisible": bool(input_data.get("failureRetryVisible", False)),
        "failureNoticeVisible": bool(input_data.get("failureNoticeVisible", False)),
    }


def recoverable_state(state, metadata, continue_surface):
    return {
        "state": state,
        "phase": state,
        "composerDisabled": False,
        "sendVisible": True,
        "stopVisible": False,
        "continueVisible": continue_surface == "legacy",
        "continueSurface": continue_surface,
        "canRecoverInput": True,
        **metadata,
    }


def classify_generation_control(input_data):
    metadata = normalize_metadata(input_data)
    continue_surface = "legacy" if input_data.get("continueSurface") == "legacy" else "hidden"

    if input_data.get("isRecovering", False):
        return {
            "state": "recovering",
            "phase": "recoveringFallback" if input_data.get("recoveryStage") == "fallback" else "recoveringPrimary",
            "composerDisabled": True,
            "sendVisible": False,
            "stopVisible": bool(input_data.get("isGenerating", False) or input_data.get("hasStreamingProcessor", False)),
            "continueVisible": False,
            "continueSurface": "hidden",
            "canRecoverInput": False,
            **metadata,
            "failureRetryVisible": False,
            "failureNoticeVisible": False,
        }

    if input_data.get("hasError", False):
        return recoverable_state("error", metadata, continue_surface)
    if input_data.get("isStopped", False):
        return recoverable_state("stopped", metadata, continue_surface)
    if input_data.get("isFinished", False):
        return recoverable_state("completed", metadata, continue_surface)
    if input_data.get("isGenerating", False) or input_data.get("hasStreamingProcessor", False):
        return {
            "state": "streaming",
            "phase": "streaming",
            "composerDisabled": True,
            "sendVisible": False,
            "stopVisible": True,
            "continueVisible": False,
            "continueSurface": "hidden",
            "canRecoverInput": False,
            **metadata,
        }

    return {
        "state": "idle",
        "phase": "idle",
        "composerDisabled": False,
        "sendVisible": True,
        "stopVisible": False,
        "continueVisible": False,
        "continueSurface": "hidden",
        "canRecoverInput": True,
        **metadata,
    }


def validate_payload(payload):
    required_boolean_keys = {
        "composerDisabled",
        "sendVisible",
        "stopVisible",
        "continueVisible",
        "canRecoverInput",
        "failureRetryVisible",
        "failureNoticeVisible",
    }
    if payload.get("state") not in {"idle", "streaming", "recovering", "stopped", "completed", "error"}:
        return None
    if payload.get("phase") not in PHASES:
        return None
    if payload.get("continueSurface") not in {"hidden", "legacy"}:
        return None
    if not all(isinstance(payload.get(key), bool) for key in required_boolean_keys):
        return None
    active_message_id = payload.get("activeMessageId")
    if active_message_id is not None and not (isinstance(active_message_id, int) and active_message_id >= 0):
        return None
    if payload.get("recoveryStatusLabel") is not None and not isinstance(payload.get("recoveryStatusLabel"), str):
        return None
    return payload


IDLE_FALLBACK = {
    "state": "idle",
    "phase": "idle",
    "composerDisabled": False,
    "sendVisible": True,
    "stopVisible": False,
    "continueVisible": False,
    "continueSurface": "hidden",
    "canRecoverInput": True,
    "activeMessageId": None,
    "recoveryStatusLabel": None,
    "failureRetryVisible": False,
    "failureNoticeVisible": False,
}


def react_generation_control(payload):
    return validate_payload(payload) or IDLE_FALLBACK


def hidden_marker(validated):
    return {
        "data-main-chat-generation-control-phase": validated["phase"],
        "data-main-chat-generation-control-retry": "visible" if validated["failureRetryVisible"] else "hidden",
    }


def main():
    streaming = classify_generation_control({
        "isGenerating": True,
        "hasStreamingProcessor": True,
    })
    assert streaming["phase"] == "streaming"
    assert streaming["stopVisible"] is True
    assert hidden_marker(react_generation_control(streaming))["data-main-chat-generation-control-phase"] == "streaming"

    recovering = classify_generation_control({
        "isRecovering": True,
        "hasError": True,
        "hasStreamingProcessor": True,
        "recoveryStage": "fallback",
        "activeMessageId": 2,
        "recoveryStatusLabel": "Using fallback provider",
        "failureRetryVisible": True,
        "failureNoticeVisible": True,
    })
    assert recovering["phase"] == "recoveringFallback"
    assert recovering["activeMessageId"] == 2
    assert recovering["failureRetryVisible"] is False
    assert recovering["failureNoticeVisible"] is False

    final_failure = classify_generation_control({
        "hasError": True,
        "activeMessageId": 3,
        "failureRetryVisible": True,
        "failureNoticeVisible": True,
        "continueSurface": "legacy",
    })
    assert final_failure["phase"] == "error"
    assert final_failure["continueVisible"] is True
    assert hidden_marker(react_generation_control(final_failure))["data-main-chat-generation-control-retry"] == "visible"

    final_failure_without_continue = classify_generation_control({
        "hasError": True,
        "continueSurface": "hidden",
    })
    assert final_failure_without_continue["continueVisible"] is False
    assert final_failure_without_continue["continueSurface"] == "hidden"

    unsafe_metadata = classify_generation_control({
        "hasError": True,
        "activeMessageId": -1,
        "recoveryStatusLabel": 42,
    })
    assert unsafe_metadata["activeMessageId"] is None
    assert unsafe_metadata["recoveryStatusLabel"] is None

    malformed = dict(final_failure)
    malformed["phase"] = "paused"
    assert react_generation_control(malformed) == IDLE_FALLBACK
    assert hidden_marker(react_generation_control(malformed)) == {
        "data-main-chat-generation-control-phase": "idle",
        "data-main-chat-generation-control-retry": "hidden",
    }


if __name__ == "__main__":
    main()
