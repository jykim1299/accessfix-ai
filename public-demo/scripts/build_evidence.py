"""Build a static, allowlisted public evidence copy without running experiments.

Usage: python scripts/build_evidence.py --archive <reviewed ZIP> --snapshot <public snapshot>
Only files explicitly named below are read. The source ZIP and snapshot are never changed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

EXPECTED_ZIP_SHA256 = "05cff33e4fc04912c360111456e5789573f5f2762c4e6e639f883331448b2011"
ROOT = Path(__file__).resolve().parents[1]
SPECS = [
    ("tabs", "m4/meta-live-v1/dev-tabs/jobs", "8328c19142b14cb4bd87c0403fd20a5d", "f4ebaa0f3eaa4ee0907961d4596fb874", "keyboard-activity/overview.png", "keyboard-activity/activity.png"),
    ("switch", "m4/meta-live-v1/holdout-switch/jobs", "4e88252e82914c1dabd5f3cfb44e7015", "5797f925762948bb8a5bdd0841101fe0", "pointer-save/initial.png", "pointer-save/initial.png"),
    ("modal", "m3-meta/live-v2/jobs", "6f85e31f4bc34de395d46087c653ad25", "fe2e9435f2e84842a497a7004a37a3da", "keyboard-escape/open.png", "keyboard-escape/cancelled.png"),
    ("action", "m4/meta-live-v1/holdout-action/jobs", "5156f3d206654ff0a38452cf5c8a811f", "39d0aebf21294ae0b7dcdaede0cfc478", "keyboard-enter/initial.png", "keyboard-enter/discounted.png"),
    ("menu", "m4/meta-live-v1/holdout-menu/jobs", "e28c0615cc9f4714b5885e0580fafa3c", "dd7011debd554dfa807b45aeb8f082ac", "keyboard-duplicate/open.png", "keyboard-duplicate/selected.png"),
]
COPY = {
    "tabs": {
        "title": "Tabs that work with a keyboard", "shortTitle": "Project tabs",
        "summary": "Keyboard users can switch views and keep their notes.",
        "problem": "The original tabs respond to clicks, but keyboard users cannot reach the Activity or Billing view.",
        "repairExplanation": "The patch adds keyboard navigation and selection while preserving the views and notes action.",
        "decisionExplanation": "Both keyboard tasks complete, both pointer tasks still work, and no new automated findings appear in the measured states.",
        "before": "Original: the keyboard task stays on Overview.", "after": "Candidate: the same task reaches Activity.",
    },
    "switch": {
        "title": "A working switch can still be unsafe", "shortTitle": "Notification switch",
        "summary": "The keyboard fix works, but new low-contrast text causes rejection.",
        "problem": "One Space press toggles the original switch twice, leaving its value unchanged.",
        "repairExplanation": "The patch makes the switch respond once to keyboard activation. Its new styling also makes the Off label too faint.",
        "decisionExplanation": "Keyboard tasks improve from 0/2 to 2/2, but the new Off label has 1.19:1 contrast against a required 4.5:1. The candidate is rejected.",
        "before": "Original initial state: the Off label is readable.", "after": "Candidate, same initial state: white Off text loses contrast.",
    },
    "modal": {
        "title": "A dialog that keeps keyboard focus", "shortTitle": "Delivery preferences",
        "summary": "Save, cancel, and Escape work with focus kept inside the open dialog.",
        "problem": "Opening the original dialog does not manage focus, keyboard focus can escape, and Escape does not close it.",
        "repairExplanation": "The patch gives the dialog an accessible name, manages focus, handles Escape, and returns focus after closing.",
        "decisionExplanation": "All three keyboard workflows pass, both pointer workflows remain intact, and the measured dialog-name finding is removed.",
        "before": "Original: the Escape task leaves the dialog open.", "after": "Candidate: Escape closes the dialog and returns focus.",
    },
    "action": {
        "title": "An action available to every input", "shortTitle": "Order action",
        "summary": "Enter and Space apply the discount without breaking the order.",
        "problem": "The original named action responds to a click but not Enter or Space.",
        "repairExplanation": "The patch adds keyboard activation and repairs the affected order-summary semantics.",
        "decisionExplanation": "Both keyboard workflows and both pointer workflows pass. The measured automated findings decrease from 12 to 0.",
        "before": "Original: keyboard activation does not apply the discount.", "after": "Candidate: keyboard activation applies the discount.",
    },
    "menu": {
        "title": "A menu with a complete keyboard path", "shortTitle": "Workspace menu",
        "summary": "Menu actions work by keyboard; existing findings still need review.",
        "problem": "The original menu opens, but keyboard users cannot move into its commands or complete the menu lifecycle.",
        "repairExplanation": "The patch adds focus entry, menu navigation, selection, Escape, and focus return.",
        "decisionExplanation": "Both keyboard workflows pass without new findings. The recorded decision is accepted with review remaining: 15 existing violation signatures and 2 incomplete signatures remain.",
        "before": "Original: the menu opens but keyboard selection is blocked.", "after": "Candidate: the keyboard task selects Duplicate.",
    },
    "tictactoe": {
        "title": "Keyboard play is only part of the proof", "shortTitle": "Public Tic Tac Toe",
        "summary": "Keyboard play improves, but unresolved checks and lost board outlines prevent acceptance.",
        "problem": "The public React mini app has clickable game cells that keyboard users cannot operate.",
        "repairExplanation": "The patch makes cells keyboard-operable. Screenshot review also found that the board outlines disappeared.",
        "decisionExplanation": "The frozen verifier rejects 16 new incomplete signatures, not 16 confirmed violations. A separate screenshot review found missing board outlines that the task checks missed.",
        "before": "Original public mini app: board outlines are visible.", "after": "Candidate: keyboard play works, but board outlines are lost.",
    },
}
TASK_NAMES = {
    "keyboard-activity": "Open Activity, return, and save a note",
    "keyboard-billing": "Open Billing, return, and save a note",
    "pointer-activity": "Click Activity and keep notes working",
    "pointer-billing": "Click Billing and keep notes working",
    "keyboard-save": "Change and save using the keyboard",
    "keyboard-reset": "Change, reset, and save using the keyboard",
    "pointer-save": "Change and save using the pointer",
    "pointer-reset": "Change, reset, and save using the pointer",
    "keyboard-cancel": "Cancel changes and return keyboard focus",
    "keyboard-escape": "Close with Escape and return keyboard focus",
    "pointer-cancel": "Cancel without changing saved preferences",
    "keyboard-enter": "Activate with Enter and preserve the result",
    "keyboard-space": "Activate with Space and preserve the result",
    "pointer-apply": "Apply and clear the discount with the pointer",
    "pointer-clear-first": "Keep order actions working after clearing",
    "keyboard-duplicate": "Duplicate, cancel, and return keyboard focus",
    "keyboard-archive": "Archive, cancel, and return keyboard focus",
    "pointer-duplicate": "Duplicate and keep draft creation working",
    "pointer-archive": "Archive and keep draft creation working",
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def public_text_check(data: bytes) -> None:
    text = data.decode("utf-8-sig")
    forbidden = [r"(?i)\b[A-Z]:[\\/]+(?:Users|workspace|Temp|Program Files)[\\/]+",
                 r"(?i)/(?:Users|home|workspace)/", r"\bsk-[A-Za-z0-9_-]{24,}",
                 r"(?i)Bearer\s+[A-Za-z0-9._-]{16,}", r"(?i)\.env(?:\s|\"|$)"]
    if any(re.search(pattern, text) for pattern in forbidden):
        raise ValueError("A selected text artifact contains a forbidden private-path or credential pattern")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--snapshot", required=True, type=Path)
    args = parser.parse_args()
    archive_bytes = args.archive.read_bytes()
    if digest(archive_bytes) != EXPECTED_ZIP_SHA256:
        raise ValueError("The reviewed public evidence archive hash does not match")
    entries = []
    cases = []
    z = zipfile.ZipFile(args.archive)

    def read(member: str) -> bytes:
        if member.startswith("/") or ".." in Path(member).parts:
            raise ValueError("Invalid archive member")
        return z.read(member)

    def data(member: str):
        return json.loads(read(member))

    def source_ref(member: str, origin="reviewed-public-archive"):
        blob = read(member) if origin == "reviewed-public-archive" else (args.snapshot / member).read_bytes()
        return {"origin": origin, "member": member, "sha256": digest(blob)}

    def write_file(case_id, filename, blob, label, kind, sources, derived=False):
        target = ROOT / "public/evidence" / case_id / filename
        if target.suffix != ".png":
            public_text_check(blob)
        elif blob[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError("Expected PNG")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(blob)
        record = {"path": "/evidence/" + case_id + "/" + filename, "sha256": digest(blob),
                  "bytes": len(blob), "derived": derived, "byteIdentical": not derived,
                  "sources": sources, "label": label, "kind": kind}
        entries.append(record)
        return {k: record[k] for k in ["label", "path", "kind", "sha256", "derived"]}

    def copy(case_id, filename, member, label, kind):
        return write_file(case_id, filename, read(member), label, kind, [source_ref(member)])

    def derived(case_id, filename, payload, label, kind, members):
        wrapper = {"derived": True, "notice": "Derived presentation of preserved public evidence; not a new experiment.",
                   "sources": [source_ref(m) for m in members], "data": payload}
        return write_file(case_id, filename, (json.dumps(wrapper, indent=2, ensure_ascii=False) + "\n").encode(),
                          label, kind, wrapper["sources"], True)

    def snap_copy(case_id, filename, relative, label, kind):
        blob = (args.snapshot / relative).read_bytes()
        return write_file(case_id, filename, blob, label, kind, [source_ref(relative, "reviewed-public-snapshot")])

    def metric(m):
        return {"keyboardPass": m["keyboard_pass"], "keyboardTotal": m["keyboard_total"],
                "pointerPass": m["pointer_pass"], "pointerTotal": m["pointer_total"],
                "violations": m["axe_state_nodes"], "incomplete": m["incomplete_state_nodes"],
                "measurementComplete": m["measurement_complete"], "observedAuditStates": m["observed_audit_states"]}

    def common(case_id, dec, model, patch):
        words = COPY[case_id]
        return {"id": case_id, **{k: words[k] for k in ["title", "shortTitle", "summary", "problem", "repairExplanation", "decisionExplanation"]},
                "kind": "Public open-source mini app" if case_id == "tictactoe" else "Project-authored test fixture",
                "decision": dec["status"], "manualReview": dec["manual_review"],
                "reasons": dec["reasons"], "newViolations": dec["new_violations"], "newIncomplete": dec["new_incomplete"],
                "metrics": {phase: metric(dec["metrics"][phase]) for phase in ["before", "after"]},
                "model": {"id": model["response_model"], "requestedId": model["requested_model"], "provider": "Meta",
                          "requests": model["request_attempts"], "tokens": model["usage"]["total_tokens"],
                          "seconds": round(model["elapsed_s"], 3), "costUsd": model["cost_usd"],
                          "automaticRetries": model["automatic_retries"], "recordedAt": model["started_utc"]},
                "patch": patch, "notes": ["Stored historical results; opening this page makes no model request.",
                    "Counts cover the declared tasks and measured states, not complete accessibility conformance.",
                    "Blocked original workflows leave later states unmeasured. Missing evidence is never a pass.",
                    "Model cost was not recorded; it is unknown, not zero."], "images": {}, "keyboardLog": [], "tasks": [], "files": []}

    for case_id, folder, analysis_id, repair_id, before_image, after_image in SPECS:
        ap = "artifacts/" + folder + "/analyses/" + analysis_id
        rp = "artifacts/" + folder + "/repairs/" + repair_id
        decision_member, model_member, patch_member = rp + "/decision.json", rp + "/model/metadata.json", rp + "/patch.diff"
        dec, model = data(decision_member), data(model_member)
        case = common(case_id, dec, model, read(patch_member).decode("utf-8"))
        case["files"] += [copy(case_id, "decision.json", decision_member, "Recorded decision", "decision"),
                          copy(case_id, "model.json", model_member, "Recorded model metadata", "model"),
                          copy(case_id, "patch.diff", patch_member, "Actual model patch", "patch")]
        results = {"before": data(ap + "/baseline/result.json"), "after": data(rp + "/validation/result.json")}
        result_members = {"before": ap + "/baseline/result.json", "after": rp + "/validation/result.json"}
        for phase in ["before", "after"]:
            case["files"].append(copy(case_id, phase + "-tasks.json", result_members[phase],
                                      ("Original" if phase == "before" else "Candidate") + " browser task results", "tasks"))
        workflows = {phase: {v["id"]: v for v in results[phase]["workflows"]} for phase in results}
        for task_id, after in workflows["after"].items():
            before = workflows["before"].get(task_id)
            case["tasks"].append({"id": task_id, "name": TASK_NAMES.get(task_id, task_id.replace("-", " ").capitalize()),
                                  "mode": after["modality"], "beforePassed": before["status"] == "pass" if before else None,
                                  "afterPassed": after["status"] == "pass", "beforeChecks": before.get("checks", []) if before else [],
                                  "afterChecks": after.get("checks", [])})
        for phase in ["before", "after"]:
            for task_id, workflow in workflows[phase].items():
                if workflow["modality"] != "keyboard":
                    continue
                recorded = [a for a in workflow.get("actions", []) if a.get("kind") == "key"]
                case["keyboardLog"].append({"phase": phase, "taskId": task_id,
                    "label": ("Original" if phase == "before" else "Candidate") + " · " + TASK_NAMES.get(task_id, task_id),
                    "keys": [a["key"] for a in recorded], "entries": recorded,
                    "passed": workflow["status"] == "pass",
                    "actual": "Task completed" if workflow["status"] == "pass" else "Task did not complete",
                    "source": "/evidence/" + case_id + "/" + phase + "-tasks.json"})
        audit = {phase: [{"task": wf["id"], "audits": wf.get("audits", [])} for wf in results[phase]["workflows"]] for phase in results}
        case["files"].append(derived(case_id, "audits.json", audit, "Measured state audits · derived", "audit", list(result_members.values())))
        case["files"].append(derived(case_id, "tasks.json", case["tasks"], "Task comparison · derived", "tasks", list(result_members.values())))
        for phase, member in [("before", ap + "/baseline/evidence/" + before_image), ("after", rp + "/validation/evidence/" + after_image)]:
            f = copy(case_id, phase + ".png", member, COPY[case_id][phase], "image")
            case["files"].append(f)
            case["images"][phase] = {"src": f["path"], "caption": COPY[case_id][phase], "sha256": f["sha256"]}
        if case_id == "switch":
            case["images"]["contrastBefore"] = case["images"]["before"]
            case["images"]["contrastAfter"] = case["images"]["after"]
            for phase, member in [("taskBefore", ap + "/baseline/evidence/keyboard-save/initial.png"),
                                   ("taskAfter", rp + "/validation/evidence/keyboard-save/saved.png")]:
                f = copy(case_id, phase + ".png", member, "Keyboard save task " + phase, "image")
                case["files"].append(f)
                case["images"][phase] = {"src": f["path"], "caption": "Original keyboard task is blocked." if phase == "taskBefore" else "Candidate keyboard task saves the setting."}
            case["files"].append(copy(case_id, "contrast-audit.json", rp + "/validation/evidence/pointer-save/initial.axe.json", "New contrast violation · original audit", "audit"))
            case["contrast"] = {"ratio": 1.19, "required": 4.5, "foreground": "#ffffff", "background": "#e6ece8", "text": "Off", "state": "initial"}
        if case_id == "tabs":
            f = copy(case_id, "after-persisted.png", rp + "/validation/evidence/keyboard-activity/persisted.png", "Candidate note remains after reload", "image")
            case["files"].append(f)
        record = data(ap + "/record.json")
        license_member = "examples/modal/LICENSE" if case_id == "modal" else "evaluation/m4/cases/LICENSE"
        case["source"] = {"kind": "Project-authored synthetic fixture", "name": "AccessFix AI " + case["shortTitle"],
                          "license": "MIT (fixture source)", "sha256": record["source_hashes"].get("src/ModalApp.tsx", record["source_hashes"].get("src/App.tsx")),
                          "hashes": record["source_hashes"], "evidenceArchiveSha256": EXPECTED_ZIP_SHA256}
        case["files"].append(derived(case_id, "source.json", case["source"], "Source attribution · derived", "source", [ap + "/record.json"]))
        case["files"].append(snap_copy(case_id, "LICENSE.txt", license_member, "Fixture source license", "license"))
        case["checks"] = {"afterPassed": sum(c["status"] == "pass" for wf in results["after"]["workflows"] for c in wf["checks"]),
                          "afterTotal": sum(len(wf["required_checks"]) for wf in results["after"]["workflows"])}
        if case_id == "menu":
            case["notes"].append("Accepted with review remaining: 15 existing violation signatures and 2 incomplete signatures remain. This is not a clean audit.")
        cases.append(case)

    case_id = "tictactoe"
    prefix = "public-evidence/m5/"
    dm, mm, pm = prefix + "public-app/decision.json", prefix + "public-app/model/metadata.json", prefix + "public-app/patch.diff"
    sm = prefix + "public-app-meta-summary.json"
    dec, model, summary = data(dm), data(mm), data(sm)
    case = common(case_id, dec, model, read(pm).decode("utf-8"))
    for filename, member, label, kind in [("decision.json", dm, "Recorded decision", "decision"), ("model.json", mm, "Recorded model metadata", "model"),
                                          ("patch.diff", pm, "Actual model patch", "patch"), ("recorded-summary.json", sm, "Preserved public experiment summary", "tasks")]:
        case["files"].append(copy(case_id, filename, member, label, kind))
    for phase in ["before", "after"]:
        f = copy(case_id, phase + ".png", prefix + "screenshots/public-" + phase + ".png", COPY[case_id][phase], "image")
        case["files"].append(f)
        case["images"][phase] = {"src": f["path"], "caption": COPY[case_id][phase], "sha256": f["sha256"]}
    case["tasks"] = [
        {"id": "keyboard-summary", "name": "Complete both keyboard game tasks (Enter and Space)", "mode": "keyboard", "beforePassed": False, "afterPassed": True,
         "beforeCount": 0, "afterCount": 2, "total": 2, "evidenceLevel": "Preserved aggregate result; detailed per-step log is not in this public copy."},
        {"id": "pointer-summary", "name": "Complete the three pointer game outcomes", "mode": "pointer", "beforePassed": True, "afterPassed": True,
         "beforeCount": 3, "afterCount": 3, "total": 3, "evidenceLevel": "Preserved aggregate result; detailed per-step log is not in this public copy."},
    ]
    case["files"].append(derived(case_id, "tasks.json", {"tasks": case["tasks"], "keyboardLogAvailable": False}, "Task outcome summary · derived", "tasks", [dm, sm]))
    case["files"].append(derived(case_id, "audits.json", {"before": dec["metrics"]["before"], "after": dec["metrics"]["after"],
                            "newIncomplete": dec["new_incomplete"], "fullStateAuditsAvailable": False}, "Audit signature summary · derived", "audit", [dm]))
    provenance_member = "evaluation/m5_public_tictactoe/provenance.json"
    provenance = json.loads((args.snapshot / provenance_member).read_text(encoding="utf-8"))
    app = next(f for f in provenance["files"] if f["upstream_path"].endswith("App.jsx"))
    case["source"] = {"kind": "Public open-source React mini app", "name": "Frontend Mini Challenges · Tic Tac Toe",
                      "url": provenance["repository"], "commit": provenance["commit"], "license": "MIT · Sadanand Pai", "sha256": app["sha256"],
                      "scope": "Pinned game module in a small AccessFix wrapper; not the full upstream repository or production deployment."}
    case["files"].append(snap_copy(case_id, "source-provenance.json", provenance_member, "Published upstream source provenance", "source"))
    case["files"].append(snap_copy(case_id, "LICENSE.txt", "evaluation/m5_public_tictactoe/upstream/LICENSE", "Upstream MIT license", "license"))
    case["notes"] += ["The 16 new incomplete signatures require review; they are not 16 confirmed accessibility violations.",
                      "Separate screenshot review found lost board outlines. The original task verifier did not catch that visual loss.",
                      "Detailed key events and full state audit reports are not included in this public evidence copy.",
                      "This evaluates a real public mini app in a local wrapper, not its complete upstream repository."]
    cases.append(case)
    bundle = {"version": 1, "notice": "Read-only replay of preserved experiments. No uploads, live repairs, or model requests.",
              "evidenceNotice": "Original screenshots, patches and decisions retain their recorded bytes. Derived summaries are labelled. Missing evidence is not a successful measurement.",
              "cases": cases}
    encoded = (json.dumps(bundle, indent=2, ensure_ascii=False) + "\n").encode()
    public_text_check(encoded)
    (ROOT / "public/data").mkdir(parents=True, exist_ok=True)
    (ROOT / "public/data/cases.json").write_bytes(encoded)
    manifest = {"version": 1, "archiveName": "accessfix-demo-evidence.zip", "archiveSha256": EXPECTED_ZIP_SHA256,
                "method": "Explicit public allowlist; raw files copied byte-for-byte; derived fields retain source references and hashes.",
                "sourceOriginalsModified": False, "modelRequests": 0, "networkRequests": 0,
                "excluded": ["private files", "credentials", "raw model requests/responses", "trace archives", "unselected experiments"],
                "caseIds": [c["id"] for c in cases], "files": entries,
                "normalizedData": {"path": "/data/cases.json", "sha256": digest(encoded), "derived": True}}
    (ROOT / "provenance").mkdir(parents=True, exist_ok=True)
    (ROOT / "provenance/evidence-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"cases": len(cases), "publicFiles": len(entries), "archiveVerified": True, "dataSha256": digest(encoded)}))


if __name__ == "__main__":
    main()
