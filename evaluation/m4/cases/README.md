# M4 reviewed synthetic React cases

These four fixtures were authored afresh for the official AccessFix build on 2026-10-28 KST. They do not contain company data, private project code, or Phase 1–3 PoC code. No external application was downloaded or modified. Each directory is a fixed registered example for the existing offline Docker/esbuild boundary; it has no package scripts, external resources, configuration execution, or dependency imports other than React and React DOM.

`../cases.json` declares one development case and three held-out evaluation cases before any model request. The sources deliberately contain differing keyboard interaction failures while preserving useful pointer operations. Model inputs may contain the public task and source, but independent final contracts and assertions belong to the verifier and must not be included in the model payload.

| Case | Split | Failure mechanism | Existing functionality to preserve |
|---|---|---|---|
| dev-tabs | Development | Focusable selected tab has click selection without arrow/Home/End interaction | Three view contents, selected state, notes action and persistence |
| holdout-menu | Holdout | Menu opens on a native button but has no focus entry, menu navigation or Escape handling | Duplicate/archive effects, menu close after choice, independent draft creation and persistence |
| holdout-switch | Holdout | Named focusable ARIA switch toggles on both Space keydown and keyup, undoing the change during one key press | Draft versus saved value, reset, persisted setting, test notification action |
| holdout-action | Holdout | Named focusable role button responds to click without Enter/Space activation | Discount arithmetic, item quantity, clearing coupon and order persistence |

“Holdout” here means the cases are reserved for the single frozen evaluation run, not independent external data unseen by the developers. Baseline axe results are to be measured; this document does not claim zero findings before execution. The examples are narrow functional research cases, not a complete accessibility benchmark.

All fixture source and styles are licensed under the accompanying MIT license. React and the runtime dependencies retain their own licenses, documented in the official-build runtime. Instructions on screen describe ordinary user tasks and contain no model instructions or repair recipes.
