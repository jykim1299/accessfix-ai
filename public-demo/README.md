# AccessFix AI — Public Read-Only Demo RC1

Don't just fix accessibility issues. Prove users can complete their tasks.

This is a **local review candidate**, separate from the existing AccessFix AI developer application and blue submission package. It presents recorded, publicly reviewed Meta Muse Spark experiments. It never starts an analysis, calls a model, applies a patch, uploads a file or restores source.

## Run locally

Requires Node.js 22+ (validated with 24.22.1), pnpm and Python 3.12+ for the small static preview server.

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
python scripts/serve.py --port 8833
```

Open `http://127.0.0.1:8833/`. The local preview binds to loopback and serves **only built files in dist/**. It permits GET/HEAD, denies mutation methods, exposes no FastAPI routes, disables directory listings, and sets restrictive security headers. No API key or Docker is needed.

The delivered review machine can reuse an already installed dependency directory. That local junction is excluded from the source package. A fresh install uses the included dependency lock; no dependency download occurred as part of model inference.

## Review path

1. Dashboard: the accessibility problem, repair/verification workflow and two contrasting decisions.
2. Guided Demo: Problem → AI Repair → Independent Verification → Evidence-Based Decision, using the actual Tabs record.
3. Tabs: keyboard tasks 0/2 → 2/2; pointer 2/2 maintained; measured axe violations 0 → 0. Blocked original workflows leave some later states unmeasured.
4. Switch: keyboard improvement introduced a new contrast failure (1.19:1). The candidate was rejected and the original preserved.
5. Evidence Explorer: filters and links to the reviewed public patch, task records, model metadata, decisions and images.
6. Run History: M3 modal, M4 Tabs/Switch/Action/Menu and M5 Tic Tac Toe. Menu retains issues requiring review. M5's new incomplete signatures are not confirmed violations, and the recorded visual review found lost outlines.

Screenshots and key logs are preserved records. The guided interface is a new explanation of those records, not a new repair run or a live reenactment. An accepted historical candidate may have subsequently been restored to the original; those states remain distinct. Excalidraw private/research records are deliberately excluded.

## Source and evidence boundaries

- `src/`: new demo-only React interface. The AccessFix AI name, copy and blue palette continue the existing presentation.
- `public/data/`: derived, labelled presentation data from the reviewed public bundle.
- `public/evidence/`: explicitly selected public evidence; copied files retain their source hashes. Any derived export is identified as derived.
- `provenance/`: selection, original hashes, attribution and transformation records.
- `scripts/serve.py`: local static file server only; no application backend or inference SDK.
- `qa/`: new RC1 UI/security verification, distinct from historical M1–M6 results.

The existing blue ZIP, video, README, model responses, patches, screenshots and verdicts remain unchanged. This demo does not claim full WCAG conformance or generalization to arbitrary websites. Screen-reader and real assistive-technology testing remain unmeasured.

The overall project license remains subject to the owner's decision; no blanket MIT license is newly assigned here. Preserved third-party and fixture licenses apply to their respective included materials. Do not present AccessFix AI as an official Meta product.

## Static deployment preparation — no deployment performed

`pnpm run build` produces a standalone `dist/` directory. Hash routing and relative asset paths allow a static host or project subdirectory without an application server. No host project, remote URL, credential, Git push or deployment was created. Review `SECURITY_RELEASE_CHECKLIST.md` before any separately authorized publication.
