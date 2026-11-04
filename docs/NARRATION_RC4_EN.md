# RC4 narration — review draft

Local Microsoft Zira synthesis. Saved Meta results; no live inference.

**00:00:00,500 · Hook**

AI fixed one accessibility issue. But another fix created a new problem. AccessFix AI caught it.

**00:00:08,010 · Hook**

One repair accepted. One unsafe change stopped.

**00:00:15,500 · What we built**

These are recorded results. No live model call.

**00:00:19,615 · What we built**

Meta Muse Spark proposes a bounded source code patch.

**00:00:23,320 · What we built**

We built AccessFix AI to decide independently whether that proposal works.

**00:00:28,025 · What we built**

A separate browser verifier measures completed keyboard tasks, preserves existing pointer behavior, and checks accessibility regressions.

**00:00:36,310 · What we built**

The model's explanation is never the verdict.

**00:00:40,500 · Successful repair**

Start with the original Project Tabs. The mouse can open Activity, but the recorded arrow key leaves focus on Overview.

**00:00:48,180 · Successful repair**

Both original keyboard tasks failed, even though the scan found zero violations in the states it reached.

**00:00:54,185 · Successful repair**

Muse Spark added a keyboard path. The saved candidate reaches Activity.

**00:00:59,335 · Successful repair**

The independent checks improved from zero of two to two of two keyboard tasks. Both pointer tasks still passed.

**00:01:06,525 · Successful repair**

The verifier also checked returning, adding a note, and keeping it after reload.

**00:01:11,710 · Successful repair**

Accepted on those measured criteria. The historical run was later restored to the original.

**00:01:20,500 · Unsafe repair rejected**

Now compare the Notification Switch. Meta repaired its keyboard behavior: zero of two tasks became two of two.

**00:01:27,975 · Unsafe repair rejected**

But look at the same initial Off label in the original and the AI candidate.

**00:01:32,280 · Unsafe repair rejected**

The candidate's white text became hard to read. The preserved audit measured one point one nine to one, below the applicable four point five to one threshold.

**00:01:41,435 · Unsafe repair rejected**

This was a new confirmed contrast violation, not an incomplete finding.

**00:01:46,230 · Unsafe repair rejected**

AccessFix AI rejected the candidate and preserved the original, even though keyboard and pointer tasks passed.

**00:01:52,785 · Unsafe repair rejected**

Catching an unsafe fix is part of the result.

**00:02:00,500 · Independent proof**

Inspect the actual patch, the recorded Playwright user tasks, the axe core audits, and the final decision.

**00:02:07,620 · Independent proof**

Historical requests used Muse Spark one point three Contributor. The public site only reads preserved results.

**00:02:14,635 · Independent proof**

Menu still needs review. Tic Tac Toe was rejected for new incomplete signatures; separate review also found lost board outlines.

**00:02:25,500 · Closing**

Accepted is not full accessibility conformance, or proof of arbitrary website repair.

**00:02:31,170 · Closing**

AI generates the fix. AccessFix AI proves whether it works.

**00:02:36,300 · Closing**

Explore the read only demo and inspect the technical evidence. Public links await owner publication.