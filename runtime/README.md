# Isolated modal verifier — Milestone 1

Fresh implementation for the official-build workspace, written after the user-defined kickoff. No Phase 1–3 implementation was copied. This runtime executes only the registered React example and separately staged candidates.

## Reproduce

From the repository root, with Docker Desktop running:

```powershell
docker build --tag accessfix-m1-browser:20261027 runtime
$env:PYTHONPATH = "$PWD\backend"
.venv\Scripts\python.exe -c "from pathlib import Path;from accessfix.browser import run_browser;print(run_browser(Path('examples/modal'),Path('artifacts/manual-new-run'),'final'))"
```

The destination must not already exist. Use a fresh path for every run; failed results remain available.

`run_browser(source, out, mode)` supports:

- `final`: five independent browser contexts; pointer save/cancel and keyboard save/cancel/Escape. The trusted contract lists all mandatory checks and states. Missing checks, ambiguous semantic targets and incomplete measurements are recorded explicitly.
- `observe`: operational focus, keyboard and axe observations for model input. It does not export final assertion code, final input values or gate criteria.
- `isolation`: directly measures user ID, read-only mounts, absence of host/socket mounts, capabilities, no-new-privileges, resource limits, external-network blocking and absence of model-credential environment variables.

Keyboard actions use actual Tab, Shift+Tab, Enter, Space, Escape and text entry. They do not call focus, fill or click to force a keyboard success. Pointer workflows run in separate contexts even if a keyboard task cannot finish. Every workflow stores an action log, state-specific axe JSON, full-page screenshots and a Playwright trace.

## Fixed build boundary

Only the trusted worker invokes esbuild. The app's package scripts, build configuration, HTML commands or model-generated commands are never executed. Source imports are restricted to local project files and the installed React packages. The generated HTML is fixed by the harness. Browser network requests are restricted to the loopback fixture server and the container has `--network none`.

The Docker invocation runs as `pwuser`, with a read-only root filesystem, read-only source and harness mounts, dropped capabilities, no-new-privileges, 2 GiB memory, 2 CPUs, 256 process limit, a 512 MiB temporary filesystem and a 300 second outer timeout. Only the evidence mount is writable. No model key, home directory or Docker socket is mounted.

This is development isolation, not proof that arbitrary hostile repositories are safe. Chromium's additional sandbox is disabled in this configuration and explicitly reported as `chromium_sandbox: false`. The official Playwright image documentation warns that its development image alone is not sufficient protection for untrusted websites. The MVP accepts only the registered, reviewed fixture; it is not a general repository-execution service. See [official Playwright Docker documentation](https://playwright.dev/docs/docker).

## Dependency provenance

Versions and package-lock integrity hashes are fixed. The official Playwright base is pinned by digest in Dockerfile; the actual image ID is also recorded per run.

| Dependency | Version | License | Source |
|---|---|---|---|
| Playwright / official browser image | 1.64.1 | Apache-2.0 | https://github.com/microsoft/playwright |
| axe-core | 4.14.0 | MPL-2.0 | https://github.com/dequelabs/axe-core |
| React | 19.2.0 | MIT | https://github.com/facebook/react |
| React DOM | 19.2.0 | MIT | https://github.com/facebook/react |
| esbuild | 0.25.12 | MIT | https://github.com/evanw/esbuild |

The image includes operating-system packages with their own licenses. Dependency use is distinct from copying earlier AccessFix PoC code. axe runs against the whole page in each required screen state with WCAG 2 A/AA, 2.1 A/AA, 2.2 AA and best-practice tags. Its violations and incomplete nodes are preserved separately. Passing these checks is not a WCAG conformance certificate; see [Playwright accessibility testing guidance](https://playwright.dev/docs/accessibility-testing).

## Initial observed evidence

- `artifacts/browser-smoke-v1`: build succeeded; pointer 2/2 workflows passed; keyboard 0/3 passed. Focus entry, forward/reverse containment, return and Escape failures were observed. Worker elapsed time was 22.6666 seconds. This is a verifier smoke run, not a model result.
- `artifacts/observation-v1`: actual axe identified one `aria-dialog-name` violation node in the open state, no violation in the closed state, and no incomplete nodes in those two observed states. Escape left the dialog open; initial focus remained on the opener.
- `artifacts/isolation-v1`: 10/10 initial isolation probes passed.
- `artifacts/isolation-v2`: 14/14 probes passed after adding read-only harness and cgroup resource-limit checks. Earlier evidence was retained.

Before any model request, implementation review corrected object comparison to ignore JSON property order, explicitly marked screenshot failures as measurement errors, and added separate measured build/browser timings. These changes did not change the fixture, user-task contract or expected outcomes. The final pre-model freeze hashes are maintained by the backend evidence manifest.
