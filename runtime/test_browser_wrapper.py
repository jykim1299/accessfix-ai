"""Failure-path unit tests; these do not count as browser/model measurements."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from accessfix.browser import run_browser


class BrowserFailureEvidence(unittest.TestCase):
    def test_container_and_cleanup_timeouts_preserve_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "evidence"
            with patch("accessfix.browser.subprocess.run", side_effect=[
                subprocess.CompletedProcess([], 0, stdout="sha256:unit-test"),
                subprocess.TimeoutExpired("docker run", 300, output=b"partial trace log", stderr=b"diagnostic"),
                subprocess.TimeoutExpired("docker stop", 15),
            ]):
                result = run_browser(ROOT / "examples/modal", output)
            self.assertFalse(result["build_ok"])
            self.assertEqual(result["error"]["category"], "measurement_timeout")
            self.assertIn("cleanup_error", result["error"])
            self.assertIn("partial trace log", (output / "container.log").read_text())
            self.assertEqual(json.loads((output / "result.json").read_text()), result)

    def test_absent_measurement_cannot_pass(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "evidence"
            with patch("accessfix.browser.subprocess.run", side_effect=[
                subprocess.CompletedProcess([], 0, stdout="sha256:unit-test"),
                subprocess.CompletedProcess([], 2, stdout="", stderr="build failed"),
            ]):
                result = run_browser(ROOT / "examples/modal", output)
            self.assertFalse(result["build_ok"])
            self.assertEqual(result["error"]["category"], "container_failed")
            self.assertEqual(result["container_exit_code"], 2)
            self.assertEqual(result["workflows"], [])


if __name__ == "__main__":
    unittest.main()
