# M5 external public React application: Tic Tac Toe

This is an external-public evaluation, separate from M4 synthetic cases.

- Upstream: https://github.com/sadanandpai/frontend-mini-challenges
- Pinned commit: `48b7dae8bae41e4c69b904c7793bb8a4f892f337` (2026-10-20T04:28:12Z).
- Module: `apps/react/src/challenges/tic-tac-toe/` (exact upstream paths are authoritative in `provenance.json`).
- License: MIT, Copyright 2023 Sadanand Pai; the unchanged license is in `upstream/LICENSE`.
- `App.jsx`, `constant.js`, and `tictactoe.module.css` are byte-identical upstream files. `provenance.json` records source URLs and hashes.
- `main.tsx` is our small React entry with a main landmark and title. The upstream catalog/router and build system are not executed. This evaluates a real published mini application, not its entire repository or production deployment.
- Runtime: the existing pinned M1 Docker image; React 19.2.0, Playwright 1.64.1, axe-core 4.14.0, esbuild 0.25.12. Upstream package metadata is retained for comparison; no upstream dependency or install script is run.

## Fixed user-task scope

Three independent pointer sessions exercise X win, O win, and draw; two keyboard-only sessions exercise Enter and Space moves, occupied-cell protection, alternating turns, scoreboard, and Rematch. Visible game outcomes determine success. A uniquely visible 3-by-3 board is identified by geometry, not private CSS classes or a required patch. DOM child grouping and a maximum bounded keyboard traversal remain limitations. The verifier accepts focusable cells or descendants and basic roving-grid movement, but is not a general assistive-technology verifier.

The original source has click handlers on non-focusable cells. In preflight-v2 its pointer tasks passed 3/3 and keyboard tasks failed 0/2. Observed axe violations/incomplete were both zero; later keyboard states are explicitly missing because the tasks stopped. Zero here does not establish full accessibility.

Positive controls are manually written keyboard repairs. Regression controls preserve keyboard handlers but remove board clearing during Rematch. A missing-audit control must also be rejected. None of these controls or the final assertions is sent to the model.

Before inference, `freeze.json` records source, trusted verifier, gate, prompt, runner, provenance, and image identity. The one-shot model receives only the public task, `src/App.jsx`, `src/tictactoe.module.css`, and operational focus/axe observations. It may edit only those two files, at most 10 edits / 64 KiB, with 12,000 completion tokens and no automatic retries. It receives no final contract, assertions, controls, or scores. New axe/incomplete findings, lost original behavior, incomplete measurement, or no improvement reject the candidate. Acceptance is not WCAG conformance or deployment approval. Original selection and preserved evidence are retained regardless of result.

## Exploration record before model use

`evaluation/m5_public` preserves the initially considered accordion. Its first harness syntax failure and second no-improvement preflight are under `artifacts/m5/public-app`; no model call occurred. Accordion keyboard tasks already passed; the isolated wrapper affected its heading hierarchy. It was excluded rather than reporting an artificial repair opportunity.

Tic Tac Toe preflight-v1 used two pointer scenarios and an always-ARIA-labelled manual positive control. That control introduced axe `label-content-name-mismatch` incomplete on one-character X/O labels, so the gate correctly refused it. Preflight-v2 adds the draw scenario before inference and uses a manual control whose filled-cell name comes from its existing visible content, with a location label on empty cells. Both original preflights are preserved. The source and acceptance policy were not weakened; no model outcome had been seen. The actual Meta patch is evaluated once against the frozen v2 protocol, including new incomplete rejection.

## Execution boundary

Non-root, network-none, read-only source/harness/root filesystem, dropped capabilities, no-new-privileges, 2 CPUs / 2 GiB / 256 PIDs / timeout. Only React imports and source-local files pass the build boundary. The model key is never mounted. Chromium's internal sandbox remains disabled, so this is restricted to the reviewed module; arbitrary external repositories are unsupported.

Commands (repository root):

```powershell
.venv\Scripts\python.exe tests/m5/build_public_controls.py --output artifacts/m5/public-tictactoe/controls-NEW
.venv\Scripts\python.exe scripts/m5_public_tictactoe_eval.py preflight --output artifacts/m5/public-tictactoe/preflight-NEW --controls artifacts/m5/public-tictactoe/controls-NEW
# Freeze is created once after successful controls. Never overwrite an existing freeze.
.venv\Scripts\python.exe scripts/m5_public_tictactoe_eval.py freeze --preflight artifacts/m5/public-tictactoe/preflight-NEW
# This command makes one real Meta request using MODEL_API_KEY in memory.
.venv\Scripts\python.exe scripts/m5_public_tictactoe_eval.py live --output artifacts/m5/public-tictactoe/meta-live-NEW
```
