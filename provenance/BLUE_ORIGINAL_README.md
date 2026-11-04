# AccessFix AI — Submission Preview

**Don't just fix accessibility issues. Prove users can complete their tasks.**

AccessFix AI connects a bounded AI code patch to independent Playwright user
tasks and axe-core checks. New regressions or missing measurements reject a
candidate. The original source and historical decision remain distinct.

AccessFix AI was built during this hackathon as a new, independent
codebase. Earlier research PoC code is not included in this submission.
Historical development timestamps are preserved; this English UI update
does not relabel earlier implementation work as newly written code.

This local release replays **stored results from actual Meta API requests**.
Opening History does not call a model. It is a reviewed-app prototype, not an
arbitrary website executor or WCAG conformance certification.

## Run the stored demo

Requirements: Python 3.12, Node.js 22+ (validated with 24.22.1), pnpm, Windows
PowerShell. Docker Desktop/Linux engine is needed for new browser analysis,
but not to view installed evidence. Use a new directory, not the development
checkout. No model key is needed for the default demo.

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
pnpm --dir frontend install --frozen-lockfile --ignore-scripts
pnpm --dir frontend run build
# The reviewed evidence ZIP is included under evidence/. Verify CHECKSUMS.txt.
.venv\Scripts\python.exe scripts/install_demo_evidence.py evidence/accessfix-demo-evidence.zip --destination . --sha256 05cff33e4fc04912c360111456e5789573f5f2762c4e6e639f883331448b2011
.venv\Scripts\python.exe release/run_demo.py --port 8808
```

Open [the dashboard](http://127.0.0.1:8808/),
[Meta tabs success](http://127.0.0.1:8808/#/runs/m4-meta-dev-tabs), and
[Meta switch rejection](http://127.0.0.1:8808/#/runs/m4-meta-holdout-switch).
The UI labels public copies and their source hashes. Original raw traces,
model request/response logs, and private paths are omitted; absence is not a
successful measurement. The installer checks the entire bundle before writing
and refuses overwrites, path traversal, linked destinations, and hash mismatch.

Default launch disables new model repair requests even if the host has model
credentials. To deliberately enable new inference, launch with `--enable-repair`
and configure server-only `MODEL_API_KEY` and `META_MODEL`. Never put keys in
source, browser code, command-line arguments, or videos. New calls consume quota.

## Blue edition demo — 2:35.92

- `media/accessfix-blue-narrated.mp4`: English local narration and synchronized burned-in captions.
- `media/accessfix-blue-captioned.mp4`: identical visuals and captions, without audio.
- `media/accessfix-blue.en.srt`: synchronized English subtitles, one or two lines per cue.

The six scenes move from a blocked keyboard task, through Detect → AI Repair →
Independent Verification, to the actual M4 tabs repair and switch rejection.
The final scenes show the exact model and the limits of this small synthetic set.

New blue product UI captures are combined with untouched historical evidence
screenshots. Crops/enlargement and paced key-log annotations are editorial
presentation; they are not new experiments or a continuous live screen capture.
Historical screenshot colors, outcomes, model outputs and source hashes are unchanged.
This edition makes no model requests. The original experimental screenshots retain
their original theme; only the AccessFix product UI has been redesigned.

See `docs/DEMO_GUIDE_EN.md` and `docs/QA_REPORT_KO.md` for the final verification,
alignment method, residual axe incomplete and publishing status. Earlier English
verification in provenance is historical, not a claim about this new edition.

## Measured results and limits

All M4 requested/returned models were `muse-spark-1.3-contributor`. Four one-shot
requests used 32,062 tokens, no retries. Tabs and action button were accepted;
menu was accepted with remaining review; switch was rejected. **3/4 acceptance
is not a complete accessibility resolution rate.** Counts deduplicate state,
rule and node. Blocked original workflows leave later states unmeasured.

M3 separately verified a Meta modal repair: keyboard 0/3 → 3/3, pointer 2/2,
axe 1 → 0, 47/47 required checks. M1 OpenAI is separately labelled.

M5 separately evaluated a pinned MIT public React Tic Tac Toe mini app. One
Meta call used 7,646 tokens; keyboard 0/2 → 2/2, pointer 3/3, checks 51/51.
The candidate was **rejected for 16 new incomplete signatures**, not 16 confirmed
violations. Screenshot review also found lost board outlines missed by the task
verifier. It is not counted as an automatically accepted repair. Its supplemental
results install under `public-evidence/m5/`.

Earlier M5/M6 reviews recorded mobile comparison-table and long Diff-line
axe incomplete where content was clipped. Their keyboard scrolling and text
contrast measurements (table 5.633:1, ordinary Diff 6.105:1) are historical review
evidence. English-UI checks are recorded separately in the new verification file. We do not replace incomplete
with an automatic pass. Screen reader and real assistive-technology testing are
outside the measured scope.

## Verify and run a new analysis

```powershell
.venv\Scripts\python.exe -m pytest -q
pnpm --dir tests/m2 install --frozen-lockfile --ignore-scripts
pnpm --dir tests/m2 exec playwright install chromium
docker build -t accessfix-m6-browser:rc1 runtime
node tests/m6/release-smoke.mjs http://127.0.0.1:8808 artifacts/m6/release-smoke-new
# With the demo server still running in another terminal, run real Docker analysis:
.venv\Scripts\python.exe release/verify_runtime.py --url http://127.0.0.1:8808 --out artifacts/m6/new-analysis.json
```

New browser analysis uses the single registered local modal. Browser containers
run without network, as non-root, with read-only source/harness, dropped
capabilities, and resource limits. Source package scripts do not run. Chromium's
additional internal sandbox is disabled, so arbitrary hostile repositories are
not supported. A rebuilt image is not a retroactive reproduction of the frozen
historical environment; new evidence records its actual image identity.

Unit tests use synthetic inputs; browser/UI tests provide actual execution
evidence. The development full UI suite retains raw preservation checks unavailable
in this reduced public bundle. The release smoke suite verifies the public subset
without changing the historical acceptance criteria. The separate
`release/verify_runtime.py` command verifies new Docker analysis; the intentionally
broken original modal is expected to retain keyboard failures and a missing audit.

## Source, license, and publication

This is a new release snapshot without the development `.git` history or raw
artifacts. `SOURCE_MANIFEST.json` identifies included/excluded paths and hashes.
The evidence ZIP independently links original and reviewed-copy hashes and
lists omissions. Earlier Phase 1–3 PoC code was not copied into this official build.

The project-wide license awaits the owner's decision. MIT is proposed in
`release/LICENSE.MIT-DRAFT.txt`; it is not yet an active grant. Existing MIT
fixture/upstream licenses stay effective for their own files. See
`release/THIRD_PARTY_NOTICES.md`. Do not publish the old development Git history
or raw UI trace ZIPs; they contain local authentication and environment records.

This RC has not been pushed to GitHub or deployed. Owner approval of license,
final media review, official submission requirements, and an explicit publication
instruction are still required before public release.


## Submission materials

- [Project and Meta model-use description](docs/PROJECT_DESCRIPTION_EN.md)
- [Scene-aligned narration](docs/NARRATION_EN.md)
- [Video versions and recording notes](docs/DEMO_GUIDE_EN.md)
- [Confirmed official requirements and unconfirmed portal fields](docs/SUBMISSION_REQUIREMENTS_KO.md)
- [Publication checklist](docs/PUBLICATION_CHECKLIST.md)
- [English UI and media verification](provenance/ENGLISH_VERIFICATION.json)
- [Preserved M6 measured validation](provenance/M6_VERIFICATION.json)

The exact publication file list is `GITHUB_FILE_LIST.txt`. This is an independent
directory without `.git`; no previous Git history, raw traces, credentials,
node_modules, or virtual environment is included. `SOURCE_MANIFEST.json` records
the new publication snapshot; `provenance/M6_SOURCE_MANIFEST.json` preserves its
source snapshot. The previous final snapshot is recorded in `provenance/PREVIOUS_FINAL_SOURCE_MANIFEST.json`.
Only the listed UI presentation and UI test text were updated; copied core code
is not represented as newly authored during this presentation update.

The previous development UI tests requiring omitted private raw evidence do not
replace the public-subset tests listed above. No new research evaluation or
model inference was conducted during final submission polish.
