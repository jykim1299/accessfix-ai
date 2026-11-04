"""Adversarial installer checks, not model performance tests."""
import hashlib
import json
from pathlib import Path
import zipfile

import pytest
from scripts.install_demo_evidence import install
from release.run_demo import create_demo
from fastapi.testclient import TestClient


def bundle(tmp_path, paths=None, tamper=False):
    paths = paths or ['artifacts/demo/record.json']
    raw = b'{"accepted":false}'
    entries = [{'path': p, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()} for p in paths]
    file = tmp_path / 'bundle.zip'
    with zipfile.ZipFile(file, 'w') as z:
        z.writestr('manifest.json', json.dumps({'schema_version': 1, 'entries': entries}))
        for p in paths: z.writestr(p, raw if not tamper else b'changed')
    return file, hashlib.sha256(file.read_bytes()).hexdigest()


@pytest.mark.parametrize('paths', [['../escaped'], ['artifacts/../../escaped'], ['artifacts/C:/bad'],
    ['artifacts/a', 'artifacts/a/b'], ['artifacts/Record.json', 'artifacts/record.json'], ['backend/override.py']])
def test_unsafe_bundle_rejected_before_any_write(tmp_path, paths):
    file, digest = bundle(tmp_path, paths); dest = tmp_path / 'new'; dest.mkdir()
    with pytest.raises(ValueError): install(file, dest, digest)
    assert list(dest.iterdir()) == []


def test_tamper_and_overwrite_refused(tmp_path):
    file, digest = bundle(tmp_path, tamper=True); dest = tmp_path / 'new'; dest.mkdir()
    with pytest.raises(ValueError): install(file, dest, digest)
    assert not list(dest.iterdir())
    file, digest = bundle(tmp_path)
    with pytest.raises(ValueError): install(file, dest, '0' * 64)
    result = install(file, dest, digest)
    assert result['installed_files'] == 1
    original = (dest / 'artifacts/demo/record.json').read_bytes()
    with pytest.raises(FileExistsError): install(file, dest, digest)
    assert (dest / 'artifacts/demo/record.json').read_bytes() == original


@pytest.mark.parametrize('name', ['NUL.txt', 'con', 'COM1.json', 'LPT².txt', 'CONOUT$',
    'bad?.json', 'bad*.json', 'bad|.json', 'bad<.json', 'bad>.json', 'bad".json',
    'record.json.', 'record.json ', 'bad\x01.json'])
def test_windows_alias_rejected_before_earlier_valid_file_is_written(tmp_path, name):
    file, digest = bundle(tmp_path, ['artifacts/valid.json', 'artifacts/' + name])
    dest = tmp_path / 'new'; dest.mkdir()
    with pytest.raises(ValueError): install(file, dest, digest)
    assert list(dest.iterdir()) == []


def test_link_destination_refused(tmp_path):
    file, digest = bundle(tmp_path); dest = tmp_path / 'new'; dest.mkdir()
    external = tmp_path / 'outside'; external.mkdir()
    try: (dest / 'artifacts').symlink_to(external, target_is_directory=True)
    except OSError: pytest.skip('OS does not permit test symlinks')
    with pytest.raises(ValueError): install(file, dest, digest)
    assert not list(external.iterdir())


def test_saved_demo_cannot_call_provider_even_with_local_auth(tmp_path):
    with TestClient(create_demo(root=tmp_path / 'jobs')) as client:
        providers = client.get('/api/providers').json()
        assert providers and not any(p['available'] for p in providers)
        token = client.get('/api/session').json()['token']
        response = client.post('/api/analyses/' + 'a' * 32 + '/repair', json={'provider': 'meta'},
                               headers={'x-accessfix-token': token})
        assert response.status_code == 403
        assert list((tmp_path / 'jobs').glob('repairs/*')) == []
