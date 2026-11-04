# M2 UI verification

These tests exercise the React product UI against real local FastAPI endpoints.
They use pinned Playwright 1.64.1 / Chromium and axe-core 4.14.0. They do not run
any model transport. Existing M1 evidence is checked for byte preservation.

Production browser tests visit the read-only M1 AI and manual-control history,
run a new real Docker analysis, inspect image/diff/trace evidence, reload a saved
route, and test keyboard and mobile layouts. Mutation tests use a second local
server whose provider factory is explicitly replaced by a manual test provider:
one known positive patch and then a deliberate no-patch failure. The coordinator
and Docker browser validation remain real. Test data is labeled `test-control`.

From the repository root after the frontend is built and the product server is
running on port 8801:

```powershell
.\.venv\Scripts\python.exe tests\m2\test_server.py --root artifacts\m2-ui-test-new --port 8802
```

In a second terminal:

```powershell
cd tests\m2
pnpm install --frozen-lockfile
node run-ui.mjs --url http://127.0.0.1:8801 --test-url http://127.0.0.1:8802 --output ..\..\artifacts\m2-ui\new-run
```

Use new destination paths for each execution. Failed screenshots, browser traces,
requests, axe output, and checks are retained. Never interpret manual-control UI
tests as AI performance or combine them with the M1 real model run.

Read-only visual/a11y follow-up after a presentation-only fix:

```powershell
node review-ui.mjs http://127.0.0.1:8801 ..\..\artifacts\m2-ui\new-static-review
```

This scans nine actual desktop/mobile states (including 390 and 320 px), records
bundle hashes before/after, prohibits POST requests, and preserves axe incomplete
results separately. A zero-violation result is not a WCAG conformance claim.
Supplemental computed solid foreground/background contrast samples are not used
to overwrite or convert an axe incomplete result to a pass.

Observed development runs are retained separately: `run-v1` had 14/24 checks pass,
`run-v2` had 17/25, and `run-v3` had 26/26. Earlier runs exposed UI text contrast,
visible-label/accessibility-name mismatch, and a nonfocusable mobile scroll region;
two first-run exact wrapped-label locators were also resolved by explicit labels.
The final run added a 320 px reflow check and fixed-bundle checks without removing
earlier acceptance criteria. No real model requests were made in these UI runs.
