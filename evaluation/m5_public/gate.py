"""M5 public-app adaptation of official-build M1 gate; original gate remains byte-for-byte unchanged."""
from __future__ import annotations

import json
from accessfix.storage import PROJECT, read_json


def _contract(case_id):
    return read_json(PROJECT / "evaluation/m5_public/harness/contract.json")["cases"][case_id]["workflows"]


def _unique(rows, key):
    if not isinstance(rows, list) or any(not isinstance(r, dict) or not isinstance(r.get(key), str) for r in rows):
        raise ValueError("Invalid records")
    mapped = {r[key]: r for r in rows}
    if len(mapped) != len(rows):
        raise ValueError("Duplicate records")
    return mapped


def summarize(result: dict, case_id: str) -> dict:
    problems, failures, signatures, incompletes, errors = [], [], set(), set(), set()
    counts = {"pointer": 0, "keyboard": 0}
    contract = _contract(case_id)
    expected_counts = {m:sum(s["modality"] == m for s in contract) for m in ("pointer", "keyboard")}
    valid_pointer = True
    state_count = 0
    try:
        if not isinstance(result, dict) or result.get("schema_version") != 1 or result.get("build_ok") is not True or result.get("mode") != "final":
            raise ValueError("Missing final build/measurement")
        if result.get("error") or result.get("container_exit_code", 0) != 0:
            raise ValueError("Browser process failed")
        rows = _unique(result.get("workflows"), "id")
        if set(rows) != {r["id"] for r in contract}:
            raise ValueError("Missing or unexpected workflows")
        for spec in contract:
            wid, modality = spec["id"], spec["modality"]
            row = rows[wid]
            if row.get("modality") != modality:
                raise ValueError("Wrong input modality")
            checks = _unique(row.get("checks"), "id")
            audits = _unique(row.get("audits"), "state")
            if set(checks) != set(spec["checks"]) or set(audits) != set(spec["states"]):
                problems.append(wid + ":missing_contract_records")
                if modality == "pointer":valid_pointer = False
            passed = True
            for cid in spec["checks"]:
                c = checks.get(cid, {})
                if c.get("status") != "pass":
                    failures.append(wid + ":" + cid)
                    passed = False
                if c.get("status") not in ("pass", "fail"):
                    problems.append(wid + ":" + cid + ":unmeasured")
                    if modality == "pointer":valid_pointer = False
            for state in spec["states"]:
                audit = audits.get(state, {})
                if audit.get("status") != "complete" or not isinstance(audit.get("violations"), list) or not isinstance(audit.get("incomplete"), list):
                    problems.append(wid + ":" + state + ":audit_missing")
                    passed = False
                    if modality == "pointer":valid_pointer = False
                    continue
                state_count += 1
                for key, target in [("violations", signatures), ("incomplete", incompletes)]:
                    for rule in audit[key]:
                        if not isinstance(rule, dict) or not isinstance(rule.get("id"), str) or not isinstance(rule.get("nodes"), list) or not rule["nodes"]:
                            raise ValueError("Malformed axe rule")
                        for node in rule["nodes"]:
                            if not isinstance(node, dict) or not isinstance(node.get("target"), list) or not node["target"]:
                                raise ValueError("Malformed axe node")
                            target.add(state + "|" + rule["id"] + "|" + json.dumps(node["target"], sort_keys=True))
            if not isinstance(row.get("errors"), list) or any(not isinstance(e, dict) for e in row["errors"]):
                raise ValueError("Malformed browser errors")
            if row.get("status") not in ("pass", "fail", "error"):
                raise ValueError("Missing workflow status")
            for error in row["errors"]:
                category = error.get("category", "unknown")
                if category in ("page_error", "browser_error"):
                    errors.add(str(error.get("message")))
                if category in ("measurement_error", "runtime_error", "selector_ambiguity", "semantic_ambiguity", "audit_error", "target_missing", "trace_error"):
                    problems.append(wid + ":" + category)
                    if modality == "pointer":valid_pointer = False
                passed = False
            page_errors = row.get("page_errors", [])
            if not isinstance(page_errors, list) or any(not isinstance(e, str) for e in page_errors):
                raise ValueError("Malformed page errors")
            if page_errors:
                errors.update(page_errors)
                passed = False
            if row.get("status") != "pass":passed = False
            if passed:counts[modality] += 1
    except (KeyError, TypeError, ValueError) as error:
        problems.append(str(error));valid_pointer = False
    return {"measurement_complete":not problems,"pointer_reference_valid":valid_pointer and expected_counts["pointer"] > 0,
        "pointer_pass":counts["pointer"],"pointer_total":expected_counts["pointer"],
        "keyboard_pass":counts["keyboard"],"keyboard_total":expected_counts["keyboard"],
        "axe_state_nodes":len(signatures) if state_count else None,"incomplete_state_nodes":len(incompletes) if state_count else None,
        "observed_audit_states":state_count,"violations":sorted(signatures),"incomplete":sorted(incompletes),
        "failures":failures,"measurement_problems":problems,"browser_errors":sorted(errors),
        "manual_review":bool(incompletes or problems),
        "axe_zero_keyboard_failed":bool(state_count and not signatures and counts["keyboard"] < expected_counts["keyboard"])}


def assess(baseline: dict, candidate: dict, case_id: str) -> dict:
    before, after = summarize(baseline, case_id), summarize(candidate, case_id)
    reasons = []
    if not before["pointer_reference_valid"] or before["pointer_pass"] != before["pointer_total"]:
        reasons.append("baseline_pointer_reference_invalid")
    if not after["measurement_complete"]:reasons.append("required_measurement_missing")
    if after["keyboard_total"] == 0 or after["keyboard_pass"] != after["keyboard_total"]:reasons.append("keyboard_task_failed")
    if after["pointer_total"] == 0 or after["pointer_pass"] != after["pointer_total"]:reasons.append("pointer_task_failed")
    def passed_checks(value):
        try:
            return {(f["id"], c["id"]) for f in value.get("workflows", []) for c in f.get("checks", []) if c.get("status") == "pass"}
        except (KeyError, TypeError, AttributeError):
            return set()
    original_passed = passed_checks(baseline)
    candidate_passed = passed_checks(candidate)
    regressions = sorted(":".join(x) for x in original_passed - candidate_passed)
    new_violations = sorted(set(after["violations"]) - set(before["violations"]))
    new_incomplete = sorted(set(after["incomplete"]) - set(before["incomplete"]))
    new_errors = sorted(set(after["browser_errors"]) - set(before["browser_errors"]))
    if regressions:reasons.append("existing_behavior_regression")
    if new_violations:reasons.append("new_axe_violation")
    if new_incomplete:reasons.append("new_incomplete_requires_review")
    if new_errors:reasons.append("new_browser_error")
    improved = after["keyboard_pass"] > before["keyboard_pass"] or (after["axe_state_nodes"] is not None and before["axe_state_nodes"] is not None and after["axe_state_nodes"] < before["axe_state_nodes"])
    if not improved:reasons.append("no_measured_improvement")
    return {"accepted":not reasons,"status":"accepted" if not reasons else "rejected","reasons":reasons,
        "regressions":regressions,"new_violations":new_violations,"new_incomplete":new_incomplete,"new_browser_errors":new_errors,
        "manual_review":after["manual_review"],"metrics":{"before":before,"after":after},
        "scope":"Declared M5 public-app user tasks and automated checks only; not WCAG conformance or deployment approval."}
