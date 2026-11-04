"""Apply bounded text edits as data. Never execute a proposed command."""
from __future__ import annotations

import difflib
import json
import shutil
from pathlib import Path

from .storage import inventory, safe_child

ALLOWED_FILES = ("src/ModalApp.tsx", "src/styles.css")
MAX_BYTES = 65536


def source_payload(source: Path) -> dict[str, str]:
    files = {name: safe_child(source, name).read_text(encoding="utf-8") for name in ALLOWED_FILES}
    if sum(len(text.encode("utf-8")) for text in files.values()) > MAX_BYTES:
        raise ValueError("Source input exceeds 64 KiB")
    return files


def validate_patch(files: dict[str, str], proposal: dict) -> dict[str, str]:
    if not isinstance(proposal, dict) or set(proposal) != {"rationale", "edits"}:
        raise ValueError("Patch must contain rationale and edits only")
    if not isinstance(proposal["rationale"], str):
        raise ValueError("Invalid patch explanation")
    if len(json.dumps(proposal, ensure_ascii=False).encode("utf-8")) > MAX_BYTES:
        raise ValueError("Patch exceeds 64 KiB")
    edits = proposal["edits"]
    if not isinstance(edits, list) or not 1 <= len(edits) <= 10:
        raise ValueError("Patch must contain 1 to 10 edits")
    result = dict(files)
    for edit in edits:
        if not isinstance(edit, dict) or set(edit) != {"path", "old", "new"}:
            raise ValueError("Each edit requires path, old and new")
        name, old, new = edit["path"], edit["old"], edit["new"]
        if name not in ALLOWED_FILES or name not in files:
            raise ValueError("Patch path is not allowed")
        if not isinstance(old, str) or not old or not isinstance(new, str):
            raise ValueError("Invalid edit text")
        if result[name].count(old) != 1:
            raise ValueError("Edit anchor must occur exactly once")
        result[name] = result[name].replace(old, new, 1)
    if result == files:
        raise ValueError("Patch changes nothing")
    if sum(len(text.encode("utf-8")) for text in result.values()) > MAX_BYTES:
        raise ValueError("Candidate exceeds 64 KiB")
    return result


def create_candidate(original: Path, candidate: Path, proposal: dict, expected: dict) -> str:
    if inventory(original) != expected:
        raise ValueError("Original source changed after analysis")
    files = source_payload(original)
    updated = validate_patch(files, proposal)
    if candidate.exists():
        raise ValueError("Candidate already exists")
    shutil.copytree(original, candidate)
    diff = []
    for name in ALLOWED_FILES:
        if files[name] == updated[name]:
            continue
        safe_child(candidate, name).write_text(updated[name], encoding="utf-8")
        diff.extend(difflib.unified_diff(files[name].splitlines(True), updated[name].splitlines(True), fromfile="original/" + name, tofile="candidate/" + name))
    if inventory(original) != expected:
        raise RuntimeError("Original integrity lost")
    return "".join(diff)
