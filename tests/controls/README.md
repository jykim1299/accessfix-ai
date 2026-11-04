# Independent modal verifier controls

These controls were newly authored after the user-specified kickoff, before any repair-model inference. They are not model repair results and are never included in model input.

`build_controls.py` creates separate source copies from the new example; it refuses to overwrite an existing artifact directory. The original example remains unchanged.

| Control | Expected observation |
|---|---|
| Original example | Pointer save/cancel work; keyboard focus management fails; open dialog lacks an accessible name |
| positive | Pointer and keyboard task outcomes work; named dialog, entry/containment/Escape/return focus |
| keyboard-noop | Pointer works; keyboard opener does not open despite native button and named dialog source |
| pointer-regression | Keyboard save works; pointer save is prevented and must be rejected |
| ambiguous-opener | Two visible opener buttons share a semantic name; verifier must report ambiguity |
| new-axe | An extra unnamed button introduces an axe violation even when modal workflows work |

Missing-data gate checks remove a required audit from an already measured positive-control result. They test the result parser/gate and are explicitly labeled synthetic-result controls, not browser observations.
