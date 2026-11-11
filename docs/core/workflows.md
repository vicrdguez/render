# Proving workflows

The core is proved by workflows that differ. A concept that two unlike workflows need is a candidate for the core. A concept that one needs stays in its extension.

These are tests of the primitives, not products. Each one is as small as it can be while still stressing something the others do not.

## W0, the bare agent

**Decided.** No extension is loaded. You open a project, send a message, close the client, restart the server, and continue the conversation.

W0 proves that the core runs alone.

## W1, design to merge

**Decided.** A slim version of the pstack flow and of the workflow in Render v1.

1. You send a prompt in a project that selects the workflow.
2. A designer agent writes a design document and opens a decision on it.
3. You comment, and the designer revises and asks again. Or you approve.
4. An implementer agent works in its own worktree.
5. A reviewer agent on another model checks the result.
6. A final decision gates the merge. Only you merge.

## W2, forecasts

**Proposed.** W2 needs a model, the store, and a clock. It needs no shell, no Git, no network, and no files. It replaces "thesis to verdict" from the first draft.

1. You state a claim in a conversation.
2. The agent sharpens it into a forecast: a statement that can fail, a probability, a date to resolve by, and the rule that settles it. Its tool `record_forecast` appends the forecast as an entry and creates a `w2.due` task, in one commit.
3. `w2.due` sleeps until the date. No model runs.
4. When it wakes, it checks that its forecast entry is still the latest one. If so, it requests a decision. The basis is the forecast entry. The choices are "yes", "no", "void", and "not yet". The `then` task is `w2.score`.
5. You answer from any device.
6. `w2.score` runs with no model. For "yes" or "no" it computes the Brier score and emits `w2.resolved`. For "void" it emits `w2.voided`. For "not yet" it creates another `w2.due`, so the same subject gets a second decision later.
7. A revised forecast is a new entry. The next request supersedes the open decision. A dropped forecast withdraws it. An old `w2.due` that wakes later sees a newer entry and ends without asking.
8. A `calibration` tool reads the `w2.resolved` events and reports how your stated probabilities compare with the outcomes.

A test uses the faux model provider and passes its own clock to the harness, so it does not wait (measured, `now` in `src/harness/types.ts:729-732`). The key move has run: a task slept for a week across a closed store, woke on reopen, and wrote a decision-shaped document (measured, check 6 of `spikes/substrate.mjs`).

W2 has the shape of quant research without the compute job: a claim fixed before the result, then a score. A later quant workflow replaces step 5 with a backtest task that produces the answer. That mapping is a guess about work not yet described.

## What each workflow stresses

| | W1 | W2 |
| --- | --- | --- |
| Who requests a decision | An agent's tool | A task that the clock wakes, with no model |
| Basis | A design document that changes under review | A forecast fixed before the result |
| The answer | An approval | An observed fact |
| Open decisions | One or two | Many, on separate subjects |
| Supersede and withdraw | On a revision | Routine |
| One subject asked again | After your comments | After "not yet", weeks later |
| Work after an answer | Starts an agent | Runs code with no model |
| Time | Minutes, driven by answers | Weeks, and the store may be closed |
| Events | Role handoffs, read by the client | Read back by a tool |
| Outside effects | Git, a worktree, a shell | None |

## Where W2 came from

The three arena designs each proposed a different W2.

| Proposal | Source | Result |
| --- | --- | --- |
| Forecasts | Candidate 1 | Chosen. It has agent work, a second reader of events, and a tested key move. |
| Spaced-recall notebook | Candidate 2 | Runner-up. The judge preferred it. |
| Thesis to verdict | Candidate 3, the first draft | Dropped. Its first decision approves a document, which repeats W1. |

The spaced-recall notebook shows question cards on a schedule, and you grade each one "remembered" or "again". The judge preferred it because each card recurs and because an old timer must notice a revised card. Those two stresses are now in W2 as the "not yet" choice and the check in step 4.

It stays the runner-up for two reasons. No agent does any work in it, so it tests the core without the part that makes Render an agent tool. And nothing in it reads events, so it gives Event no second reader.

## What the W1 walk must show

No workflow has been walked through Decision and Event one commit at a time. The judge named this as a gap in all three designs, and it is the next step.

The walk for W1 must show one chain, and show that a retry or a revision cannot break it:

- The approved design is an entry. The decision on it names that entry as its basis.
- The implementation records which design entry it built from.
- The review records which commit SHA it reviewed.
- The basis of the final decision is an entry that names the design entry, the SHA, and the review entry.
- The `then` task of the final decision checks that the branch still points at that SHA before it hands the branch to you. It does not merge.

If a link is missing, a workflow could show a valid approval for the wrong source.
