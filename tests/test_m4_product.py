"""Read-only history boundaries. Local fixtures, never a model request."""
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from accessfix.product import RunReader, create_product_app
from accessfix.service import Coordinator
from accessfix.storage import inventory, write_json
from test_product_api import seed, AID, RID


M3_RID = "fe2e9435f2e84842a497a7004a37a3da"


def entry(**changes):
    return {"key": "m4-tabs", "subdir": "m4/live-v1/tabs/jobs", "repair_id": RID,
            "title": "M4 · Tabs", "provenance": "ai", **changes}


@pytest.fixture
def histories(tmp_path):
    archives, live, index = tmp_path / "archives", tmp_path / "live", tmp_path / "history-index.json"
    seed(archives / "m3-meta/live-v2/jobs", AID, M3_RID, "meta")
    seed(archives / "m4/live-v1/tabs/jobs", provider="meta")
    write_json(index, {"entries": [entry()]})
    jobs = Coordinator(live)
    try:
        with TestClient(create_product_app(root=live, archive_root=archives,
                                          coordinator=jobs, history_index=index)) as client:
            yield client, archives, index
    finally:
        jobs.close()


def test_m3_and_m4_remain_readonly_with_source_provenance(histories):
    client, archives, _ = histories
    before = inventory(archives)
    for key in ("m3-meta", "m4-tabs"):
        response = client.get("/api/runs/" + key)
        assert response.status_code == 200
        detail = response.json()
        assert detail["read_only"]
        assert detail["repair"]["model"]["provider"] == "meta"
        assert detail["decision_status"] == "accepted"
        assert detail["status"] == "restored"
        assert detail["selected"] == "original"
        assert detail["actions"] == {"repair_url": None, "restore_url": None}
        assert detail["archive_source"]["copied"] is False
        assert len(detail["archive_source"]["sha256"]) == 64
    assert inventory(archives) == before


def test_m4_registry_does_not_grant_mutation_access(histories):
    client, archives, _ = histories
    before = inventory(archives)
    headers = {"X-AccessFix-Token": client.get("/api/session").json()["token"]}
    assert client.post(f"/api/repairs/{RID}/restore", headers=headers).status_code == 404
    assert client.post(f"/api/analyses/{AID}/repair", headers=headers, json={"provider": "meta"}).status_code == 404
    assert inventory(archives) == before


@pytest.mark.parametrize("bad", [
    entry(subdir="m4/../../outside"), entry(subdir="https://remote.example/code"),
    entry(subdir="m4\\outside"), entry(subdir="m3-meta/live-v2/jobs"),
    entry(repair_id="../record"), entry(key="m1-ai"), entry(provenance="test-control"),
    entry(title=""), entry(key="m4-../../outside"),
])
def test_invalid_index_fails_closed(histories, bad):
    client, _, index = histories
    write_json(index, {"entries": [entry(), bad]})
    history = client.get("/api/history").json()
    assert not any(row["key"].startswith("m4-") for row in history["runs"])
    assert any(warning["key"] == "m4-index" for warning in history["warnings"])
    assert client.get("/api/runs/m4-tabs").status_code == 404


def test_m4_only_known_source_artifacts_can_download(histories):
    client, archives, _ = histories
    source = archives / "m4/live-v1/tabs/jobs" / "repairs" / RID / "candidate/src"
    source.mkdir(parents=True)
    (source / "App.tsx").write_text("export default function App(){return null}")
    (source / "key.env").write_text("not-real-secret")
    base = "/api/run-artifacts/m4-tabs/repairs/candidate/src/"
    assert client.get(base + "App.tsx").status_code == 200
    assert client.get(base + "key.env").status_code == 404


def test_absent_index_keeps_m3_available(histories):
    client, _, index = histories
    index.unlink()
    assert client.get("/api/runs/m3-meta").status_code == 200
    assert client.get("/api/runs/m4-tabs").status_code == 404
