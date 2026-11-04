"""Run real isolated-browser positive/negative controls before model inference."""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from accessfix.browser import run_browser
from accessfix.gate import assess
from controls.build_controls import CASES, materialize


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def modality_pass(result: dict, modality: str) -> bool:
    flows = [flow for flow in result.get('workflows', []) if flow.get('modality') == modality]
    return bool(flows) and all(flow.get('status') == 'pass' for flow in flows)


def categories(result: dict) -> list[str]:
    return sorted({str(error.get('category')) for flow in result.get('workflows', []) for error in flow.get('errors', [])})


def run(destination: Path) -> dict:
    destination.mkdir(parents=True, exist_ok=False)
    example = ROOT / 'examples/modal'
    original_hash = hashlib.sha256((example / 'src/ModalApp.tsx').read_bytes()).hexdigest()
    baseline = run_browser(example, destination / 'original', mode='final')
    rows = [{
        'id': 'original', 'kind': 'browser_control',
        'passed': bool(baseline.get('build_ok') and modality_pass(baseline, 'pointer') and not modality_pass(baseline, 'keyboard')),
        'build_ok': baseline.get('build_ok'), 'pointer_pass': modality_pass(baseline, 'pointer'),
        'keyboard_pass': modality_pass(baseline, 'keyboard'), 'errors': categories(baseline),
        'result_path': 'original/result.json',
    }]
    measured = {}
    for case in CASES:
        source = materialize(example, destination / case / 'source', case)
        result = run_browser(source, destination / case / 'browser', mode='final')
        decision = assess(baseline, result)
        write_json(destination / case / 'decision.json', decision)
        pointer, keyboard = modality_pass(result, 'pointer'), modality_pass(result, 'keyboard')
        if case == 'positive':
            passed = bool(result.get('build_ok') and pointer and keyboard and decision['accepted'])
        elif case == 'keyboard-noop':
            passed = bool(result.get('build_ok') and pointer and not keyboard and not decision['accepted'])
        elif case == 'pointer-regression':
            passed = bool(result.get('build_ok') and not pointer and keyboard and not decision['accepted'])
        elif case == 'ambiguous-opener':
            passed = bool(result.get('build_ok') and not decision['accepted'] and any('ambig' in item for item in categories(result)))
        else:
            passed = bool(result.get('build_ok') and pointer and keyboard and not decision['accepted'] and decision.get('new_violations'))
        rows.append({'id': case, 'kind': 'browser_control', 'passed': passed, 'build_ok': result.get('build_ok'),
                     'pointer_pass': pointer, 'keyboard_pass': keyboard, 'errors': categories(result),
                     'decision': decision, 'result_path': f'{case}/browser/result.json'})
        measured[case] = result
        print(json.dumps({'case': case, 'passed': passed, 'pointer': pointer, 'keyboard': keyboard, 'accepted': decision['accepted']}, ensure_ascii=False), flush=True)

    malformed = deepcopy(measured['positive'])
    removed = None
    for flow in malformed.get('workflows', []):
        if flow.get('audits'):
            removed = flow['audits'].pop(0)
            break
    write_json(destination / 'missing-audit/input.json', malformed)
    missing_decision = assess(baseline, malformed)
    write_json(destination / 'missing-audit/decision.json', missing_decision)
    rows.append({'id': 'missing-audit', 'kind': 'synthetic_result_gate_control',
                 'passed': removed is not None and not missing_decision['accepted'],
                 'removed_state': removed.get('state') if removed else None, 'decision': missing_decision})
    unchanged = original_hash == hashlib.sha256((example / 'src/ModalApp.tsx').read_bytes()).hexdigest()
    rows.append({'id': 'original-preserved', 'kind': 'file_integrity', 'passed': unchanged, 'sha256': original_hash})
    summary = {'schema_version': 1, 'purpose': 'Independent verifier/gate controls, not model repair performance',
               'completed_utc': datetime.now(timezone.utc).isoformat(), 'checks': len(rows),
               'passed': sum(row['passed'] for row in rows), 'failed': sum(not row['passed'] for row in rows), 'rows': rows}
    write_json(destination / 'summary.json', summary)
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/controls' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    args = parser.parse_args()
    summary = run(args.output.resolve())
    print(json.dumps({key: value for key, value in summary.items() if key != 'rows'}, indent=2))
    raise SystemExit(0 if not summary['failed'] else 1)
