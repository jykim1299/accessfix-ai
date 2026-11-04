# AccessFix AI

**Don't just fix accessibility issues. Prove users can complete their tasks.**

AccessFix AI is a local prototype that links AI code repair to independent evidence of user-task completion. An automated accessibility scan can report zero violations while keyboard users still cannot operate an interface. AccessFix AI measures both.

For a reviewed, registered React app, Playwright runs keyboard and pointer tasks and axe-core inspects measured screen states. A bounded one-shot model request proposes a source patch. A separate browser verifier checks the candidate. New regressions or missing required measurements block acceptance; the original stays recoverable. The model does not receive final assertions, and its explanation is not the verdict.

The demo replays stored results from actual Meta Model API calls to `muse-spark-1.3-contributor`, with matching requested and returned model identifiers. In the tabs case, keyboard tasks improved from 0/2 to 2/2 while pointer tasks stayed 2/2. In the switch case, keyboard and pointer tasks passed, but a new 1.19:1 text-contrast issue caused rejection. Failed patches and their browser evidence remain inspectable.

Four small M4 synthetic cases used four one-shot Meta requests and 32,062 tokens. Tabs and action button were accepted; the menu was accepted with remaining violations and incomplete checks; the switch was rejected. Three accepted candidates out of four is not a complete accessibility resolution rate or a general website success rate. A separate pinned MIT public React Tic Tac Toe candidate was rejected for new incomplete findings, and screenshot review revealed a visual boundary loss missed by the task verifier.

The stack is React/TypeScript, Python/FastAPI, Playwright, axe-core, and an offline, resource-limited Docker browser. Scope is reviewed registered apps, not arbitrary repositories or external websites. This is not a WCAG conformance certificate. Mobile UI incomplete checks and unmeasured assistive-technology behavior remain limitations.

The package includes a reviewed evidence subset with source hashes, screenshots, diffs, model metadata, and verification results. Raw authenticated traces and development Git history are excluded. Recorded results are labelled as replay, not live inference. Newly authored AccessFix AI code is MIT licensed with owner approval; third-party notices remain intact. External publication remains subject to owner approval.

## Short description

AI accessibility repair with independent proof of user-task completion. Actual Meta patches are checked in an isolated browser; regressions are rejected and original code remains recoverable.

## Model-use statement

Meta Muse Spark performs the product's source-code repair. Playwright and axe-core independently evaluate the candidate. Codex assisted development and submission preparation; OpenAI M1 experiments are separately labelled. Final video narration uses Amazon Polly Joanna Neural, approved after user listening. The narration voice is separate from Meta source-code repair. No new repair-model calls were made during submission polish.

## Submission fields still to confirm

This text is prepared content, not a claim about the portal's exact fields or limits. Team identities, actual published repository/video URLs, field lengths, consent requirements, and any deployment requirement must be confirmed in the authenticated submission form. No URL or team identity is invented here.
