# Walk: W1 and W2 through the core, one commit at a time

Paths under `src/`, `test/` and `README.md` are in `/tmp/render-ground/pi/packages/durable`. "Probe" is `probe.mjs` in this directory, run on pi-durable 1.5.2. It printed `ok: checks A-F passed`.

## 1. W1, one commit at a time

### Conversations

| Name | Owner | Role | Tools |
| --- | --- | --- | --- |
| `C1`, the project root | none | none | `read`, `write`, `edit`, `bash`, `start_work` |
| `Cw`, one per piece of work | none | designer | `read`, `bash`, `propose_design` |
| `Ci` | task `w1.build` | implementer | `read`, `write`, `edit`, `bash`, `hand_off` |
| `Cr` | task `w1.build` | reviewer, on another model | `read`, `bash`, `verdict` |
| `L`, the event log | none | never runs | none |

Every W1 task for a piece of work is owned by its thread `Cw`, so one `Cw.abort()` reaches all of it.

The subject of every W1 decision is `w1:${Cw}`. Two conversation documents hold W1's own state:

- `w1.work` on `Cw`: `{ title, stage, version, proposed?: { entry, decision, call }, owes?: DecisionId, design?, build? }`.
- `w1.job` on `Ci` and `Cr`: `{ design, round, handoff?: { entry, sha, round }, verdict?: { entry, sha, pass, round } }`.

Every tool below is declared `replay: "safe"` and starts its commit with a guard: if the document already holds this call's `api.taskId`, it returns the recorded result. See finding 1.

### Commits

| # | Started by | Reads | Writes, in order | Rerun |
| --- | --- | --- | --- | --- |
| 1 | Client submits "Add a `--json` flag..." to `C1` | | pi-durable's own submission and run | pi-durable |
| 2 | Tool `start_work({ title, request })` in `C1` | guard doc on `C1` | `tx.createConversation({ ownership: ownerless })` gives `Cw`. `configure(tx, Cw, Designer.agent())`. Doc `w1.work`. `tx.createTask(W1Kickoff, { request }, { conversationId: Cw })`. `emit(w1.started)`. Result sets `terminate`. | Guard returns `Cw` |
| 3 | Task `w1.kickoff` in `Cw` | | `handle.submit(tx, { type: "input", content: request, requestId: "w1.kickoff" })`, then terminal | One commit |
| 4 | Tool `propose_design({ text, replies })` in `Cw` | `w1.work`. Refuses unless `stage` is `design`. | `E1 = appendEntry(w1.design, { text, version: 1 })`. `request(tx, { subject, title: "Design v1: ...", basis: E1, choices: ["approve", "revise", "drop"], conversation: Cw, then: W1DesignDecided })` opens `D1`. Doc `proposed = { E1, D1, call }`. `emit(w1.design.proposed)`. Result sets `terminate`. | Guard |
| 5 | Host `answer(D1, { basis: E1, choice: "revise", annotations: [a0, a1] }, laptop)` | Decision doc `D1`, the open list, the registry | `T = createTask(W1DesignDecided, { decision: D1, choice }, { conversationId: Cw })`. Decision doc becomes answered with `continuation: T`. Open slot cleared. | Same fields return `repeated: true` |
| 6 | Task `w1.design_decided`, choice `revise` | Decision doc `D1`, `w1.work`, entry `E1` | Checks `proposed.decision === D1`. `handle.submit(tx, { type: "input", content, requestId: D1 })`, where `content` quotes each annotated passage. Doc `owes = D1`. Terminal. | One commit |
| 7 | Tool `propose_design`, second run | `w1.work`, decision doc `D1` | Refuses unless `replies` covers both annotations of `D1`. `E2 = appendEntry(w1.design, { text, version: 2, replies, answers: D1 })`. `request` opens `D2`, since `D1` is answered. Doc clears `owes`. `emit`. | Guard |
| 8 | Phone `answer(D1, { basis: E1, choice: "approve" }, phone)` | Decision doc `D1` | Nothing. Refuses with `conflict` and returns `D1`'s record. | Same |
| 9 | Laptop `answer(D2, { basis: E2, choice: "approve" }, laptop)` | as 5 | as 5, with `{ decision: D2, choice: "approve" }` | as 5 |
| 10 | Task `w1.design_decided`, choice `approve` | Decision doc `D2`, `w1.work` | Checks `proposed.decision === D2`. `B = createTask(W1Build, { design: E2, decision: D2 })`. Doc `stage = "build"`, `design = E2`, `build = B`. `emit(w1.build.started)`. Terminal. | One commit |
| 11 | Task `w1.build`, phase `worktree` | Shell: `git rev-parse HEAD`, kept with `runtime.memo("base", sha)`. `git worktree list`. | Shell: `git worktree add -b w1/${Cw} <dir> <base>`, skipped when the path is listed. Then one commit: create `Ci` and `Cr` with `{ ownership: { kind: "task", taskId: B } }`, `configure(tx, Ci, Implementer.agent({ cwd }))`, the same for `Cr`, doc `w1.job` on both, checkpoint `{ phase: "implement", round: 1, nudges: 0 }`. | Worktree found and skipped. Memo keeps the first base. |
| 12 | `w1.build`, phase `implement` | Entry `E2` for the design text | `Ci.submit({ type: "input", content, requestId: "${B}:impl:${round}:${nudges}" })`, then `submission.wait()` in memory | Same `requestId` returns the first submission |
| 13 | Tool `hand_off({ summary })` in `Ci` | Shell: `git status --porcelain` must be empty. `git rev-parse HEAD`. Doc `w1.job`. | `H1 = appendEntry(w1.handoff, { text, sha, design: E2 })`. Doc `handoff = { H1, sha, round }`. Result sets `terminate`. | Guard |
| 14 | `w1.build`, after the wait | `w1.job` on `Ci` | Hand-off found for this round: doc `w1.job.handoff` on `Cr`, checkpoint `{ phase: "review" }`. Not found: see "An agent ends its run" below. | One commit |
| 15 | `w1.build`, phase `review` | | `Cr.submit({ ..., requestId: "${B}:review:${round}:${nudges}" })`, then wait | as 12 |
| 16 | Tool `verdict({ pass, findings, summary })` in `Cr` | Shell: `git rev-parse HEAD` must equal `handoff.sha`. Doc `w1.job`. | `R1 = appendEntry(w1.review, { text, pass: false, findings, sha, handoff: H1 })`. Doc `verdict`. Result sets `terminate`. | Guard |
| 17 | `w1.build`, after the wait | `w1.job` on `Cr` | `emit(w1.review.failed)`. Checkpoint `{ phase: "implement", round: 2, findings: R1 }`. | One commit |
| 18 to 21 | Round 2, as 12 to 16 | | `H2` with `sha2`. `R2` with `pass: true` and `sha2`. | |
| 22 | `w1.build`, after the wait | `w1.job` on `Cr`. Shell: `git diff --stat`. | Checks `verdict.sha === handoff.sha`. `X = appendEntry(w1.result, Cw, { text, design: E2, sha: sha2, review: R2, branch })`. `request(tx, { subject, title: "Merge: ...", basis: X, choices: ["approve", "rework", "drop"], conversation: Cw, then: W1MergeDecided })` opens `D3`. Doc `stage = "merge"`. `emit(w1.review.passed)`. Terminal. | One commit |
| 23 | Laptop `answer(D3, { basis: X, choice: "approve" }, laptop)` | as 5 | as 5 | as 5 |
| 24 | Task `w1.merge_decided` | Decision doc `D3`, entry `X`. Shell: `git rev-parse refs/heads/${branch}`. | Head equals `sha2`: doc `stage = "ready"`, `emit(w1.ready, { text: "Approved. Run: git merge --ff-only <sha2>" })`, terminal. Head differs: `emit(w1.branch.moved)` and a new `w1.build` that starts at review. | Reads the head again |

Why each order is legal (measured):

- Commits 4, 7, 13, 16 and 22 read documents, append, then write documents and append to `L`. Only a table read after a table write throws (`src/session/transaction.ts:1140-1156`). Probe check A ran this order, and the run ended after one model request.
- Commit 6 reads `E1`, calls `handle.submit(tx, draft)`, then returns the terminal state. `submit(tx, draft)` must come before the first table write (`README.md:713`). Probe check B ran it.
- `tx.createConversation` takes only `ownership` (`src/types.ts:1016`). `configure(tx, id, change)` sets the agent in the same commit (`src/harness/agent.ts:92`). Probe check C ran commit 11's shape and read back exactly the role's tools.
- Commit 12 follows `test/examples/22-subagent-background.ts:91-92`. Probe check D closed the Harness during the wait. After reopen `Ci` held the input once.

### The chain of evidence

1. The approved design is `E2`, and `D2.basis` is `E2`. Commit 10 passes `E2` to the build, so the implementer builds what was approved, not "the latest design".
2. `H2` records `design: E2` and `sha2`.
3. `R2` records `sha2` and `handoff: H2`. The tool refuses when `HEAD` is not the handed-off SHA.
4. `X` names `E2`, `sha2` and `R2`. `D3.basis` is `X`.
5. Commit 24 compares the branch head with `sha2`, then names the SHA for the merge.

One break remains. The branch can move between commit 24 and your merge, so the hand-over names the SHA. Nothing stops an agent's `bash` from merging. That is the accepted limit in ruling 2.

### Unhappy paths

**The server dies between two commits.** The worst place is inside `propose_design`, `hand_off` or `verdict`, after the tool's own commit and before pi-durable commits the tool result. Every other gap ends in one atomic commit or a rerun that reads fixed inputs. This one hands recovery to a model. A tool is `replay: "unsafe"` by default, so the model gets an `interrupted` error result (measured, `README.md:277`, `src/harness/types.ts:357`). It will call the tool again. That appends a twin design entry, and `request` supersedes `D1`. If you answered `D1` first, two lines of work are live. `replay: "safe"` plus the guard closes it (inferred, not run).

**An agent ends its run without handing off.** In `Ci` and `Cr` the wait resolves and commit 14 finds no hand-off for the round. It raises `nudges`, and the phase submits "You stopped without calling `hand_off`" under a new `requestId`. After two nudges it appends a `w1.stuck` entry in `Cw`, requests a decision on it with `retry` and `drop`, and ends. `retry` starts a new `w1.build` in the same worktree with new conversations. In `Cw` the designer's answer is a message to you, and the client shows `Cw` idle with a new answer.

**The owner aborts while a decision is open.**

- Nothing is running, as after commit 4. `Cw.abort()` finds no task, so no commit runs and nothing can call `withdraw`. So every W1 decision has the choice `drop`. Its `then` task sets `stage = "dropped"` and emits `w1.dropped` (finding 2).
- `w1.build` is running, or a `then` task is pending. `Cw.abort()` reaches every task `Cw` owns that is not `background` (measured, `src/types.ts:415`). pi-durable stops `Ci` and `Cr` first, then runs the `abort` handler of `w1.build`, whose one commit calls `withdraw(tx, subject)`, sets `stage = "dropped"` and emits. Probe check E ran such a handler.

**An outside effect runs twice.** Commit 11 names the worktree after `Cw`, looks before it creates, and keeps the base SHA in a memo. A second run creates nothing.

**The client sends the answer again.** The same fields return the record with `repeated: true` and the same `continuation`. The annotation list is compared in order.

## 2. W2, one commit at a time

Project Q has `C1`, the root, with no owner and no role. Its tools are the four coding tools plus `record_forecast`, `drop_forecast` and `calibration`. One session document `w2.book` maps a forecast key to `{ latest: EntryId, p, state }`.

| # | Started by | Reads | Writes, in order | Rerun |
| --- | --- | --- | --- | --- |
| 1 | Client submits the claim to `C1` | | pi-durable's run. The agent sharpens the claim. | |
| 2 | Tool `record_forecast({ claim, p, resolveBy, rule })` | `w2.book` | `F1 = appendEntry(w2.forecast, { text, claim, p, resolveBy, rule, key })`. `createTask(W2Due, { key, forecast: F1, until }, { ownership: { kind: "conversation" }, background: true })`. Doc `book[key]`. `emit(w2.recorded)`. | Guard |
| 3 | Task `w2.due`, phase `sleep` | | `runtime.sleepUntil(until, { phase: "ask" })` | One commit |
| | The server is down for a week. The date passes. | | | |
| 4 | `w2.due`, phase `ask`, after the store reopens | `w2.book` | `latest === F1`: `request(tx, { subject: "w2:${key}", title: "Did it happen? ...", basis: F1, choices: ["yes", "no", "void", "not yet"], conversation: C1, then: W2Score })` opens `D1`. Terminal. No model runs. | An equal draft returns `D1` |
| 5 | Host `answer(D1, { basis: F1, choice: "not yet" }, device)` | as W1 commit 5 | `createTask(W2Score, { decision: D1, choice })` in `C1` | |
| 6 | Task `w2.score` | Decision doc `D1`, `w2.book` | Checks `latest === D1.basis`. Creates a second `w2.due` for `F1`, due in seven days, `background`. Terminal. | One commit |
| 7 | Tool `record_forecast({ ..., revises: key })` | `w2.book` | `F2 = appendEntry(...)`. A `w2.due` for `F2`. `book[key].latest = F2`. `withdraw(tx, subject)`. `emit(w2.recorded)`. | Guard |
| 8 | `F1`'s second timer wakes | `w2.book` | `latest !== F1`, so terminal. It asks nothing. | One commit |
| 9 | `F2`'s timer wakes | `w2.book` | `request` opens `D2` on `F2` | |
| 10 | Host `answer(D2, { basis: F2, choice: "yes" }, device)` | | `createTask(W2Score, ...)` | |
| 11 | Task `w2.score` | Decision doc `D2`, `w2.book` | `book[key].state = "resolved"`. `emit(w2.resolved, { text, at, conversation: C1, forecast: F2, p: 0.35, outcome: 1, brier: 0.4225 })`. Terminal. | One commit |
| 12 | Tool `calibration()` | Entries of `L`, kept when `W2Resolved.is(entry)` | Nothing | Read only |

What the walk showed:

- **The week.** A task slept a week across a closed store and woke on reopen (measured, check 6 of `spikes/substrate.mjs`). Commit 4 runs only if the server opens Q's store at start (finding 9).
- **The timers must be `background`.** Otherwise pressing Stop during a chat in `C1` aborts every sleeping forecast (measured, `src/types.ts:415`, probe check E).
- **Commit 7 withdraws at once.** `workflows.md` waits for the next request to supersede. That may be months away, and until then the inbox offers a decision on `F1` (finding 8).
- **Commit 12 does not need events.** The scan has no filter by kind (measured, `EntryQuery` at `src/types.ts:838-846`), so the tool pages the whole log. `w2.book` already holds every probability and outcome. See finding 10.

## 3. `role()` on paper

```ts
type RoleSpec = {
	name: string;
	instructions: string; // from prose(), loaded when the module loads
	extensions: readonly Extension[]; // exactly these
	tools: readonly Tool[]; // exactly these
	model?: ModelRef;
	thinkingLevel?: ThinkingLevel;
	maxTurns?: number;
};
declare function role(spec: RoleSpec): { name: string; agent(over?: { cwd?: string }): AgentChange };
```

`role()` is a pure function and never holds a `tx`. Inside a commit the workflow writes two lines of pi-durable:

```ts
const ci = await tx.createConversation({ ownership: { kind: "task", taskId: task.id } });
await configure(tx, ci.id, Implementer.agent({ cwd }));
```

`configure` writes the `pi.agent` document, so it is legal after the table write (measured, probe check C).

W1's three roles:

```ts
const Designer = role({ name: "designer", instructions: designerProse, extensions: [Coding, W1], tools: [read, bash, proposeDesign] });
const Implementer = role({ name: "implementer", instructions: implementerProse, extensions: [Coding, W1], tools: [read, write, edit, bash, handOff], maxTurns: 80 });
const Reviewer = role({ name: "reviewer", instructions: reviewerProse, extensions: [Coding, W1], tools: [read, bash, verdict], model: { provider: "openai", modelId: "gpt-6-sol" } });
```

The exact lists matter. A task-owned conversation starts as a copy of its owner's agent (measured, `README.md:402`), so `Ci` would inherit `propose_design` without them.

Left out on purpose:

- A registry of roles, a file format, and model fallbacks.
- Creating the conversation, sending work, and waiting for a hand-off. Those are the workflow's tasks.
- A stored label. pi-durable has no place for one.
- Any permission check. A role selects tools. `bash` in the designer's list can still write files.

W2 does not use it. Its one agent is the bare agent with three more tools.

**Entry to the standard library.** Three checks, a paragraph in the change, and the owner's yes:

1. One workflow uses it today, and a second could use it unchanged.
2. It calls only the public API of pi-durable and the core. The core never imports it, and a workflow can skip it.
3. It owns no stored name: no document kind, entry kind, task, or extension. Code that needs one is part of a workflow or a candidate for the core.

A part with no user is deleted. `prose()` and `role()` both pass.

## 4. Annotation through the rule

| Check | Result | Evidence |
| --- | --- | --- |
| 1. A real failure | Pass | Commit 5 carries two comments on two passages. With one `notes` string, commit 7 cannot count them, so it cannot refuse a design that skips one. |
| 2. pi-durable does not provide it | Pass | No comment concept. `EntryRecord` has no author (measured, `src/types.ts:460-476`). A `{ type: "write" }` submission stores an entry and starts no run (measured, probe check F), and stamps no device. |
| 3. An extension cannot keep the promise | Split | The stored shape passes: a client that knows no workflow must write it. "Every annotation answered" fails: W1 keeps it in commit 7. |
| 4. Two unlike users | Fails for the range | W2's answer carries at most one remark and no passage. Only W1 uses a range. A client can work with plain notes, so the client clause does not save it. |
| 5. A small shape | Pass for a list on the answer. Fail for saved annotations. | Saving needs a second host write path, a record with its own states, and rules for a superseded decision. |

Annotation fails as a primitive. A wider shape for a field the core already stores passes, as the owner ruled.

```ts
type Annotation = { text: string; range?: { start: number; end: number } }; // offsets into the basis `text`
// Decision, answered: `notes?: string` becomes `annotations?: readonly Annotation[]`
// answer(id, { basis, choice, annotations }, device)
```

`answer` checks the schema, stores the list, and compares it on a retry. It does not read the basis and it knows nothing about replies. An annotation is named by its decision ID and its index. The range has one user, so it is the first part to remove under the rule's removal clause.

| | Notes only | A list with the answer | Entries saved before the answer |
| --- | --- | --- | --- |
| New in the core | Nothing | One type, one field | A host call `annotate`, a record, and collection in `answer` |
| Client that knows no workflow | Flattens quotes into one string | Sends ranges | Sends ranges, one at a time |
| Review moves between devices | No | No, the accepted limit | Yes |
| Workflow can count comments | No | Yes | Yes |
| Rule | Nothing to admit | Passes as above | Fails checks 4 and 5 today |

The step from the middle column to the right one adds a call and leaves `answer` unchanged.

**What the client needs.** To show any basis, the entry's data must carry `text: string`, as `EventData` does. Today a client has an `EntryId` and workflow-shaped JSON (finding 4). With `text`, the client shows it, lets you select, and sends offsets. The workflow renders replies into the next basis `text`.

**Every annotation answered.** W1 keeps it, in `propose_design` at commit 7. The tool reads `w1.work.owes`, loads that decision's annotations, and throws unless `replies` has one `{ annotation: index, how: "done" | "declined", text }` for each. The model gets the error and calls again. The replies are stored in `E2`. The core is not involved.

## 5. What fell short

1. **A crash inside a tool that requests (commits 4, 7, 13, 16).** `docs/core` covers phases and `then` tasks, not tools. Fix: the guide says such a tool is `replay: "safe"` and guards on `api.taskId`. Home: workflow.
2. **No way to drop work that waits on you (after commit 4).** "Withdraw on cancel" assumes a commit that cancels. Fix: the guide says every request offers a way out in `choices`. Home: workflow. A host call that lets a client withdraw fails check 3, since a choice does the job.
3. **`conflict` strands the phone (commit 8).** It returns `D1` and not `D2`. Fix: `conflict` returns the subject's open decision, as `not_open` does. Home: core. Checks: the phone hits it; only `answer` holds both records; both workflows meet it and it is one field.
4. **A client cannot show a basis (commits 4, 22, W2 4).** Fix: the basis entry's data carries `text`, and `request` takes the entry's kind so TypeScript checks it. Home: core. Checks: no workflow-agnostic inbox works without it; pi-durable entries are untyped JSON; it is one field on a shape the core owns.
5. **Annotations.** Section 4. Home: core, with the range on probation.
6. **The answer and the `then` task are two commits (5 and 6, 9 and 10).** Other commits can land between them. Fix: the guide says a `then` task first checks that its decision is still the one the workflow expects. Home: workflow.
7. **The `then` task's ownership is not stated.** Fix: `primitives.md` says it is conversation-owned and not `background`, so `abort()` reaches it. Home: core, text only.
8. **W2 revision leaves a decision open (W2 commit 7).** Fix: `withdraw` in the revising commit, and correct `workflows.md` step 7. Home: workflow.
9. **A closed store never wakes (W2 commit 4).** Fix: the server opens every project at start. Home: host wiring. It settles the open point at `topology.md:84`.
10. **Event has no second reader that needs it (W2 commit 12).** A document serves `calibration` better. Event still stands on the client clause of check 4, but the README's "one W2 tool" is not support. To read the log at all, an extension needs its ID. Fix: export `eventLog(reader): Promise<ConversationId>`. Home: core, one function, or cut reading back until a workflow needs it.
11. **A sentence that describes an illegal order.** `primitives.md` says `request` goes "after it appends the basis entry and before it calls `submit(tx, draft)`". In one commit that order throws. The legal order is `submit`, append, `request`. Fix: the sentence.
12. **A failed `then` task (after 5, 9, 23).** The decision says answered and the work is dead. Fix: the host passes `onReport` to the client, and the decision view shows the state of `continuation`. Home: host wiring.
13. **`stale_basis` is nearly unreachable.** Each ID has one basis, so the status check stops the phone. Keep it against a client bug.
14. **A client cannot name `Ci`.** pi-durable stores no label. Not admitted: W2 has one conversation, so check 4 fails.

## 6. Not verified

- No kill mid-commit. Probe check D closes the Harness, which is not a crash.
- A `replay: "safe"` rerun with the same `api.taskId`, the guard, and `runtime.memo` across a rerun (inferred from `README.md:277`).
- Whether a conversation-owned task that is not `background` delays input to its conversation.
- Any Git command or shell through `ExecutionEnv`.
- `request`, `withdraw`, `answer` and `emit` themselves. The probe uses plain documents shaped like them.
- A second model provider, and annotation offsets in a real client.
- A workflow upgrade with open decisions.
