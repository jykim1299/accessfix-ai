# M5 product regression

`m2-regression.mjs` reruns all 26 M2 product checks against new M5 evidence stores.
It preserves M2/M4 tests and their observed failures. Changes and source hashes
are recorded in `m2-regression-provenance.json`.

The former rejection-heading mismatch now uses the current UI wording while
still requiring the original rejected decision, manual-control provenance, and
pointer-regression reason. The provider-refresh check deliberately holds the
actual `/api/providers` request. Repair must stay disabled while the catalog is
pending, then become enabled after its response and complete option rendering.
It must retain the same saved analysis. No assertion about usability is removed.

Start two local servers with new output paths (never reuse a previous run):

```powershell
.\.venv\Scripts\python.exe tests\m5\product_server.py --root artifacts\m5\regression-live-new --port 8806
.\.venv\Scripts\python.exe tests\m2\test_server.py --root artifacts\m5\regression-manual-new --port 8807
```

Run with Node and the existing pinned `tests/m2` dependencies:

```powershell
node tests/m5/m2-regression.mjs --url http://127.0.0.1:8806 --test-url http://127.0.0.1:8807 --output artifacts/m5/m2-regression-new
```

The live server receives one real browser analysis but no repair request.
The manual server uses the unchanged explicit M2 control provider for one
positive patch and one deliberate provider failure, with real Docker browser
verification and restoration. External model calls are zero. The suite saves
screenshots, trace, API requests, axe violations and incomplete findings, source
preservation checks, and frontend bundle hashes before and after execution.
Zero axe violations do not clear incomplete findings or certify WCAG conformance.

## Evidence pagination

```powershell
node tests/m5/evidence-pages.mjs http://127.0.0.1:8804 artifacts/m5/evidence-pages-new
```

This read-only review compares every download URL on every page with the actual
API artifact list for the M3 Meta result and M4 rejected switch result. It checks
keyboard next/previous navigation, status focus when Next becomes disabled,
filter changes resetting to page one, 320 px reflow, and axe findings. Non-GET
browser requests are blocked and recorded. Evidence contents and archived
decisions are never changed.
