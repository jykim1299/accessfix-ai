"""Run one registered browser analysis through the release API; no repair call."""
import argparse
import json
from pathlib import Path
import time
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8808')
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
base = args.url.rstrip('/')
if not base.startswith(('http://127.0.0.1:', 'http://localhost:')):
    raise SystemExit('Only a local release server is supported')
args.out.parent.mkdir(parents=True, exist_ok=True)
if args.out.exists(): raise SystemExit('Use a new output file')


def get(path):
    with urllib.request.urlopen(base + path) as response:
        return json.load(response)


assert not any(p['available'] for p in get('/api/providers')), 'Use default model-disabled release mode'
session = get('/api/session')['token']
example = get('/api/examples')[0]
data = json.dumps({'example_id': example['id'], 'task_id': example['tasks'][0]['id']}).encode()
request = urllib.request.Request(base + '/api/analyses', data=data, method='POST',
    headers={'Content-Type': 'application/json', 'Origin': base, 'X-AccessFix-Token': session})
with urllib.request.urlopen(request) as response:
    assert response.status == 202
    queued = json.load(response)
ident = queued['id']; started = time.monotonic()
while time.monotonic() - started < 180:
    record = get('/api/analyses/' + ident)
    if record['status'] in ('completed', 'failed'): break
    time.sleep(1)
assert record['status'] == 'completed', record.get('error', record['status'])
assert record['baseline']['build_ok'] and record['metrics']['pointer_pass'] == 2
assert record['metrics']['keyboard_pass'] == 0  # The deliberately broken original stays broken.
result = {'analysis_id': ident, 'status': record['status'], 'metrics': record['metrics'],
          'image_id': record['baseline']['image_id'], 'elapsed_s': time.monotonic() - started,
          'actual_model_calls': 0, 'repair_requests': 0, 'session_values_saved': False}
args.out.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({k: result[k] for k in ['analysis_id', 'status', 'image_id', 'actual_model_calls']}))
