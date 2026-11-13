# Extensions as the main unit, and Lane through the rules

**Measured** means I read the line or ran it. E1 to E6 are checks in `probe.mjs` here, run on pi-durable 1.5.2 with SQLite. H1 to H12 are in `docs/core/spikes/host.mjs`. pi-durable paths start at `packages/durable/`.

## 1. The extension model

**An extension** is a pi-durable `Extension`, as today: a name with optional tools, sections, hooks, wraps, and tasks (measured, `src/harness/types.ts:424-433`). The host knows one module per name from its import map: host.md's `WorkflowModule`, renamed `ExtensionModule`, with the same three members, `extension`, an optional `entry`, and optional `options`. The import map is code, so it builds codemode with its sandbox (measured, `src/codemode/codemode.ts:219-221,256-258`). Sandboxing itself is `HarnessOptions.env` in pi-durable, not an `Extension` (measured, `test/examples/28-sandbox-per-conversation.ts:49`), so it will need a module member later.

**A workflow is an extension whose module exports `entry`,** so a client can create a conversation of it. Hence `create` takes only such a name, and a workflow never joins the project default. Decision, Event, tasks, and options stay open to every extension.

**A project selects** one list of extension names: `Project` becomes `{ project, workdir, extensions }`. `coding-tools` is always installed and first, so the list leaves it out. The host builds the project's **default** from the list: `coding-tools`, then each listed extension without `entry` that the server has. It passes the default to the project's harness as `settings.extensions`, through a getter over a list it rebuilds after each commit to `Project`. pi-durable reads settings synchronously at every resolution (measured, `src/harness/types.ts:630-633,719`).

**How an agent gets tools.** A stored array selects exactly those extensions. Anything else starts from `settings.extensions` and applies the stored `{ add, remove }`, skipping names with no code (measured, `src/harness/agent.ts:351-371`).

- The bare agent is created with `{ cwd, model }` and no selection, so it follows the default. In P it gets `read`, `write`, `edit`, `bash`, and `web_search` (measured, E1).
- A workflow's first conversation takes what `entry` says: `{ add: [W1] }`, the default plus the workflow, or an array, exactly what it names.
- A conversation that a workflow creates makes the same choice through `role()`, whose type requires one of the two.

| W1 role | `extensions` | `tools` filter | Offered in P (measured, E1) |
| --- | --- | --- | --- |
| Designer | `{ add: [W1] }` | `{ remove: [write, edit, W1's other roles' tools] }` | `read`, `bash`, `web_search`, `publish_design` |
| Implementer | `{ add: [W1] }` | `{ remove: [W1's other roles' tools] }` | Coding tools, `web_search`, `publish_build` |
| Reviewer | `[W1]` | `[showDiff, showFile, publishReview]` | Those three |

W2 keeps `[W2]`, and W1 never names `websearch`. A new rule for workflow authors: **a role whose promise rests on what it cannot do names its extensions and tools exactly.** The cost is that a role on the default removes its workflow's other tools by name.

**When the project's set grows,** the addition reaches every conversation whose selection is unset or `{ add, remove }`, from its next model request, also inside a working run. The request in flight keeps its tools (measured, E3). An exact array sees nothing (measured, E3, H11). So host.md's "No live work changes" stays true for workflows and becomes false, on purpose, for tool extensions. Nothing is removed, because a task of an uninstalled extension runs on (measured, H12).

**Options and secrets.** Options stay in the extension's own session document through `options()`, whose first parameter becomes the extension's name. The key is an option with a second format that the host knows, `secret`:

```ts
export const WebsearchOptions = options("websearch", obj({
	provider: oneOf(["brave", "exa"]), // the providers it supports
	apiKey: str({ format: "secret", minLength: 1 }),
}));
```

- `options` says that the key is set and never returns it. `setOptions` writes it like any key.
- `web_search` reads it when it runs and puts it in no result, entry, event, or section (measured, E2). It declares `replay: "safe"`, as Ultimate's does (measured, Ultimate `extensions/parallel/server.ts:37-53`).
- `open` never carries a session document (measured, `src/harness/view.ts:78-84`).
- The key is plain text in the store, which an agent's shell can read, an accepted limit already. Ultimate's `secrets.json` has the same exposure (measured, Ultimate `extensions/secrets/README.md:3`).
- It is per project, so Q needs its own. One key for all projects would sit beside the model logins in the server's configuration, which no call sets today.

**Three ways compared.**

| | A. Each conversation names its extensions (today) | B. A project default that a conversation edits | C. An extension turns itself on for every agent |
| --- | --- | --- | --- |
| Designer searches | Only if W1 names `websearch` | Yes, `{ add: [W1] }` | Yes |
| Reviewer cannot search | Yes | Yes, exact array | Only if W1 removes it by name |
| Adding codemode reaches open conversations | Never | Those on the default, next request | All |

**I recommend B.** It is pi-durable's own `settings.extensions` with `{ add, remove }`, so the host adds one getter. A makes every workflow name every tool extension it wants. C gives the project's choice to the extension's author, as Ultimate's core tier does (measured, Ultimate `docs/extensions/places.md:25-28`), and W1 must know `websearch` to keep it from the reviewer.

## 2. The script, steps 1 to 6

| Step | Client calls | Host commits | pi-durable alone, and what the agent can do | Today |
| --- | --- | --- | --- | --- |
| 1 | `extensions`, `bind({ project: "p", workdir, extensions: ["websearch", "w1"] })`, `setOptions` for both, `options` | As host.md: one commit writes `Project`, then install and `resume()`. Default: `coding-tools`, `websearch`. One commit per `setOptions`. | Nothing runs. `options` shows `apiKey` as set. | Cannot: `bind` takes workflows, and `options` would show the key. |
| 2 | `create({ model })`, `input` | Create, then `configure` with `{ cwd, model }` | The bare agent B is offered `web_search`, which reads the key. B searches and answers (measured, E1, E2). | Cannot: B has `coding-tools` only. |
| 3 | `create("w1")`, `input`, answers | Row 0 with the new `entry`. Row 11's `role()` gives R `[W1]`. | D searches. R has no search tool, even if the owner asks it in a chat. | Half: R holds, D cannot search. |
| 4 | `addExtensions(["codemode"])` | One commit on `Project`, `registry.install`, default rebuilt | From each one's next request, B and D get `codemode` and its section. The request in flight does not (measured, E3). R never. I from its creation. | Cannot: no call, and an install reaches no exact list (H11). |
| 5 | `input` to F. Later in Q: `addExtensions(["websearch"])`, `setOptions` | As step 4, in Q | F's stored array is `[W2]`: no search, before or after. A bare conversation in Q can search. | The same answer |
| 6 | Reconnect, `projects` | None. At start the host installs what it has, builds defaults without `websearch`, and reports it missing. | Selections unchanged. `web_search` is not offered, a call to it gets an error result, and options and key stay stored (measured, E4). Search returns with the code. | Start reads "each listed workflow". |

- **Step 5.** No call changes a conversation's selection, and none should, because the role owns its tools (host.md, `setModel`). If W2's `entry` took `{ add: [W2] }`, only later conversations would search, because F's selection is stored (measured, `src/harness/agent.ts:92-95`).
- **Step 6.** A call that the restart cut off finds no tool, and ends `tool_unavailable` before its intent or "interrupted" after it (measured, `src/harness/tool.ts:152-155,205-222`). `websearch` has no tasks, so nothing waits.

## 3. Lane through the rules

A lane is one long-running conversation per role and project that keeps its history in its transcript and summaries and hands work to worker conversations.

**As a core part, it fails all five checks.**

1. A real failure: fail. Nothing in the walk fails without one. It promises better briefs, which nothing has measured.
2. Not in pi-durable: fail. `test/examples/22-subagent-background.ts:62-127` is a conversation with named, persistent subagents that report back (measured). Ultimate's standing agents are an extension (measured, Ultimate `extensions/subagents/README.md:125`).
3. An extension cannot keep the promise: fail. It guards no act at the client boundary. A client shows it as a conversation.
4. Two unlike users: fail. Only W1's implementer.
5. A small shape: fail. Hearing back needs a task that waits and reports (`22-subagent-background.ts:80-127`), which is a loop.

**As a library helper, it fails two of four.**

1. Callers today: fail. No proving workflow has a lane.
2. No guarantee: pass. pi-durable calls only.
3. No stored name: fail. The report back needs a task under a name, and check 3 allows only a document. What would pass, "find or create the role's conversation", is `role()` and a document read.
4. No workflow concept: pass. A long-running role is a way to define roles.

| | Core | Library | W1 builds it alone | No lane: fresh workers and notes |
| --- | --- | --- | --- | --- |
| The rules | Fails all five | Fails 1 and 3 | Nothing shared | Nothing shared |
| Knowledge | Transcript and summary | Same | Same | W1's `notes` option and `w1.lessons` |
| Step 8 | One queue | Same | Same | No queue |
| Requests per hand-over | Two or more, at the lane's size | Same | Same | None |
| A wrong belief | Tell it, or replace it | Same | Same | Edit the notes |

**I recommend no lane, for now.** The checks leave only "a workflow builds this itself". Section 4 shows why W1 should not build one yet: two or more large requests per hand-over, one queue for two items, and knowledge that a summarizing model decides to keep. The owner's goal is work you can check after you leave, and a lane's knowledge is the part of W1 you cannot read in one place.

The smallest shape, inside W1:

1. A W1 option, `notes: str({ default: "" })`, holds the owner's standing instructions to implementers.
2. A W1 session document, `w1.lessons`, holds the IDs of P's newest 20 failed review entries. `publish_review` appends one in row 13.
3. Rows 10 and 14 add the notes and those reviews' findings to the implementer's input. Both are stored data, so a rerun sends the same input.

It adds no conversation, task, or model request. The verdict changes with a second workflow that needs a long-running role, or a measured case where fresh workers with notes repeat a mistake a lane would avoid.

## 4. The script, steps 7 to 12

The script needs a lane, so this walks the smallest one W1 can build alone, in walk.md's order: table reads, at most one `submit(tx, draft)`, then table writes. On a rerun a task phase runs again unless its commit landed, and each submit reuses a stored `requestId`, which returns the first submission. `dispatch_build` declares `replay: "safe"` and keeps a receipt under `api.taskId`. Every conversation is ownerless.

| Name | Created by | Tools |
| --- | --- | --- |
| D1, D2, D3: designers of k1 to k3 | The host, with `entry` | As in section 1, and `codemode` |
| L: the implementer lane, in P's directory | `w1.to_lane`, with `role()` | Exactly `read` and `dispatch_build` |
| I1, I2: workers, each in its item's worktree | `dispatch_build`, with `role()` | The implementer's, and `codemode` |
| Rv1, Rv2: reviewers | `publish_build`, with `role()` | The reviewer's three |

W1 adds a document `w1.lane` = `{ conversation, generation }`, an option `lane: int({ minimum: 1, default: 1 })`, and a task `w1.to_lane`, the only code that submits to L. The task is `background` in the item's designer, with two phases, because creating L is a table write and a submit must come first (measured, P4).

| Row | Started by | Reads | Writes, in order |
| --- | --- | --- | --- |
| 7.1 | `w1.prepare`, after row 9's worktree check | `Work` | `createTask` `w1.to_lane { k1, cause: A2 }` → `Work` → terminal |
| 7.2 | `w1.to_lane`, phase 1 | `w1.lane`, options | With no lane, or a generation below the `lane` option: `role()` creates L → `w1.lane`. Then the checkpoint. |
| 7.3 | `w1.to_lane`, phase 2 | `Work`, the cause, options | `configure(L, { model })` → `L.submit(input, requestId: cause)`, a follow-up → `Work` → `emit` naming L → terminal. The input is V2's text for A2, R1's findings for R1, and the handover for J1. |
| 7.4 | L's run calls `dispatch_build({ item: k1, brief })`, commit 1 | Receipt, `Work`, `w1.lane` | It refuses unless L is the current lane and k1 waits for it. If `Work` names no worker: `role()` creates I1 → `Work` → receipt. |
| 7.5 | `dispatch_build`, commit 2 | Receipt, `Work`, V2 | `configure(I1, { model })` → `I1.submit(input, requestId: dispatch:<taskId>)` with V2's text, the owed annotations, then the brief → `Work` → receipt → `emit` naming I1. L's run ends. |
| 7.6 | G1 to row 18 of walk.md, with I1 and Rv1 | | The review passes. The owner approves J1. |
| 7.7 | H, row 19 | As row 19 | Row 19's writes, then `createTask` `w1.to_lane { k1, cause: J1 }`, which costs one lane run |
| 8.1 | k2's `w1.prepare` | | As 7.1 to 7.5. Row 7.2 finds L, and 7.4 creates I2. |
| 8.2 | k1's `publish_review`, a fail | `Work` | R1 → `Work` → `createTask` `w1.fix_start` → `emit` |
| 8.3 | `w1.fix_start` | `Work`, R1 | `createTask` `w1.to_lane { k1, cause: R1 }` → `Work` → `emit` → terminal. L is in k2's run, so R1's input queues until that run answers (measured, `README.md:541-542`, E5). |
| 8.4 | L's next run, for k1 | | `dispatch_build({ item: k1 })`. `Work` names I1, so 7.5 sends the fix to I1, which keeps k1's context. Rows 15 to 19 follow. |
| 9.1 | pi-durable | | A `pi.compaction` task appends a summary entry whose `head` is the first kept entry (measured, `README.md:608-630`). No W1 commit. |
| 9.2 | k3's `w1.prepare`, a week later | | As 7.1 to 7.3. L's next request holds the system prompt, the summary, about 20,000 recent tokens, and k3's input. |
| 10.1 | L's run for k3 fails on a model error while I2 runs. | | The run ends `unanswered` with `runFailure` (measured, H8), and `afterRun` does not fire. k3 waits. I2 runs on. |
| 10.2 | The server restarts. | | `running` tasks go back to `pending`. I2's cut-off request is sent again (measured, `README.md:216`). L stays failed. Nothing reaches the inbox. |
| 10.3 | k2's handover, 7.7 for k2 | | Its report starts a run in L, which clears `runFailure`. If the model dispatches k3, it moves. If not, k3 waits, and `conversations` no longer shows L as failed. |
| 11.1 | `open` L, then `input` "Stop using the old serializer everywhere." | | L is idle, so a run starts at L's full context. A user entry in L. No W1 commit. |
| 12.1 | `setOptions("w1", { lane: 2 })` | | One host commit |
| 12.2 | The next `w1.to_lane`, phase 1 | `w1.lane`, options | 1 is below 2: `role()` creates Lb → `w1.lane` = `{ Lb, 2 }` → checkpoint. |
| 12.3 | Phase 2 | Every `Work` | As 7.3, opening with each item's stage, design, SHAs, and verdicts, and any item that waits for L |

- **Step 8.** Step 7 passed k1's first review, so step 8, which fails it, is the other branch. I1 and I2 work at once. L's runs are the only queue.
- **Step 9.** L knows of k1 and k2 what the summary kept. The rest is where L cannot read it: its old entries, `Work`, other conversations' entries, and Git.
- **Step 10.** Row 10.3 needs W1's `afterRun` check (walk.md row E2) on L: after a run that answers, an item still waiting for L with its input settled gets a decision on `w1:${k}:stuck`. Row 10.1 stays uncovered, because a failed run fires no hook. The owner finds L through `conversations`.
- **Step 11.** It reaches only later briefs, while L keeps it. The summary has a "Constraints & Preferences" heading (measured, `src/harness/compaction.ts:85-87`), so it likely survives (inferred). I2 is not told. Handed-over code is unchanged, and "everywhere" needs a new W1 item, which L cannot start. Under the recommended shape this is one `setOptions("w1", { notes })`.
- **Step 12.** Lb knows only its opening. L stays readable, and `dispatch_build` refuses its calls. What L got right is lost too.

**The chain of evidence holds.** I1's input carries V2's text from the entry, not L's retelling (7.5). The build entry names V2 from `Work` and the SHA from Git, and `publish_build` never reads the brief. The review, M, J1, and H are unchanged. The lane adds a brief that no decision covers. A wrong brief fails review where V2 speaks, and passes where V2 is silent, as on the serializer.

## 5. What a lane knows, and what it costs

**Where its knowledge lives.** The transcript keeps every entry after a compaction (measured, `README.md:608`, E6), but the model sees only the active context, and L cannot read its history. The `pi.compaction` summary is all it sees of the past. No document holds it unless W1 writes one. A `beforeCompact` hook can supply the summary from W1's records with no model request (measured, `src/harness/compaction.ts:142-147`, E6). The lane's memory is then W1's stored data, which is the recommended shape plus a conversation.

**What compaction keeps and loses.** By default it keeps about 20,000 recent tokens verbatim and a summary of at most about 13,100 tokens, 0.8 of `reserveTokens` (measured, `src/harness/agent.ts:29-34`, `compaction.ts:153-156`). The summary has fixed headings: Goal, Constraints & Preferences, Progress, Key Decisions, Next Steps, and Critical Context (measured, `compaction.ts:78-109`). Its input drops thinking and system messages and cuts each tool result to 2,000 characters (measured, `compaction.ts:67-68,399-402`). Each compaction folds the last summary into the next (measured, `compaction.ts:78`). k1's findings last only while every summary keeps them. The owner's premise, a lane that "becomes always more accurate", is not what this does. It keeps an aging summary and a fixed window.

**One run at a time.** Follow-ups queue and start one run each (measured, `README.md:542,559`, `agent.ts:83`, E5). A steer would put two items in one run.

**What a dispatch costs.** Without a lane, row 10 submits with no model request. With one, a dispatch is at least two requests, the tool call and the answer after it, and each report back one more, all carrying L's whole context. k1 with one fix round costs five or more. E5 used four requests for three short inputs (measured).

**When the lane is wrong.** Its beliefs show only in its briefs and answers. No decision, event, or check reads a brief, and review catches one only where the design speaks. The owner finds out by reading briefs or code, then tells it, which a later compaction may shrink, or replaces it and loses the rest.

## 6. What changes in `docs/core`

1. **README.md.** A project selects extensions. A workflow is an extension whose module exports `entry`. Docs. Proposed.
2. **README.md, the admission rule.** Check 4 becomes: "**Two unlike users.** Two extensions that do different jobs use it with the same meaning, or a client that knows no extension cannot work without it. A repair to the server's safety is the one exception." Core rule. Proposed.
3. **host.md, selecting extensions.** `ExtensionModule` and `Project.extensions`. The calls that change: `workflows` becomes `extensions`, which also says which are workflows. `bind` takes `extensions`. `addWorkflows` becomes `addExtensions` and rebuilds the default. `projects` lists extensions and those the server lacks. `options` and `setOptions` name an extension. `create` refuses a name without `entry` with `not_a_workflow`, and gives the bare agent `{ cwd, model }`. Host wiring. Proposed.
   - Checks 1 and 2: step 1 cannot bind `websearch`, and pi-durable has no project.
   - Checks 3 and 4: only the host fills a project's registry, for `websearch`, W1, and any client.
   - Check 5: one list in an existing document, and renamed calls.
4. **host.md and primitives.md, the default.** `settings.extensions` per project. It replaces the Decided line "A bare conversation selects `coding-tools` only", so the owner must agree. Host wiring. Proposed.
   - Checks 1 and 2: steps 2 and 3 cannot search, and pi-durable has the mechanism (`src/harness/agent.ts:351-371`), which the core only feeds.
   - Checks 3 and 4: only the host opens a harness, and the bare agent and W1's designer use it.
   - Check 5: one getter.
5. **host.md, the `secret` format.** Host wiring. Proposed.
   - Checks 1 and 2: in step 1 `options` would show the key everywhere, and pi-schema checks a format only with its caller's function (measured, `packages/schema/src/types.ts:9-19`).
   - Checks 3 and 4: only the host answers `options`. It passes on the client clause only, since only `websearch` has a key.
   - Check 5: one format name.
6. **primitives.md.** `workflow_not_loaded` becomes `extension_not_loaded`. Core. A rename, so `answer`'s checks stand. Proposed.
7. **library.md.** `options(extension, schema)`, and `role()` takes `{ add }`. Library. Proposed. Both pass the four checks: callers in W1, W2, and `web_search`, and W1 rows 9 and 11. No guarantee. They write only their caller's `<extension>.options`, and `pi.agent`. No workflow concept. A lane helper fails checks 1 and 3 (section 3).
8. **workflows.md and walk.md.** W1's roles, the rule on exact lists, `websearch`, and the notes shape. Workflow. Proposed.
9. **README.md, "Accepted limits".** No extension is removed. A secret is plain text in the store. The owner cannot add a tool to a role. Accepted limit. Proposed.
10. **README.md, "Open questions".** Lane: a workflow builds it itself. Sandboxing needs a module member for `env`. Docs. Proposed.

## 7. Not verified

- E1 to E6 used stand-in extensions, a faux model, and no provider or sandbox.
- No process was killed, so a `web_search` call cut off by a restart was read, not run. The `secret` format did not run through pi-schema.
- No lane row ran beyond E5 and E6. The `afterRun` check on L was read, not run.
- No real model summarized. Prompt caching and the getter with many projects were not measured.
