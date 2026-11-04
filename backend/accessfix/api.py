"""Loopback-only Milestone 1 API; no deployment or arbitrary source execution."""
from contextlib import asynccontextmanager
import secrets
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .providers import provider_status
from .service import Coordinator, BusyError, EXAMPLE_ID, TASK_ID, TASK


class AnalysisInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    example_id: str = EXAMPLE_ID
    task_id: str = TASK_ID


class RepairInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: str


def create_app(coordinator=None):
    token = secrets.token_urlsafe(32)

    @asynccontextmanager
    async def lifespan(app):
        app.state.jobs = coordinator or Coordinator()
        try:
            yield
        finally:
            if coordinator is None:app.state.jobs.close()

    app = FastAPI(title="AccessFix AI — Milestone 1", version="0.1.0", lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver", "[::1]"])

    @app.middleware("http")
    async def local_boundary(request: Request, call_next):
        if request.client and request.client.host not in ("127.0.0.1", "::1", "testclient"):
            return JSONResponse({"detail":"Loopback clients only"}, status_code=403)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            if request.headers.get("sec-fetch-site") == "cross-site":
                return JSONResponse({"detail":"Cross-site mutation refused"}, status_code=403)
            origin = request.headers.get("origin")
            if origin and origin != str(request.base_url).rstrip("/"):
                return JSONResponse({"detail":"Origin mismatch"}, status_code=403)
            if not secrets.compare_digest(request.headers.get("x-accessfix-token", ""), token):
                return JSONResponse({"detail":"Local session token required"}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(BusyError)
    async def busy(request, error):return JSONResponse({"detail":str(error)}, status_code=409)

    @app.exception_handler(FileNotFoundError)
    async def missing(request, error):return JSONResponse({"detail":"Record or artifact not found"}, status_code=404)

    @app.exception_handler(ValueError)
    async def invalid(request, error):return JSONResponse({"detail":str(error)}, status_code=400)

    @app.get("/api/session")
    def session():return {"token":token,"scope":"local single-user MVP"}

    @app.get("/api/examples")
    def examples():return [{"id":EXAMPLE_ID,"name":"Delivery preferences modal","source":"Newly authored local React example (MIT)","tasks":[{"id":TASK_ID,"description":TASK}]}]

    @app.get("/api/providers")
    def providers():return provider_status()

    @app.get("/api/status")
    def status(request: Request):return {"busy":request.app.state.jobs.busy}

    @app.post("/api/analyses", status_code=202)
    def analyse(body: AnalysisInput, request: Request):
        return request.app.state.jobs.analyse(body.example_id, body.task_id)

    @app.get("/api/analyses/{ident}")
    def analysis(ident: str, request: Request):return request.app.state.jobs.get("analyses", ident)

    @app.post("/api/analyses/{ident}/repair", status_code=202)
    def repair(ident: str, body: RepairInput, request: Request):return request.app.state.jobs.repair(ident, body.provider)

    @app.get("/api/repairs/{ident}")
    def repaired(ident: str, request: Request):return request.app.state.jobs.get("repairs", ident)

    @app.post("/api/repairs/{ident}/restore")
    def restore(ident: str, request: Request):return request.app.state.jobs.restore(ident)

    @app.get("/api/artifacts/{kind}/{ident}/{relative:path}")
    def artifact(kind: str, ident: str, relative: str, request: Request):
        file = request.app.state.jobs.artifact(kind, ident, relative)
        return FileResponse(file, filename=file.name, media_type="application/octet-stream", headers={"Content-Security-Policy":"sandbox; default-src 'none'"})

    return app


app = create_app()
