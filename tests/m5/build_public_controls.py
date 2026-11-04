"""Manual verifier controls, never supplied to the Meta model."""
import argparse
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
destination = args.output.resolve()
if not destination.is_relative_to(ROOT / "artifacts/m5"):
    raise SystemExit("Controls must be in the M5 evidence tree")
destination.mkdir(parents=True, exist_ok=False)
source = ROOT / "evaluation/m5_public_tictactoe/application"
anchor = '<div className={styles[\'grid-item\']} onClick={handleClick}>'
replacement = '''<div className={styles['grid-item']} role="button" tabIndex={0}
      aria-label={value === null ? `Row ${Math.floor(iTh / 3) + 1}, column ${iTh % 3 + 1}` : undefined}
      onClick={handleClick} onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); handleClick();
        }
      }}>'''
for kind in ("positive", "regression"):
    target = destination / "public-tictactoe" / kind
    shutil.copytree(source, target)
    file = target / "src/App.jsx"
    text = file.read_text(encoding="utf-8")
    assert text.count(anchor) == 1
    text = text.replace(anchor, replacement)
    if kind == "regression":
        # Retain keyboard improvement but break the existing Rematch action.
        old = "setSquares(initialArray);"
        assert text.count(old) == 1
        text = text.replace(old, "/* Deliberate manual control: board reset removed. */")
    file.write_text(text, encoding="utf-8")
print("Created manual positive and regression controls; no model requests")
