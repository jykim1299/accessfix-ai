# Technical guide — RC4 publication candidate

## Two execution modes

The `public-demo/` directory is the approved RC4 static, read-only site. `backend/`, `frontend/`, `runtime/` and `release/` preserve the earlier public engine source snapshot. RC4 does not add a generic repair service or a model endpoint.

The finished RC4 build is included. Start it with `python public-demo/scripts/serve.py --port 8833`. Only rebuilding needs Node.js and pnpm:

```powershell
Set-Location public-demo
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
python scripts/serve.py --port 8833
```

The new README/media were prepared without reinstalling dependencies or rerunning model experiments. Original engine installation, the default model-disabled demo, public-subset tests, isolation limits and Docker procedures are preserved byte-for-byte in [the previous README](../provenance/BLUE_ORIGINAL_README.md). Its Blue-video section describes historical media, not the RC4 video. Paths in that archived README are relative to the candidate repository root.

## Independent repair pipeline

The provider produces a limited source patch. Patching validates allowed paths and edit limits. The trusted verifier then runs Playwright user tasks and axe-core on the candidate in a separate browser environment. The gate checks improvement, required observations and regressions. Model prose cannot override the gate. Original source selection and historical acceptance are separate states.

The model is not sent final assertions. Browser containers have no model credential, no network, non-root execution, read-only source/harness/root filesystem, dropped capabilities and resource/time limits. Chromium's additional internal sandbox is disabled; this remains a reviewed-module boundary.

## Evidence and provenance

`provenance/RC4_EVIDENCE_MANIFEST.json` describes69 public files and their original/derived status. `public-demo/public/data/cases.json` is a labeled presentation dataset. Original images, patches, model metadata and verdicts are unchanged. The old evidence ZIP and its hash are preserved under `evidence/`.

M1 OpenAI work, M3 Meta modal, the M4 synthetic cases, M5 external mini-app and later presentation checks are separate. The M4 three-of-four acceptance count is not a resolution percentage. M5's visual outline loss was a supplemental observation, not an automatically verified success. Menu's remaining findings and serialized check discrepancy stay visible.

The new media QA and narration timing are documented separately. It does not replace historical frozen evaluation or establish broad accessibility conformance.
