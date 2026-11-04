"""Verify and install a reviewed demo bundle. No inference or project execution."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import zipfile


def safe_path(root: Path, relative: str) -> Path:
    if not isinstance(relative, str) or not relative or '\\' in relative or ':' in relative:
        raise ValueError('Invalid bundle path')
    parts = PurePosixPath(relative).parts
    if relative.startswith('/') or any(p in ('', '.', '..') for p in relative.split('/')):
        raise ValueError('Invalid bundle path')
    if parts[0] not in ('artifacts', 'public-evidence'):
        raise ValueError('Bundle may only install evidence')
    # Reject Windows aliases before any write, even when validating on another OS.
    devices = {'CON', 'PRN', 'AUX', 'NUL', 'CONIN$', 'CONOUT$'}
    devices.update(prefix + digit for prefix in ('COM', 'LPT') for digit in '123456789¹²³')
    for part in parts:
        if (part.endswith((' ', '.')) or any(ord(c) < 32 or c in '<>"|?*' for c in part)
                or part.split('.')[0].upper() in devices):
            raise ValueError('Invalid or reserved Windows bundle path')
    target = root.joinpath(*parts)
    for parent in [target, *target.parents]:
        if parent.exists() and (parent.is_symlink() or parent.is_junction()):
            raise ValueError('Linked destination refused')
        if parent == root:
            break
    if not target.resolve().is_relative_to(root.resolve()):
        raise ValueError('Path escape')
    return target


def install(bundle: Path, destination: Path, expected_sha256: str):
    if hashlib.sha256(bundle.read_bytes()).hexdigest() != expected_sha256.lower():
        raise ValueError('Bundle SHA-256 mismatch')
    root = destination.resolve()
    if not root.is_dir() or destination.is_symlink() or destination.is_junction():
        raise ValueError('Destination must be an existing real directory')
    with zipfile.ZipFile(bundle) as z:
        infos = z.infolist()
        names = [i.filename for i in infos]
        if len(names) != len(set(names)) or len(names) > 6000:
            raise ValueError('Duplicate or excessive archive members')
        if sum(i.file_size for i in infos) > 256 * 1024 * 1024:
            raise ValueError('Bundle exceeds size limit')
        for i in infos:
            if stat.S_ISLNK(i.external_attr >> 16) or i.is_dir():
                raise ValueError('Links and directory members refused')
        if 'manifest.json' not in names or z.getinfo('manifest.json').file_size > 4 * 1024 * 1024:
            raise ValueError('Missing or oversized manifest')
        manifest = json.loads(z.read('manifest.json'))
        entries = manifest.get('entries')
        if manifest.get('schema_version') != 1 or not isinstance(entries, list):
            raise ValueError('Invalid manifest')
        paths = [e['path'] for e in entries]
        folded = [p.casefold() for p in paths]
        if len(paths) != len(set(folded)) or set(names) != {'manifest.json', *paths}:
            raise ValueError('Manifest and archive differ')
        if any(any('/'.join(p.split('/')[:i]) in folded for i in range(1, len(p.split('/')))) for p in folded):
            raise ValueError('File and directory path collision')
        pending = []
        for entry in entries:
            target = safe_path(root, entry['path'])
            if target.exists():
                raise FileExistsError('Refusing to overwrite existing evidence')
            if any(parent.exists() and not parent.is_dir() for parent in target.parents):
                raise ValueError('Destination parent is not a directory')
            data = z.read(entry['path'])
            if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
                raise ValueError('Evidence hash mismatch')
            pending.append((target, data))
        # All bytes and destinations are checked before creating any output.
        for target, data in pending:
            safe_path(root, target.relative_to(root).as_posix())
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as handle:
                handle.write(data)
    return {'installed_files': len(pending), 'bundle_sha256': expected_sha256, 'model_requests': 0}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('bundle', type=Path)
    p.add_argument('--destination', type=Path, default=Path('.'))
    p.add_argument('--sha256', required=True, help='SHA-256 from the separate release checksum file')
    a = p.parse_args()
    print(json.dumps(install(a.bundle, a.destination, a.sha256)))
