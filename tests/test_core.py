"""Synthetic unit/API controls. These are not browser or model success measurements."""
from copy import deepcopy
import json
from pathlib import Path
import shutil

from fastapi.testclient import TestClient
import pytest

from accessfix.api import create_app
from accessfix.gate import assess, summarize, _contract
from accessfix.patching import create_candidate, validate_patch
from accessfix.service import Coordinator, EXAMPLE
from accessfix.storage import inventory, read_json, safe_child, write_json


def measurement(positive=True):
    workflows = []
    for spec in _contract():
        passed = positive or spec["modality"] == "pointer"
        workflows.append({"id":spec["id"],"modality":spec["modality"],"status":"pass" if passed else "fail",
            "checks":[{"id":c,"status":"pass" if passed or c != "focus-entry" else "fail","expected":"HIDDEN_ORACLE_SENTINEL"} for c in spec["checks"]],
            "errors":[],"audits":[{"state":s,"status":"complete","violations":[],"incomplete":[]} for s in spec["states"]]})
    return {"schema_version":1,"build_ok":True,"mode":"final","workflows":workflows}


def proposal():
    return {"rationale":"Synthetic test patch", "edits":[{"path":"src/ModalApp.tsx","old":"export default function ModalApp()", "new":"/* synthetic test */\nexport default function ModalApp()"}]}


@pytest.mark.parametrize("mutator", [
    lambda x:x.update(build_ok=False),
    lambda x:x.update(container_exit_code=1),
    lambda x:x.update(error={"category":"crash"}),
    lambda x:x["workflows"].pop(),
    lambda x:x["workflows"][0]["audits"].pop(),
    lambda x:x["workflows"][0]["checks"].pop(),
    lambda x:x["workflows"][0].update(errors=None),
    lambda x:x["workflows"][0].update(errors=["bad"]),
    lambda x:x["workflows"][0]["audits"][0].update(status="error"),
    lambda x:x["workflows"].append(deepcopy(x["workflows"][0])),
])
def test_missing_and_malformed_measurements_rejected(mutator):
    candidate = measurement();mutator(candidate)
    decision = assess(measurement(False), candidate)
    assert not decision["accepted"]
    assert "required_measurement_missing" in decision["reasons"]


@pytest.mark.parametrize("key,reason", [("violations","new_axe_violation"),("incomplete","new_incomplete_requires_review")])
def test_axe_state_regression_rejected(key, reason):
    candidate=measurement()
    candidate["workflows"][0]["audits"][0][key]=[{"id":"button-name","nodes":[{"target":["#new"]}]}]
    decision=assess(measurement(False),candidate)
    assert not decision["accepted"] and reason in decision["reasons"]


def test_axe_zero_is_not_keyboard_success():
    summary=summarize(measurement(False))
    assert summary["axe_zero_keyboard_failed"]
    assert summary["keyboard_pass"] == 0
    assert not assess(measurement(False),measurement(False))["accepted"]


def test_behavior_regression_even_if_workflow_claims_pass():
    candidate=measurement();candidate["workflows"][0]["checks"][0]["status"]="fail"
    decision=assess(measurement(False),candidate)
    assert "existing_behavior_regression" in decision["reasons"]


def test_page_errors_are_reported_and_rejected():
    candidate=measurement();candidate["workflows"][0]["page_errors"]=["Uncaught example error"]
    decision=assess(measurement(False),candidate)
    assert not decision["accepted"]
    assert decision["new_browser_errors"]==["Uncaught example error"]


def test_positive_gate():
    assert assess(measurement(False),measurement())["accepted"]


@pytest.mark.parametrize("path", ["../secret", "/absolute", "C:/secret", "src\\file", "a/../../b", "a//b"])
def test_artifact_paths_cannot_escape(tmp_path,path):
    with pytest.raises(ValueError):safe_child(tmp_path,path)


def test_exact_patch_and_preservation(tmp_path):
    original=tmp_path/"original";shutil.copytree(EXAMPLE,original)
    hashes=inventory(original)
    diff=create_candidate(original,tmp_path/"candidate",proposal(),hashes)
    assert "synthetic test" in diff
    assert inventory(original)==hashes
    assert (tmp_path/"candidate"/"src"/"ModalApp.tsx").is_file()


@pytest.mark.parametrize("edit", [
    {"path":"../runtime/worker.mjs","old":"x","new":"y"},
    {"path":"src/ModalApp.tsx","old":"","new":"y"},
    {"path":"src/ModalApp.tsx","old":"not-existing-anchor","new":"y"},
    {"path":"src/ModalApp.tsx","old":" ","new":"y"},
    {"path":"src/ModalApp.tsx","old":"export default function ModalApp()","new":"x"*65537},
])
def test_patch_limits(tmp_path,edit):
    with pytest.raises(ValueError):create_candidate(EXAMPLE,tmp_path/"candidate",{"rationale":"test","edits":[edit]},inventory(EXAMPLE))
    assert not (tmp_path/"candidate").exists()


class SpyProvider:
    def __init__(self):self.calls=[]
    def propose(self,payload,out):
        self.calls.append(deepcopy(payload));out.mkdir()
        write_json(out/"input.json",payload)
        return {"proposal":proposal(),"metadata":{"provider":"synthetic-test","requests":1,"usage":None}}


def fake_runner(source,out,mode):
    out.mkdir()
    result={"build_ok":True,"observations":{"events":["Focus remained on opener"],"audits":[{"state":s,"status":"complete"} for s in ("closed","open")]}} if mode=="observe" else measurement(source.name=="candidate")
    write_json(out/"result.json",result);return result


def test_api_e2e_idempotency_original_restore_and_no_oracle(tmp_path):
    spy=SpyProvider();jobs=Coordinator(tmp_path,runner=fake_runner,provider_factory=lambda _:spy)
    try:
        with TestClient(create_app(jobs)) as client:
            assert client.get("/api/examples").status_code==200
            assert client.post("/api/analyses",json={}).status_code==403
            headers={"X-AccessFix-Token":client.get("/api/session").json()["token"]}
            assert client.post("/api/analyses",headers={**headers,"Origin":"https://untrusted.example"},json={}).status_code==403
            assert client.post("/api/analyses",headers=headers,json={"example_id":"outside"}).status_code==400
            response=client.post("/api/analyses",headers=headers,json={})
            assert response.status_code==202
            aid=response.json()["id"];assert jobs.wait("analyses",aid)["status"]=="completed"
            response=client.post(f"/api/analyses/{aid}/repair",headers=headers,json={"provider":"codex"})
            assert response.status_code==202
            rid=response.json()["id"];record=jobs.wait("repairs",rid)
            assert record["status"]=="completed",record
            assert record["decision"]["accepted"] and record["selected"]=="candidate"
            assert client.post(f"/api/analyses/{aid}/repair",headers=headers,json={"provider":"codex"}).json()["id"]==rid
            assert len(spy.calls)==1
            assert "HIDDEN_ORACLE_SENTINEL" not in json.dumps(spy.calls)
            assert set(spy.calls[0])=={"files","task","observations"}
            assert client.get(f"/api/repairs/{rid}").json()["original_intact"]
            artifact=client.get(f"/api/artifacts/repairs/{rid}/patch.diff")
            assert artifact.status_code==200 and "attachment" in artifact.headers["content-disposition"]
            restored=client.post(f"/api/repairs/{rid}/restore",headers=headers).json()
            assert restored["status"]=="restored" and restored["selected"]=="original"
            assert restored["decision"]==record["decision"]
            manifest=read_json(tmp_path/"repairs"/rid/"evidence-manifest.json")
            actual=inventory(tmp_path/"repairs"/rid)
            assert all(actual[p]==h for p,h in manifest.items())
    finally:jobs.close()


def test_restart_never_reissues_request(tmp_path):
    rid="a"*32
    write_json(tmp_path/"repairs"/rid/"record.json",{"id":rid,"status":"model_running","events":[],"model_requests":1})
    jobs=Coordinator(tmp_path)
    try:
        record=jobs.get("repairs",rid)
        assert record["status"]=="failed" and record["selected"]=="original"
        assert record["model_requests"]==1
        with pytest.raises(RuntimeError):Coordinator(tmp_path)
    finally:jobs.close()
