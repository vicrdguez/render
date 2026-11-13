# Extensions as the main unit, and Lane through the rules

Candidate 3. Paper design, no Tau code. pi-durable paths start at `packages/durable/`. X1 to X11 are the checks of `probe.mjs` in this directory, run on pi-durable 1.5.2 with SQLite files. Its host and workflow parts are stand-ins.

## 1. The extension model

**An extension is a module in the host's import map.** It is today's `WorkflowModule`, renamed.

```ts
type ExtensionModule = {
	readonly extension: Extension;
	readonly options?: { schema; get(tx); set(tx, value) };
	readonly entry?: AgentChange | ((tx: Tx) => Promise<AgentChange>); // only a workflow has it
};
```

The host knows an extension's name, its options contract, and whether it has `entry`.

**A workflow is an extension that owns conversations.** Its module exports `entry`, so a client can create a conversation of it, and it creates the others itself. Every other extension adds tools, sections, hooks, or tasks to conversations that someone else owns. So `create` names only a workflow.

**A project selects extension names.** `Project.extensions` replaces `Project.workflows`.

### How an agent gets an extension's tools

| | A. Exact names on each conversation (today) | B. A project default that a conversation edits | C. An extension is on for every agent |
| --- | --- | --- | --- |
| The bare agent and W1's designer search | The host copies the project's list, and W1 names `websearch` | Both follow the default | Yes |
| W1's reviewer cannot search | Yes | Yes, with an exact array | No, unless a role can opt out, and then C is B |
| `codemode` arrives during work | Nobody gets it without a new call for each conversation | Each follower of the default gets it at its next model request | Everyone, the reviewer too |

**B is the design.** The owner decides for the project, and a role decides for itself. pi-durable has both forms: a stored array selects exactly, and a stored object edits the host's default (measured, `src/harness/types.ts:467-468,632-633`, `src/harness/agent.ts:352-371`). It has no part for C, because a stored array beats any default (measured, `src/harness/agent.ts:358`).

The host passes `settings.extensions` as a getter, and pi-durable reads settings at every use (measured, `README.md:408`, `src/harness/harness.ts:204-206`). The default is `coding-tools`, then the project's extensions that are not workflows.

- **The bare agent** stores a model and a `cwd`, and no selection (measured, X1).
- **A workflow's first conversation** gets `entry`. An exact array there shuts the default out. `{ add: [W1] }` takes the default and W1 (measured, X1).
- **A conversation that a workflow creates** gets the same choice through `role()`. W1's designer becomes `extensions: { add: [W1] }` with `tools: { remove: [write, edit, publishBuild, showDiff, showFile, publishReview] }`, because a `tools` array would filter every selected extension (measured, `src/harness/agent.ts:338-349`). The reviewer keeps its exact lists.

**B replaces a Decided line.** `primitives.md` has the bare agent select `coding-tools` only, and it counts a project change that reaches running work as a failure. Steps 2 and 4 need both to change, and I think the line was wrong for tools. The walk's finding stays closed, because the default holds no workflow.

### What a running conversation sees when the project's set changes

- **An extension is added.** The host commits `Project` and installs it. A conversation that follows the default is offered the new tools from its next model request, also inside a working run. A `pi.system` entry records from when (measured, `README.md:378,402`, X2).
- **A conversation with an exact array sees nothing** (measured, X2). A new workflow stays out of the default.
- **Nothing is removed,** as ruling 22 says for workflows. I think that is stricter than an extension without tasks needs (measured, X4).

`codemode` brings a hazard. Its scripts make nested calls, and each ignores `executionMode` (measured, `src/harness/types.ts:324`, X5). The walk fixes a build's SHA with a `sequential` tool. So W1's publishing tools also declare `callers: ["model"]` (measured, `src/harness/types.ts:372-376`, X5).

### Options and secrets

`websearch` exports `options` as W1 does: `options("websearch", obj({ provider: str(), apiKey: str({ format: "secret" }) }))`. The values are the session document `websearch.options` in the project's store, and the tool reads it in each call. No call refuses a tool extension with an unset option. Its tool returns an error result that says so (measured with a stand-in, X3).

Three homes for the key were weighed.

- **The server's environment.** No client can set it, and `bash` passes it to every command (measured, `src/tools/bash.ts:84-86`).
- **A secrets file of the host for all projects,** as Ultimate has (reported, `ultimate/extensions/secrets/README.md:3`). It needs a store, two calls, and a module member.
- **The options document.** It needs one format name, `secret`, beside `model`. This is the design.

`options` and `setOptions` return `true` for a `secret` key and never its value. The key is plain text in the project's SQLite file, where an agent's shell can read it, as the first accepted limit says. The key is per project. I think the server is the better home once two projects share an account. Ruling 15 and step 1 point at the project, so the design follows them.

## 2. The script, steps 1 to 6

| Step | The client calls | The host commits | pi-durable does alone | The agent can then |
| --- | --- | --- | --- | --- |
| 1 | `extensions`, `bind(p, workdir, ["websearch", "w1"])`, `setOptions` twice | `Project`, then install and `resume()`. One commit for each `setOptions`. | Nothing | Nothing yet |
| 2 | `create(p, { model })`, `input` | `tx.createConversation`, then `configure(tx, id, { cwd, model })` | It resolves the default at each request. | Use the coding tools and search (measured, X1) |
| 3 | `create(p, "w1")`, `input` | W1 row 0 with the open `entry`. Row 11 later creates R with exact lists. | It offers D `read`, `bash`, `publish_design`, and `web_search`. | D searches, and its transcript holds no key (measured, X2). R cannot. |
| 4 | `addExtensions(p, ["codemode"])` | One commit on `Project`, then `registry.install()` | It offers `codemode` from the next request of D's working run (measured, X2). | D and the bare agent run scripts. R never does. |
| 5 | `bind` and `create` for Q with `w2`, then `input`. Later `addExtensions(q, ["websearch"])` and `setOptions`. | As steps 1 and 3. Later a `Project` commit, an install, and an options commit. | It ends F's `web_search` call as `tool_unavailable`, and the run goes on (measured, `src/harness/tool.ts:152-156`, X3). | F cannot search, before the add or after it. A bare conversation in Q can, once the key is set (measured, X3). |
| 6 | `projects` | None | It skips a stored name that has no code (measured, `src/harness/agent.ts:366-369`, X4). | Everything but search |

- **Step 5.** F is closed because W2's `entry` is an exact array. W2's author opens it with `{ add: [W2], remove: [CodingTools] }`, for new conversations only. The owner cannot open a closed role from a client. That is the cost of B, and the right default for a role whose tools are evidence.
- **Step 6.** Both projects open and no work stops. `projects` reports `websearch` as missing, and no task waits, because `websearch` has none. `websearch.options` keeps its key. When the code returns, so do the tool and its options (measured, X4).
- **Today's `docs/core` cannot do steps 1 to 4, or the add in step 5.** `bind` takes workflows only, the bare agent and the designer have fixed lists, and `host.md` says of an add that "No live work changes".

## 3. Lane through the rules

A lane is one long-running conversation for a role. It keeps the project's history and hands the work to other agents.

**As a core primitive, by the five checks:**

| Check | Result | Evidence |
| --- | --- | --- |
| 1. A real failure | Pass, narrowly | No row of the walk fails, because W1 has one work item. With a second, the steer "Use the existing serializer" (`host.md`, step 4) ends with item 1's implementer. That a lane hands work over better has no run behind it. |
| 2. pi-durable does not provide it | Fail | It provides each part: a lasting conversation, compaction (measured, `README.md:608`), a tool that submits to another conversation in its own commit (measured, `src/harness/types.ts:160-170`, X6), and an example of persistent subagents (measured, `test/examples/22-subagent-background.ts:1-4`). |
| 3. An extension cannot keep the promise | Fail | A lane guards no boundary, and a client reads it with `open` and `input`. X6 to X11 built one as an extension. Ultimate ships standing agents as one (reported, `ultimate/extensions/subagents/README.md:125`). |
| 4. Two unlike users | Fail | W1 only. W2 creates no conversation, and no client must tell a lane from a conversation. |
| 5. A small shape that names no workflow concept | Fail | A lane that dispatches is a queue and a loop. "Worker" and "brief" are workflow concepts. Without them it is `role()` and a document. |

**As a library helper, by the four checks:**

1. **It has callers today.** Fail. No row of W1 or W2 calls it.
2. **It adds no guarantee.** Pass. Section 4 uses public pi-durable calls only.
3. **It owns no stored name.** Fail. The Decided clause covers a document, and a lane also needs a tool and an entry kind.
4. **It names no workflow concept.** Fail for the dispatch, as core check 5.

**The four options:**

- **A core primitive.** It fails checks 2 to 5.
- **A library helper beside `role()`.** It fails checks 1 and 3. A helper that passes is four lines of find-or-create.
- **A pattern that W1 builds, with nothing shared.** One conversation, one document, three tools, and one section. A dispatch costs at least two model requests (measured, X6).
- **No lane.** Fresh workers read a notes document through a section. A dispatch costs no model request, and the owner gives a standing instruction to any worker that has `note`.

**I recommend the third. The answer for the core is "no", and for the library "not yet".** A helper can enter the library when a second call site exists, and then as find-or-create only.

The smallest shape is a conversation N, a session document `w1.lane`, and a section `w1_notes`. The document holds N's ID, the notes, one line for each item that was handed over, and the items that wait for a dispatch. The section renders the notes and the lines into every request of N and of each worker.

The fourth option is this shape without N and `dispatch`. The document carries everything that must outlast a context. N adds a brief written by a model that saw the recent work, and one place where the owner talks to the role. W1 should keep N only if a run of the same items shows that the briefs do better than the notes alone. No such run exists.

## 4. The script, steps 7 to 12

Every conversation is ownerless. The designers and the reviewers are as in `walk.md`, one for each work item.

- **N, the lane.** `w1.prepare` of the first item creates it with `role()`, on the implementer's model. Its exact tools are `read`, `bash`, `dispatch`, `note`, and `fresh`.
- **I1, I2, I3, the workers.** `w1.prepare` of each item creates one with `role()`, in the item's worktree. The tools are the implementer's, as in `walk.md`.

No task of the lane owns a worker. A task-owned conversation starts as a copy of its owner's agent (measured, `src/harness/agent.ts:209-215`), and a Stop in N would abort it.

In the rows, `k` is a work item, V its accepted design, and A the decision that approved V.

| Row | Started by | Reads | Writes, in order | A rerun |
| --- | --- | --- | --- | --- |
| 9a | `w1.prepare`, phase 1 | `Work`, the options, `w1.lane` | `role()` creates I → `role()` creates N, if `w1.lane` names none → `Work`, `w1.lane` → checkpoint | It finds both IDs. |
| 10a | `w1.prepare`, phase 2 | `Work`, V, the options | `configure(tx, N, { model })` → `N.submit(input, requestId: A)`, with the item's title and V's text → `Work` set to briefing, and `w1.lane` lists `k` as waiting → `emit`, which names N → terminal | It gets the first submission back. |
| L1 | `dispatch({ work, brief })`, called by the lane | `Work`, `w1.lane`, V | It requires that `k` waits. `I.submit(input, requestId: A)`, with V's text and then the brief → entry K `{ text, work, design: V }` in N → `Work` set to building, with K → `w1.lane` and the receipt → `emit`, which names I | It returns the receipt. A second call for `k` finds "building" and refuses. |
| N1 | `note({ add })` or `note({ drop })`, called by the lane | `w1.lane` | `w1.lane` and the receipt → `emit` | It returns the receipt. |
| F1 | `fresh()`, called by the lane | | `emit`. The result carries `control: { handoff, terminate: true }`, and pi-durable appends the reset. | A second reset changes nothing. |

Row 11 of `walk.md` adds `brief: K` to B. Rows 13 and 17 start with `N.submit(write, requestId: R)`, an entry that holds the verdict and the findings as a model message. Row 19 adds the item's line to `w1.lane`.

L1 ran as one commit, with its read of an entry in another conversation (measured, X6). `dispatch` is `replay: "safe"`, `sequential`, and `callers: ["model"]`. The brief is stored in the lane's tool call and again in K, so the worker's input is built from stored data.

**Step 7.** Rows 9a, 10a, and L1 replace rows 9 and 10. Rows 11 to 19 run as in `walk.md`. The lane gets the verdict as a `write`, which starts no run and costs no model request (measured, X7).

**Step 8.** Item 2 runs rows 9a, 10a, and L1 while item 1 is in review. Item 1's review then fails, and row 14 of `walk.md` sends the findings to I1, not to N. The two items need different conversations, so neither waits. The report on item 1 is placed inside N's run for item 2, as the newest message that the lane's model reads (measured, X7).

**Step 9.** Compaction is pi-durable's own task and no W1 row. Section 5 says what N knows when item 3 arrives.

**Step 10.** The lane's run ends `unanswered` with `runFailure: model_error`, and no `afterRun` hook fires (measured, `src/harness/types.ts:1018-1025`, X9). The worker runs on, and after the restart its cut-off tool call gets an error result. N still shows the failure, and an item that waited is still at "briefing". The owner finds N as failed in `conversations` and sends `continue`, and the lane dispatches (measured, X9, with a clean close and no kill). As in `walk.md`, a failed run opens no decision, and here it holds an item before any worker starts.

**Step 11.** The owner calls `open` and `input` on N, and the lane calls `note`, row N1. From its next model request, each running worker has the note as a prompt section (measured, X8). If the lane's model does not call `note`, nothing durable happened.

**Step 12.** If the wrong knowledge is a note, the owner asks the lane to drop it. If it is in the context, the owner asks for `fresh`, row F1. The same conversation starts a new context, every entry stays stored, and the notes are in the next request (measured, X11). Both ways need a model that runs in N.

**The chain of evidence holds, with one more named input.** B now names V, the SHA, and K. The worker's input was V's text and K's text, and both are entries. The lane writes no entry of the chain but K, and no tool takes a SHA or a verdict from it. The brief and the notes steered the build, and the owner approved neither. The owner can read both, because B names K and each note is an event. A lane that does not dispatch holds every item at "briefing".

## 5. What a lane knows, and what it costs

**What compaction keeps and loses:**

- The model sees the summary and about `keepRecentTokens` of the newest messages, 20,000 by default (measured, `src/harness/agent.ts:29-34`).
- The summary is at most `0.8 × reserveTokens` tokens, or the model's output limit if that is lower. The request asked for 13,107 with the defaults (measured, `src/harness/compaction.ts:153-156`, X10).
- The summarizer sees each tool result cut to 2,000 characters and no system message, so no notes (measured, `src/harness/compaction.ts:68,399-402`, X10).
- Each later compaction folds the earlier summary into a new one (measured, `src/harness/compaction.ts:78`). The lane's memory of item 1 is then a summary of a summary.

**After step 9 the lane's knowledge of items 1 and 2 lives in three places.** The document `w1.lane` holds their lines and the notes exactly, and the section renders it into the next request (measured, X10). The summary holds what the summarizer kept, which nobody reviewed. The transcript holds every brief and report as stored entries that the model no longer sees (measured, `README.md:608`, X10). The week changes nothing in the store.

The owner expects a lane to become "always more accurate". pi-durable's compaction does not give a transcript that property. Only what reaches the document is kept exactly. Ultimate's project memory is also a document, of up to 150 entries (reported, `ultimate/extensions/lineage/README.md:55`).

**One conversation runs one thing at a time.** A second input queues and gets a run of its own (measured, `README.md:542`, X7). For two work items that means serial dispatches and parallel builds, as long as N never waits for a worker. When a run fails, the inputs queued behind it stay queued until the next input or a `continue` (measured, `README.md:561`).

**What a dispatch costs.** At least two model requests on the lane, one that returns the call and one that ends the run (measured, X6). Each `read` or `bash` round adds one. Each request carries the lane's context, which grows until `contextWindow - reserveTokens` (measured, `README.md:627`). Fresh workers that read the notes cost none of this.

**When the lane is wrong.** A wrong note is visible, because it is an event and rendered text. A wrong belief in the summary is not. It shows first in a brief, and K is an entry that the owner can read in N. Nothing checks a brief before the worker starts. The review catches a build that left the design, after the build is paid for. W1 could request a decision on K, at the cost of one answer for each item.

## 6. What changes in `docs/core`

1. **`README.md`, "The shared understanding" and the decision log.** The extension is the unit, and a workflow is an extension whose module exports `entry`. Docs. Decided by ruling 23, and the `entry` test is Proposed.
2. **`README.md`, check 4.** "Two workflows that differ" becomes "Two extensions that differ", and "a client that knows no workflow" becomes "a client that knows no extension". W1 and W2 still differ, and two search providers do not. The rule. Proposed.
3. **`README.md`, the table of parts and the accepted limits.** Lane is out, and a workflow builds it. New limits: a secret is plain text in the store, no extension is removed, and a client cannot open a closed role. Docs. Proposed.
4. **`host.md`, the calls and names.** `workflows` becomes `extensions`, and it also says whether `create` accepts each name. `bind` takes `extensions`. `addWorkflows` becomes `addExtensions`. `projects`, `options`, and `setOptions` name extensions, and the last two hide a `secret`. `WorkflowModule` becomes `ExtensionModule`, and `Project.workflows` becomes `Project.extensions`. The other fourteen calls do not change. Host wiring. Proposed.
5. **`host.md`, "Adding a workflow", and `primitives.md`, "The host sets what a new conversation selects".** The host passes `settings.extensions`, the bare agent stores no selection, and "No live work changes" gives way to section 1. Host wiring. Proposed. It replaces a Decided line.
6. **`host.md`, "What the host knows".** The format `secret`. Core, host layer. Proposed.
7. **`library.md`.** `role()` takes `extensions` as an exact array or as `{ add, remove }`. The first parameter of `options()` is an extension's name. Lane is not added. Library. Proposed.
8. **`workflows.md`.** W0 follows the project default. Three rules for authors are new: a role whose tools are evidence takes exact lists, a tool that publishes declares `callers: ["model"]`, and an extension keeps a secret out of results, sections, and events. Workflow. Proposed.
9. **`walk.md`.** A new section holds section 4 as a variant of W1, and rows 9 and 10 stay until a run compares the lane with the notes alone. Workflow. Proposed.
10. **`topology.md`.** "Workflows" becomes "extensions" where it means what a project selects. Docs.

**The project default, change 5:**

- **Checks 1 and 2.** The bare agent cannot search in step 2. pi-durable has the setting and does not choose its value.
- **Checks 3 and 4.** Only the host passes a harness its settings. The bare agent, W1's designer, and `websearch` depend on it.
- **Check 5.** One getter over a document that the host owns.

**The `secret` format, change 6:**

- **Checks 1 and 2.** After step 1 the `options` call returns the API key to every device that asks. pi-durable knows no secret.
- **Checks 3 and 4.** The reply to a client is the host's. Check 4 passes on the client clause only.
- **Check 5.** One format name. No vault and no new call.

**The renames, change 4,** add no shape.

**`role()` and `options()`, by the four checks.** The callers of `role()` are W1's `entry` and rows 9 and 11. The wider type adds no guarantee, stores nothing, and names no role. `options()` gains `websearch` as a caller.

## 7. Not verified

- No Tau code exists. `probe.mjs` used stand-ins for the host, both workflows, `websearch`, and `codemode`, and it called no search provider.
- X4 and X9 closed the store cleanly, and nothing was killed. A `web_search` call that a restart cuts off was not run.
- X10 ran a manual compaction with a scripted summarizer. What a real summary keeps of three work items is unknown.
- No lane ran against fresh workers with notes. That a lane hands work over better is untested, and so is the opposite.
- The rows of section 4 are paper. X6 to X11 ran the moves they lean on.
- How the `w1_notes` section tells a worker from a reviewer was not run.
