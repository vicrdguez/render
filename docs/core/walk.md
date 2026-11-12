# W1 and W2, one commit at a time

**Proposed.** This is the paper walk that the first arena asked for. Nothing in it is implemented.

Three walks were written apart from one brief. A judge from another model family scored them. This file merges them: the base is candidate 2, with parts from the other two and from the checks the picker ran afterwards. [Walk arena](arena-walk.md) says which part came from where.

The walk had one job, to find where the paper design breaks or says nothing. It found 23 places. They are listed under "What the walk changed", and the other files in this folder now carry the fixes.

The owner reviewed the walk and accepted its changes. The [host](host.md) pass then closed three of its open findings. It gave W1's models and its working directory a source, so rows 0, 4, 8, 9, 11, 12, 14, and 16 below now read W1's options.

## How to read the rows

No row has run as written. The moves the rows lean on have run, on pi-durable 1.5.2:

| Label | File | Storage |
| --- | --- | --- |
| Checks 1 to 7 | `spikes/substrate.mjs` | SQLite, clean close |
| K1 to K6 | `spikes/crash.mjs` | SQLite, process killed with `SIGKILL` |
| P1 to P5 | `arena-walk/candidate-1-probe.mjs` | In memory |
| A to F | `arena-walk/candidate-3-probe.mjs` | SQLite, clean close |

Each row gives what starts the commit, what it reads, and what it writes. An arrow gives the order of writes.

Every row keeps one order: table reads first, then at most one `submit(tx, draft)`, then table writes. `appendEntry`, `createTask`, `createConversation`, and `emit` are table writes. Documents, `request`, `withdraw`, and `decision` can come at any point (measured, `src/session/transaction.ts:1140-1156`, `src/harness/submissions.ts:75-82`, checks 3 and 5, P4).

What a rerun does depends on what started the commit.

- **A tool.** Every tool in this walk that writes declares `replay: "safe"` and keeps a receipt under `api.taskId`, written in the same commit as its other writes. If the process dies before the commit, nothing landed and the tool runs again. If it dies after the commit, the tool runs again with the same `api.taskId`, finds the receipt, and returns the saved result (measured, K1). Without `replay: "safe"` the model gets an error result and calls again, and that call is a new task that appends a twin (measured, K2).
- **A task.** A phase writes its next checkpoint, or its terminal outcome, in the same commit as its other writes. If the commit landed, the task goes on from the next phase. If not, the phase runs again.
- **A `then` task.** The same as a task, and it keys what it has done by the decision ID, not by its own task ID. A second `then` task for the same decision then skips the work the first one finished.
- **An answer.** The table for `answer` in [Primitives](primitives.md). Killed inside the commit, neither the answer nor the `then` task lands. Killed after it, both are there (measured, K6).

## W1, design to merge

### Who takes part

Project P's registry holds `coding-tools` and `w1`. The W1 module gives the host `entry`, which returns the designer's settings, and `options`, the contract through which a client sets W1's options for P. The options are the model of each role and the base branch. Here the designer and the implementer run on model A, and the reviewer on model B. [Host](host.md) and [Standard library](library.md) have the shapes.

| Name | Created by | Role | Model | Tools |
| --- | --- | --- | --- | --- |
| D | The host, for the client, with W1's `entry`. Its `cwd` is P's working directory. | Designer | A | `read`, `bash`, `publish_design` |
| I | `w1.prepare`, with `role()` | Implementer. Its `cwd` is the worktree. | A | `read`, `write`, `edit`, `bash`, `publish_build` |
| R | `publish_build`, with `role()` | Reviewer | B | `show_diff`, `show_file`, `publish_review` |
| L | The store layer, when the store first opens | Event log | None | None |

All four are ownerless. An ownerless conversation starts with an empty agent, so each role's settings name a model. Without one, the first run ends with `no_model` (measured, `src/harness/agent.ts:204-215`, `src/harness/generation.ts:185-189`).

Task names carry the `w1.` prefix, because they are stored and must be unique in a registry. Tool names carry none. A model provider takes only letters, digits, `_`, and `-` in a tool name (reported, not checked here).

D is one piece of work, and its conversation ID is the work's key `k`. Every W1 task but `w1.ensure_handoff` belongs to D and is `background`, so a Stop in D does not reach it (measured, `src/harness/scheduler.ts:668-691`, P1, probe E).

W1 keeps one document per piece of work, `Work`. It holds the stage, the accepted design, the candidate SHA, the IDs of I and R, and the receipts. I and R each hold a small document that names D. The decision subjects are `w1:${k}:design`, `w1:${k}:merge`, and `w1:${k}:stuck`.

### The rows

| Row | Started by | Reads | Writes, in order |
| --- | --- | --- | --- |
| 0 | The client asks for a W1 conversation. | `Project`, W1's options | One host commit: it checks the options → `tx.createConversation` → `configure(tx, id, { cwd, ...entry })`, where `entry(tx)` reads the designer's model. That is D. |
| 1 | The client sends "Add a `--json` flag to the export command." | Admission state | `D.submit(input)` with the client's `requestId`. A resend returns the first submission. |
| 2 | `publish_design` | `Work` | Entry V1 `{ text }` in D → `Work` and the receipt → `request` A1 on V1, with choices approve, revise, and abort, and `then: w1.design_answer` → `emit`. The result sets `terminate`. |
| 3 | The laptop answers A1: revise, with annotation 0 on the passage about the output format and annotation 1 on the passage about errors. | A1, the open list, the registry, V1 for the range check | `createTask` T1 in D → A1 answered with the choice, the annotations, the device, the time, and T1 → the open slot cleared. |
| 4 | T1 | A1 through `decision`, `Work`, V1, the options | `configure(tx, D, { model })` → `D.submit(input, requestId: A1)`, where the input quotes each annotation with its passage → `Work` set to designing, and it owes A1 → `emit` → terminal. |
| 5 | `publish_design`, called with a reply for each annotation | `Work`, A1 | It refuses unless every annotation of A1 has a reply. Entry V2 `{ text, replies }` → `Work` → `request` A2 on V2 → `emit`. |
| 6 | The phone, which still shows V1, answers A1: approve. | A1 | Nothing. A1 is answered with another choice, so the result is `conflict`. The phone reads the inbox again and shows A2. |
| 7 | The laptop answers A2: approve. | As row 3 | `createTask` T2 → A2 answered. A resend with equal fields returns the record and T2. |
| 8 | T2. It first reads the base branch from the options and its SHA from Git. | A2, `Work`, the options | `Work` takes the accepted design V2, the decision A2, and the plan for the worktree: path, branch `w1/${k}`, the base branch, and its SHA → `createTask` `w1.prepare` → `emit` → terminal. |
| 9 | `w1.prepare`, phase 1. It first makes sure the worktree exists (see "An outside effect runs twice"). | `Work`, the options | `role()` creates I with the implementer's model → `Work` and I's document → checkpoint. |
| 10 | `w1.prepare`, phase 2 | `Work`, V2 | `I.submit(input, requestId: A2)` → `Work` set to building → `emit` → terminal. |
| G1 | The implementer's `bash` runs `git commit`. | | Git commit S1. This is not a Render commit. |
| 11 | `publish_build`. It first checks that the worktree is clean and reads the head SHA. | `Work`, the options | Entry B1 `{ text, design: V2, sha: S1 }` in I → `role()` creates R with the reviewer's model → `Work`, the candidate, and the receipt → `createTask` `w1.review_start` → `emit`. |
| 12 | `w1.review_start` | `Work`, B1, the options | `configure(tx, R, { model })` → `R.submit(input, requestId: B1)` → `Work` set to reviewing, with the model → `emit` → terminal. |
| 13 | `publish_review`, after the reviewer has read S1 with `show_diff` and `show_file` | `Work` | Entry R1 `{ text, build: B1, sha: S1, verdict: "fail", findings }` in R → `Work` and the receipt → `createTask` `w1.fix_start` → `emit`. |
| 14 | `w1.fix_start` | `Work`, R1, the options | `configure(tx, I, { model })` → `I.submit(input, requestId: R1)` → `Work` set to fixing → `emit` → terminal. |
| G2 | The implementer's `bash` | | Git commit S2. |
| 15 | `publish_build` | `Work` | Entry B2 `{ text, design: V2, sha: S2, fixes: R1 }` → `Work` → `createTask` `w1.review_start` → `emit`. |
| 16 | `w1.review_start` | `Work`, B2, the options | `configure(tx, R, { model })` → `R.submit(input, requestId: B2)` → `Work`, with the model → `emit` → terminal. |
| 17 | `publish_review`, a pass | `Work`. It requires that B2 is still the candidate. | Entry R2 `{ text, build: B2, sha: S2, verdict: "pass" }` → entry M `{ text, design: V2, sha: S2, build: B2, review: R2, branch }` in D → `Work` and the receipt → `request` J1 on M, with choices approve and abort, and `then: w1.handoff` → `emit`. |
| 18 | The owner answers J1: approve. | As row 3 | `createTask` H → J1 answered. |
| 19 | H. It first reads the branch's head from Git. | J1, M, `Work` | It requires that M names the accepted design and that M's SHA, the candidate, and the head are all S2. `Work` set to handed over → `emit` "Approved. Merge with `git merge --ff-only S2`" → terminal. If the head has moved, it hands nothing over: entry `{ text }` in I that names both SHAs → `Work` set to fixing → `request` on `w1:${k}:stuck`, with choices retry and abort → `emit` → terminal. Retry is row E3, and the implementer then publishes the new head for review. |
| G3 | The owner | | The owner merges S2. Render writes nothing, and the timeline says "handed over", not "merged". |

Seven notes on the rows:

- **A commit that submits to a role's conversation first sets that role's model from the options.** Rows 4, 12, 14, and 16 do, and so does the retry in row E3. `configure` writes a document, so it can come before the submission (measured, `src/harness/agent.ts:92-95`, H7 of `spikes/host.mjs`). A change to an option then reaches the next round, and a run that is working ends on the model it had. Row 10 does not need it, because row 9 has just created I.
- **The events of rows 10 and 12 name I and R.** A client that knows no workflow can then find the agent and join it. See "Joining a running agent" in [Host](host.md).
- **Rows 9 and 10 are two commits.** Creating a conversation is a table write, and `submit(tx, draft)` must come before the first table write (measured, P4).
- **A submission's content is built from stored data only.** A reused `requestId` returns the earlier submission and compares the type, not the content (measured, `src/harness/submissions.ts:231-239`). So a rerun must build the same input.
- **The reviewer has no `read` and no `bash`.** Its two tools read Git objects at the candidate SHA, and they take that SHA from `Work`, never from the model. A file changed after the publish cannot reach the review.
- **An annotation can come with any choice.** The core stores it whatever the choice is, and W1 answers each one. With "revise" it goes to the designer (row 5). With "approve" on a design it goes to the implementer in row 10, and `publish_build` refuses until each one has a reply, as row 5 does. With "approve" on J1 nothing follows, so H lists each one in the handover event as not acted on. With "abort", X2 does the same.
- **A publish is not the end of a run.** pi-durable runs a round's tool calls in parallel by default, and a round ends the run only when every call asks for it (measured, `src/harness/agent.ts:81`, `src/harness/generation.ts:1096-1097`). So `bash` can run beside `publish_build`. The tool declares `executionMode: "sequential"`, which makes its whole round run in call order (measured, `src/harness/types.ts:358-359`, not run). The SHA is then fixed at the tool's turn, and a later call cannot change what S1 names.

### The chain of evidence

1. A2's basis is V2, and V2 is an entry.
2. B2 names V2 and S2.
3. R2 names B2 and S2. The reviewer read S2 from Git objects.
4. M names V2, S2, B2, and R2. J1's basis is M.
5. H checks that the branch head is still S2 and hands over the SHA.

What the chain does not prove:

- That the review is right. It proves what was reviewed.
- That the branch stays put after row 19. The owner merges the SHA, not the branch name, so a branch that moves later does not change what is merged.
- That no agent merged on its own. An agent's `bash` runs as the server's OS user. This is an accepted limit (see the [README](README.md)).

### The server dies between two commits

**The worst place is after G1 and before row 11.** Git holds S1 and the store holds no build entry. No receipt can cover it, because the Git commit is not in the store. On restart the cut-off `bash` call is not run again, and the model gets an error result (measured for a tool with the default `replay`, K2; `bash` declares none). The model then looks at Git, finds S1, and publishes it. If it ends its run without publishing, the next section applies. Nothing repeats `git commit` blindly.

**The second place is inside a publishing tool,** after its commit and before its result is stored. K1 and K2 are this case. With `replay: "safe"` and the receipt, one entry and one decision exist. Without them, the model's second call appends a twin entry, and the twin's request supersedes the first decision, or opens a second one if the owner already answered the first.

**An answer is not a bad place.** The answer and its `then` task land in one commit (measured, K6).

### An agent ends its run without handing off

W1 has an `afterRun` hook. It returns one `w1.ensure_handoff` task, which pi-durable creates as a child of the run (measured, `src/harness/types.ts:1018-1025`).

| Row | Started by | Reads | Writes, in order |
| --- | --- | --- | --- |
| E1 | The run ends with a final answer. | | pi-durable's own commit. |
| E2 | `w1.ensure_handoff` | `Work`, the final answer | If the stage moved on, terminal only. If not: entry `{ text }` in that conversation, holding the agent's last message → `request` on `w1:${k}:stuck`, with choices retry and abort → `emit` → terminal. |
| E3 | The owner answers retry, with or without an annotation. | As row 3 | The `then` task submits to that conversation with the decision ID as `requestId`. Any annotation is part of the input. |

A designer that asks a question instead of publishing lands here. Its question is the basis text, and the owner's reply is an annotation on "retry".

**A run that fails or is stopped is not covered.** `afterRun` never fires after a failure or an abort (measured, the same lines). A run fails on a model error, the turn limit, or a crash loop (measured, `README.md:220`). W1 then shows "building" and no decision. The conversation shows the failed run, and new input there starts a run that can still publish, because the tool checks the stage and not the run. Nothing reaches the inbox. This is the weakest row of the walk.

Candidates 1 and 3 close it another way. A task submits, waits on `Submission.wait()`, and turns every ending without a handoff into a decision (measured that the wait works, P5 and probe C). The cost is a long-lived task. It must commit a changed checkpoint before it waits, or five restarts end it as `faulted` (measured, K3 and K5).

**Decided.** The owner ruled that this is the workflow's concern, and that the hook is enough for W1, which is a sample. The way out is the owner's: a client lists the conversation as failed, and the owner opens it and continues the run. A run that ended on a model error left the reason in `pi.live.runFailure`, and a `continue` then answered the input the failed run had left (measured, H8). See "Joining a running agent" in [Host](host.md).

### The owner aborts while a decision is open

Every W1 decision offers "abort". Its `then` task looks for that choice before anything else.

| Row | Started by | Reads | Writes, in order |
| --- | --- | --- | --- |
| X1 | The owner answers the open decision: abort. | As row 3 | `createTask` for the `then` task → the decision answered. |
| X2 | The `then` task | The decision, `Work` | `Work` set to cancelled → `withdraw` on the work's other subjects → an entry in D that lists each annotation still owed, as not pursued → `createTask` `w1.stop` → `emit` → terminal. |
| X3 to X5 | `w1.stop`, one phase each for D, I, and R | | `runtime.conversation(id)` and then `abort()`, which is pi-durable's own commit. Then the checkpoint. |
| X6 | `w1.stop`, last phase | `Work` | `Work` set to stopped → terminal. The worktree stays, and the event names its path. |

X2 is the cancel. It is durable before any agent stops. From then on every W1 tool and task reads "cancelled" first and writes nothing.

The stops cannot join X2, because a `Tx` has no abort and `Conversation.abort()` makes its own commit (measured, `src/harness/scheduler.ts:673-691`). A task reaches another conversation's `abort()` through `runtime.conversation(id)` (measured, `src/types.ts:324`, `src/harness/types.ts:167-175`, and `test/examples/22-subagent-background.ts:178` does it from a tool). `w1.stop` is `background`, so its own abort of D does not reach it.

A Stop in a client is not a cancel. It ends one run and withdraws nothing.

### An outside effect runs twice

Row 8 stores the plan first: the path, the branch name, and the base SHA. Row 9 then looks before it acts.

- No worktree at the path: create it.
- A worktree at the path with the same branch and base: carry on.
- Anything else: open a decision on `w1:${k}:stuck` and stop. W1 never deletes a directory it cannot prove is its own.

The same rule covers G1. After a crash the agent inspects Git before it commits again.

### The client sends an answer again

Row 7. Equal fields return the record with `repeated: true`, and the first device stays as `by`. Other fields give `conflict`. If the call rejects, the outcome is unknown and the client sends again (measured, `src/types.ts:1333-1344`).

If the `then` task has ended `faulted`, an equal resend creates it again (see [Primitives](primitives.md)). This is how the owner goes on after a continuation dies.

## W2, forecasts

### Who takes part

Project Q's registry holds `coding-tools` and `w2`. W2's `entry` gives the conversation three tools, `record_forecast`, `revise_forecast`, and `calibration`, and the model from W2's one option. It selects no coding tools. W2 does not use `role()`, because it creates no conversation.

F is the conversation the host creates for the client. LQ is Q's event log. W2 keeps one document, `Book`, with the latest forecast entry, the live timer, the open round, the state, and the receipts. F1 and F2 are versions of one forecast and share one subject.

Every W2 task belongs to F and is `background`. Without that flag, a Stop in F aborts every sleeping timer (measured, P1 and probe E).

### The rows

| Row | Started by | Reads | Writes, in order |
| --- | --- | --- | --- |
| 1 | The client sends "I think pi-durable ships a 2.0 before March." | Admission state | `F.submit(input)` |
| 2 | `record_forecast` | `Book` | Entry F1 `{ text, p: 0.70, resolveBy: t1, rule }` → `createTask` `w2.due` U1 → `Book` and the receipt → `emit`. The probability is the agent's estimate, and the entry says so. |
| 3 | U1, phase 1 | | `runtime.sleepUntil(t1)`. No model runs. The server stops for a week, and t1 passes. |
| 4 | The server starts and opens Q. U1 is overdue and runs. | `Book`, F1 | It requires that F1 is the latest and U1 the live timer. `request` D1 on F1, with choices yes, no, void, and "not yet", and `then: w2.score` → `Book` → `emit` → terminal. |
| 5 | The owner answers D1: "not yet". | As W1 row 3 | `createTask` Z1 → D1 answered. |
| 6 | Z1 | D1, `Book` | `createTask` `w2.due` U1b, due seven days after D1's stored answer time → `Book` → `emit` → terminal. |
| 7 | The client sends the revision. | | `F.submit(input)` |
| 8 | `revise_forecast` | `Book` | Entry F2 `{ text, p: 0.60, resolveBy: t2, replaces: F1 }` → `createTask` `w2.due` U2 → `withdraw` on the subject → `Book` → `emit`. |
| 9 | U2, phase 1 | | `runtime.sleepUntil(t2)`. U1b still sleeps. |
| 10 | U1b wakes. | `Book` | F2 is the latest, so terminal only. No request, no event, no model. |
| 11 | U2 wakes. | `Book`, F2 | `request` D2 on F2 → `Book` → `emit` → terminal. |
| 12 | The owner answers D2: yes. | As W1 row 3 | `createTask` Z2 → D2 answered. |
| 13 | Z2 | D2, `Book` | It requires that D2 is the open round and that the forecast is not scored. The score is (0.60 - 1)² = 0.16. `Book` set to resolved → `emit` `w2.resolved` `{ text, forecast: F2, decision: D2, p: 0.60, outcome: 1, score: 0.16 }` → terminal. |
| 14 | The client asks for a calibration report. | | `F.submit(input)` |
| 15 | `calibration` | `eventLog(tx)`, then every entry of LQ | Nothing. It reports one scored forecast and one replaced forecast. |

Four notes on the rows:

- **Row 4 needs an open store.** The server opens every project when it starts and calls `resume()` on each. A store opened on first use would leave D1 unasked until the owner touched Q (measured, check 6, and `README.md:127` for `resume()`).
- **Row 6 uses a stored time.** A rerun then computes the same deadline.
- **Row 8 withdraws at once.** In this script D1 is already answered, so the call does nothing. If D1 were still open, waiting for F2's timer would let the owner score a forecast that was replaced.
- **Row 15 reads every event in Q.** An entry scan has no filter by kind (measured, `src/types.ts:838-846`). The tool filters with `W2Resolved.is(entry)`.

## What the walk changed

A fix whose home is "Core" or "Host wiring" changes the core. Each one has its five checks in [Primitives](primitives.md) or [Topology](topology.md). The owner reviewed them: "I like the design that the walk uncovered, the changes that the walk uncovered." They are **Decided**. Findings 13, 20, and 21 were open then, and [Host](host.md) now answers them.

| # | What the walk found | Rows | Fix | Home |
| --- | --- | --- | --- | --- |
| 1 | A client that knows no workflow cannot show a basis. An entry's data is any JSON. | W1 3, W2 5 | A basis entry carries `text`. | Core |
| 2 | Two comments on two passages do not fit in one `notes` string. | W1 3 | `annotations` replaces `notes`. | Core |
| 3 | Nothing says who owns the `then` task. A Stop could cancel an answer. | W1 3, W2 5 | `answer` creates it in the decision's conversation, as `background`. | Core |
| 4 | An answered decision whose `then` task ended `faulted` is a dead end. | Every answer | An equal resend creates the task again. | Core |
| 5 | A `then` task cannot read its decision, and a tool cannot find the event log. | W1 4, W2 15 | `decision(tx, id)` and `eventLog(tx)`. | Core |
| 6 | `request` with an equal draft does not make a rerun safe. The basis is a new entry each time, and the time has moved. | W1 2 | Receipts, as above. `request` no longer compares the time. | Workflow, and core wording |
| 7 | `primitives.md` told workflows to append, then `request`, then `submit(tx, draft)`. That order throws. | W1 4 | The text now gives the legal order. | Docs |
| 8 | A new conversation cannot get its first input in the commit that creates it. | W1 9, 10 | Two commits. | Workflow |
| 9 | `workflows.md` left a replaced forecast's decision open until the next request. | W2 8 | Withdraw in the revising commit. | Workflow |
| 10 | Nothing said that timers must be `background`. | W2 2 | The flag. | Workflow |
| 11 | A store that is closed never wakes. | W2 4 | The server opens every project at start. | Host wiring |
| 12 | The first conversation of a workflow gets every installed extension and no role. | W1 0 | The module's `entry`. | Host wiring |
| 13 | A workflow has no place for per-project options, such as the reviewer's model or the base branch. | W1 0, 8 | Options that the workflow defines and a client sets. See [Host](host.md). | Standard library and host wiring. Proposed. |
| 14 | A run that ends is not a handoff. | W1 E1 to E3 | The `afterRun` check. A failed or stopped run is the owner's to continue. | Workflow |
| 15 | A Stop is not a cancel, and aborting a conversation withdraws no decision. | W1 X1 to X6 | An "abort" choice on every decision, and a durable cancel before the stops. | Workflow |
| 16 | An outside effect has no receipt in the store. | W1 9, G1 | Store the plan, look, act, and stop on a mismatch. | Workflow |
| 17 | The reviewer could read files that are not in the reviewed commit, and a publish does not end a run. | W1 11 to 13 | Tools pinned to the SHA, and a sequential publish. | Workflow |
| 18 | A task that waits in memory is ended after five restarts. | K3, K5 | Commit a changed checkpoint before the wait. | Workflow |
| 19 | Event has one reader among the extensions, and W2 could have read its own document instead. | W2 15 | Event stays in the core for the client alone. | README |
| 20 | A faulted task that no decision points at is seen only by `onReport` and `getTask`. | | A `faults` call for clients. Running a task again is not designed. See [Host](host.md). | Host wiring. Proposed. |
| 21 | A client that retries "create a conversation" gets two. `createConversation` takes no key (measured, `src/harness/types.ts:919`). | W1 0 | None. The owner accepted it. | Accepted limit |
| 22 | An annotation can come with a choice that ends a stage. Nothing said who answers it then. | W1 7, 18, X1 | W1 carries it to the next role, or lists it as not acted on. | Workflow |
| 23 | The handover said what it requires, and not what it does when the branch has moved since the review. | W1 19 | A decision on the `stuck` subject. Retry sends the new head to review. | Workflow |

## Not verified

- No workflow code exists. The rows are paper.
- No Git command, worktree, or shell ran.
- The real `request`, `withdraw`, `answer`, `emit`, `decision`, and `eventLog` do not exist. The checks used plain documents with the same shape.
- K6 kills the process inside the commit's callback and right after the commit. It does not kill it in the middle of SQLite's own write.
- A sequential round was read in the source, not run.
- No hook was run. The `afterRun` rows rest on the source comment.
- A second model provider for R was not set up.
- Annotation ranges were not tried in a real client.
- No workflow upgrade was walked with a decision open.
