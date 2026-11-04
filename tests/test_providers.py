"""Protocol tests use fake responses. The CLI boundary test uses a local fake server only."""
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from types import SimpleNamespace
from unittest.mock import Mock, patch
import urllib.error
import urllib.request

from accessfix.providers import (
    CodexProvider, HTTPProvider, PATCH_SCHEMA, _NoRedirect, _endpoint,
    configured_codex_model, get_provider, parse_proposal, provider_status,
)

PAYLOAD = {"files": {"src/App.tsx": "const x = 1;"}, "observations": {"keyboard": "failed"},
           "task": "Open and dismiss the preferences dialog using the keyboard."}
PROPOSAL = {"rationale": "Protocol fixture only", "edits": [{"path": "src/App.tsx", "old": "x = 1", "new": "x = 2"}]}


class Response:
    def __init__(self, data, status=200):
        self.raw = json.dumps(data).encode()
        self.status = status
        self.headers = {"x-request-id": "request-fixture"}
    def read(self, size): return self.raw[:size]
    def __enter__(self): return self
    def __exit__(self, *args): pass


def completion(text=None):
    return {"model": "returned-test-model", "usage": {"prompt_tokens": 41, "completion_tokens": 12},
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(PROPOSAL) if text is None else text}}]}


def events(text=None):
    return [{"type": "thread.started", "thread_id": "mock-thread"}, {"type": "turn.started"},
            {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(PROPOSAL) if text is None else text}},
            {"type": "turn.completed", "usage": {"input_tokens": 100, "output_tokens": 20}}]


class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="accessfix-provider-test-")
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def http(self, data=None, status=200):
        provider = HTTPProvider("meta", "https://api.meta.ai/v1", "unit-test-secret", "requested-test-model")
        opener = Mock()
        opener.open.return_value = Response(completion() if data is None else data, status)
        with patch("accessfix.providers.urllib.request.build_opener", return_value=opener):
            result = provider.propose(PAYLOAD, self.root / "result")
        self.assertEqual(opener.open.call_count, 1)
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 240)
        return result

    def codex(self, records=None, returncode=0):
        with patch("accessfix.providers.shutil.which", return_value="codex-fixture.exe"), \
             patch("accessfix.providers.configured_codex_model", return_value=("configured-test-model", "test_config")):
            provider = CodexProvider()
        result = SimpleNamespace(returncode=returncode, stdout="\n".join(json.dumps(x) for x in (records or events())), stderr="")
        with patch.object(provider, "restricted_catalog", return_value={"models": []}), \
             patch("accessfix.providers.subprocess.run", return_value=result) as run:
            output = provider.propose(PAYLOAD, self.root / "result")
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.kwargs["timeout"], 240)
        return output, run.call_args

    def test_parse_rejects_unexpected_fields_and_empty_anchor(self):
        for value in ({**PROPOSAL, "commands": ["echo unsafe"]},
                      {"rationale": "x", "edits": [{"path": "x", "old": "", "new": "x"}]},
                      {"rationale": "x", "edits": [PROPOSAL["edits"][0]] * 11}):
            with self.subTest(value=value), self.assertRaises(ValueError): parse_proposal(json.dumps(value))

    def test_parse_rejects_oversized_utf8_output(self):
        with self.assertRaises(ValueError): parse_proposal(json.dumps({"rationale": "가" * 24000, "edits": []}, ensure_ascii=False))

    def test_http_success_retains_requested_and_returned_identity(self):
        result = self.http()
        self.assertEqual(result["proposal"], PROPOSAL)
        self.assertEqual(result["metadata"]["requested_model"], "requested-test-model")
        self.assertEqual(result["metadata"]["response_model"], "returned-test-model")
        self.assertEqual(result["metadata"]["usage"], completion()["usage"])
        self.assertIsNone(result["metadata"]["cost_usd"])
        for path in (self.root / "result").iterdir():
            self.assertNotIn("unit-test-secret", path.read_text(encoding="utf-8"))

    def test_malformed_patch_preserves_usage_and_raw_response(self):
        result = self.http(completion("not json"))
        self.assertIsNone(result["proposal"])
        self.assertEqual(result["metadata"]["usage"], completion()["usage"])
        self.assertTrue((self.root / "result" / "response.json").exists())

    def test_truncated_completion_is_not_a_patch(self):
        data = completion(); data["choices"][0]["finish_reason"] = "length"
        result = self.http(data)
        self.assertIsNone(result["proposal"])
        self.assertEqual(result["metadata"]["automatic_retries"], 0)

    def test_tool_calls_are_rejected(self):
        data = completion(); data["choices"][0]["message"]["tool_calls"] = [{"name": "exec"}]
        self.assertIsNone(self.http(data)["proposal"])

    def test_http_201_is_not_accepted_as_model_completion(self):
        result = self.http(status=201)
        self.assertIsNone(result["proposal"])
        self.assertFalse(result["metadata"]["auth_verified"])

    def test_responses_api_and_refusal(self):
        provider = HTTPProvider("openai", "https://api.openai.com/v1", "test-key", "configured-model", responses=True)
        data = {"model": "response-model", "status": "completed", "usage": {"total_tokens": 50},
                "output": [{"type": "message", "content": [{"type": "refusal", "refusal": "No"}]}]}
        opener = Mock(); opener.open.return_value = Response(data)
        with patch("accessfix.providers.urllib.request.build_opener", return_value=opener):
            result = provider.propose(PAYLOAD, self.root / "result")
        self.assertIsNone(result["proposal"])
        self.assertEqual(result["metadata"]["usage"], {"total_tokens": 50})
        body = json.loads(opener.open.call_args.args[0].data)
        self.assertFalse(body["store"])
        self.assertNotIn("tools", body)
        self.assertEqual(body["text"]["format"]["schema"], PATCH_SCHEMA)

    def test_http_error_does_not_retry_or_record_key(self):
        provider = HTTPProvider("meta", "https://api.meta.ai/v1", "test-key", "configured-model")
        raw = json.dumps({"error": {"type": "auth", "code": "denied", "message": "test-key invalid"}}).encode()
        opener = Mock(); opener.open.side_effect = urllib.error.HTTPError(provider.base, 401, "Denied", {}, io.BytesIO(raw))
        with patch("accessfix.providers.urllib.request.build_opener", return_value=opener):
            result = provider.propose(PAYLOAD, self.root / "result")
        self.assertEqual(opener.open.call_count, 1)
        self.assertEqual(result["metadata"]["http_status"], 401)
        self.assertIsNone(result["metadata"]["usage"])
        self.assertNotIn("test-key", (self.root / "result" / "metadata.json").read_text())

    def test_output_cannot_overwrite_prior_evidence(self):
        provider = HTTPProvider("meta", "https://api.meta.ai/v1", "test-key", "configured-model")
        out = self.root / "existing"; out.mkdir(); (out / "keep.txt").write_text("preserved")
        with patch("accessfix.providers.urllib.request.build_opener") as opener, self.assertRaises(FileExistsError):
            provider.propose(PAYLOAD, out)
        opener.assert_not_called()
        self.assertEqual((out / "keep.txt").read_text(), "preserved")

    def test_input_rejects_hidden_assertion_field_before_transport(self):
        provider = HTTPProvider("meta", "https://api.meta.ai/v1", "test-key", "configured-model")
        with patch("accessfix.providers.urllib.request.build_opener") as opener, self.assertRaises(ValueError):
            provider.propose({**PAYLOAD, "final_assertions": "must not be sent"}, self.root / "result")
        opener.assert_not_called()

    def test_endpoint_rules_and_redirect_refusal(self):
        for base in ("http://remote.example/v1", "https://user:pass@example.com/v1", "https://example.com/v1?secret=x"):
            with self.subTest(base=base), self.assertRaises(ValueError): _endpoint(base, True)
        self.assertEqual(_endpoint("http://127.0.0.1:8000/v1/", True), "http://127.0.0.1:8000/v1")
        with self.assertRaises(urllib.error.HTTPError):
            _NoRedirect().redirect_request(urllib.request.Request("https://api.meta.ai/v1"), None, 302, "Moved", {}, "https://attacker.example")

    def test_codex_uses_configured_model_and_reports_missing_response_id(self):
        result, call = self.codex()
        self.assertEqual(result["proposal"], PROPOSAL)
        self.assertIsNone(result["metadata"]["response_model"])
        self.assertEqual(result["metadata"]["requested_model"], "configured-test-model")
        self.assertEqual(result["metadata"]["usage"], {"input_tokens": 100, "output_tokens": 20})
        command = call.args[0]
        self.assertIn("--strict-config", command)
        for option in ("model_providers.accessfix_one_shot.request_max_retries=0",
                       "model_providers.accessfix_one_shot.stream_max_retries=0",
                       "features.unbounded_connection_retries=false", "features.shell_tool=false"):
            self.assertIn(option, command)

    def test_codex_malformed_response_keeps_usage(self):
        result, _ = self.codex(events("broken json"))
        self.assertIsNone(result["proposal"])
        self.assertEqual(result["metadata"]["usage"]["output_tokens"], 20)
        self.assertTrue(result["metadata"]["live_response_received"])

    def test_codex_tool_activity_rejects_candidate(self):
        records = events(); records.insert(2, {"type": "item.started", "item": {"type": "command_execution"}})
        result, _ = self.codex(records)
        self.assertIsNone(result["proposal"])
        self.assertEqual(result["metadata"]["unexpected_tool_activity"], ["command_execution"])

    def test_codex_multiple_turns_reject_candidate(self):
        result, _ = self.codex(events() + [{"type": "turn.started"}])
        self.assertIsNone(result["proposal"])
        self.assertEqual(result["metadata"]["turns_started"], 2)

    def test_model_configuration_no_fallback_or_auth_file_read(self):
        (self.root / "config.toml").write_text('model = "configured-file-model"', encoding="utf-8")
        with patch.dict(os.environ, {"CODEX_HOME": str(self.root)}, clear=True):
            self.assertEqual(configured_codex_model(), ("configured-file-model", "user_config.model"))
        with patch.dict(os.environ, {"CODEX_HOME": str(self.root / "absent")}, clear=True):
            self.assertIsNone(configured_codex_model()[0])

    def test_provider_catalog_does_not_claim_authentication(self):
        with patch.dict(os.environ, {}, clear=True), patch("accessfix.providers.shutil.which", return_value=None):
            rows = provider_status()
        self.assertEqual({r["id"] for r in rows}, {"codex", "openai", "meta", "spark-open"})
        self.assertTrue(all(not r["auth_verified"] and not r["available"] for r in rows))
        with self.assertRaises(ValueError): get_provider("unknown")


@unittest.skipUnless(shutil.which("codex"), "Installed Codex required only for local transport boundary probe")
class InstalledCliBoundaryTests(unittest.TestCase):
    def test_installed_cli_sends_no_tools_and_does_not_retry_local_error(self):
        seen = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_POST(self):
                data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
                seen.append({"path": self.path, "model": data.get("model"), "tools": data.get("tools"),
                             "authorization_present": bool(self.headers.get("Authorization"))})
                self.send_response(400); self.send_header("Content-Type", "application/json"); self.end_headers()
                self.wfile.write(b'{"error":{"type":"local_preflight","message":"No model inference"}}')
        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            provider = CodexProvider()
            with tempfile.TemporaryDirectory(prefix="accessfix-local-boundary-") as temp:
                root = Path(temp)
                (root / "schema.json").write_text(json.dumps(PATCH_SCHEMA), encoding="utf-8")
                (root / "catalog.json").write_text(json.dumps(provider.restricted_catalog()), encoding="utf-8")
                command = provider._command(root, root / "schema.json", root / "catalog.json")[:-1]
                command += ["-c", f'model_providers.accessfix_one_shot.base_url="http://127.0.0.1:{server.server_port}/v1"',
                            "-c", "model_providers.accessfix_one_shot.requires_openai_auth=false", "-"]
                result = subprocess.run(command, input="Local transport preflight only.", capture_output=True,
                                        text=True, encoding="utf-8", errors="replace", timeout=45)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(len(seen), 1, result.stderr + result.stdout)
                self.assertFalse(seen[0]["tools"], seen)
                self.assertFalse(seen[0]["authorization_present"])
                self.assertEqual(seen[0]["model"], provider.model)
                self.assertEqual(seen[0]["path"], "/v1/responses")
                self.assertNotIn("unrecognized configuration", result.stdout)
        finally:
            server.shutdown(); server.server_close(); thread.join(timeout=5)


if __name__ == "__main__": unittest.main()
