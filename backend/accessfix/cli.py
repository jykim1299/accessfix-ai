"""Thin HTTP client for the real M1 API. Polling never resends inference."""
import argparse
import json
import time
import httpx


def main():
    parser = argparse.ArgumentParser(prog="accessfix")
    parser.add_argument("--url", default="http://127.0.0.1:8800")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("examples", "providers", "analyse"):sub.add_parser(name)
    repair = sub.add_parser("repair");repair.add_argument("id");repair.add_argument("--provider", required=True, choices=["openai", "codex", "meta", "spark-open"])
    show = sub.add_parser("show");show.add_argument("kind", choices=["analyses","repairs"]);show.add_argument("id")
    restore = sub.add_parser("restore");restore.add_argument("id")
    args = parser.parse_args()
    with httpx.Client(base_url=args.url, timeout=15, trust_env=False) as client:
        def request(method, path, **kwargs):
            response = client.request(method, path, **kwargs);response.raise_for_status();return response.json()
        headers = {"X-AccessFix-Token":request("GET", "/api/session")["token"]}
        if args.command in ("examples", "providers"):
            record = request("GET", "/api/" + args.command)
        elif args.command == "show":record = request("GET", f"/api/{args.kind}/{args.id}")
        elif args.command == "restore":record = request("POST", f"/api/repairs/{args.id}/restore", headers=headers)
        else:
            if args.command == "analyse":
                record = request("POST", "/api/analyses", json={}, headers=headers);kind="analyses"
            else:
                record = request("POST", f"/api/analyses/{args.id}/repair", json={"provider":args.provider}, headers=headers);kind="repairs"
            print(json.dumps({"id":record["id"],"kind":kind}), flush=True)
            deadline = time.monotonic() + 900
            last = None
            while record["status"] not in ("completed", "failed", "restored") or request("GET", "/api/status")["busy"]:
                if time.monotonic() > deadline:raise TimeoutError("Still running; use show with the recorded ID")
                if last != record["status"]:
                    print(json.dumps({"status":record["status"]}), flush=True);last=record["status"]
                time.sleep(1)
                record = request("GET", f"/api/{kind}/{record['id']}")
        print(json.dumps(record, ensure_ascii=False, indent=2))
        if isinstance(record,dict) and record.get("status") == "failed":raise SystemExit(1)


if __name__ == "__main__":main()
