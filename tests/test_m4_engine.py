"""Synthetic protocol tests; these are not measured browser or model outcomes."""
import copy
import json
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from evaluation.m4 import gate
from evaluation.m4.patch import apply
from accessfix.storage import inventory

CONTRACT = [{"id": "pointer", "modality": "pointer", "checks": ["core", "secondary"], "states": ["initial", "changed"]},
            {"id": "keyboard", "modality": "keyboard", "checks": ["core", "secondary"], "states": ["initial", "changed"]}]


def measured(keyboard=True):
    rows = []
    for spec in CONTRACT:
        passed = keyboard or spec["modality"] == "pointer"
        rows.append({**spec, "checks": [{"id": c, "status": "pass" if passed or c == "secondary" else "fail"} for c in spec["checks"]],
            "audits": [{"state": s, "status": "complete", "violations": [], "incomplete": []} for s in spec["states"]],
            "status": "pass" if passed else "fail", "errors": [], "page_errors": []})
    return {"schema_version": 1, "mode": "final", "build_ok": True, "workflows": rows, "container_exit_code": 0}


@pytest.fixture(autouse=True)
def trusted_contract(monkeypatch):
    monkeypatch.setattr(gate, "_contract", lambda case: copy.deepcopy(CONTRACT))


def test_axe_zero_is_not_keyboard_success():
    before = measured(False)
    assert gate.summarize(before, "fixture")["axe_zero_keyboard_failed"]
    assert not gate.assess(before, before, "fixture")["accepted"]
    assert gate.assess(before, measured(), "fixture")["accepted"]


@pytest.mark.parametrize("tamper", ["missing_check", "missing_audit", "duplicate_flow", "fake_contract", "failed_process"])
def test_missing_or_forged_measurement_fails_closed(tamper):
    after = measured()
    if tamper == "missing_check": after["workflows"][0]["checks"].pop()
    if tamper == "missing_audit": after["workflows"][0]["audits"].pop()
    if tamper == "duplicate_flow": after["workflows"].append(copy.deepcopy(after["workflows"][0]))
    if tamper == "fake_contract":
        after["workflows"][0].update(required_checks=[], checks=[])
    if tamper == "failed_process": after["container_exit_code"] = 1
    decision = gate.assess(measured(False), after, "fixture")
    assert not decision["accepted"]
    assert "required_measurement_missing" in decision["reasons"]


@pytest.mark.parametrize("kind,reason", [("incomplete", "new_incomplete_requires_review"), ("violations", "new_axe_violation")])
def test_new_axe_findings_are_not_erased(kind, reason):
    after = measured()
    after["workflows"][0]["audits"][0][kind] = [{"id": "contrast", "nodes": [{"target": [".mock"]}]}]
    decision = gate.assess(measured(False), after, "fixture")
    assert not decision["accepted"] and reason in decision["reasons"]


def test_improved_keyboard_cannot_hide_pointer_regression():
    after = measured()
    after["workflows"][0]["checks"][1]["status"] = "fail"
    after["workflows"][0]["status"] = "fail"
    decision = gate.assess(measured(False), after, "fixture")
    assert not decision["accepted"]
    assert "pointer:secondary" in decision["regressions"]


def test_patch_cannot_escape_or_modify_original(tmp_path):
    source = tmp_path / "original"; (source / "src").mkdir(parents=True)
    (source / "src/App.tsx").write_text("const version = 1;", encoding="utf-8")
    (source / "src/styles.css").write_text("body {color: black;}", encoding="utf-8")
    expected = inventory(source)
    for name in ("../escaped.txt", "src/main.tsx", "package.json"):
        with pytest.raises(ValueError, match="not allowed"):
            apply(source, tmp_path / "rejected", {"rationale": "mock", "edits": [{"path": name, "old": "1", "new": "2"}]}, expected)
    proposal = {"rationale": "mock", "edits": [{"path": "src/App.tsx", "old": "version = 1", "new": "version = 2"}]}
    apply(source, tmp_path / "candidate", proposal, expected)
    assert inventory(source) == expected
    with pytest.raises(ValueError, match="already exists"):
        apply(source, tmp_path / "candidate", proposal, expected)


def test_m4_request_uses_versioned_prompt_without_oracle(tmp_path, monkeypatch):
    from evaluation.m4.model import MetaTaskProvider, VERSION
    monkeypatch.setenv("MODEL_API_KEY", "mock-only-m4-test-key")
    provider = MetaTaskProvider()
    payload = {"task": "Use the public control.", "files": {"src/App.tsx": "const value = 1;"}, "observations": {"action": "Space had no effect"}}
    with patch.object(provider, "_complete", return_value={"proposal": None}) as call:
        provider.propose(payload, tmp_path / "request")
    body = call.call_args.args[0]
    assert json.loads(body["messages"][1]["content"]) == payload
    assert call.call_args.kwargs["prompt_version"] == VERSION
    assert body["max_completion_tokens"] == 12000 and "tools" not in body
    with pytest.raises(ValueError):
        provider.propose({**payload, "final_assertions": {}}, tmp_path / "bad")
