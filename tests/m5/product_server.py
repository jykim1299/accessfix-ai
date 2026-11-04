"""M5 regression host: new live evidence root, existing read-only archives."""
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from accessfix.product import create_product_app

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8806)
    args = parser.parse_args()
    destination = args.root.resolve()
    destination.mkdir(parents=True, exist_ok=False)
    app = create_product_app(root=destination / "jobs")
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=args.port, workers=1)
