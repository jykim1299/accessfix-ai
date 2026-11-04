"""Real browser/API rejection control with an explicitly synthetic provider; no LLM call."""
from pathlib import Path
import sys
from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"backend"))
from accessfix.api import create_app
from accessfix.service import Coordinator
from accessfix.storage import inventory, read_json, write_json
from controls.build_controls import case_source


class RegressionControl:
    def propose(self,payload,out):
        out.mkdir()
        old=payload["files"]["src/ModalApp.tsx"]
        proposal={"rationale":"Manual negative control: pointer save is intentionally broken; this is not an AI result",
                  "edits":[{"path":"src/ModalApp.tsx","old":old,"new":case_source(old,"pointer-regression")}]}
        metadata={"provider":"manual-regression-control","request_attempts":0,"usage":None,"live_response_received":False}
        write_json(out/"proposal.json",proposal);write_json(out/"metadata.json",metadata)
        return {"proposal":proposal,"metadata":metadata}


def run(destination):
    destination.mkdir(parents=True,exist_ok=False)
    jobs=Coordinator(destination/"jobs",provider_factory=lambda _:RegressionControl())
    try:
        with TestClient(create_app(jobs)) as client:
            headers={"X-AccessFix-Token":client.get("/api/session").json()["token"]}
            aid=client.post("/api/analyses",headers=headers,json={}).json()["id"]
            analysis=jobs.wait("analyses",aid)
            assert analysis["status"]=="completed",analysis
            rid=client.post(f"/api/analyses/{aid}/repair",headers=headers,json={"provider":"codex"}).json()["id"]
            repair=jobs.wait("repairs",rid)
            checks={"completed_measurement":repair["status"]=="completed","rejected":repair.get("decision",{}).get("accepted") is False,
                    "original_selected":repair["selected"]=="original","pointer_regression_detected":"pointer_task_failed" in repair.get("decision",{}).get("reasons",[]),
                    "original_hash_unchanged":inventory(destination/"jobs/analyses"/aid/"original")==analysis["source_hashes"],
                    "failed_candidate_preserved":(destination/"jobs/repairs"/rid/"candidate/src/ModalApp.tsx").is_file()}
            response=client.get(f"/api/artifacts/repairs/{rid}/patch.diff")
            checks["rejected_diff_retrievable"]=response.status_code==200 and bool(response.content)
            restored=client.post(f"/api/repairs/{rid}/restore",headers=headers).json()
            checks["restore_rejected_patch"]=restored["selected"]=="original" and restored["decision"]==repair["decision"]
            summary={"purpose":"API plus real Docker browser negative control; manual patch, not model performance",
                     "external_model_requests":0,"analysis_id":aid,"repair_id":rid,"checks":checks,
                     "passed":sum(checks.values()),"failed":sum(not v for v in checks.values()),"decision":repair.get("decision")}
            write_json(destination/"summary.json",summary)
            print({k:v for k,v in summary.items() if k!="decision"},flush=True)
            assert all(checks.values())
    finally:jobs.close()


if __name__=="__main__":run(Path(sys.argv[1]).resolve())
