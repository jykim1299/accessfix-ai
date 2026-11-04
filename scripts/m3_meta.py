"""Explicit live Meta experiment. No inference on import, status polling or tests.

One readiness request, then at most one repair request. Evidence is append-only
across invocations: select a new output directory; existing directories are refused.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from accessfix.browser import run_browser
from accessfix.gate import summarize
from accessfix.providers import get_provider, PROMPT_VERSION
from accessfix.service import Coordinator, EXAMPLE, protocol_hashes
from accessfix.storage import inventory, now, read_json, sha256, write_json

MODEL = "muse-spark-1.3-contributor"


def load_local_key():
    """Read only the named variable, including a newly set Windows user variable."""
    if os.environ.get("MODEL_API_KEY"):
        return "process_environment"
    if os.name == "nt":
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
                value, _ = winreg.QueryValueEx(key, "MODEL_API_KEY")
            if isinstance(value, str) and value:
                os.environ["MODEL_API_KEY"] = value
                return "windows_user_environment"
        except (OSError, ValueError):
            pass
    return None


def preservation():
    results = {}
    for phase in ("m1", "m2"):
        path = ROOT / "reports" / f"{phase}-20261027" / "artifact-manifest.json"
        expected = read_json(path)["sha256"]
        changed = [name for name, digest in expected.items()
                   if not (ROOT / name).is_file() or sha256(ROOT / name) != digest]
        results[phase] = {"manifest_sha256": sha256(path), "files_checked": len(expected),
                          "unchanged": not changed, "missing_or_changed": changed}
    return results


def run(out: Path, probe_only=False, verified_probe: Path | None = None):
    out = out.resolve()
    allowed = ROOT / "artifacts" / "m3-meta"
    if not out.is_relative_to(allowed) or out == allowed:
        raise ValueError("Use a new directory below artifacts/m3-meta")
    out.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    result = {"started_utc": now(), "requested_model": MODEL, "provider": "meta",
              "status": "preflight", "actual_request_attempts": 0, "automatic_retries": 0,
              "cost_usd": None, "meta_repair_accepted": None, "probe_only": probe_only}
    coordinator = None
    try:
        before = preservation()
        write_json(out / "preservation-before.json", before)
        if not all(item["unchanged"] for item in before.values()):
            raise RuntimeError("Historical evidence differs; inspect preservation report before inference")
        key_source = load_local_key()
        os.environ["META_MODEL"] = MODEL
        write_json(out / "plan.json", {"recorded_utc": now(), "key_present": bool(key_source),
            "key_source": key_source, "model": MODEL, "maximum_requests": 1 if probe_only or verified_probe else 2,
            "probe_token_cap": 256, "repair_token_cap": 12000, "prompt_version": PROMPT_VERSION,
            "protocol_hashes": protocol_hashes(), "source_hashes": inventory(EXAMPLE),
            "source_scope": "Registered official-build modal only; no private or PoC project code",
            "gate_policy": "Existing independent M1 verifier and gate; no retry or oracle adjustment",
            "muse_spark_measured_semantics": "Meta repair response observed, not a claim of browser success"})
        if not key_source:
            result.update(status="configuration_blocked", error="MODEL_API_KEY is not present in the local environment",
                          http_status=None, auth_verified=False)
            return result
        provider = get_provider("meta")
        probe_attempts = 0
        if verified_probe is not None:
            # Explicit recovery from a local browser/runtime failure; do not repeat paid inference.
            verified_probe = verified_probe.resolve()
            if not verified_probe.is_relative_to(allowed) or verified_probe.is_relative_to(out):
                raise ValueError("Reuse only an earlier M3 probe evidence directory")
            probe = read_json(verified_probe / "metadata.json")
            if (probe.get("requested_model") != MODEL or probe.get("provider") != "meta"
                    or probe.get("endpoint") != "https://api.meta.ai/v1/chat/completions"
                    or probe.get("purpose") != "authentication_probe" or probe.get("http_status") != 200
                    or not probe.get("probe_completed") or not probe.get("auth_verified") or probe.get("error")):
                raise ValueError("Previous probe did not verify this model and endpoint")
            result.update(probe_reused=True, probe_evidence=verified_probe.relative_to(ROOT).as_posix(),
                          probe_evidence_hashes=inventory(verified_probe))
        else:
            probe = provider.probe(out / "probe")["metadata"]
            probe_attempts = probe["request_attempts"]
        result.update(probe=probe, actual_request_attempts=probe_attempts,
                      auth_verified=probe["auth_verified"])
        print(json.dumps({"phase": "probe", "reused": bool(verified_probe), "http_status": probe.get("http_status"),
                          "auth_verified": probe["auth_verified"], "error_code": probe.get("error_code")}), flush=True)
        if not probe.get("probe_completed") or probe.get("error"):
            result["status"] = "probe_failed"
            return result
        if probe_only:
            result["status"] = "probe_completed"
            return result
        coordinator = Coordinator(root=out / "jobs")
        initial = coordinator.analyse()
        result["analysis_id"] = initial["id"]
        write_json(out / "summary.json", result)
        analysis = coordinator.wait("analyses", initial["id"])
        result.update(analysis_status=analysis["status"], baseline=analysis.get("metrics"),
                      analysis_elapsed_s=analysis.get("elapsed_s"))
        print(json.dumps({"phase": "analysis", "status": analysis["status"]}), flush=True)
        if analysis["status"] != "completed":
            result.update(status="analysis_failed", error=analysis.get("error"))
            return result
        repair_start = coordinator.repair(analysis["id"], "meta")
        result["repair_id"] = repair_start["id"]
        write_json(out / "summary.json", result)
        repair = coordinator.wait("repairs", repair_start["id"])
        decision = repair.get("decision") or {}
        metadata = repair.get("model") or {}
        result.update(status="repair_completed" if repair["status"] == "completed" else "repair_failed",
                      model=metadata, repair_terminal_status=repair["status"], repair_error=repair.get("error"),
                      repair_elapsed_s=repair.get("elapsed_s"), meta_repair_accepted=decision.get("accepted", False),
                      gate_reasons=decision.get("reasons"), decision=decision,
                      candidate=decision.get("metrics", {}).get("after"),
                      actual_request_attempts=probe_attempts + metadata["request_attempts"] if "request_attempts" in metadata else None)
        # Repeated repair must resolve to the same completed record, never another model call.
        repeated = coordinator.repair(analysis["id"], "meta")
        result["idempotency_pass"] = repeated["id"] == repair["id"] and repeated["model_requests"] == repair["model_requests"]
        restored = coordinator.restore(repair["id"])
        original = out / "jobs" / "analyses" / analysis["id"] / "original"
        result.update(current_selected=restored["selected"], current_status=restored["status"],
                      decision_preserved=restored.get("decision") == repair.get("decision"),
                      original_hashes_match=inventory(original) == analysis["source_hashes"])
        restored_browser = run_browser(original, out / "restored-browser", mode="final")
        metrics = summarize(restored_browser)
        result.update(restored_metrics=metrics, restore_browser_matches_baseline=all(
            metrics[k] == analysis["metrics"][k] for k in
            ("pointer_pass", "keyboard_pass", "axe_state_nodes", "incomplete_state_nodes")))
        return result
    except Exception as error:
        secret = os.environ.get("MODEL_API_KEY", "")
        message = str(error).replace(secret, "[REDACTED]") if secret else str(error)
        result.update(status="experiment_failed", error=message[:1000])
        return result
    finally:
        if coordinator: coordinator.close()
        result.update(finished_utc=now(), elapsed_s=time.monotonic() - started)
        write_json(out / "preservation-after.json", preservation())
        write_json(out / "summary.json", result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--probe-only", action="store_true")
    parser.add_argument("--verified-probe", type=Path, help="Explicitly reuse successful earlier M3 probe evidence; no new probe request")
    args = parser.parse_args()
    outcome = run(args.output, args.probe_only, args.verified_probe)
    print(json.dumps(outcome, ensure_ascii=False, indent=2))
    raise SystemExit(0 if outcome["status"] in {"repair_completed", "probe_completed"} else 1)
