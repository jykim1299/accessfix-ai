"""Independent verifier controls, created before repair inference.

These are explicit development controls, never model-generated repair outcomes.
Only the single submitted example is used as the model's source input.
"""
from pathlib import Path
import shutil

CASES = ('positive', 'keyboard-noop', 'pointer-regression', 'ambiguous-opener', 'new-axe')


def replace_once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise ValueError('Control source anchor must occur exactly once')
    return source.replace(old, new, 1)


def positive_source(source: str) -> str:
    source = replace_once(source, 'useEffect, useState', 'useEffect, useRef, useState')
    source = replace_once(source, '  const [drafts, setDrafts] = useState(0);', '''  const [drafts, setDrafts] = useState(0);
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    if (!node) return;
    const controls = () => Array.from(node.querySelectorAll<HTMLElement>('input,button,[tabindex="0"]'))
      .filter(control => !control.hasAttribute('disabled') && control.getClientRects().length > 0);
    controls()[0]?.focus();
    const manageKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
      if (event.key !== 'Tab') return;
      const available = controls();
      const first = available[0];
      const last = available[available.length - 1];
      if (!first || !last) return;
      if (!node.contains(document.activeElement)) {
        event.preventDefault(); first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', manageKeys, true);
    return () => {
      document.removeEventListener('keydown', manageKeys, true);
      opener.current?.focus();
    };
  }, [open]);''')
    source = replace_once(source, '<section className="workspace">', '<section className="workspace" inert={open}>')
    source = replace_once(source, '<button className="primary" onClick={openPreferences}>', '<button ref={opener} className="primary" onClick={openPreferences}>')
    source = replace_once(source, '<div className="preferences-dialog" role="dialog" aria-modal="true">', '<div ref={dialog} className="preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="preferences-title" aria-describedby="preferences-description">')
    return source


def case_source(original: str, case: str) -> str:
    source = positive_source(original)
    if case == 'positive':
        return source
    if case == 'keyboard-noop':
        return replace_once(source, 'ref={opener} className="primary" onClick={openPreferences}', 'ref={opener} className="primary" onKeyDown={event => { if (event.key === "Enter" || event.key === " ") event.preventDefault(); }} onClick={openPreferences}')
    if case == 'pointer-regression':
        return replace_once(source, '<button className="primary" type="submit">Save preferences', '<button className="primary" type="submit" onClick={event => { if (event.detail > 0) event.preventDefault(); }}>Save preferences')
    if case == 'ambiguous-opener':
        return replace_once(source, '<p className="local-note">', '<button className="secondary" onClick={openPreferences}>Edit delivery preferences</button><p className="local-note">')
    if case == 'new-axe':
        return replace_once(source, '<p className="local-note">', '<button type="button" className="unnamed-control" /><p className="local-note">')
    raise ValueError('Unknown control case')


def materialize(example: Path, destination: Path, case: str) -> Path:
    if case not in CASES:
        raise ValueError('Unknown control case')
    if destination.exists():
        raise FileExistsError('Control artifacts must never be overwritten')
    shutil.copytree(example, destination)
    source = (example / 'src/ModalApp.tsx').read_text(encoding='utf-8')
    (destination / 'src/ModalApp.tsx').write_text(case_source(source, case), encoding='utf-8')
    return destination
