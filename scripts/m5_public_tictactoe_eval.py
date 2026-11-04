"""Explicit M5 public-app preflight/freeze/live runner. No model request during preflight or UI use."""
import argparse
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "backend")]
from accessfix.storage import inventory, now, read_json, sha256, write_json
from evaluation.m5_public_tictactoe.browser import run_browser
from evaluation.m5_public_tictactoe.gate import assess, summarize
from evaluation.m5_public_tictactoe.model import MetaTaskProvider, MODEL, VERSION
from evaluation.m5_public_tictactoe.patch import apply, source_payload
from m3_meta import load_local_key

EVAL = ROOT / "evaluation/m5_public_tictactoe"
FREEZE = EVAL / "freeze.json"


def cases():
    return read_json(EVAL / "cases.json")


def preservation():
    result = {}
    for phase in ("m1-20261027", "m2-20261027", "m3-20261028", "m4-20261028"):
        manifest = ROOT / "reports" / phase / "artifact-manifest.json"
        expected = read_json(manifest)["sha256"]
        changed = [p for p,h in expected.items() if not (ROOT/p).is_file() or sha256(ROOT/p)!=h]
        result[phase] = {"files_checked":len(expected), "unchanged":not changed,
                         "missing_or_changed":changed,"manifest_sha256":sha256(manifest)}
    return result


def frozen_files():
    selected = [p for p in EVAL.rglob("*") if p.is_file()
                and p != FREEZE and "__pycache__" not in p.parts]
    selected += [ROOT / p for p in ("backend/accessfix/providers.py", "backend/accessfix/storage.py", "scripts/m5_public_tictactoe_eval.py")]
    return {p.relative_to(ROOT).as_posix():sha256(p) for p in sorted(selected)}


def ensure_frozen():
    frozen = read_json(FREEZE)
    if frozen["sha256"] != frozen_files():
        raise RuntimeError("Evaluation source/verifier/prompt changed after freeze; do not silently reevaluate")
    return frozen


def fresh(path):
    path = path.resolve()
    if not path.is_relative_to(ROOT / "artifacts/m5/public-tictactoe") or path == ROOT / "artifacts/m5/public-tictactoe":
        raise ValueError("Use a new directory below artifacts/m5/public-tictactoe")
    path.mkdir(parents=True, exist_ok=False)
    return path


def source(case):
    return EVAL / "application"


def observation_valid(value):
    operational=value.get("observations") or {}
    audits=operational.get("audits") or []
    return bool(value.get("build_ok") and not value.get("error") and value.get("container_exit_code")==0
        and not operational.get("errors") and not operational.get("page_errors") and not operational.get("blocked_requests")
        and len(audits)==2 and {a.get("state") for a in audits}=={"initial","after-keys"}
        and all(a.get("status")=="complete" and isinstance(a.get("violations"),list)
                and isinstance(a.get("incomplete"),list) for a in audits))


def preflight(out, controls):
    out = fresh(out)
    results = []
    start_hashes=frozen_files()
    write_json(out/"protocol-start.json",start_hashes)
    write_json(out / "preservation-before.json", preservation())
    for case in cases():
        cid=case["id"]; directory=out/cid; directory.mkdir()
        started=time.monotonic()
        baseline=run_browser(source(case),directory/"baseline",cid)
        observation=run_browser(source(case),directory/"observation",cid,"observe")
        positive=run_browser(controls/cid/"positive",directory/"positive",cid)
        regression=run_browser(controls/cid/"regression",directory/"regression",cid)
        positive_gate=assess(baseline,positive,cid)
        regression_gate=assess(baseline,regression,cid)
        missing=copy.deepcopy(positive)
        if missing.get("workflows"): missing["workflows"][0]["audits"] = []
        missing_gate=assess(baseline,missing,cid)
        metrics=summarize(baseline,cid)
        obs_valid=observation_valid(observation)
        entry={"case_id":cid,"split":case["split"],"baseline":metrics,
            "positive_gate":positive_gate,"regression_gate":regression_gate,"missing_measurement_gate":missing_gate,
            "observation_valid":bool(obs_valid),"elapsed_s":time.monotonic()-started}
        entry["preflight_pass"]=(metrics["pointer_reference_valid"] and metrics["pointer_pass"]==metrics["pointer_total"]
            and (metrics["keyboard_pass"]<metrics["keyboard_total"] or metrics["axe_state_nodes"]>0) and obs_valid and positive_gate["accepted"]
            and not regression_gate["accepted"] and "existing_behavior_regression" in regression_gate["reasons"]
            and not missing_gate["accepted"] and "required_measurement_missing" in missing_gate["reasons"])
        write_json(directory/"summary.json",entry);results.append(entry)
        print(json.dumps({"case":cid,"preflight_pass":bool(entry["preflight_pass"]),"baseline":metrics,
                          "positive_reasons":positive_gate["reasons"],"negative_reasons":regression_gate["reasons"]}),flush=True)
    end_hashes=frozen_files();write_json(out/"protocol-end.json",end_hashes)
    write_json(out/"summary.json",{"recorded_utc":now(),"cases":results,"protocol_unchanged":start_hashes==end_hashes,
               "all_pass":start_hashes==end_hashes and all(r["preflight_pass"] for r in results)})
    write_json(out/"preservation-after.json",preservation())
    return results


def freeze(preflight_dir):
    if FREEZE.exists(): raise FileExistsError("Existing freeze must remain; do not overwrite")
    result=read_json(preflight_dir/"summary.json")
    if not result["all_pass"] or {r["case_id"] for r in result["cases"]}!={c["id"] for c in cases()}:
        raise RuntimeError("All registered cases need successful verifier controls before freezing")
    if read_json(preflight_dir/"protocol-end.json")!=frozen_files():
        raise RuntimeError("Preflight used different source or verifier; run new controls before freeze")
    image=subprocess.run(["docker","image","inspect","accessfix-m1-browser:20261027","--format","{{.Id}}"],
                          capture_output=True,text=True,check=True).stdout.strip()
    write_json(FREEZE,{"frozen_utc":now(),"model":MODEL,"prompt_version":VERSION,"maximum_calls_per_case":1,
                      "automatic_retries":0,"maximum_completion_tokens":12000,"image_id":image,
                      "preflight":preflight_dir.relative_to(ROOT).as_posix(),"preflight_sha256":sha256(preflight_dir/"summary.json"),
                      "sha256":frozen_files()})
    print(json.dumps({"freeze":str(FREEZE),"frozen_files":len(read_json(FREEZE)["sha256"])}))


def record_event(directory, record, status, message, **values):
    event={"sequence":len(record["events"])+1,"time":now(),"status":status,"message":message}
    record["events"].append(event);record.update(status=status,**values)
    with (directory/"events.jsonl").open("a",encoding="utf-8") as f: f.write(json.dumps(event)+"\n")
    write_json(directory/"record.json",record)


def measured_case(case, out, manual_candidate=None):
    ensure_frozen();cid=case["id"];directory=out/cid;directory.mkdir()
    jobs=directory/"jobs";aid=uuid.uuid4().hex;rid=uuid.uuid4().hex
    adir=jobs/"analyses"/aid;rdir=jobs/"repairs"/rid;adir.mkdir(parents=True);rdir.mkdir(parents=True)
    original=adir/"original";shutil.copytree(source(case),original);expected=inventory(original)
    analysis={"id":aid,"kind":"analysis","example_id":cid,"task_id":cid,"title":case["title"],
              "task_description":case["task"],"created_at":now(),"status":"queued","events":[],"repair_id":rid,"selected":"original"}
    repair={"id":rid,"kind":"repair","analysis_id":aid,"provider":"manual-regression" if manual_candidate else "meta",
            "created_at":now(),"status":"queued","events":[],"model_requests":0,"selected":"original","diff":None,"decision":None}
    write_json(adir/"record.json",analysis);write_json(rdir/"record.json",repair)
    write_json(adir/"source-manifest.json",expected);write_json(adir/"protocol-manifest.json",read_json(FREEZE))
    started=time.monotonic();result={"case_id":cid,"split":case["split"],"analysis_id":aid,"repair_id":rid,
                                    "provenance":"manual-control" if manual_candidate else "ai","requested_model":None if manual_candidate else MODEL}
    try:
        record_event(adir,analysis,"baseline_running","Measuring the registered original")
        baseline=run_browser(original,adir/"baseline",cid)
        observation=run_browser(original,adir/"observation",cid,"observe")
        metrics=summarize(baseline,cid)
        if not metrics["pointer_reference_valid"] or metrics["pointer_pass"]!=metrics["pointer_total"]:
            raise RuntimeError("Baseline pointer reference invalid; no model call")
        operational=observation.get("observations")
        if not observation_valid(observation):
            raise RuntimeError("Operational observation invalid; no model call")
        ensure_frozen()
        record_event(adir,analysis,"completed","Original measured",baseline=baseline,metrics=metrics,source_hashes=expected,
                     elapsed_s=time.monotonic()-started,finished_at=now())
        repair_started=time.monotonic()
        if manual_candidate:
            files=source_payload(original);new=source_payload(manual_candidate)
            proposal={"rationale":"Manual regression control; not AI output or model performance", "edits":[
                {"path":n,"old":v,"new":new[n]} for n,v in files.items() if v!=new[n]]}
            metadata={"provider":"manual-regression-control","requested_model":None,"response_model":None,
                      "request_attempts":0,"usage":None,"elapsed_s":0,"live_response_received":False}
            (rdir/"model").mkdir();write_json(rdir/"model/proposal.json",proposal)
            write_json(rdir/"model/metadata.json",metadata)
        else:
            record_event(rdir,repair,"model_running","One bounded Meta repair request",model_requests=1)
            answer=MetaTaskProvider().propose({"task":case["task"],"files":source_payload(original),"observations":operational},rdir/"model")
            proposal=answer["proposal"];metadata=answer["metadata"]
        record_event(rdir,repair,"patch_checking","Checking patch as data",model=metadata)
        write_json(rdir/"provider-metadata.json",metadata)
        if proposal is None: raise RuntimeError("Model did not return a valid patch")
        diff=apply(original,rdir/"candidate",proposal,expected)
        (rdir/"patch.diff").write_text(diff,encoding="utf-8")
        hashes=inventory(rdir/"candidate")
        record_event(rdir,repair,"candidate_running","Running independent user tasks",diff=diff,candidate_hashes=hashes)
        candidate=run_browser(rdir/"candidate",rdir/"validation",cid)
        ensure_frozen()
        if inventory(original)!=expected or inventory(rdir/"candidate")!=hashes: raise RuntimeError("Source integrity changed")
        decision=assess(baseline,candidate,cid);write_json(rdir/"decision.json",decision)
        record_event(rdir,repair,"completed","Candidate accepted" if decision["accepted"] else "Candidate rejected; original retained",
            validation=candidate,decision=decision,selected="candidate" if decision["accepted"] else "original",original_intact=True,
            elapsed_s=time.monotonic()-repair_started,finished_at=now())
        write_json(rdir/"completed-record.json",repair)
        # Selecting original does not erase the historical acceptance or candidate evidence.
        record_event(rdir,repair,"restored","Original selected; candidate evidence preserved",selected="original",restored_at=now())
        write_json(rdir/"restoration.json",{"time":now(),"selected":"original","original_hashes":expected,"decision_unchanged":decision})
        restored=run_browser(original,directory/"restored-browser",cid)
        restored_metrics=summarize(restored,cid)
        result.update(restoration_matches_baseline=all(restored_metrics[k]==metrics[k] for k in
            ("pointer_pass","keyboard_pass","axe_state_nodes","incomplete_state_nodes")),restored_metrics=restored_metrics)
    except Exception as error:
        secret=os.environ.get("MODEL_API_KEY","");message=str(error).replace(secret,"[REDACTED]") if secret else str(error)
        if analysis["status"]!="completed": record_event(adir,analysis,"failed","Analysis incomplete",error=message[:1000])
        record_event(rdir,repair,"failed","Repair failed; original retained",error=message[:1000],selected="original",original_intact=inventory(original)==expected)
    finally:
        decision=repair.get("decision") or {};meta=repair.get("model") or {}
        result.update(status=repair["status"],selected=repair["selected"],accepted=decision.get("accepted",False),
            decision=decision,baseline=analysis.get("metrics"),candidate=decision.get("metrics",{}).get("after"),
            patch_applied=bool(repair.get("candidate_hashes")),build_ok=(repair.get("validation") or {}).get("build_ok"),
            model=meta,model_requests=repair["model_requests"],actual_request_attempts=meta.get("request_attempts",0 if not repair["model_requests"] else None),error=repair.get("error"),
            original_hashes_match=inventory(original)==expected,elapsed_s=time.monotonic()-started,
            repair_elapsed_s=repair.get("elapsed_s"))
        write_json(directory/"summary.json",result)
        write_json(rdir/"evidence-manifest.json",{p:h for p,h in inventory(rdir).items() if p not in {"record.json","events.jsonl","restoration.json","evidence-manifest.json"}})
        print(json.dumps({"case":cid,"accepted":result["accepted"],"status":result["status"],"error":result["error"],
                          "gate_reasons":decision.get("reasons"),"usage":meta.get("usage")}),flush=True)
    return result


def live(out, manual_controls=None):
    frozen=ensure_frozen();out=fresh(out)
    before=preservation();write_json(out/"preservation-before.json",before)
    if not all(x["unchanged"] for x in before.values()): raise RuntimeError("Historical evidence changed")
    image=subprocess.run(["docker","image","inspect","accessfix-m1-browser:20261027","--format","{{.Id}}"],capture_output=True,text=True,check=True).stdout.strip()
    if image!=frozen["image_id"]: raise RuntimeError("Frozen Docker image differs")
    if not manual_controls and not load_local_key(): raise RuntimeError("MODEL_API_KEY is unavailable; no request made")
    write_json(out/"freeze.json",frozen);results=[]
    for case in cases():
        result=measured_case(case,out,manual_controls/case["id"]/"regression" if manual_controls else None)
        results.append(result)
        write_json(out/"summary.json",{"recorded_utc":now(),"cases":results,"model_invocations":sum(r["model_requests"] for r in results),
                   "actual_model_requests":sum(r["actual_request_attempts"] for r in results) if all(r["actual_request_attempts"] is not None for r in results) else None,
                   "total_tokens":sum((r["model"].get("usage") or {}).get("total_tokens",0) for r in results),
                   "unknown_usage_calls":sum(bool(r["model_requests"] and not r["model"].get("usage")) for r in results)})
    write_json(out/"preservation-after.json",preservation())


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command",choices=["preflight","freeze","live","controls"])
    parser.add_argument("--output",type=Path)
    parser.add_argument("--controls",type=Path)
    parser.add_argument("--preflight",type=Path)
    args=parser.parse_args()
    if args.command=="preflight": preflight(args.output,args.controls.resolve())
    elif args.command=="freeze": freeze(args.preflight.resolve())
    else: live(args.output,args.controls.resolve() if args.command=="controls" else None)
