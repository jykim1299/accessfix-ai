> M5 selection outcome (before any model call): **excluded**. Preflight-v2 did not establish a valid repair improvement; keyboard tasks already passed and the heading finding depended on the local wrapper. This directory preserves the explored source/verifier and failed preflights; it was not frozen and has no Meta result. The final external evaluation is `../m5_public_tictactoe/`. The plan below is historical exploration, not a completed experiment.

# M5 external public React application evaluation

This is a separately reported external-public case, not part of the M4 synthetic denominator.

The selected application is the standalone Accordion challenge from [Sadanand Pai's frontend-mini-challenges](https://github.com/sadanandpai/frontend-mini-challenges/tree/48b7dae8bae41e4c69b904c7793bb8a4f892f337/apps/react/src/challenges/accordion), pinned to commit `48b7dae8bae41e4c69b904c7793bb8a4f892f337` (upstream commit timestamp 2026-10-20T04:28:12Z). Its [MIT license](https://github.com/sadanandpai/frontend-mini-challenges/blob/48b7dae8bae41e4c69b904c7793bb8a4f892f337/LICENSE) and copyright notice are preserved in `upstream/LICENSE`.

The four application files `App.jsx`, `Accordion.jsx`, `Accordion.module.css`, and `data.js` are byte-for-byte upstream files. `provenance.json` records the exact raw URLs, file sizes, retrieval time, and SHA-256 hashes. The repository's root and React package manifests are retained as provenance only. They are never executed or installed.

The small app is extracted from the larger challenge catalog: this evaluation does **not** claim to run the full upstream monorepo or its shared navigation/theme. A locally authored React entry mounts the unchanged app inside a main landmark with an Accordion heading. The existing isolated image supplies React 19.2.0 (within upstream's declared React ^19.1.0 range), esbuild, Playwright, and axe-core. No dependencies or scripts from the downloaded manifests are executed. CSS Modules are handled by the existing esbuild compiler. No network, new runner capability, arbitrary repository URL, or deployment is introduced.

The original source has white +/- disclosure text on a light gray background. The browser must confirm this issue; source inspection is not a performance result. Existing keyboard activation can already work, and its success is preserved rather than represented as a newly repaired keyboard failure.

## Fixed evaluation scope

One external application, four workflows: keyboard and pointer operation in multiple-open and single-open modes. The verifier checks all five visible questions, answers, independent open/close, exclusive expansion, checkbox mode changes, and final collapsed state. Keyboard workflows use real Tab, Enter, and Space input. Controls are selected by question meaning and contextual association, without requiring a particular generated class, wrapper depth, tag, identifier, or model-generated patch. No final assertion, answer text contract, or manual control is sent to Meta.

All six declared screen states in each of four workflows receive axe scans, screenshots, and traces. Missing measurements fail closed. Existing functional passes, pointer tasks, keyboard tasks, and content must remain. New axe state/rule/node signatures, new incomplete signatures, browser errors, or missing checks reject the patch. Existing residual issues remain reported; accepted does not mean WCAG conformance.

The manually authored positive control changes only the disclosure foreground to #111111. The negative control adds the same contrast repair but deliberately drops coordination between disclosures, breaking exclusive expansion. Both run before the model; their outcomes are not AI performance. A copied positive measurement with a removed audit verifies missing-evidence rejection.

The model uses the unchanged M4 generic repair strategy under a separate prompt version `user-task-repair-one-shot-m5-public-v1`: one actual request to `muse-spark-1.3-contributor`, maximum 12,000 completion tokens, zero automatic retries. Only `src/Accordion.jsx` and `src/Accordion.module.css` are writable. At most 10 exact-anchor edits and 64 KiB patch bytes. All other source files, final contracts, manual controls, and verifier code remain inaccessible to the model. The payload contains only the public task, those two files, and operational browser observations.

Before inference, `freeze.json` locks source, provenance, contract, verifier, gate, prompt, bounded patcher, transport, runner, and pinned image ID. The root agent reviews the freeze before executing `scripts/m5_public_eval.py live`. Changing the frozen inputs requires a new experiment; failed results are retained. The original is kept intact and reselected after candidate measurement, and its browser result is reproduced.

## Reproduction

From the repository root, use the existing Python environment and Docker image:

```powershell
.venv\Scripts\python.exe scripts/m5_public_eval.py preflight --output artifacts/m5/public-app/preflight-new --controls artifacts/m5/public-app/controls-v1
.venv\Scripts\python.exe scripts/m5_public_eval.py live --output artifacts/m5/public-app/meta-live-new
```

The live command makes one billable model request, requires `MODEL_API_KEY` in the process or Windows user environment, and refuses changed frozen inputs. Replaying existing evidence does not invoke the model. The original M1–M4 experimental files and reports remain unchanged.
