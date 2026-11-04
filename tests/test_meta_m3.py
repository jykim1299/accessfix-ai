"""Meta protocol boundary tests. All responses are local mocks; no API calls or keys."""
import io
import json
from unittest.mock import Mock, patch
import urllib.error

import pytest

from accessfix.providers import HTTPProvider, PATCH_SCHEMA


FAKE_KEY = "LLM_000_fake_secret_for_unit_tests"
MODEL = "muse-spark-1.3-contributor"
PAYLOAD = {
    "task": "Open and dismiss the registered preferences dialog with the keyboard.",
    "files": {"src/ModalApp.tsx": "const label = 'Preferences';"},
    "observations": {"focus": "Remained on opener after opening dialog"},
}
PROPOSAL = {"rationale": "Mock protocol result only", "edits": []}


class Response:
    status = 200

    def __init__(self, data, request_id="mock-meta-request"):
        self.raw = json.dumps(data).encode("utf-8")
        self.headers = {"x-request-id": request_id}

    def read(self, size):
        return self.raw[:size]

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


def completion(content="OK", finish_reason="stop", model=MODEL):
    return {
        "model": model,
        "usage": {"prompt_tokens": 6, "completion_tokens": 3, "total_tokens": 9},
        "choices": [{"finish_reason": finish_reason, "message": {"role": "assistant", "content": content}}],
    }


@pytest.fixture
def provider():
    return HTTPProvider("meta", "https://api.meta.ai/v1", FAKE_KEY, MODEL)


@pytest.fixture
def opener():
    mocked = Mock()
    mocked.open.return_value = Response(completion())
    with patch("accessfix.providers.urllib.request.build_opener", return_value=mocked):
        yield mocked


def assert_no_saved_key(directory):
    for path in directory.rglob("*"):
        if path.is_file():
            assert FAKE_KEY.encode() not in path.read_bytes(), path.name


def test_meta_repair_uses_bounded_schema_without_tools(provider, opener, tmp_path):
    opener.open.return_value = Response(completion(json.dumps(PROPOSAL)))
    result = provider.propose(PAYLOAD, tmp_path / "repair")
    assert result["proposal"] == PROPOSAL
    request = opener.open.call_args.args[0]
    body = json.loads(request.data)
    assert request.full_url == "https://api.meta.ai/v1/chat/completions"
    assert body["model"] == MODEL
    assert body["max_completion_tokens"] == 12000
    assert "max_output_tokens" not in body
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["schema"] == PATCH_SCHEMA
    assert [message["role"] for message in body["messages"]] == ["developer", "user"]
    assert json.loads(body["messages"][1]["content"]) == PAYLOAD
    assert "tools" not in body
    assert opener.open.call_count == 1
    meta = result["metadata"]
    assert meta["patch_parsed"] is True
    assert meta["browser_verified"] is False
    assert meta["purpose"] == "repair"
    assert meta["response_model_matches_requested"] is True
    assert meta["automatic_retries"] == 0
    assert_no_saved_key(tmp_path)


def test_probe_sends_only_small_prompt_and_records_no_repair_success(provider, opener, tmp_path):
    result = provider.probe(tmp_path / "probe")
    request = opener.open.call_args.args[0]
    body = json.loads(request.data)
    assert body == {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Reply exactly OK."}],
        "max_completion_tokens": 256,
        "reasoning_effort": "minimal",
    }
    assert request.get_header("Authorization") == "Bearer " + FAKE_KEY
    assert opener.open.call_count == 1
    meta = result["metadata"]
    assert meta["auth_verified"] is True
    assert meta["live_response_received"] is True
    assert meta["probe_completed"] is True
    assert meta["purpose"] == "authentication_probe"
    assert meta["prompt_version"] == "meta-auth-probe-v1"
    assert meta["muse_spark_measured"] is False
    assert meta["patch_parsed"] is False
    assert meta["browser_verified"] is False
    assert meta["usage"] == completion()["usage"]
    assert result["proposal"] is None
    assert not (tmp_path / "probe" / "proposal.json").exists()
    assert_no_saved_key(tmp_path)


@pytest.mark.parametrize("content,finish_reason", [("", "length"), ("", "stop")])
def test_probe_incomplete_output_does_not_erase_observed_authentication(provider, opener, tmp_path, content, finish_reason):
    opener.open.return_value = Response(completion(content, finish_reason))
    result = provider.probe(tmp_path / "probe")
    meta = result["metadata"]
    assert meta["auth_verified"] is True
    assert meta["live_response_received"] is True
    assert not meta.get("probe_completed", False)
    assert meta["error"] == "ValueError"
    assert meta["finish_reason"] == finish_reason
    assert meta["usage"] == completion()["usage"]
    assert meta["muse_spark_measured"] is False
    assert opener.open.call_count == 1
    assert (tmp_path / "probe" / "response.json").is_file()


@pytest.mark.parametrize("status,error_type,error_code", [
    (401, "authentication_error", "invalid_api_key"),
    (402, "invalid_request_error", "billing_required"),
    (403, "invalid_request_error", "permission_denied"),
    (429, "rate_limit_error", "rate_limit_exceeded"),
    (500, "server_error", "backend_unavailable"),
])
def test_http_failure_preserves_actual_error_without_retry(provider, opener, tmp_path, status, error_type, error_code):
    # These are mock error values, not evidence of a response from the Meta service.
    raw = json.dumps({"error": {
        "type": error_type, "code": error_code, "param": "model", "message": "Denied for " + FAKE_KEY,
    }}).encode()
    opener.open.side_effect = urllib.error.HTTPError(
        provider.base, status, "Mock denial", {"x-request-id": "mock-error-id"}, io.BytesIO(raw))
    result = provider.probe(tmp_path / "probe")
    meta = result["metadata"]
    assert meta["http_status"] == status
    assert meta["error_type"] == error_type
    assert meta["error_code"] == error_code
    assert meta["error_param"] == "model"
    assert meta["request_id"] == "mock-error-id"
    assert "[REDACTED]" in meta["error_message"]
    assert meta["request_attempts"] == 1
    assert meta["automatic_retries"] == 0
    assert meta["auth_verified"] is False
    assert meta["live_response_received"] is False
    assert meta["muse_spark_measured"] is False
    assert meta["usage"] is None
    assert meta["cost_usd"] is None
    assert result["proposal"] is None
    assert opener.open.call_count == 1
    assert_no_saved_key(tmp_path)


def test_null_error_code_stays_null_and_all_error_fields_are_redacted(provider, opener, tmp_path):
    raw = json.dumps({"error": {
        "type": "invalid_request_error:" + FAKE_KEY, "code": None,
        "param": FAKE_KEY, "message": "x" * 990 + FAKE_KEY + " trailing",
    }}).encode()
    opener.open.side_effect = urllib.error.HTTPError(
        provider.base, 400, "Mock denial", {"x-request-id": FAKE_KEY}, io.BytesIO(raw))
    meta = provider.probe(tmp_path / "probe")["metadata"]
    assert meta["error_code"] is None
    assert meta["error_param"] == "[REDACTED]"
    assert meta["request_id"] == "[REDACTED]"
    assert "LLM_000" not in meta["error_message"]
    assert len(meta["error_message"]) <= 1000
    assert_no_saved_key(tmp_path)


def test_echoed_key_in_successful_nested_response_and_headers_is_not_saved(provider, opener, tmp_path):
    data = completion()
    data["extra"] = {FAKE_KEY: [FAKE_KEY, {"echo": "prefix " + FAKE_KEY}]}
    data["usage"]["unknown_detail"] = FAKE_KEY
    opener.open.return_value = Response(data, request_id=FAKE_KEY)
    result = provider.probe(tmp_path / "probe")
    assert result["metadata"]["request_id"] == "[REDACTED]"
    saved = json.loads((tmp_path / "probe" / "response.json").read_text(encoding="utf-8"))
    assert saved["extra"]["[REDACTED]"][1]["echo"] == "prefix [REDACTED]"
    assert result["metadata"]["usage"]["unknown_detail"] == "[REDACTED]"
    assert_no_saved_key(tmp_path)


def test_network_error_redacts_before_truncating_and_does_not_retry(provider, opener, tmp_path):
    opener.open.side_effect = urllib.error.URLError("x" * 980 + FAKE_KEY + " trailing")
    meta = provider.probe(tmp_path / "probe")["metadata"]
    assert meta["error"] == "URLError"
    assert "LLM_000" not in meta["error_message"]
    assert meta["auth_verified"] is False
    assert opener.open.call_count == 1
    assert_no_saved_key(tmp_path)


def test_response_model_mismatch_is_recorded_without_renaming_model(provider, opener, tmp_path):
    opener.open.return_value = Response(completion(model="returned-different-model"))
    meta = provider.probe(tmp_path / "probe")["metadata"]
    assert meta["requested_model"] == MODEL
    assert meta["response_model"] == "returned-different-model"
    assert meta["response_model_matches_requested"] is False


def test_probe_cannot_overwrite_prior_evidence_or_make_another_request(provider, opener, tmp_path):
    out = tmp_path / "probe"
    provider.probe(out)
    before = {path.name: path.read_bytes() for path in out.iterdir()}
    with pytest.raises(FileExistsError):
        provider.probe(out)
    assert {path.name: path.read_bytes() for path in out.iterdir()} == before
    assert opener.open.call_count == 1


def test_probe_cannot_route_to_other_provider(opener, tmp_path):
    provider = HTTPProvider("openai", "https://api.openai.com/v1", FAKE_KEY, "mock-model", responses=True)
    with pytest.raises(ValueError, match="Meta chat"):
        provider.probe(tmp_path / "probe")
    opener.open.assert_not_called()
    assert not (tmp_path / "probe").exists()
