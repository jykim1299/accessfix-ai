# Sources and licenses

Newly authored AccessFix AI code is MIT licensed under the root LICENSE, with owner approval on November 4, 2026. Third-party and fixture licenses remain effective for their respective files. The previous MIT draft is retained as an archived proposal.

The public React Tic Tac Toe and explored Accordion modules originate from
[Sadanand Pai's frontend-mini-challenges](https://github.com/sadanandpai/frontend-mini-challenges),
commit `48b7dae8bae41e4c69b904c7793bb8a4f892f337`, MIT, Copyright 2023 Sadanand Pai.
Their exact original license and source hashes are retained under
`evaluation/m5_public_tictactoe/` and `evaluation/m5_public/`. The local React
entry is an explicitly separate adaptation. No upstream package script runs.

The modal example and M4 synthetic cases have their own MIT licenses. They are
new official-build fixtures, not copied from the earlier Phase 1–3 PoC.

Principal pinned dependencies:

| Dependency | Version | License |
|---|---|---|
| React / React DOM | 19.2.0 | MIT |
| TypeScript | 5.9.3 | Apache-2.0 |
| esbuild | 0.25.12 | MIT |
| Playwright | 1.64.1 | Apache-2.0 |
| axe-core | 4.14.0 | MPL-2.0 |
| FastAPI | 0.162.0 | MIT |
| Uvicorn | 0.54.0 | BSD-3-Clause |
| HTTPX | 0.28.1 | BSD-3-Clause |
| Pydantic | 2.14.1 | MIT |
| Starlette | 1.10.0 | BSD-3-Clause |
| pytest | 9.1.1 | MIT |

Exact transitive versions and integrity values are in the three JS locks and
`requirements.txt`. This table is not a complete operating-system SBOM.
The Docker Playwright base contains browser/OS components with their respective
licenses. Retain their distribution notices. The frontend build emits linked
legal comments; keep `app.js.LEGAL.txt` with the bundle.

Meta Model API and OpenAI services are not redistributed model weights. Access
requires their own account and applicable terms. Actual recorded Meta model use
is `muse-spark-1.3-contributor`; no Spark Open or Standard performance is claimed.

Screenshots, diffs, and result JSON in the reviewed evidence bundle are measured
records. Original source provenance and hashes are provided. No trace ZIP or
raw authenticated network log is included. Private original evidence remains
separate and is not part of this release license proposal.
