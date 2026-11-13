# The extension model

This is a proposal, not an implementation. Rulings remain fixed. Source paths below are relative to `/tmp/render-ground/pi/packages/durable`, unless another root is named. "Measured" means source read here, not a successful Tau run.

An extension is trusted server code, packaged as an unwrapped pi-durable `Extension`. It can supply tools, sections, hooks, wraps, and named tasks. Tasks are registry-wide, not restricted by a conversation's selection. These are separate from the tools an agent may call, measured at `src/harness/types.ts:424-444`.

A workflow is an extension with a conversation entry point. That is the one distinction the host needs. Rename the existing side-by-side descriptor `WorkflowModule` to `ExtensionModule`. Keep `extension`, optional `entry`, and optional `options`. Presence of `entry` marks a workflow. No kind hierarchy, activation hooks, services, or extension loader is added. The composition root supplies the static import map. The core imports neither extensions nor the library.

A project selects extension names, including workflows. `extensions` returns each name, whether it has `entry`, and its options schema. Its registry also holds `coding-tools`. Installation makes code available. Selection determines which agent uses it. Keep `Project.workdir` as the owner's path.

Three choices differ:

| Choice | Benefit | Cost | Decision |
| --- | --- | --- | --- |
| Exact extensions on every conversation, today's design | New project choices never widen an old role | Adding search requires changing every interested role | Keep for restricted roles |
| Project default, edited with `{ add, remove }` | Bare conversations and willing roles gain project tools without copies | A project addition changes their next request | Use for general agents |
| Extension declares itself on for every agent | Author need not arrange selection | Overrides the reviewer's restriction and the project's choice | Reject |

Arrays select exactly. Objects edit `settings.extensions`. Missing installed names are skipped. These are measured, `src/harness/agent.ts:351-370`. There is no self-enabling field in `Extension`, measured, `src/harness/types.ts:424-433`.

The host supplies a synchronous `settings.extensions` getter returning `coding-tools` followed by installed selected modules without `entry`. Workflows never enter that default. Settings support live getters, measured, `src/harness/types.ts:630-633`. Persist the project list before installing additions. A restart rebuilds the getter and registry from that list. No conversation rewrite loop is needed.

Selections are explicit even when they inherit:

- The bare agent gets `{ extensions: {}, model, cwd }`, with no tool filter.
- W1's `entry(tx)` adds W1 to the default. Its designer excludes `write` and `edit` with a removal filter, rather than today's exact tool list. It gets search and later codemode.
- W2's entry adds W2 and removes `coding-tools`, with no tool filter. Without search it still has only W2's tools.
- Workflow-created conversations get what the workflow configures. W1's reviewer uses exact `[W1]` and exact `[show_diff, show_file, publish_review]`. Workers and the trial lane below also use exact lists. Nothing adds project tools behind their backs.

Extension selection and tool filtering are independent, measured, `src/harness/agent.ts:264-305,338-348`. `role()` can remain exact-list-only. The designer's entry uses `AgentChange`, not `RoleSettings`.

A running request keeps its prepared tools and prompt. An inherited selection changes at the next request, even within a run, measured, `src/harness/generation.ts:175-184`. This deliberately changes host.md's Proposed "No live work changes" claim. Dynamic defaults do not weaken the reviewer's exact selection. Tool lists still are not sandboxes.

`websearch` owns `<extension>.options` in each project store. Its flat schema requires `provider` and `apiKey`. Mark `apiKey` with JSON Schema `writeOnly: true`. The existing server-side `get` still returns raw set keys for patch merging. Client-facing `options` and `setOptions` omit write-only values and return their set-key names instead. Never return those values in errors, logs, entries, events, or prompts. `null` clears a key. Provider errors must be scrubbed by websearch.

This stores the key as plaintext in the extension's document, including backups. It is not a vault. I prefer this small first design to a new secret subsystem, but that is a real cost. Same-account shells retain the accepted access limit. Only an authenticated client sets options through the host. Trusted extension code can still write its own document. Websearch reads options at each tool execution. Missing configuration returns a tool error before any provider request. Creation validates only the chosen workflow's options, not every optional tool's configuration.

# The script, steps 1 to 6

Calls below are capability labels, not a protocol. Each project retains the existing lock, store, event log, and startup order.

| Step | Client calls | Host commits, in order | pi-durable and the agent |
| --- | --- | --- | --- |
| 1 | `extensions`; `bind(P, path, [websearch, W1])`; `setOptions` for websearch and W1 | Bind writes `Project { project, workdir, extensions }`. Then install code and resume. Each options patch separately reads, merges, validates, and writes the extension's document. Responses redact the key. | Registry publication is immediate, measured, `src/harness/registry.ts:73-91`. No model runs for setup. Today's docs cannot select or configure a non-workflow. |
| 2 | `create(P, model)`; `input(B, question, requestId)` | Create reads Project, creates ownerless B, and configures inherited selection and cwd. Input uses the existing submission call. | B gets coding tools and `search`, not W1. Websearch alone calls the outside provider. Reused input IDs return the original submission, measured, `src/harness/submissions.ts:232-239`. |
| 3 | `create(P, W1)`; `input(D1, prompt, requestId)`; ordinary decision calls later | Check W1 options, create ownerless D1, apply `entry(tx)` and cwd. W1 later creates its reviewer with an exact selection. | D1 searches before publishing V1. The reviewer has neither search nor codemode, including nested calls. Enabled tools constrain nested callers too, measured, `src/harness/agent.ts:294-305`. Its Git tools still choose the published SHA from Work. |
| 4 | `addExtensions(P, [codemode])` | Read Project, append the name once, write Project. Then install codemode. A resend is a no-op. | B and D1 gain it at their next request. Idle inherited conversations gain it on their next run. Exact workers, reviewers, and lanes do not. Already prepared requests do not change. Today's docs only offer `addWorkflows`. |
| 5 | Existing W2 `input(F, "search...")`; later `addExtensions(Q, [websearch])`, `setOptions(Q, websearch, ...)`, then another `input` | Before addition, no configuration commit occurs. Later use the same list and options commits as above. | F initially has no search tool. It must say it cannot search, not invent a result. After addition F gains search at its next request, but gets a configuration error until Q's own provider and key are set. P's key is not Q's. An old answer is not automatically retried. |
| 6 | Reconnect; `projects`, `open` | Startup opens P and Q, reads Project, installs available code, reports missing `websearch`, and resumes. Keep its name and options. Write no substitute selection. | Search disappears from resolved agents, measured, `src/harness/agent.ts:365-368`. A pending call can return `tool_unavailable`, while an interrupted execution can return `interrupted`, measured, `src/harness/tool.ts:148-155,200-226`. Only a missing extension-defined task waits as `missing_task`, measured, `src/harness/types.ts:793-798`. Other work continues. Restore code and restart to restore search. |

A missing search extension does not freeze the whole project. Nor does it prove that an interrupted provider request never happened. Websearch uses `replay: "unsafe"` to avoid automatic repeat billing after an interrupted execution. That policy's recovery behavior is measured, `src/harness/tool.ts:195-226`.

# Lane through the rules

Lane's claimed benefit is better briefs from project history. That benefit has not been demonstrated. Persistent conversation state is not itself a new guarantee.

| Core check | Result | Evidence |
| --- | --- | --- |
| 1. Real failure | Fail | W1 already builds and fixes with workers. No observed bad handoff is shown that fresh workers plus notes cannot solve. |
| 2. Not provided by pi-durable | Fail | Owned conversations, persistent maps, dispatch, and background reports are already illustrated, measured, `test/examples/03-owned-conversations.ts:9-13`, `test/examples/22-subagent-background.ts:38-58,75-133`. Compaction is built in. |
| 3. Extension cannot keep the promise | Fail | The W1 pattern below needs no new human authority or shared client record. |
| 4. Two unlike users | Fail | Only W1's implementer is proposed. W2 creates no workers. The client already opens ordinary conversations. |
| 5. Small, workflow-free shape | Pass | A generic long-running role could name only settings and conversation IDs. This does not repair checks 1 to 4. |

| Library check | Result | Evidence |
| --- | --- | --- |
| 1. Two current call sites | Fail | One W1 lane-creation site. Several work items are not separate call sites. Fix dispatch reuses it. Worker creation already uses `role()`. |
| 2. Adds no guarantee | Pass | The proposed pattern uses public conversations, documents, tasks, and core decisions. W1 can write those calls itself. |
| 3. Owns no stored name | Fail | A complete shared Lane would own routing state and dispatch tasks. Caller-named documents are allowed, but that does not permit library-owned task names. A creation-only helper reduces to `role()`. |
| 4. No workflow concept | Pass | Long-lived roles are not inherently implementers or build stages. |

Reject a core Lane. Defer a library `lane()` beside `role()`. Fresh workers reading a notes document are the cheapest alternative and remain the baseline for comparison.

Recommend a W1-private trial for this script. Its smallest shape is one ownerless conversation, W1's session document `w1.implementer` holding its current ID, work references, and fallible notes, plus W1 tools and task phases. No shared Lane type, reporter service, scheduler, or waiting parent run. Keep only if better briefs justify its cost.

# The script, steps 7 to 12

Step 8 occurs inside step 7's review period, before its eventual pass and handover. D1 owns `--json`; D2 owns `--csv`. V1 and V2 below name their accepted design entries, not draft numbers.

D1, D2, and D3 are ownerless designers, one per item, with the inherited designer selection above. L1 is the ownerless implementer lane, model A, exact `[W1]`, with `work`, `remember`, `dispatch_worker`, and `request_fresh_lane`. U1 and U2 are ownerless workers, model A, exact `[coding-tools, W1]`, with `read`, `write`, `edit`, `bash`, and `publish_build`, each in its item's worktree. R1 and R2 are ownerless reviewers, model B, with the exact reviewer settings above. E is the existing event log, not an agent.

Item tasks remain background tasks owned by the item's D. The reset continuation belongs to L1 and is background. The lane's run owns no worker. Ownerless agents start empty rather than inheriting another role, measured, `src/harness/agent.ts:204-215`. Ownership determines abort traversal, measured, `src/harness/scheduler.ts:668-691`.

Each row is one store commit unless marked Git. Reads precede writes. At most one submission comes before other table writes, measured, `src/session/transaction.ts:1140-1156`, `src/harness/submissions.ts:75-82`. Documents remain usable after table writes, measured, `src/harness/types.ts:544-548`.

Tools use `replay: "safe"` with same-commit receipts keyed by `api.taskId`. Phases commit their next checkpoint or terminal outcome with their effects. Continuations also check receipts keyed by decision ID. Thus a rerun either finds the receipt, starts at the next phase, or repeats an uncommitted row. Dispatches also record their design-approval or failed-review cause in Work, preventing two new tool calls from creating duplicate workers. Safe replay is measured, `src/harness/tool.ts:200-219`. Submission IDs derive from immutable causes and content is saved before dispatch, because only the reused submission's type is compared, measured, `src/harness/submissions.ts:232-239`.

| Step and start | Reads | Writes, in order; rerun |
| --- | --- | --- |
| 7a. Approved-design continuation | Decision A1, accepted design V1, Work1, options; Git base read before commit | Save the existing worktree plan. Create `w1.prepare`. Emit. End. Decision receipt prevents a second plan. |
| 7b. Prepare phase, after ensuring the worktree matches its plan | Work1, `w1.implementer`, options | If absent, create L1 with `role()` and save its ID. Save ready checkpoint. No input yet. A landed checkpoint prevents another L1. |
| 7c. Prepare's next phase | Work1, V1, current lane, notes | Configure L1's model. Submit a saved build request keyed by A1, as follow-up. Set Work1 to awaiting dispatch. Emit with L1's ID. End. |
| 7d. L1's `dispatch_worker` | Current lane ID, Work1, V1, notes, tool receipt | Require current L1 and the expected stage. Append brief T1 naming V1 and the plan. Create U1 with `role()`. Save U1, T1, cause, receipt, and starting stage in Work1. Create `w1.worker_start`. Emit with U1. Terminate. Existing dispatch receipt returns U1. |
| 7e. Worker-start phase | Work1, T1, V1, options | Configure U1. Submit the stored brief and approved basis, keyed by T1. Set building. Emit. End. |
| 7f. U1's shell, Git only | Worktree | Commit S1. No store receipt covers Git. After interruption inspect Git before committing again, as walk.md requires. |
| 7g. `publish_build`, sequential | Clean head S1 before commit; Work1, V1, options, receipt | Append B1 naming V1 and S1. Create reviewer R1. Save candidate and receipt. Create review-start and lane-notice tasks. Emit. End tool round. |
| 7h. Review-start phase | Work1, B1, options | Configure R1. Submit B1, keyed by B1. Set reviewing. Emit. End. |
| 8a. Item 2 becomes ready while R1 reviews | Its approval, V2, Work2, lane ID | Repeat 7a to 7e in separate commits for D2 and U2. L1's follow-up queues behind its current run. U2 has a separate plan and worktree. |
| 8b. R1's `publish_review` fails | Work1 and current candidate B1 | Append failure F1 naming B1 and S1. Save it. Create `w1.fix_start` and a notice. Emit. Receipt returns F1. |
| 8c. Fix-start phase | Work1, F1, current L1, options | Configure L1. Submit the saved fix request keyed by F1, as follow-up. Set awaiting fix dispatch. Emit. End. |
| 8d. L1 dispatches the fix | Work1, F1, current lane, receipt | Save a new brief referencing F1 and V1. Reuse U1, not U2. Create worker-start. Save receipt. Emit. Worker-start separately submits that brief to U1, keyed by its entry ID. U1 serializes its own runs. |
| 7i. U1 fixes, publishes, and passes | Each existing W1 row's inputs | Git S1b, then separate build and review commits as walk.md rows 15 to 17. The pass creates M1 naming V1, S1b, build, and review, then requests the final decision. |
| 7j. Owner answers; handoff phase follows | Answer basis, M1, Work1; Git head before handoff commit | Existing `answer` commit creates continuation. Separate handoff checks design, candidate, and head equality. Mark handed over. Create notice. Emit the SHA for the owner's merge. A moved head follows walk.md's stuck path. |
| Notices, after build, review, or handoff | Immutable cause entry, saved target lane | Submit a passive `write` containing that outcome and its evidence IDs, keyed by cause ID. End. No new model run. The target is saved in task input, not chosen again on replay. Passive writes are measured, `src/harness/types.ts:72-99`, `src/harness/submissions.ts:219-221`. |
| 9. Compaction, then item 3 | pi-durable's selected context; later Work3 and notes | Compaction writes a summary head. Item 3 repeats 7a onward. W1's `work` tool still reads Work1 and Work2 by their saved IDs, regardless of the summary. |
| 10. Model error, then restart | L1's live state; later Project and durable tasks | pi-durable records `model_error`, measured, `src/harness/live.ts:92-107`. Startup reconciles surviving running tasks to pending, measured, `src/harness/harness.ts:299-306`. U1 or U2 continues independently. A terminal failed lane run is not retried by restarting. The owner uses `open`, then `continue`, measured, `src/harness/types.ts:101-108`. No failure decision is promised. |
| 11. Owner steers L1 | `input` text; `remember` reads the referenced entry and current lane | Submit the owner's words with the client request ID. If L1 calls `remember`, save the quote and source ID in W1's notes with a receipt. New briefs include it. Chat alone guarantees neither this write nor a code change. |
| 12a. `request_fresh_lane` | Current L1, outstanding Work references, receipt | Append basis naming L1 and active workers. Request replace or keep, with `then: w1.lane_answer`. Save receipt. |
| 12b. Owner answers replace; continuation follows | Decision, current lane, reset receipt | Separate answer commit. Then create ownerless L2 with base role settings. Replace current ID, clear all notes, and retain Work references only. Save decision receipt. Emit with L2. End. No transcript or summary copy. |

After replacement, every mutating lane tool checks the current ID. Old queued requests and late notices can remain in L1 but cannot dispatch new work. Existing workers finish under their saved briefs. The new lane reads their results from Work. The owner re-enters wanted directions and asks L2 to dispatch any saved pending requests. No conversation is deleted. W1's `afterRun` check must recognize dispatch as the lane's handoff, and ignore owner chats that owe no dispatch. It runs only after answers, measured, `src/harness/types.ts:1018-1025`.

The evidence chain remains approved design entry, build plus SHA, review plus that same SHA, final basis, and head check. Lane notes and briefs authorize none of those steps. They can still cause a bad implementation. The reviewer can miss it, just as before.

# What a lane knows, and what it costs

The transcript stores dispatches, tool results, and passive outcome notices. The summary is a lossy model-written replacement for an old context prefix, not a verified project history. W1's document holds notes and work IDs. Work and immutable entries hold stage facts and evidence. A prompt section rereads the notes and active work references before requests. Sections reading committed documents are illustrated, measured, `test/examples/10-extension-state.ts:51-55`.

Compaction selects a prefix and first kept entry, then writes a summary with `head` pointing there, measured, `src/harness/compaction.ts:130-140,468-488`. Context uses that head plus the kept range, measured, `src/harness/context.ts:145-158`. It does not erase stored history, illustrated by the stored-entry count in `test/examples/24-compaction.ts:104-110`, measured. Summarization omits system messages and thinking and truncates tool results to 2,000 characters, measured, `src/harness/compaction.ts:67-68,398-425`. Similar losses are measured in `/tmp/render-ground/pi/packages/coding-agent/docs/compaction.md:276-291`. Do not use that package's entry format here.

A week later L1 may remember why items 1 and 2 changed. It can reliably retrieve their accepted designs, failures, final SHAs, and present states. The summary does not guarantee those recollections. Notes are claims with source references, not evidence themselves.

One lane handles one run at a time. Queueing is measured, `src/harness/types.ts:81-89`. Dispatches serialize, workers do not. Each dispatch adds at least one lane model request before worker requests. A terminating dispatch round can stop there. Reading history, updating notes, or answering adds requests. Passive notices add none. Default compaction adds a model request and may retry, measured, `src/harness/compaction.ts:172-200`.

"Stop using the old serializer everywhere" does not broadcast to workers or undo handovers. The owner must steer active workers separately and require changed builds to pass review. Wrong lane knowledge appears through bad briefs, worker objections, review findings, or owner inspection. There is no automatic truth check. Corrections cost review time. Replacement loses useful context too. Neither improved accuracy nor lower total cost is established.

# What changes in `docs/core`

1. `README.md`: extend check 4 to "Two extensions with unlike duties use it with the same meaning, or a client that knows no extension cannot work without it. A repair to the server's safety is the one exception." Home: core governance. Status: Proposed. Extension primacy itself is Decided.

   Checks 1 and 2 pass: workflow-only wording excludes websearch. pi-durable provides no Tau admission rule.
   Checks 3 and 4 pass: this governs the owner's core boundary, including clients that know no extension.
   Check 5 passes: prose only, no new runtime mechanism.

2. `host.md`, `primitives.md`, `topology.md`: use `ExtensionModule`, `Project.extensions`, `extensions`, and `addExtensions`, replacing the workflow-only names. Update `bind`, `projects`, `options`, and `setOptions` to name extensions. `create` still takes a workflow or a bare model. Refuse a named module without `entry`. Show missing extension code in `projects`. `faults` scans all installed selected extensions' task kinds. Home: host wiring. Status: Proposed under ruling 23.

   Checks 1 and 2 pass: steps 1 and 5 cannot bind websearch. pi supplies selection, not project binding or client descriptors, measured, `src/harness/types.ts:424-433,630-633`.
   Checks 3 and 4 pass: an uninstalled extension cannot receive bind. Bare agents, W1, W2, and generic clients need the same catalogue.
   Check 5 passes: generalize existing fields and calls. Add no loader or subsystem.

3. `host.md`, `primitives.md`, `workflows.md`, `library.md`: document inherited defaults and exact restricted roles. Fix the designer example to use `AgentChange`. Home: host wiring and workflow settings. Status: Proposed. Reviewer isolation remains required.

   Checks 1 and 2 pass for host wiring: project additions otherwise cannot reach general agents. pi supplies the selection algorithm but cannot choose Tau's defaults, measured, `src/harness/agent.ts:351-370`.
   Checks 3 and 4 pass: the host creates bare agents before extension code runs. Bare agents and W2 both need project tools.
   Check 5 passes: one settings getter and existing `AgentChange` fields. W1 alone owns its role filters.

4. `host.md`: extend options responses with write-only redaction and set-key names. Home: host wiring. Status: Proposed. Keep `answer`, `open`, and other conversation calls unchanged. Generalize `workflow_not_loaded` to `extension_not_loaded` without changing its refusal rule.

   Checks 1 and 2 pass: raw options expose the API key. The measured `Extension` contract contains no client options handling, `src/harness/types.ts:424-433`.
   Checks 3 and 4 pass: a paper alternative that redacts `get` breaks patch merging. Raw `get` leaks through today's generic host response. Only the host controls that response to generic clients.
   Check 5 passes: honor `writeOnly` at the existing boundary. Add no secret service or transport.

5. `library.md`: say "the library". Generalize `options(extension, schema)` and `<extension>.options`. Home: library. Status: Proposed shape, no new helper. Its four checks pass: W1, W2, and websearch call it; it adds no guarantee; its document holds only caller data under the caller's name; it interprets no workflow concept. Keep `role()` and `prose()` unchanged.

6. `walk.md`, `workflows.md`: record the W1-private lane trial and its extra tools, state, and requests. Home: workflow. Status: Proposed experiment. Shared Lane is not admitted by either rule. Keep failure recovery with the owner, as ruled. Extend the no-removal offering to extension names for now. Home: accepted limit, Proposed for non-workflows. Existing no-delete and no-unbind limits remain Decided.

# Not verified

No probe, tests, provider calls, Git commands, or Tau implementation ran. Source reads do not prove live defaults during restart, codemode's nested-call behavior, redaction, or the lane trial. Codemode must respect enabled-tool selection before it is offered to any role. Secret-safe errors and logs need tests before implementation. Plaintext-store disclosure, same-account shell access, power loss, upgrades, and terminal task recovery retain their stated limits. A real trial must compare brief quality, model requests, corrections, and elapsed time against fresh workers reading the same notes. The protocol remains outside this design.
