# AccessFix AI — submission answer bank

Prepared for Indie Developer Track. These are proposed answers, **not an assertion that these are the portal's exact field names or limits**. No form input or submission has occurred.

## Project name
AccessFix AI

## Tagline
AI generates the fix. AccessFix AI proves whether it works.

## One-sentence description
AccessFix AI uses Meta Muse Spark to propose accessibility repairs, independently tests whether users can complete real browser tasks, and rejects patches that introduce regressions.

## Problem
Accessibility defects can block keyboard users even when an automated audit reports no violations. An AI-generated patch can restore an interaction while introducing a different barrier. Developers need evidence that the user's task actually works and that the repair preserves existing behavior.

## Solution / What we built
We built a bounded repair-and-verification prototype for reviewed React applications. AccessFix AI records baseline keyboard and pointer task outcomes, asks Meta Muse Spark for a limited source patch, and evaluates the candidate with an independent Playwright browser verifier and axe-core audits. A developer-implemented acceptance gate uses the measured evidence to accept an improvement or reject a regression. Original source and rejected patches remain recoverable and inspectable.

The public RC4 demo is a static, read-only explorer of saved experiments. It lets judges inspect actual patches, before/after screenshots, task records, model metadata, and final decisions without a model key. It does not run new inference or repair an arbitrary website on demand.

## Use of Meta AI
The actual repair model in the featured experiments was `muse-spark-1.3-contributor` through the Meta Model API. Meta Muse Spark generated the source-code changes. AccessFix AI's orchestration, patch limits, independent browser checks, and acceptance gate were implemented by the developer. The model was not given the verifier's final assertions, and its explanation could not override the measured decision.

Project Tabs used one request, 8,375 tokens, and a recorded response time of 51.187 seconds. Notification Switch used one request, 5,133 tokens, and 20.969 seconds. Neither featured experiment used an automatic retry. These are historical model calls, not live calls in the submitted video. Codex assisted development and preparation; the final narration is Amazon Polly Joanna Neural and is separate from Meta repair inference.

## Results / Why the demo matters
In Project Tabs, keyboard tasks improved from 0/2 to 2/2 while pointer tasks stayed 2/2. The candidate passed the experiment's measured criteria and was accepted. The original run was subsequently restored; the stored acceptance and current source selection are separate facts.

In Notification Switch, the candidate also improved keyboard behavior from 0/2 to 2/2 and preserved pointer tasks. However, the browser found a new confirmed text-contrast violation of 1.19:1, below the applicable 4.5:1 threshold. AccessFix AI rejected the candidate and preserved the original. A keyboard fix alone was insufficient evidence to ship it.

The four M4 cases used four one-shot Meta requests totaling 32,062 tokens: Tabs and Order action were accepted, Workspace menu was accepted with review remaining, and Notification Switch was rejected. This three-of-four acceptance count is not a general accessibility success rate. The separate public Tic Tac Toe candidate was rejected for new incomplete signatures; incomplete findings are not confirmed violations. Screenshot review also found lost outlines missed by task checks.

## Differentiation
The product evaluates completed user tasks rather than merely checking that a key event occurred or trusting the model's success claim. It combines keyboard outcomes, pointer preservation, observed-state audits, fixed acceptance criteria, and source recovery. The rejection example demonstrates why independent verification matters: a plausible AI patch can improve one interaction and still be unsafe to adopt.

## Technical implementation
React and TypeScript provide the product interfaces and static evidence explorer. Python and FastAPI coordinate registered cases, provider adapters, patch boundaries, and the evidence-based gate. Playwright checks browser task completion and axe-core audits measured states. The browser runtime uses Docker with disabled network, non-root execution, read-only mounts, dropped capabilities, and resource limits. Chromium's additional internal sandbox is disabled in this reviewed-module environment; arbitrary hostile repositories are outside scope. Model credentials are server-side and are not mounted into the browser runtime.

The public site contains static assets only. It has no repair, file-upload, admin, or model-call endpoint. Original and derived evidence are distinguished with provenance and SHA-256 records.

## Reproduction
The public repository includes working engine source, pinned dependencies, the reviewed evidence ZIP, the static RC4 demo, source patches, verification records, and installation instructions. Judges can run `python public-demo/scripts/serve.py --port 8833` to explore stored results without credentials. The README also documents the FastAPI product installation and links Docker analysis instructions. Historical experiments remain frozen; rebuilding a runtime does not retroactively reproduce its exact historical image. New inference is opt-in and requires the user's own credentials and quota.

## Limitations and provenance
Accepted means the fixed experiment's measured criteria passed; it does not mean full WCAG conformance. The prototype supports reviewed registered apps, not arbitrary live internet sites. Screen-reader behavior and real assistive-technology testing remain unmeasured. Menu review items, Tic Tac Toe's incomplete findings and visual regression, and RC4's remaining expanded-code incomplete occurrences are disclosed. External MIT code retains its original license and authorship. Failed candidates and original experimental decisions are preserved.

## URLs — must be filled only after separately approved publication
- GitHub: GITHUB_URL_PENDING
- Read-only HTTPS demo: READ_ONLY_DEMO_URL_PENDING
- 165-second Joanna demo video: VIDEO_URL_PENDING

## Identity and declarations — owner must verify in the real form
Participant/team identity, selected Indie track, exact required questions, maximum lengths, rights declarations, terms acceptance, and final submit confirmation are pending inspection of the authenticated portal. Do not invent team members or answer legal declarations for the owner.
