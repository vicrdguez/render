# Proving workflows

The core is proved by workflows that differ. A concept that two unlike workflows need is a candidate for the core. A concept that one needs stays in its extension.

A workflow is one kind of extension. [Extensions](extensions.md) has the model, and a fourth proving case that is not a workflow: web search.

These are tests of the primitives, not products. Each one is as small as it can be while still stressing something the others do not.

W1 and W2 have been walked on paper, one commit at a time. [The walk](walk.md) has every row. This file says what each workflow is, and it lists the rules for workflow authors that the walk and the [host](host.md) pass produced.

## W0, the bare agent

**Decided.** No workflow is loaded. You open a project, send a message, close the client, restart the server, and continue the conversation.

The bare agent selects pi-durable's `coding-tools` extension, which gives it `read`, `write`, `edit`, and `bash` (measured, `src/tools/index.ts:27-36`). Codemode is an optional extension.

It is a chat with a coding agent, as in pi. The client sends the model when it creates the conversation, and the host sets the project's working directory. In a project that has extensions that are not workflows, such as web search, the bare agent gets their tools too. That part is **Proposed** in [Extensions](extensions.md). What Tau adds is where the conversation lives: on the server, across a restart, and reachable from a second device. Nothing asks a decision, and the timeline stays empty.

W0 proves that the core runs alone. [Host](host.md) lists the calls it needs.

## W1, design to merge

**Decided.** A slim version of the pstack flow and of the workflow in Render v1.

1. You send a prompt in a conversation of the W1 workflow.
2. A designer agent writes a design document and opens a decision on it.
3. You answer "revise" with comments on passages of the design. The designer replies to each comment in the next version and asks again. Or you approve.
4. An implementer agent works in its own worktree.
5. A reviewer agent on another model checks the commit the implementer published.
6. A final decision gates the handover. Only you merge.

Every W1 decision also offers "abort".

W1 has four options per project: the model of the designer, of the implementer, and of the reviewer, and the base branch. You set them from a client before the first conversation. [Standard library](library.md) has the schema.

## W2, forecasts

**Proposed.** W2 needs a model, the store, and a clock. It needs no shell, no Git, no network, and no files. It replaces "thesis to verdict" from the first draft.

1. You state a claim in a conversation.
2. The agent sharpens it into a forecast: a statement that can fail, a probability, a date to resolve by, and the rule that settles it. Its tool `record_forecast` appends the forecast as an entry and creates a `w2.due` task, in one commit.
3. `w2.due` sleeps until the date. No model runs.
4. When it wakes, it checks that its forecast entry is still the latest one. If so, it requests a decision. The basis is the forecast entry. The choices are "yes", "no", "void", and "not yet". The `then` task is `w2.score`.
5. You answer from any device.
6. `w2.score` runs with no model. For "yes" or "no" it computes the Brier score and emits `w2.resolved`. For "void" it emits `w2.voided`. For "not yet" it creates another `w2.due`, so the same subject gets a second decision later.
7. A revised forecast is a new entry. The tool `revise_forecast` withdraws the subject's open decision in the same commit. An old `w2.due` that wakes later sees a newer entry and ends without asking.
8. A `calibration` tool reads the `w2.resolved` events and reports how your stated probabilities compare with the outcomes.

The walk changed step 7. The first version left the old decision open until the next request, so you could score a forecast that had been replaced. The walk did not cover "void" or a dropped forecast.

W2 has one option per project, its model.

A test uses the faux model provider and passes its own clock to the harness, so it does not wait (measured, `now` in `src/harness/types.ts:729-732`). The key move has run: a task slept for a week across a closed store, woke on reopen, and wrote a decision-shaped document (measured, check 6 of `spikes/substrate.mjs`).

W2 has the shape of quant research without the compute job: a claim fixed before the result, then a score. A later quant workflow replaces step 5 with a backtest task that produces the answer. That mapping is a guess about work not yet described.

## What each workflow stresses

| | W1 | W2 |
| --- | --- | --- |
| Who requests a decision | An agent's tool | A task that the clock wakes, with no model |
| Basis | A design document that changes under review | A forecast fixed before the result |
| The answer | An approval, or comments on passages | An observed fact |
| Open decisions | One or two | Many, on separate subjects |
| Supersede and withdraw | On a revision | Routine |
| One subject asked again | After your comments | After "not yet", weeks later |
| Work after an answer | Starts an agent | Runs code with no model |
| Time | Minutes, driven by answers | Weeks, and the store may be closed |
| Events | Role handoffs, read by the client | Read back by a tool |
| Outside effects | Git, a worktree, a shell | None |
| Conversations it creates | Two, each with a role | None |

## Rules for workflow authors

**Proposed.** The walk produced these, and the [host](host.md) pass added the last four. None is in the core. Each one is a rule because a walk, or a check, showed what goes wrong without it.

| Rule | Without it | Evidence |
| --- | --- | --- |
| Inside a commit: table reads, then at most one `submit(tx, draft)`, then table writes. | The commit throws `ReadAfterWrite`. | Checks 3 and 5, P4 |
| A tool that writes declares `replay: "safe"`. It keeps a receipt under `api.taskId`, written in the commit that does its other writes. When it finds the receipt, it returns the saved result. | After a crash the model calls again. That call is a new task, and it appends a twin entry and a second decision. | K1, K2 |
| A `then` task keys what it has done by the decision ID. Before it acts, it checks that the decision is the one its workflow still waits on. | A `then` task that is created again repeats the work. A late one acts on a decision that no longer counts. | K4, W2 row 13 |
| Every decision offers a choice that ends the work. | While a decision is open nothing runs, so nothing can be stopped. A Stop in a client withdraws no decision. | W1 rows X1 to X6 |
| A task that must outlive a Stop is `background`. That covers every timer. | A Stop in the conversation aborts every sleeping task in it. | P1, probe E |
| A cancel is a commit of its own, and it comes before any agent is stopped. | A crash between two stops leaves the work half cancelled, with nothing that says so. | W1 row X2 |
| A task that waits in memory first commits a changed checkpoint. | Five restarts during the wait end the task as `faulted`. | K3, K5 |
| A conversation gets its first input in the commit after the one that creates it. | `submit(tx, draft)` throws after the table write. | P4 |
| A submission is built from stored data only. Its `requestId` is the ID of the stored thing that caused it. | A rerun sends a second input, or a different one under the same ID. | `src/harness/submissions.ts:231-239` |
| Before an outside effect, store the plan. Then look, act, and stop on a mismatch. Never delete what you cannot prove is yours. | A rerun repeats the effect, or destroys someone else's work. | W1 row 9, not run |
| A tool that publishes outside state reads that state itself and declares `executionMode: "sequential"`. | The model names the state, or another call in the same round changes it. | `src/harness/types.ts:358-359`, not run |
| A reviewer's tools read the published state, not the working files. | The review covers files that are not in the commit. | W1 row 13, not run |
| A basis entry and an event carry `text`. | A client that knows no workflow shows nothing. | [Primitives](primitives.md) |
| A run that ends is not a handoff. Check the stage when the run ends. | The work shows "building" and never moves. | W1 rows E1 to E3 |
| A tool checks the workflow's state. Prose grants nothing, and a role's tool list is not a sandbox. | An agent with `bash` does what its role's prose forbids. The owner can also join any agent and ask it to call any of its tools. | [Primitives](primitives.md), [Host](host.md) |
| Read an option in the commit that uses it. Copy a value that an outside effect depends on into your own document. | A later phase, or a rerun, acts on a value that has changed since. | W1 row 8, H2 and H3 |
| A commit that submits to a role's conversation first sets that role's model from the options. | A changed option reaches only conversations that are created later. | W1 rows 12 and 16, H7 |
| The event of the commit that first submits to a conversation names that conversation. | A client that knows no workflow cannot find the agent to join it. | W1 rows 10 and 12 |
| A new option ships with a default. | After an upgrade `read` throws, and the tasks that read the option fault. | [Standard library](library.md) |

One of these leans on source that was read and not run: the `afterRun` hook. H2, H3, and H7 are checks of `spikes/host.mjs`. The sequential round has since run, as E6 of `spikes/ext.mjs`.

[Extensions](extensions.md) adds five rules for every extension author: exact lists for a closed role, an open role that removes its extension's other tools, `callers: ["model"]` on a tool that publishes, a section that checks who it is for, and a secret kept out of everything a model or a client can read.

## Where W2 came from

The three designs of the first arena each proposed a different W2.

| Proposal | Source | Result |
| --- | --- | --- |
| Forecasts | Candidate 1 | Chosen. It has agent work, a reader of events, and a tested key move. |
| Spaced-recall notebook | Candidate 2 | Runner-up. The judge preferred it. |
| Thesis to verdict | Candidate 3, the first draft | Dropped. Its first decision approves a document, which repeats W1. |

The spaced-recall notebook shows question cards on a schedule, and you grade each one "remembered" or "again". The judge preferred it because each card recurs and because an old timer must notice a revised card. Those two stresses are now in W2 as the "not yet" choice and the check in step 4.

It stays the runner-up for two reasons. No agent does any work in it, so it tests the core without the part that makes Tau an agent tool. And nothing in it reads events.

The walk weakened the second reason. W2's `calibration` tool reads events, but it could read W2's own document instead. So W2 does not prove that an extension must read events. See Event in [Primitives](primitives.md).

## What the W1 walk showed

The first arena asked for one chain of evidence in W1, and for proof that a retry or a revision cannot break it. The walk shows the chain link by link:

- The approved design is an entry, and the decision on it names that entry as its basis.
- The build entry names the design entry and the commit SHA.
- The review entry names the build entry and the SHA. The reviewer's tools read that SHA from Git objects.
- The basis of the final decision is an entry that names the design entry, the SHA, the build entry, and the review entry.
- The `then` task of the final decision checks that the branch still points at that SHA. It hands you the SHA and does not merge. If the branch has moved, it hands nothing over and opens a decision, and the new head goes back to review.

The chain holds on paper. It has three known limits: it does not prove that the review is right, an agent's shell can merge on its own, and no row has run. [The walk](walk.md) lists them.
