"""M4 uses the M1 isolation policy and pinned image with a separate trusted harness."""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
IMAGE = "accessfix-m1-browser:20261027"


def run_browser(source: Path, out: Path, case_id: str, mode: str = "final") -> dict:
    cases = json.loads((ROOT / "evaluation/m4/cases.json").read_text(encoding="utf-8"))
    if case_id not in {c["id"] for c in cases}: raise ValueError("Unregistered M4 case")
    if mode not in {"observe", "final", "isolation"}:
        raise ValueError("Unsupported browser mode")
    source, out = Path(source).resolve(), Path(out).resolve()
    if not source.is_dir() or not (source / "src/main.tsx").is_file():
        raise ValueError("Registered React entry is missing")
    if out == source or out.is_relative_to(source):
        raise ValueError("Evidence must be outside the source")
    out.mkdir(parents=True, exist_ok=False)
    name = "accessfix-m4-" + uuid.uuid4().hex[:12]
    command = [
        "docker", "run", "--rm", "--init", "--name", name,
        "--network", "none", "--read-only", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges", "--user", "pwuser",
        "--memory", "2g", "--cpus", "2", "--pids-limit", "256", "--shm-size", "512m",
        "--tmpfs", "/tmp:rw,nosuid,nodev,size=512m",
        "--mount", f"type=bind,source={source},target=/source,readonly",
        "--mount", f"type=bind,source={ROOT / 'evaluation/m4/harness'},target=/harness,readonly",
        "--mount", f"type=bind,source={out},target=/out", IMAGE, case_id + ":" + mode,
    ]
    (out / "command.json").write_text(json.dumps(command, indent=2), encoding="utf-8")
    started = time.perf_counter()
    result_path = out / "result.json"
    try:
        image = subprocess.run(["docker", "image", "inspect", IMAGE, "--format", "{{.Id}}"],
            capture_output=True, text=True, timeout=20, check=True).stdout.strip()
        run = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
        (out / "container.log").write_text(run.stdout + "\n" + run.stderr, encoding="utf-8")
        result = json.loads(result_path.read_text(encoding="utf-8")) if result_path.is_file() else {
            "schema_version": 1, "build_ok": False, "mode": mode, "workflows": [],
            "error": {"category": "container_failed", "message": "Container produced no measurement", "exit_code": run.returncode},
        }
        result["image_id"] = image
        result["container_exit_code"] = run.returncode
    except subprocess.TimeoutExpired as error:
        def decoded(value):
            return value.decode("utf-8", errors="replace") if isinstance(value, bytes) else (value or "")
        (out / "container.log").write_text(decoded(error.stdout) + "\n" + decoded(error.stderr), encoding="utf-8")
        cleanup_error = None
        try:
            subprocess.run(["docker", "stop", "-t", "1", name], capture_output=True, timeout=15, check=True)
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, OSError) as cleanup:
            cleanup_error = str(cleanup)[:1000]
        result = {"schema_version": 1, "build_ok": False, "mode": mode, "workflows": [],
                  "error": {"category": "measurement_timeout", "message": "Browser container exceeded 300 seconds"}}
        if cleanup_error:
            result["error"]["cleanup_error"] = cleanup_error
    except (subprocess.CalledProcessError, OSError, ValueError) as error:
        result = {"schema_version": 1, "build_ok": False, "mode": mode, "workflows": [],
                  "error": {"category": "runtime_unavailable", "message": str(error)[:1000]}}
    result["wall_s"] = time.perf_counter() - started
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result
