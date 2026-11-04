"""Loopback release demo; stored History works without credentials or Docker.

New browser analysis remains available. Live repair is disabled unless explicitly
enabled at server launch. This does not change any historical experiment.
"""
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from accessfix.product import create_product_app
from fastapi.responses import JSONResponse


def create_demo(root=None, allow_repair=False):
    app = create_product_app(root=root or ROOT / 'artifacts/release-live')

    @app.middleware('http')
    async def demo_boundary(request, call_next):
        if not allow_repair:
            if request.url.path == '/api/providers':
                return JSONResponse([{'id': 'meta', 'configured': False, 'available': False,
                    'auth_verified': False, 'requested_model': None,
                    'reason': 'Saved-evidence demo. Start with --enable-repair to allow a new paid model request.'}],
                    headers={'Cache-Control': 'no-store'})
            if request.method == 'POST' and request.url.path.endswith('/repair'):
                return JSONResponse({'detail': 'Live repair is disabled in this saved-evidence demo'}, status_code=403)
        return await call_next(request)
    return app


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8808)
    parser.add_argument('--root', type=Path)
    parser.add_argument('--browser-image', default='accessfix-m6-browser:rc1', help='Locally built release verifier image')
    parser.add_argument('--enable-repair', action='store_true')
    args = parser.parse_args()
    from accessfix import browser
    browser.IMAGE = args.browser_image
    import uvicorn
    uvicorn.run(create_demo(args.root, args.enable_repair), host='127.0.0.1', port=args.port, workers=1)
