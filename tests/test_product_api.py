"""Read-only product presentation tests; no real browser or model invocation."""
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from accessfix.product import create_product_app, PNG_SIGNATURE
from accessfix.service import Coordinator
from accessfix.storage import inventory, write_json


AID = "a" * 32
RID = "b" * 32
M1_AID = "ced16d439fa84e01ac8f0c84b9bbdba2"
M1_RID = "060e72c0e457402db2b74c67fd864274"


def seed(root, aid=AID, rid=RID, provider="ui-test-replay"):
    analysis = {"id": aid, "kind": "analysis", "created_at": "2026-10-27T00:00:00Z",
                "status": "completed", "selected": "original", "repair_id": rid,
                "events": [], "metrics": {"keyboard_pass": 0, "keyboard_total": 3}}
    repair = {"id": rid, "kind": "repair", "analysis_id": aid,
              "created_at": "2026-10-27T00:01:00Z", "status": "restored", "selected": "original",
              "decision": {"accepted": True, "status": "accepted"}, "events": [],
              "model": {"provider": provider, "live_response_received": False}, "diff": "-old\n+new"}
    adir = root / "analyses" / aid
    rdir = root / "repairs" / rid
    write_json(adir / "record.json", analysis)
    write_json(rdir / "record.json", repair)
    write_json(adir / "observation/result.json", {"observations": {"keyboard": [{"action": "Enter", "focus_inside_dialog": False}]}})
    (rdir / "patch.diff").write_bytes(repair["diff"].encode("utf-8"))
    image = adir / "baseline/evidence/keyboard-save/open.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(PNG_SIGNATURE + b"synthetic-unit-file")
    (adir / "baseline/evidence/keyboard-save/trace.zip").write_bytes(b"synthetic trace")
    (rdir / "secret.env").write_text("SECRET=not-downloadable", encoding="utf-8")
    (rdir / "model").mkdir()
    (rdir / "model/auth.json").write_text('{"key":"not-downloadable"}', encoding="utf-8")
    return analysis, repair


@pytest.fixture
def product(tmp_path):
    live, archives, frontend = (tmp_path / name for name in ("live", "archives", "frontend"))
    seed(live)
    seed(archives, M1_AID, M1_RID, "openai")
    frontend.mkdir();(frontend / "index.html").write_text("<!doctype html><html lang='en'><title>Product test</title><main>AccessFix</main></html>")
    jobs = Coordinator(live)
    app = create_product_app(root=live, archive_root=archives, frontend_dir=frontend, coordinator=jobs)
    try:
        with TestClient(app) as client:
            yield client, live, archives
    finally:
        jobs.close()


def test_history_distinguishes_actual_manual_and_test_provenance(product):
    client, _, _ = product
    result = client.get("/api/history").json()
    rows = {r["key"]: r for r in result["runs"]}
    assert rows["m1-ai"]["read_only"] is True
    assert rows["m1-ai"]["provenance"] == "ai"
    assert rows["analysis-" + AID]["provenance"] == "test-control"
    assert result["warnings"] == [
        {"key": "m1-control", "message": "Saved run unavailable or incomplete"},
        {"key": "m3-meta", "message": "Saved run unavailable or incomplete"},
    ]


def test_restored_status_and_past_acceptance_stay_separate(product):
    client, _, _ = product
    detail = client.get("/api/runs/m1-ai").json()
    assert detail["status"] == "restored" and detail["selected"] == "original"
    assert detail["decision_status"] == "accepted"
    assert detail["repair"]["decision"]["accepted"]
    assert detail["actions"] == {"repair_url": None, "restore_url": None}
    assert detail["observations"]["keyboard"][0]["focus_inside_dialog"] is False


def test_current_actions_reuse_original_api_and_link_repair(product):
    client, _, _ = product
    by_analysis = client.get("/api/runs/analysis-" + AID).json()
    by_repair = client.get("/api/runs/repair-" + RID).json()
    assert by_analysis["repair"] == by_repair["repair"]
    assert by_analysis["actions"] == {"repair_url": f"/api/analyses/{AID}/repair", "restore_url": f"/api/repairs/{RID}/restore"}


def test_partial_observation_does_not_break_status_polling(product):
    client, live, _ = product
    (live / "analyses" / AID / "observation/result.json").write_text('{"observations":',encoding="utf-8")
    response=client.get("/api/runs/analysis-"+AID)
    assert response.status_code==200
    assert response.json()["observations"] is None
    assert response.json()["warnings"][0]["category"]=="observation_unavailable"


def test_archive_mutation_cannot_reach_m1_root(product):
    client, _, archives = product
    before = inventory(archives)
    token = client.get("/api/session").json()["token"]
    headers = {"X-AccessFix-Token": token}
    assert client.post(f"/api/repairs/{M1_RID}/restore", headers=headers).status_code == 404
    assert client.post(f"/api/analyses/{M1_AID}/repair", json={"provider": "codex"}, headers=headers).status_code == 404
    assert inventory(archives) == before


def test_png_previews_and_safe_downloads(product):
    client, _, _ = product
    detail = client.get("/api/runs/m1-ai").json()
    image = next(x for x in detail["artifacts"] if x["path"].endswith("open.png"))
    preview = client.get(image["preview_url"])
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"
    assert "nosniff" in preview.headers["x-content-type-options"]
    assert "sandbox" in preview.headers["content-security-policy"]
    patch = next(x for x in detail["artifacts"] if x["path"] == "patch.diff")
    downloaded = client.get(patch["url"])
    assert downloaded.content == b"-old\n+new"
    assert "attachment" in downloaded.headers["content-disposition"]
    assert patch["preview_url"] is None


@pytest.mark.parametrize("relative", ["secret.env", "model/auth.json", "record.json.tmp", "validation/dist/app.js"])
def test_unknown_or_sensitive_evidence_not_exposed(product, relative):
    client, _, _ = product
    response = client.get(f"/api/run-artifacts/repair-{RID}/repairs/{relative}")
    assert response.status_code == 404


def test_non_png_cannot_be_inline_preview(product):
    client, _, _ = product
    assert client.get(f"/api/run-preview/repair-{RID}/repairs/patch.diff").status_code == 415


def test_disguised_png_is_not_inline_preview(product):
    client, live, _ = product
    image = live / "analyses" / AID / "baseline/evidence/keyboard-save/open.png"
    image.write_text("<script>alert('not a png')</script>")
    url = f"/api/run-preview/analysis-{AID}/analyses/baseline/evidence/keyboard-save/open.png"
    assert client.get(url).status_code == 415
    detail = client.get("/api/runs/analysis-" + AID).json()
    assert next(x for x in detail["artifacts"] if x["path"].endswith("open.png"))["preview_url"] is None


def test_original_auth_origin_host_rules_remain(product):
    client, _, _ = product
    assert client.post("/api/analyses", json={}).status_code == 403
    token = client.get("/api/session").json()["token"]
    assert client.post("/api/analyses", json={}, headers={"X-AccessFix-Token": token, "Origin": "https://other.example"}).status_code == 403
    assert client.get("/api/history", headers={"Host": "external.example"}).status_code == 400


def test_static_ui_and_unknown_api(product):
    client, _, _ = product
    assert client.get("/").status_code == 200
    assert "AccessFix" in client.get("/").text
    assert client.get("/api/not-real").status_code == 404


def test_explicit_ui_test_provenance_does_not_relabel_archive(tmp_path):
    live, archives = tmp_path / "live", tmp_path / "archives"
    seed(live, provider="openai")
    seed(archives, M1_AID, M1_RID, "openai")
    jobs = Coordinator(live)
    try:
        with TestClient(create_product_app(root=live, archive_root=archives, coordinator=jobs, live_provenance="test-control")) as client:
            assert client.get("/api/runs/analysis-" + AID).json()["provenance"] == "test-control"
            assert client.get("/api/runs/m1-ai").json()["provenance"] == "ai"
    finally:
        jobs.close()
