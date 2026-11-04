"""M2 read-only presentation API around the unchanged M1 repair coordinator.

The live product owns a separate evidence root. Historical M1 runs are fixed,
read-only registrations; archived IDs never become mutation targets.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
import re
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import create_app
from .service import Coordinator
from .storage import ARTIFACTS, PROJECT, read_json, safe_child, sha256

ID = re.compile(r"^[0-9a-f]{32}$")
TERMINAL = {"completed", "failed", "restored"}
ARCHIVES = {
    "m1-ai": ("", "060e72c0e457402db2b74c67fd864274", "M1 · AI modal repair", "ai"),
    "m1-control": ("api-rejection-control-v1/jobs", "e1168624ac7f4adca402a1ddc74a4187", "M1 · Pointer regression control", "manual-control"),
    "m3-meta": ("m3-meta/live-v2/jobs", "fe2e9435f2e84842a497a7004a37a3da", "M3 · Meta modal repair", "ai"),
}
PROVENANCE = {
    "ai": "Actual AI repair",
    "manual-control": "Manual control · not AI performance",
    "test-control": "UI test control · no live inference",
    "analysis": "Browser analysis · no repair requested",
}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _record(root: Path, kind: str, ident: str) -> dict:
    if kind not in {"analyses", "repairs"} or not isinstance(ident, str) or not ID.fullmatch(ident):
        raise HTTPException(404, "Unknown run")
    value = read_json(safe_child(root, f"{kind}/{ident}/record.json"))
    if not isinstance(value, dict) or value.get("id") != ident:
        raise ValueError("Stored record identity is invalid")
    return value


def _provenance(repair: dict | None) -> str:
    if repair is None:
        return "analysis"
    model = repair.get("model") or {}
    provider = str(model.get("provider", ""))
    if provider.startswith("manual-"):
        return "manual-control"
    if provider.startswith(("synthetic", "test-", "ui-test")):
        return "test-control"
    return "ai"


def _allowed(kind: str, relative: str) -> bool:
    """Expose known evidence outputs, never arbitrary files from a run directory."""
    parts = relative.split("/")
    if any(not part or part.startswith(".") for part in parts):
        return False
    common = {"record.json", "events.jsonl"}
    if kind == "analyses":
        if relative in common | {"source-manifest.json", "protocol-manifest.json"}:
            return True
        if relative.startswith(("baseline/", "observation/")):
            return "/dist/" not in relative and Path(relative).suffix in {".json", ".png", ".zip", ".log"}
        return relative in {"original/src/ModalApp.tsx", "original/src/App.tsx", "original/src/styles.css", "original/src/main.tsx"}
    if kind == "repairs":
        if relative in common | {"patch.diff", "decision.json", "provider-metadata.json", "evidence-manifest.json", "restoration.json", "copy-provenance.json"}:
            return True
        if relative.startswith("validation/"):
            return "/dist/" not in relative and Path(relative).suffix in {".json", ".png", ".zip", ".log"}
        if relative in {f"model/{name}" for name in ("metadata.json", "request.json", "proposal.json", "response.json", "events.json")}:
            return True
        return relative in {"candidate/src/ModalApp.tsx", "candidate/src/App.tsx", "candidate/src/styles.css", "candidate/src/main.tsx"}
    return False


def _media(path: Path) -> str:
    return {".png": "image/png", ".zip": "application/zip", ".json": "application/json", ".jsonl": "application/x-ndjson"}.get(path.suffix, "text/plain")


class RunReader:
    def __init__(self, live_root: Path, archive_root: Path, live_provenance: str | None = None,
                 history_index: Path | None = None):
        self.live_root, self.archive_root = live_root, archive_root
        self.history_index = history_index
        if live_provenance not in {None, "test-control"}:
            raise ValueError("Only an explicit test-control provenance override is supported")
        self.live_provenance = live_provenance

    def registrations(self) -> tuple[dict, list]:
        """Only a fixed, local registry can add reviewed M4 archives; clients cannot supply paths."""
        archives = dict(ARCHIVES)
        warnings = []
        if self.history_index is None or not self.history_index.exists():
            return archives, warnings
        try:
            if self.history_index.is_symlink() or self.history_index.stat().st_size > 65536:
                raise ValueError("Invalid history index file")
            safe_child(self.history_index.parent, self.history_index.name)
            data = read_json(self.history_index)
            entries = data.get("entries") if isinstance(data, dict) else data
            if not isinstance(entries, list) or len(entries) > 32:
                raise ValueError("Invalid history index entries")
            for entry in entries:
                if not isinstance(entry, dict):
                    raise ValueError("Invalid history entry")
                key, subdir, rid, title, provenance = (entry.get(field) for field in
                    ("key", "subdir", "repair_id", "title", "provenance"))
                if (not isinstance(key, str) or not re.fullmatch(r"m4-[a-z0-9-]{1,64}", key)
                        or key in archives or not isinstance(subdir, str) or not subdir.startswith("m4/")
                        or not isinstance(rid, str) or not ID.fullmatch(rid)
                        or not isinstance(title, str) or not 1 <= len(title) <= 160
                        or provenance not in {"ai", "manual-control"}):
                    raise ValueError("Invalid history registration")
                root = safe_child(self.archive_root, subdir)
                if not root.is_relative_to((self.archive_root / "m4").resolve()):
                    raise ValueError("Archive outside M4 evidence")
                archives[key] = (subdir, rid, title, provenance)
        except (OSError, ValueError, KeyError, TypeError):
            # Fail closed: never partly accept an invalid registry.
            archives = dict(ARCHIVES)
            warnings.append({"key": "m4-index", "message": "M4 history index unavailable or invalid; no M4 archives loaded"})
        return archives, warnings

    def resolve(self, key: str) -> dict:
        archives, _ = self.registrations()
        read_only = key in archives
        if read_only:
            subdir, rid, title, provenance = archives[key]
            root = safe_child(self.archive_root, subdir) if subdir else self.archive_root
            repair = _record(root, "repairs", rid)
            analysis = _record(root, "analyses", repair["analysis_id"])
        elif key.startswith("analysis-"):
            root = self.live_root
            analysis = _record(root, "analyses", key.removeprefix("analysis-"))
            repair = _record(root, "repairs", analysis["repair_id"]) if analysis.get("repair_id") else None
            title, provenance = "Delivery preferences · analysis", _provenance(repair)
        elif key.startswith("repair-"):
            root = self.live_root
            repair = _record(root, "repairs", key.removeprefix("repair-"))
            analysis = _record(root, "analyses", repair["analysis_id"])
            title, provenance = "Delivery preferences · repair", _provenance(repair)
        else:
            raise HTTPException(404, "Unknown run")
        if not read_only and self.live_provenance:
            provenance = self.live_provenance
        return {"key": key, "root": root, "title": title, "provenance": provenance,
                "read_only": read_only, "analysis": analysis, "repair": repair}

    @staticmethod
    def row(run: dict) -> dict:
        record = run["repair"] or run["analysis"]
        decision = (run["repair"] or {}).get("decision") or {}
        return {"key": run["key"], "title": run["title"], "created_at": record.get("created_at"),
                "kind": "repair" if run["repair"] else "analysis", "status": record.get("status"),
                "decision_status": decision.get("status"), "selected": record.get("selected"),
                "provenance": run["provenance"], "provenance_label": PROVENANCE[run["provenance"]],
                "read_only": run["read_only"], "analysis_id": run["analysis"]["id"],
                "repair_id": (run["repair"] or {}).get("id")}

    def history(self) -> dict:
        archives, warnings = self.registrations()
        rows = []
        keys = list(archives)
        # One recent history row per analysis, with its repair included if present.
        directory = self.live_root / "analyses"
        if directory.is_dir():
            keys.extend("analysis-" + p.name for p in directory.iterdir() if p.is_dir() and ID.fullmatch(p.name))
        for key in keys:
            try:
                rows.append(self.row(self.resolve(key)))
            except (OSError, ValueError, KeyError, HTTPException):
                warnings.append({"key": key, "message": "Saved run unavailable or incomplete"})
        rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)
        return {"runs": rows, "warnings": warnings}

    @staticmethod
    def directory(run: dict, kind: str) -> Path:
        if kind not in {"analyses", "repairs"}:
            raise HTTPException(404, "Unknown artifact kind")
        record = run["analysis"] if kind == "analyses" else run["repair"]
        if record is None:
            raise HTTPException(404, "No repair evidence exists")
        return safe_child(run["root"], f"{kind}/{record['id']}")

    def artifact(self, key: str, kind: str, relative: str) -> Path:
        run = self.resolve(key)
        path = safe_child(self.directory(run, kind), relative)
        if not _allowed(kind, relative) or not path.is_file():
            raise HTTPException(404, "Evidence file is not available")
        return path

    def detail(self, key: str) -> dict:
        run = self.resolve(key)
        result = self.row(run)
        analysis, repair = run["analysis"], run["repair"]
        result.update(analysis=analysis, repair=repair, observations=None, warnings=[])
        if run["read_only"]:
            record_path = self.directory(run, "repairs") / "record.json"
            result["archive_source"] = {"path": record_path.relative_to(self.archive_root).as_posix(),
                                        "sha256": sha256(record_path), "copied": False}
            marker_path = safe_child(self.directory(run, "repairs"), "copy-provenance.json")
            if marker_path.is_file():
                marker = read_json(marker_path)
                if isinstance(marker, dict) and marker.get("public_copy") is True:
                    source_hash = marker.get("source_record_sha256")
                    if marker.get("schema_version") != 1 or not isinstance(source_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", source_hash):
                        raise ValueError("Invalid public evidence provenance")
                    result["archive_source"].update(copied=True, source_sha256=source_hash,
                        public_subset=True)
        result["actions"] = {
            "repair_url": f"/api/analyses/{analysis['id']}/repair" if not run["read_only"] and analysis.get("status") == "completed" else None,
            "restore_url": f"/api/repairs/{repair['id']}/restore" if not run["read_only"] and repair and repair.get("status") in TERMINAL else None,
        }
        observation = safe_child(self.directory(run, "analyses"), "observation/result.json")
        if observation.is_file():
            try:
                result["observations"] = read_json(observation).get("observations")
            except (OSError, ValueError, AttributeError):
                result["warnings"].append({"category":"observation_unavailable", "message":"Operational observation is incomplete or unreadable; it is not a successful measurement."})
        files = []
        for kind in ("analyses", "repairs"):
            if kind == "repairs" and repair is None:
                continue
            directory = self.directory(run, kind)
            for path in sorted(directory.rglob("*")):
                relative = path.relative_to(directory).as_posix()
                if not _allowed(kind, relative) or not path.is_file():
                    continue
                # Reject symlinks and junctions even if they point inside the root.
                safe_child(directory, relative)
                url_path = quote(key, safe="") + "/" + kind + "/" + quote(relative, safe="/")
                preview = None
                if path.suffix == ".png":
                    with path.open("rb") as image:
                        if image.read(8) == PNG_SIGNATURE:
                            preview = "/api/run-preview/" + url_path
                files.append({"kind": kind, "path": relative, "label": relative,
                              "url": "/api/run-artifacts/" + url_path, "preview_url": preview,
                              "media_type": _media(path)})
        result["artifacts"] = files
        return result


def create_product_app(root: Path | None = None, archive_root: Path | None = None,
                       frontend_dir: Path | None = None, coordinator=None,
                       live_provenance: str | None = None, history_index: Path | None = None):
    live_root = Path(root) if root is not None else ARTIFACTS / "m2-live"
    archives = Path(archive_root) if archive_root is not None else ARTIFACTS
    static_root = Path(frontend_dir) if frontend_dir is not None else PROJECT / "frontend" / "dist"
    app = create_app()
    app.title = "AccessFix AI"
    app.version = "0.4.0"
    index = history_index or (PROJECT / "reports/m4-20261028/history-index.json" if archives == ARTIFACTS else None)
    reader = RunReader(live_root, archives, live_provenance, index)

    @asynccontextmanager
    async def lifespan(application):
        application.state.jobs = coordinator or Coordinator(root=live_root)
        try:
            yield
        finally:
            if coordinator is None:
                application.state.jobs.close()

    app.router.lifespan_context = lifespan

    @app.get("/api/history")
    def history():
        return reader.history()

    @app.get("/api/runs/{key}")
    def detail(key: str):
        return reader.detail(key)

    @app.get("/api/run-artifacts/{key}/{kind}/{relative:path}")
    def download(key: str, kind: str, relative: str):
        path = reader.artifact(key, kind, relative)
        return FileResponse(path, filename=path.name, media_type="application/octet-stream",
                            headers={"Content-Security-Policy": "sandbox; default-src 'none'"})

    @app.get("/api/run-preview/{key}/{kind}/{relative:path}")
    def preview(key: str, kind: str, relative: str):
        path = reader.artifact(key, kind, relative)
        with path.open("rb") as image:
            png = path.suffix == ".png" and image.read(8) == PNG_SIGNATURE
        if not png:
            raise HTTPException(415, "Only verified PNG screenshots support inline preview")
        return FileResponse(path, media_type="image/png", headers={"Content-Security-Policy": "sandbox; default-src 'none'"})

    # Hash-based client routing needs no arbitrary server-side path fallback.
    if static_root.is_dir():
        app.mount("/", StaticFiles(directory=static_root, html=True), name="product-ui")
    else:
        @app.get("/")
        def missing_build():
            raise HTTPException(503, "Product UI build is missing. Build frontend before starting the server.")
    return app


app = create_product_app()
