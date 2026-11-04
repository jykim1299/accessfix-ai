"""Explicit paid/live integration entry. Never collected by pytest or auto-retried."""
import argparse
import json
from pathlib import Path
import sys
import time

import httpx

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"backend"))
from accessfix.browser import run_browser
from accessfix.gate import summarize
from accessfix.storage import inventory, now, write_json


def run(url,provider,out):
    out.mkdir(parents=True,exist_ok=False)
    events=[]
    with httpx.Client(base_url=url,timeout=20,trust_env=False) as client:
        def call(method,path,**kwargs):
            response=client.request(method,path,**kwargs)
            events.append({"time":now(),"method":method,"path":path,"status_code":response.status_code})
            write_json(out/"http-events.json",events)
            response.raise_for_status();return response.json()
        token=call("GET","/api/session")["token"]
        headers={"X-AccessFix-Token":token}
        write_json(out/"providers.json",call("GET","/api/providers"))
        write_json(out/"examples.json",call("GET","/api/examples"))
        def wait(kind,ident):
            end=time.monotonic()+900;last=None
            while time.monotonic()<end:
                record=call("GET",f"/api/{kind}/{ident}")
                if last != record["status"]:
                    print(json.dumps({"kind":kind,"id":ident,"status":record["status"]}),flush=True);last=record["status"]
                if record["status"] in ("completed","failed","restored") and not call("GET","/api/status")["busy"]:return record
                time.sleep(1)
            raise TimeoutError("Job still running; use existing recorded ID")
        analysis=call("POST","/api/analyses",headers=headers,json={})
        write_json(out/"analysis-start.json",analysis)
        analysis=wait("analyses",analysis["id"]);write_json(out/"analysis.json",analysis)
        if analysis["status"]!="completed":raise RuntimeError("Analysis failed; no model call made")
        repair=call("POST",f"/api/analyses/{analysis['id']}/repair",headers=headers,json={"provider":provider})
        write_json(out/"repair-start.json",repair)
        repair=wait("repairs",repair["id"]);write_json(out/"repair.json",repair)
        repeated=call("POST",f"/api/analyses/{analysis['id']}/repair",headers=headers,json={"provider":provider})
        idempotent=repeated["id"]==repair["id"] and repeated["model_requests"]==repair["model_requests"]
        restored=call("POST",f"/api/repairs/{repair['id']}/restore",headers=headers)
        write_json(out/"restored.json",restored)
        original=ROOT/"artifacts"/"analyses"/analysis["id"]/"original"
        integrity=inventory(original)==analysis["source_hashes"]
        restored_browser=run_browser(original,out/"restored-browser","final")
        restoration_summary=summarize(restored_browser)
        restored_baseline=all(restoration_summary[k]==analysis["metrics"][k] for k in ("pointer_pass","keyboard_pass","axe_state_nodes","incomplete_state_nodes"))
        decision=repair.get("decision") or {}
        summary={"time":now(),"analysis_id":analysis["id"],"repair_id":repair["id"],
            "repair_terminal_status":repair["status"],"model":repair.get("model"),"model_requests":repair["model_requests"],
            "actual_ai_patch_accepted":decision.get("accepted",False),"gate_reasons":decision.get("reasons",[]),
            "repair_error":repair.get("error"),"baseline":analysis["metrics"],"candidate":decision.get("metrics",{}).get("after"),
            "repair_elapsed_s":repair.get("elapsed_s"),"analysis_elapsed_s":analysis.get("elapsed_s"),
            "idempotency_pass":idempotent,"restore_selected_original":restored["selected"]=="original",
            "original_hashes_match":integrity,"restore_browser_matches_baseline":restored_baseline,
            "restored_metrics":restoration_summary,"decision_preserved":restored["decision"]==repair["decision"]}
        write_json(out/"summary.json",summary)
        print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
        return summary


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--provider",required=True)
    parser.add_argument("--url",default="http://127.0.0.1:8800")
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    result=run(args.url,args.provider,args.output.resolve())
    raise SystemExit(0 if result["original_hashes_match"] and result["idempotency_pass"] and result["restore_browser_matches_baseline"] else 1)
