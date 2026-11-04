"""Bounded M5 public-app patch application. Only the two registered application files are writable."""
import difflib
import json
import shutil
from accessfix.storage import inventory, safe_child
from accessfix.providers import parse_proposal

ALLOWED = ("src/App.jsx", "src/tictactoe.module.css")


def source_payload(source):
    files = {name: safe_child(source, name).read_text(encoding="utf-8") for name in ALLOWED}
    if sum(len(v.encode()) for v in files.values()) > 65536:
        raise ValueError("Source exceeds 64 KiB")
    return files


def apply(original, candidate, proposal, expected):
    if inventory(original) != expected: raise ValueError("Original source changed")
    parse_proposal(json.dumps(proposal))
    if not proposal["edits"]: raise ValueError("Empty repair proposal")
    files = source_payload(original)
    changed = dict(files)
    for edit in proposal["edits"]:
        name, old, new = edit["path"], edit["old"], edit["new"]
        if name not in ALLOWED: raise ValueError("Patch path not allowed")
        if changed[name].count(old) != 1: raise ValueError("Patch anchor is not unique")
        changed[name] = changed[name].replace(old, new, 1)
    if changed == files: raise ValueError("No source change")
    if sum(len(v.encode()) for v in changed.values()) > 65536: raise ValueError("Candidate exceeds limit")
    if candidate.exists(): raise ValueError("Candidate already exists")
    shutil.copytree(original, candidate)
    diff = []
    for name in ALLOWED:
        if files[name] == changed[name]: continue
        safe_child(candidate, name).write_text(changed[name], encoding="utf-8")
        diff.extend(difflib.unified_diff(files[name].splitlines(True), changed[name].splitlines(True),
                    fromfile="original/" + name, tofile="candidate/" + name))
    if inventory(original) != expected: raise ValueError("Original integrity changed")
    return "".join(diff)
