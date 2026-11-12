# Walk of W1 and W2 through the Render core, one commit at a time

Labels: **m** measured (read or ran), **r** reported, **i** inferred, **g** guess. Paths are under `/tmp/render-ground/pi/packages/durable/` unless named. P1 to P5 are checks in `probe.mjs`, run on pi-durable 1.5.2. "F n" is item n of section 5.

## 1. W1, one commit at a time

| Conversation | Created by | Owner | Role | Tools |
| --- | --- | --- | --- | --- |
| C_d | the host, for the client, with W1's entry role (F6) | none | designer | `read`, `submit_design` |
| C_i | T2, phase `setup` | none | implementer, `cwd` = worktree | coding-tools (`read`, `write`, `edit`, `bash`), `submit_implementation` |
| C_r | T2, phase `setup` | none | reviewer, another model | `show_diff`, `show_file`, `submit_review` |
| L | the core | none, never runs | event log | none |

W1 state is a session document family `w1.change` keyed by k = C_d's ID: stage, approved design, conversation IDs, base, entries, open annotations, and `calls` (tool task ID to result, so a replay-safe tool sees that it already ran). T1 to T3 are `then` tasks that `answer` creates in C_d.

| # | Started by | Reads | Writes, in order | Rerun after a crash |
| --- | --- | --- | --- | --- |
| 1 | client send; host `C_d.submit(input, requestId)` | request ID | submission; run starts | Same `requestId` returns the first submission; only the type is compared (m, `src/harness/submissions.ts:232-239`). |
| 2 | tool `submit_design({text})`, `replay: "safe"` | W1 doc | entry E_v1 {text} in C_d → `request` D1 `w1:design/k#1` (basis E_v1, choices approve/revise/abort, then `w1.design.answered`) → W1 doc → `emit` → result `terminate` | `calls[taskId]` returns D1 without writing. Without it, `request` supersedes D1 (F1). |
| 3 | client inbox | open list (watch); `basis(D1)`: a host commit calling only `tx.entry(E_v1)` | nothing (m, P3) | none |
| 4 | laptop `answer(D1, {basis E_v1, choice revise, annotations: a0 on "prints one JSON array": "Use NDJSON, not one array."; a1 on "Errors": "What happens on a partial write?"})` | decision doc, registry task, `tx.entry(E_v1)` for anchors | `createTask` T1, background (F2) → D1 answered {D1@0, D1@1, by laptop, continuation T1} → open slot cleared | equal retry: `repeated: true`, T1 |
| 5 | T1 `route` | D1 via `decision(tx)` (F3), W1 doc | `C_d.submit(tx, followUp with both comments, requestId D1)` → W1 doc {open: D1@0, D1@1} → terminal | one commit with terminal; `requestId` dedupes |
| 6 | `submit_design({text v2, dispositions for D1@0, D1@1})` | W1 doc, D1 | error result if an open annotation lacks one; else E_v2 {text with responses} → `request` D2 `#2` → W1 doc → emit | as 2 |
| 7 | phone, stale: `answer(D1, {basis E_v1, approve})` | D1 | nothing: `conflict`, returns D1 (revise, laptop) | client rereads the open list, shows D2 |
| 8 | laptop `answer(D2, approve)` | as 4 | T2 → D2 answered | as 4 |
| 9 | T2 `route` | D2 | W1 doc {approved = D2.basis = E_v2} → checkpoint `setup` | atomic |
| 10 | T2 `setup` | W1 doc has no C_i | `createConversation` C_i, C_r → `configure(tx, C_i, Implementer(...))`, same for C_r → W1 doc → checkpoint | Check and create share a commit. `configure` writes only `pi.agent` (m, `src/harness/agent.ts:92-95`, P4). |
| 11 | T2 `base` | `git rev-parse main` via `runtime.env()` | checkpoint {base S0} | read only |
| 12 | T2 `worktree` | `git worktree list`, branches | outside: `git worktree add -b w1/k path(k) S0` → checkpoint | U4 |
| 13 | T2 `kickoff` | W1 doc, E_v2 | `C_i.submit(tx, input, requestId impl:k:1)` → W1 doc → emit → checkpoint `waitImpl` | Not in row 10's commit: `submit(tx)` throws after a table write (m, `src/harness/submissions.ts:76-82`, `src/session/transaction.ts:355-357`, P4). |
| 14 | T2 `waitImpl` | none | checkpoint {entered n+1}, then same draft again (same submission), `wait()` in memory (m, P5) | U1 |
| 15 | implementer: `bash git commit` → S1; `submit_implementation`, replay-safe | clean tree, `HEAD` = S1 above S0; W1 doc | E_i1 {design = doc's `approved`, sha S1, base S0} in C_i → W1 doc → emit → `terminate` | `calls` guard. Interrupted `bash` is not rerun (m, `src/harness/tool.ts:201-224`). |
| 16 | T2 `waitImpl` settles `done` | W1 doc | `C_r.submit(tx, review prompt, requestId review:E_i1)` → W1 doc → checkpoint `waitReview` | atomic |
| 17 | reviewer: `show_diff`, `show_file` at the doc's SHA; `submit_review({fail, findings})` | W1 doc; the SHA comes from the doc, never the model | E_r1 {impl E_i1, sha S1, fail} in C_r → W1 doc → emit | `calls` guard |
| 18 | T2 `waitReview` | E_r1 | `C_i.submit(tx, followUp findings, requestId fix:E_r1)` → W1 doc round 2 → checkpoint `waitImpl` | atomic |
| 19 | rows 14 to 17 again: E_i2 {design E_v2, sha S2}, E_r2 {impl E_i2, sha S2, pass} | | | |
| 20 | T2 `waitReview`, pass; `git diff S0 S2` read first | W1 doc | E_m in C_d {design E_v2, impl E_i2, sha S2, reviews E_r1, E_r2, text with diff} → `request` D3 `w1:merge/k#1` (approve/abort) → W1 doc → emit → terminal | atomic |
| 21 | laptop `answer(D3, approve)` | as 4 | T3 | as 4 |
| 22 | T3 `check` | `tx.entry(E_m)`; `git rev-parse w1/k` | at S2: outside `git worktree remove` (skipped if gone) → E_h {branch, S2} → W1 doc → emit "Merge w1/k at S2" → terminal. Moved: opens `w1:stuck/k` instead. | rechecks git |

**The chain of evidence.**

- **The decision names the approved design entry.** T2 copies `approved` from D2's answered basis, not "latest design". Holds.
- **The implementation names its design,** from the W1 doc, not model arguments. Holds.
- **The review names its SHA.** This **breaks with the obvious tools.** A reviewer with `read` reads the working tree, not S1, and any input to C_i during review can change that tree. Fix: F14.
- **The final basis names design, SHA, and review.** T2 writes it from the doc. Holds.
- **The `then` task checks and does not merge.** Holds. The branch can move after the handover, so the handover names the SHA.

New IDs per request and the stale-answer refusal (row 7) stop a retry or revision from swapping a link.

**U1. The server dies between two commits.** The worst place is inside row 14, T2's wait for the implementer:

- It is the longest gap between two commits of one task, hours long, so most crashes land there.
- Git holds commits the store has not recorded.
- Each crash counts against a task until "a new state the task commits starts the count over" (r, `README.md:216`). A waiting task commits none, so at `restartLimit` (5) it faults, heard only by `onReport` (m, `src/harness/types.ts:667`, `:757`). The implementer may hand off to no one while inbox and timeline stay silent.

Fix: commit a changed checkpoint on entering a wait (row 14), and F9. The other gaps are short and rerun cleanly.

**U2. An agent ends without handing off.** T2's wait settles `done` with the stage unmoved. T2 nudges by follow-up (`requestId nudge:k:round:n`) at most twice, then opens `w1:stuck/k` (retry/abort) quoting the last answer. A run settled `unanswered` (`turn_limit`, `model_error`, `interrupted`) goes straight to stuck. `afterRun` cannot do this: it runs "never after a failure or an abort" (m, `README.md:709`). A designer ending with a question is ordinary chat the inbox never shows (F17).

**U3. The owner aborts while a decision is open.** A client that knows no workflow can only Stop a conversation or `answer`. A Stop on C_d reaches no W1 task (i, F2), so D stays open. So every W1 decision offers "abort". Its `then` phase aborts C_i and C_r through their handles, withdraws any other open W1 subject, removes the worktree but keeps the branch, dismisses open annotations ("work aborted"), and emits. A Stop on C_i settles T2's wait `unanswered`, reason `aborted` (m, `README.md:563`), and T2 opens stuck. `docs/core`'s "withdraw on cancel" assumes a cancel signal the workflow never gets (F10).

**U4. An outside effect runs twice: the worktree.** The path and branch come from k, and the base was committed first (row 11), so a rerun uses the same arguments even if `main` moved. The phase checks before it acts:

- path registered on `w1/k`: skip;
- branch, no worktree (crash mid-`add`): `git worktree prune`, then `add path w1/k`;
- unregistered directory: remove it, continue;
- nothing: `add -b`.

A naive "directory exists" check would pass a broken worktree on (i, untested).

**U5. The client resends an answer after losing the connection.** An equal retry returns `repeated: true` and the same task; the first device stays `by`; one task exists (m, check 7 of `spikes/substrate.mjs`). Equality covers the ordered annotation list, so the client keeps its exact payload until a reply.

## 2. W2, one commit at a time

C_q is Q's root conversation, created by the host with W2's entry role, with no owner. Its only extension, `w2`, gives `record_forecast`, `drop_forecast`, and `calibration`; no shell. The W2 document family `w2.forecast` is keyed by forecast f: `{ latest, open, status, calls }`.

| # | Started by | Reads | Writes, in order | Rerun |
| --- | --- | --- | --- | --- |
| 1 | client send; agent sharpens it: `record_forecast({statement: "2.0.0 on npm before 2027-03-01", p: 0.35, resolveBy, rule})`, replay-safe | W2 doc | F1 {text, f, p, resolveBy, rule} in C_q → `createTask(W2Due, {F1, until}, {ownership: conversation, background: true})` → W2 doc {latest F1} → emit | `calls` guard |
| 2 | W2Due `sleep` | none | `sleepUntil(input.until, {phase: "ask"})` | `until` is in the input, not taken from `now()` |
| 3 | stopped a week; the date passes | | none. Only an open harness knows `wake().at` (m, `src/harness/types.ts:750`, `:775`) | the host must reopen Q (F8) |
| 4 | restart, `resume()`, phase `ask` | W2 doc: latest is F1 | `request` D1 `w2:f#1` (basis F1; yes/no/void/not yet; then `w2.score`) → W2 doc → emit → terminal | atomic. A week's sleep across a closed store woke on reopen (m, check 6). |
| 5 | `answer(D1, "not yet", notes "only an RC")` | | `w2.score` task, background → D1 answered | as W1 row 4 |
| 6 | `w2.score` | D1; latest still F1 | new W2Due {F1, until now + 7d}, background → terminal | atomic |
| 7 | owner: "60%, before April"; `record_forecast({..., f})` | W2 doc | F2 {p 0.6, resolveBy Apr 1} → W2Due {F2} → `withdraw(tx, "w2:f")` if open (F15) → W2 doc latest F2 → emit | `calls` guard |
| 8 | F1's timer wakes | latest F2 ≠ F1 | terminal, nothing else | atomic |
| 9 | F2's timer wakes | latest F2 | `request` D2 `w2:f#2`, basis F2 → emit → terminal | atomic |
| 10 | `answer(D2, "yes")`; `w2.score` runs | D2; `tx.entry(F2)` (p 0.6), a table read before any write | emit `w2.resolved` {text, F2, p 0.6, outcome 1, Brier (0.6 − 1)² = 0.16} → W2 doc → terminal | atomic |
| 11 | `calibration()` | `api.commit`: `eventLog(tx)` (F3), then pages of `tx.scanEntries({conversationId: L})` filtered to `w2.resolved` | nothing | read only |

What W2 shows:

- **Timers must be background and conversation-owned.** A Stop on C_q aborted a plain sleeping task and spared a background one (m, P1). A timer owned by the tool task would hold the call `completing` (m, `README.md:794`). `workflows.md` says neither.
- **Events need a full scan.** `EntryQuery` has no kind filter (m, `src/types.ts:838-846`), and a tool reads another conversation only through `commit` (m, `src/harness/types.ts:251-336`). The report could read W2's own document, so this reader of Event is optional (F16).
- **Q keeps "only a human answers"** with no shell; coding-tools is the only built-in one (m, `src/tools/index.ts:27-36`).

## 3. `role()` on paper

It sits in the standard library beside `prose()`.

```ts
type RoleSpec = {
  model: ModelRef; extensions: readonly Extension[];   // both required
  tools?: readonly ToolRegistration[]; modelTools?: AgentChange["modelTools"];
  thinkingLevel?: ModelThinkingLevel; instructions?: string; cwd?: string; maxTurns?: number;
};
declare function role(spec: RoleSpec): AgentChange; // pure; unset fields become null
```

Inside a commit it does nothing itself. The caller runs `tx.createConversation(...)` (a table write), then `configure(tx, id, role(...))` (a `pi.agent` document write), then records the ID in its own document.

`model` and `extensions` are required because an ownerless conversation "starts empty" (m, `src/harness/agent.ts:204-207`) and an unset selection follows the project default (m, `src/harness/types.ts:632`), which would give the implementer the designer's tools. Unset fields become `null`, so re-applying a role replaces it whole, as Ultimate's `definitionAgent` does (m, `ultimate/lib/agents.ts:172-215`).

```ts
const Designer = (o: W1Options) => role({ model: o.designer, extensions: [W1Designer] }); // createReadTool() + submit_design
const Implementer = (o: W1Options, f: { worktree: string }) =>
  role({ model: o.implementer, extensions: [CodingTools, W1Implementer], cwd: f.worktree, maxTurns: 200 });
const Reviewer = (o: W1Options, f: { worktree: string }) =>
  role({ model: o.reviewer, extensions: [W1Reviewer], cwd: f.worktree, maxTurns: 40 }); // no read, no bash
```

Left out on purpose:

- **Creation, ownership, and idempotency:** the caller's commit.
- **Model login checks and fallback:** Ultimate does them (m, `ultimate/lib/agents.ts:190-196`); here, host wiring.
- **Worktree isolation:** an Ultimate role field (m, `ultimate/lib/agents.ts:36`); here, a workflow choice.
- **The role's name:** pi-durable does not store it.
- **Any permission:** tools check state.

**W2** has one role and creates no conversations, so `role()` gains it nothing.

**Rule for entry to the standard library.**

1. Two call sites in proving workflows.
2. Pure, or work done at module load. No store access, own commits, timers, or state.
3. Uses only public pi-durable and core exports; skipping it costs no guarantee.
4. Names no workflow concept.
5. It goes back out at one caller, or when pi-durable gains it.

A pull-request note naming the call sites replaces the one-page proposal.

## 4. Annotation through the rule

| Check | Result | Evidence |
| --- | --- | --- |
| 1. Real failure | Pass | Row 4 puts two comments on passages; `notes?: string` cannot. Row 6's "deals with both" needs an ID per comment. |
| 2. pi-durable lacks it | Pass | Entries and documents are storage; nothing carries a human comment across the boundary (m, `src/types.ts:460-476`, `:989-1088`). |
| 3. An extension cannot | Pass | I tried JSON inside `notes`. A client that knows no workflow cannot write it, and anchors need a basis format the core defines. |
| 4. Two unlike users | Pass on the client clause only | W2 never annotates. A client that knows no workflow cannot do row 4 without it. |
| 5. Small, no workflow concept | Pass | Offsets, a quote, text. No dispositions. |

**The smallest shape.** Annotations travel in `answer` and are stored on the answered decision.

```ts
type Anchor = { start: number; end: number; quote: string }; // UTF-16 offsets into the basis text
type AnnotationDraft = { anchor?: Anchor; text: string };    // no anchor: the whole basis
```

What changes in `Decision`:

- The draft gains `annotate?: true`, so clients offer comments only where the workflow handles them.
- The answered variant gains ``annotations?: (AnnotationDraft & { id: `${DecisionId}@${number}` })[]``.

What changes in `answer(id, { basis, choice, notes, annotations }, device)`:

- It reads the basis entry before it writes.
- It refuses `annotations_not_accepted`, and `bad_anchor` when an anchor is out of range or its quote differs from `text.slice(start, end)`.
- IDs come from position, so a retry gets the same IDs.
- The "all equal" retry row also compares the ordered list.
- `notes` stays: context that needs no reply. Folding it in would force W2 to answer every "not yet".

It relies on F4: the basis entry's `data.text` is Markdown.

| Option | Atomic with the answer | ID per comment, anchored | Draft moves between devices | Core surface |
| --- | --- | --- | --- | --- |
| Notes only | yes | no | no | none |
| **List stored with the answer** | yes | yes | no (accepted limit) | one field, one flag, two refusals |
| Entries saved before the answer | no | yes | yes | a second client write call, its own retry key, rules for superseded decisions |

Saved entries fail row 7: the stale phone could attach comments to D1 after the laptop answered, leaving orphans. That option fits once the cross-device limit lifts.

**What a client that knows no workflow needs.**

The open list (title, choices, `annotate`); the host read `basis(id)` → `{ text }` (P3); anchors on the raw Markdown, mapped from a rendered selection (g); `answer` with annotations; and `${subject}#${n-1}` to show earlier comments beside the new version. Dispositions arrive inside the next basis text.

**How "every annotation answered" is kept.** All by W1 code. `submit_design` refuses a new version until each open annotation has a disposition (row 6), and copies the dispositions into the new basis text, where the owner sees them. An "approve" with annotations passes them to the implementer, whose `submit_implementation` must dispose of them. Abort dismisses the rest. The core stores annotations and never tracks them.

## 5. What fell short

1. **`request` treats a rerun as a revision** (W1 rows 2, 6). A repeat only happens after the first request landed, by which time `requestedAt`, taken from the clock, has moved. So "every field equal" fails and the decision supersedes itself. `primitives.md` wrongly says this row "makes a repeated phase safe". Fix: leave `requestedAt` out of the equality. **Core:** (1) a replay-safe tool reruns; (2, 3) the core's own rule; (4, 5) both workflows, nothing new.
2. **Whether the `then` task is background is unstated** (W1 rows 4, 14; U3). A non-background task dies on a Stop in its conversation (m, P1), silently cancelling a human's answer or the W1 driver. Fix: `answer` creates it with `background: true`. **Core:** (1, 2) a Stop kills the continuation, and pi-durable gives only the flag; (3) the core's commit creates the task; (4, 5) both workflows, one option.
3. **Extensions cannot read a decision or find the log** (W1 row 5, W2 row 11). Fix: two document reads, `decision(tx, id)` and `eventLog(tx)`. **Core:** (1, 2) a `then` task needs the choice, from the core's documents; (3) the core's record; (4, 5) both workflows, two functions.
4. **A basis has no form a client can show** (W1 row 3). Its `data` is opaque (m, `src/types.ts:468`). Fix: `request` takes the appended record typed `TypedEntry<{ text: string }>`, and the host serves `basis(id)`. **Core:** (1, 2) a client that knows no workflow cannot show a design or forecast; (3) every client reads the same field; (4, 5) both workflows, one field.
5. **Annotations** (W1 row 4). See section 4. **Core.**
6. **The first conversation gets no role** (W1 cast). The host creates it without workflow code, so it selects every installed extension (m, `src/harness/types.ts:632`). Fix: the workflow module gives host wiring an opaque `entry: AgentChange`, applied to each conversation the host creates for a client. **Host wiring.** This closes `primitives.md`'s open point on explicit selections.
7. **Nowhere for per-project workflow options**, such as models per role or the base branch (W1 row 10). Fix: host wiring passes the project's opaque options block to the module, which checks it with pi-schema at load. **Host wiring.**
8. **Opening projects on first use loses timers** (W2 row 3): D1 would wait until the owner touched Q. Fix: record each project's `wake()` in the catalogue via `onWake`, and open due projects at start. **Host wiring.** This settles an open question in `topology.md`.
9. **A faulted workflow task stalls in silence** (U1). A throw or `restartLimit` reaches only `onReport` (m, `src/harness/types.ts:757`), and the graph of live tasks drops it (m, `src/harness/types.ts:944`). Fix: the host emits `render.task_faulted` with one line of text. **Core, host layer:** (1, 2) W1 stalls unseen, and `onReport` is a callback, not a record; (3) no extension hears another task fault; (4, 5) every workflow, one event kind. It ends "the core emits nothing".
10. **Stop is not abort, and the workflow hears neither** (U3). Fix: decisions offer "abort"; the driver turns a Stop into a stuck decision. **Workflow.** Reword "withdraw on cancel".
11. **A run that fails or ends without handing off** (U2). `afterRun` misses failures. Fix: a driver waits on `Submission.wait()` (P5). **Workflow**; a standard library candidate once a second workflow drives agents.
12. **Long waits hit `restartLimit`** (U1). Fix: a changed checkpoint on entering a wait. **Workflow.**
13. **One submission per commit, before any table write** (W1 rows 10, 13), so creating a conversation and sending its first input take two phases. `docs/core` is silent. Fix: the authors' guide says so. **Workflow.**
14. **The reviewer reads the working tree** (the chain). Fix: reviewer tools read git objects at the doc's SHA; no `read` or `bash`. **Workflow.**
15. **A revision leaves a stale decision open** (W2 row 7). `workflows.md` step 7 waits for "the next request", so meanwhile the owner can score F1. Fix: the revising commit withdraws. **Workflow.**
16. **Event's second reader is optional** (W2 row 11). The client clause still carries Event, and item 9 adds a use. **Accepted**, but do not count the W2 tool.
17. **An agent's chat question never reaches the inbox** (U2). **Accepted limit**, for the client.
18. **The guarantee depends on tools as well as environment.** W1's `bash` is the weaker mode; Q has no shell. Word the per-project statement by both. **Accepted limit.**
19. **A client retrying a conversation create gets two.** `createConversation` takes no key (m, `src/harness/types.ts:919`). Fix: the host maps a client key to the conversation in the creating commit. **Core, host layer:** (1, 2) W0's reconnect, and pi-durable has no key; (3) the client boundary; (4, 5) every client, one map.
20. **Upgrades.** A renamed `then` task gives `workflow_not_loaded`. **Accepted limit.**

## 6. Not verified

- No workflow code ran, and no crash hit the middle of a commit. The restart count reset is from `README.md:216` only.
- P1 to P5 used `MemoryStorage`; P5 waited seconds, not hours.
- Two `createConversation` calls in one commit; `git worktree` partial states; mapping a Markdown selection to source offsets; pi-env and remote worktrees; the scan cost of a large log.
- Model behaviour: whether dispositions are honoured and nudges work.
- Citations were read at 1.5.1, whose `dist` is reported identical to 1.5.2.
