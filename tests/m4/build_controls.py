"""Trusted manual controls for verifier qualification, never repair-model input."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil

PROJECT = Path(__file__).resolve().parents[2]
CASES = PROJECT / "evaluation" / "m4" / "cases"


def replace_once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise ValueError("Manual control anchor must match exactly once")
    return source.replace(old, new, 1)


def positive(case: str, source: str) -> str:
    if case == "dev-tabs":
        return replace_once(source, 'onClick={() => setSelected(view.id)}', '''onClick={() => setSelected(view.id)} onKeyDown={event => {
          const tabs = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLElement>('[role="tab"]'));
          const index = tabs.indexOf(event.currentTarget);
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
          if (next >= 0) { event.preventDefault(); setSelected(views[next].id); tabs[next].focus(); }
          else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(view.id); }
        }}''')
    if case == "holdout-menu":
        source = replace_once(source, "  function choose(action:", '''  useEffect(() => { if (open) document.querySelector<HTMLElement>('[role="menuitem"]')?.focus(); }, [open]);
  function closeMenu() { setOpen(false); document.getElementById('workspace-actions')?.focus(); }
  function choose(action:''')
        source = replace_once(source, "    setOpen(false);", "    closeMenu();")
        return replace_once(source, 'className="menu">', '''className="menu" onKeyDown={event => {
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
          const index = items.indexOf(document.activeElement as HTMLElement);
          const next = event.key === 'ArrowDown' ? (index + 1) % items.length : event.key === 'ArrowUp' ? (index + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;
          if (next >= 0) { event.preventDefault(); items[next].focus(); }
          else if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
          else if (event.key === 'Tab') closeMenu();
        }}>''')
    if case == "holdout-switch":
        return replace_once(source, " onKeyUp={event => { if (event.key === ' ') { event.preventDefault(); setDraft(value => !value); } }}", "")
    if case == "holdout-action":
        return replace_once(source, 'onClick={() => setOrder(current => ({ ...current, coupon: true }))}', '''onClick={() => setOrder(current => ({ ...current, coupon: true }))} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOrder(current => ({ ...current, coupon: true })); } }}''')
    raise ValueError("Unknown registered control")


def regression(case: str, source: str) -> str:
    anchors = {
        "dev-tabs": ("setNotes(value => value + 1)", "setNotes(value => value)"),
        "holdout-menu": ("drafts: current.drafts + 1", "drafts: current.drafts"),
        "holdout-switch": ("setTests(value => value + 1)", "setTests(value => value)"),
        "holdout-action": ("items: current.items + 1", "items: current.items"),
    }
    return replace_once(source, *anchors[case])


def build(out: Path) -> dict[str, dict[str, Path]]:
    out = Path(out).resolve()
    out.mkdir(parents=True, exist_ok=False)
    mapping = {}
    for case in ("dev-tabs", "holdout-menu", "holdout-switch", "holdout-action"):
        original = (CASES / case / "src" / "App.tsx").read_text(encoding="utf-8")
        fixed = positive(case, original)
        mapping[case] = {}
        for name, content in (("positive", fixed), ("regression", regression(case, fixed))):
            target = out / case / name
            shutil.copytree(CASES / case, target)
            (target / "src" / "App.tsx").write_text(content, encoding="utf-8")
            mapping[case][name] = target
    (out / "controls.json").write_text(json.dumps({"kind": "manual-verifier-control", "model_calls": 0,
        "scope": "Positive controls restore keyboard behavior; regression controls disable an existing background action.",
        "cases": {case: {name: str(path) for name, path in paths.items()} for case, paths in mapping.items()}}, indent=2), encoding="utf-8")
    return mapping


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.output)
    print(json.dumps({"status": "created", "directory": str(args.output), "cases": 4, "model_calls": 0}))
