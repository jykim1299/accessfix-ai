"""Local product review server with a separate live-run store; no inference on startup."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from accessfix.product import create_product_app

app = create_product_app(root=ROOT / "artifacts/m4/product-ui-live")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8804, workers=1)
