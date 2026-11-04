from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[2]
ARTIFACTS = PROJECT / "artifacts"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    with temp.open("w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2, allow_nan=False)
        f.flush()
        os.fsync(f.fileno())
    temp.replace(path)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(directory: Path) -> dict[str, str]:
    answer = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink() or path.is_junction():
            raise ValueError("Linked source is not permitted")
        if path.is_file():
            answer[path.relative_to(directory).as_posix()] = sha256(path)
    return answer


def safe_child(root: Path, relative: str) -> Path:
    if not relative or "\\" in relative or ":" in relative or relative.startswith("/") or any(x in ("", ".", "..") for x in relative.split("/")):
        raise ValueError("Invalid relative path")
    child = root / relative
    if not child.resolve().is_relative_to(root.resolve()):
        raise ValueError("Path outside evidence directory")
    for p in [child, *child.parents]:
        if p == root:
            break
        if p.is_symlink() or p.is_junction():
            raise ValueError("Linked path is not permitted")
    return child
