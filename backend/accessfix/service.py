"""Local single-worker coordinator. Failed and interrupted repairs retain originals."""
from __future__ import annotations

import json
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .gate import assess, summarize
from .patching import create_candidate, source_payload
from .storage import ARTIFACTS, PROJECT, inventory, now, read_json, safe_child, sha256, write_json

EXAMPLE_ID = "delivery-modal"
TASK_ID = "delivery-preferences"
EXAMPLE = PROJECT / "examples" / "modal"
TASK = "Use the delivery preferences modal to edit and save settings, cancel changes, and return to the surrounding workspace using keyboard or pointer."


def protocol_hashes():
    paths = [*(PROJECT / "runtime").rglob("*"), *(PROJECT / "backend" / "accessfix").glob("*.py")]
    return {p.relative_to(PROJECT).as_posix():sha256(p) for p in sorted(paths) if p.is_file() and "node_modules" not in p.parts and p.suffix not in (".log", ".pyc")}


class BusyError(RuntimeError):pass


class Coordinator:
    def __init__(self, root: Path = ARTIFACTS, runner=None, provider_factory=None):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.lockfile = (self.root / ".coordinator.lock").open("a+b")
        self.lockfile.seek(0)
        try:
            import os
            if os.name == "nt":
                import msvcrt
                if self.lockfile.read(1) == b"":
                    self.lockfile.write(b"0");self.lockfile.flush()
                self.lockfile.seek(0)
                msvcrt.locking(self.lockfile.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.lockfile, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.lockfile.close()
            raise RuntimeError("Another coordinator owns this artifact directory; use one server worker")
        self.runner = runner
        self.provider_factory = provider_factory
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="accessfix")
        self.mutex = threading.RLock()
        self.busy = False
        self._recover()

    def close(self):
        self.pool.shutdown(wait=True)
        self.lockfile.close()

    def _recover(self):
        for path in self.root.glob("*/*/record.json"):
            record = read_json(path)
            if record["status"] not in ("completed", "failed", "restored"):
                record.update(status="failed", error="Process interrupted; never automatically resend a model request", selected="original", finished_at=now())
                write_json(path, record)

    def _dir(self, kind: str, ident: str) -> Path:
        if kind not in ("analyses", "repairs") or len(ident) != 32 or any(c not in "0123456789abcdef" for c in ident):
            raise ValueError("Invalid record identifier")
        return self.root / kind / ident

    def get(self, kind, ident):
        return read_json(self._dir(kind, ident) / "record.json")

    def event(self, kind, ident, status, message, **changes):
        with self.mutex:
            directory = self._dir(kind, ident)
            record = self.get(kind, ident)
            entry = {"sequence":len(record["events"]) + 1,"time":now(),"status":status,"message":message}
            record["events"].append(entry)
            record.update(status=status, **changes)
            with (directory / "events.jsonl").open("a", encoding="utf-8") as f:f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            write_json(directory / "record.json", record)
            return record

    def _launch(self, function, *args):
        if self.busy:raise BusyError("A browser or repair job is already running")
        self.busy = True
        self.pool.submit(self._work, function, args)

    def _work(self, function, args):
        try:function(*args)
        finally:
            with self.mutex:self.busy = False

    def _browser(self, source, out, mode):
        if self.runner is None:
            from .browser import run_browser
            return run_browser(source, out, mode=mode)
        return self.runner(source, out, mode=mode)

    def analyse(self, example_id=EXAMPLE_ID, task_id=TASK_ID):
        if example_id != EXAMPLE_ID or task_id != TASK_ID:raise ValueError("Only the registered modal example/task is supported")
        with self.mutex:
            if self.busy:raise BusyError("A job is already running")
            ident = uuid.uuid4().hex
            directory = self._dir("analyses", ident);directory.mkdir(parents=True)
            record = {"id":ident,"kind":"analysis","example_id":example_id,"task_id":task_id,"created_at":now(),"status":"queued","events":[],"repair_id":None,"selected":"original"}
            write_json(directory / "record.json", record)
            self._launch(self._analyse, ident)
            return record

    def _analyse(self, ident):
        started = time.monotonic();directory = self._dir("analyses", ident)
        try:
            self.event("analyses", ident, "baseline_running", "Building and measuring the original modal")
            original = directory / "original"
            source_hashes = inventory(EXAMPLE)
            shutil.copytree(EXAMPLE, original)
            if inventory(original) != source_hashes:raise RuntimeError("Source snapshot differs")
            protocol = protocol_hashes()
            write_json(directory / "source-manifest.json", source_hashes)
            write_json(directory / "protocol-manifest.json", protocol)
            baseline = self._browser(original, directory / "baseline", "final")
            observation = self._browser(original, directory / "observation", "observe")
            if inventory(original) != source_hashes or protocol_hashes() != protocol:raise RuntimeError("Source or verifier changed during analysis")
            summary = summarize(baseline)
            operational = observation.get("observations", {})
            audits = operational.get("audits", [])
            observation_valid = (observation.get("build_ok") is True and not observation.get("error") and observation.get("container_exit_code", 0) == 0
                and isinstance(operational, dict) and not operational.get("errors") and not operational.get("page_errors")
                and isinstance(audits, list) and len(audits) == 2 and {a.get("state") for a in audits} == {"closed", "open"}
                and all(a.get("status") == "complete" for a in audits))
            if not summary["pointer_reference_valid"] or summary["pointer_pass"] != summary["pointer_total"] or not observation_valid:
                raise RuntimeError("Baseline or operational measurement is incomplete; evidence retained")
            self.event("analyses", ident, "completed", "Original measurements saved", baseline=baseline, metrics=summary, source_hashes=source_hashes, protocol_hashes=protocol, elapsed_s=time.monotonic()-started, finished_at=now())
        except Exception as error:
            self.event("analyses", ident, "failed", "Analysis failed; no repair was requested", error=str(error), elapsed_s=time.monotonic()-started, finished_at=now())

    def repair(self, ident, provider_name):
        with self.mutex:
            analysis = self.get("analyses", ident)
            if analysis.get("repair_id"):
                return self.get("repairs", analysis["repair_id"])
            if analysis["status"] != "completed":raise ValueError("A completed analysis is required")
            if self.busy:raise BusyError("A job is already running")
            if provider_name not in ("openai", "codex", "meta", "spark-open"):raise ValueError("Unknown provider")
            rid = uuid.uuid4().hex;directory = self._dir("repairs", rid);directory.mkdir(parents=True)
            record = {"id":rid,"kind":"repair","analysis_id":ident,"provider":provider_name,"created_at":now(),"status":"queued","selected":"original","events":[],"model_requests":0,"diff":None,"decision":None}
            write_json(directory / "record.json", record)
            analysis["repair_id"] = rid
            write_json(self._dir("analyses", ident) / "record.json", analysis)
            self._launch(self._repair, rid)
            return record

    def _repair(self, rid):
        started=time.monotonic();record=self.get("repairs",rid);directory=self._dir("repairs",rid)
        aid=record["analysis_id"];analysis=self.get("analyses",aid);adir=self._dir("analyses",aid);original=adir/"original"
        try:
            if inventory(original)!=analysis["source_hashes"] or protocol_hashes()!=analysis["protocol_hashes"]:
                raise RuntimeError("Frozen source or verifier changed; create a new analysis")
            from .providers import get_provider
            provider=(self.provider_factory or get_provider)(record["provider"])
            operational=read_json(adir/"observation"/"result.json")
            # Explicit field selection: never serialize final measurement or its assertions.
            diagnostics=operational.get("observations")
            if not isinstance(diagnostics, (dict,list)) or not diagnostics:raise RuntimeError("Operational diagnostics missing")
            payload={"task":TASK,"files":source_payload(original),"observations":diagnostics}
            self.event("repairs",rid,"model_running","Requesting one bounded repair proposal",model_requests=1)
            response=provider.propose(payload,directory/"model")
            metadata=response["metadata"]
            write_json(directory/"provider-metadata.json",metadata)
            self.event("repairs",rid,"patch_checking","Checking the returned patch",model=metadata)
            proposal=response.get("proposal")
            if proposal is None:raise RuntimeError("Provider did not return a valid patch; see model evidence")
            diff=create_candidate(original,directory/"candidate",proposal,analysis["source_hashes"])
            (directory/"patch.diff").write_text(diff,encoding="utf-8")
            hashes=inventory(directory/"candidate")
            self.event("repairs",rid,"candidate_running","Validating independent pointer and keyboard tasks",diff=diff,candidate_hashes=hashes)
            candidate=self._browser(directory/"candidate",directory/"validation","final")
            if inventory(original)!=analysis["source_hashes"] or inventory(directory/"candidate")!=hashes or protocol_hashes()!=analysis["protocol_hashes"]:
                raise RuntimeError("Integrity changed during verification")
            decision=assess(analysis["baseline"],candidate)
            write_json(directory/"decision.json",decision)
            selected="candidate" if decision["accepted"] else "original"
            self.event("repairs",rid,"completed","Candidate accepted" if decision["accepted"] else "Candidate rejected; original retained",validation=candidate,decision=decision,selected=selected,original_intact=True,elapsed_s=time.monotonic()-started,finished_at=now())
        except Exception as error:
            self.event("repairs",rid,"failed","Repair failed; original retained",error=str(error),selected="original",original_intact=inventory(original)==analysis.get("source_hashes"),elapsed_s=time.monotonic()-started,finished_at=now())
        finally:
            immutable = {p:h for p,h in inventory(directory).items() if p not in ("record.json","events.jsonl","restoration.json","evidence-manifest.json")}
            write_json(directory/"evidence-manifest.json",immutable)

    def restore(self, rid):
        with self.mutex:
            record=self.get("repairs",rid)
            if record["status"] not in ("completed","failed","restored"):raise BusyError("Wait for repair to finish before restoring")
            analysis=self.get("analyses",record["analysis_id"])
            if inventory(self._dir("analyses",analysis["id"])/"original")!=analysis["source_hashes"]:raise RuntimeError("Original source integrity failed")
            result=self.event("repairs",rid,"restored","Original source selected; candidate evidence retained",selected="original",original_intact=True,restored_at=now())
            write_json(self._dir("repairs",rid)/"restoration.json",{"time":now(),"selected":"original","original_hashes":analysis["source_hashes"],"decision_unchanged":record.get("decision")})
            return result

    def artifact(self, kind, ident, relative):
        file=safe_child(self._dir(kind,ident),relative)
        if not file.is_file():raise FileNotFoundError("Artifact does not exist")
        return file

    def wait(self, kind, ident, timeout=900):
        end=time.monotonic()+timeout
        while time.monotonic()<end:
            record=self.get(kind,ident)
            if record["status"] in ("completed","failed","restored") and not self.busy:return record
            time.sleep(.2)
        raise TimeoutError("Job still running; query its ID")
