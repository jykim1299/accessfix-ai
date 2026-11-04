"""Isolated M2 UI integration host: real browser validation, zero LLM requests.

It never imports the real provider factory. First Repair returns an explicit
manual positive control; subsequent Repair returns a deliberately invalid patch.
All records are new test-control artifacts, outside M1 and production UI history.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "tests"))

from accessfix.product import create_product_app
from accessfix.service import Coordinator
from accessfix.storage import write_json, now
from controls.build_controls import positive_source


class ManualProvider:
    def __init__(self, evidence: Path):
        self.evidence = evidence
        self.invocations = 0

    def propose(self, payload: dict, out: Path) -> dict:
        self.invocations += 1
        out.mkdir(parents=True, exist_ok=False)
        metadata = {"provider": "ui-test-manual-control", "requested_model": None,
                    "response_model": None, "request_attempts": 0, "automatic_retries": 0,
                    "usage": None, "cost_usd": None, "live_response_received": False,
                    "auth_verified": False, "external_model_requests": 0,
                    "purpose": "Explicit UI integration control, never AI repair performance"}
        if self.invocations == 1:
            original = payload["files"]["src/ModalApp.tsx"]
            proposal = {"rationale": "Manual positive control for UI integration; no model inference",
                        "edits": [{"path": "src/ModalApp.tsx", "old": original,
                                   "new": positive_source(original)}]}
        else:
            proposal = None
            metadata["error"] = "deliberate_ui_test_provider_failure"
            metadata["error_message"] = "Manual UI control returned no patch to exercise a failed repair"
        write_json(out / "metadata.json", metadata)
        write_json(out / "proposal.json", proposal)
        write_json(self.evidence / "manual-provider-calls.json", {
            "time": now(), "invocations": self.invocations, "external_model_requests": 0,
            "purpose": "Manual test provider only; no actual model transport instantiated"})
        # A real short processing phase makes polling observable without fake progress.
        time.sleep(1)
        return {"proposal": proposal, "metadata": metadata}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8802)
    args = parser.parse_args()
    target = args.root.resolve()
    target.mkdir(parents=True, exist_ok=False)
    provider = ManualProvider(target)
    jobs = Coordinator(root=target / "jobs", provider_factory=lambda _: provider)
    app = create_product_app(root=jobs.root, coordinator=jobs, live_provenance="test-control")
    import uvicorn
    try:
        uvicorn.run(app, host="127.0.0.1", port=args.port, workers=1)
    finally:
        jobs.close()


if __name__ == "__main__":
    main()
