# Keel, candidate A: lanes declare, one kernel reconciles

The sketch is in `sketch/src/`. It type-checks against tau's real exports: `tsc -p sketch` with the repository's `node_modules`.

## Problem

Keel runs the workflow in `workflow-distillation.md` §6 to §8 as a tau extension. It has three lanes with seven stages, a project queue, Mandate rounds, a live plan, three branch tiers and fan-out. Several pieces of work can run at once in one project. It also has to deliver five runtime properties: publish once under replay, act once per decision, plan git effects before making them, cancel durably before stopping, and take hashes from state or git. Each property is encoded once.

Four constraints shape the design:

- **Agents are not tasks.** pi-durable can wait durably on tasks but not on conversations (grounding §6). Agents report only by calling tools, so every lane transition starts as a tool call, a decision answer, or an effect result.
- **No keyed document families.** `defineDocFamily` is not re-exported. State lives in three places: session documents (one per project), conversation documents (one per conversation) and task documents.
- **The first slice's defects were structural.** A situation inferred from field combinations fired on stale state. A decision outlived the situation that opened it. One stage enum could not hold a plan. Fields changed without a version bump.
- **Commit order.** A commit does its table reads first, then at most one submit, then its table writes. A conversation cannot receive input in the commit that creates it. Each tool or task that ignored these rules would need its own care.

The design answers all four the same way. Every situation is recorded once, in exactly one lane's state. Everything that touches the outside world is derived from that record by code that knows nothing about lanes. Outside-world contact means decisions, agent conversations, inputs, git and stopping agents.

## Usage (caller's view)

### 1. The owner, through a tau client

```text
create  { project: "minos", workflow: "keel" }                         -> conversation 41
input   { conversation: 41, text: "Fix: the book drops its last level when a fill empties it", requestId }
timeline  "Work 41: bound to your prompt (bug). Coordinator: conversation 44."
timeline  "Work 41 · i1: worker started (conversation 52)."  ... "verdict 1 fail (1 block)" ... "landed 4f2c1e0 on trunk"
inbox     "Hand over work 41: trunk 4f2c1e0"            choices: accept | findings
answer  { decision: "keel:41:verify:handover#1", choice: "accept", annotations: [] }
$ git -C ~/minos merge --ff-only 4f2c1e0                # promotion to main, by hand; keel never does this
```

Every decision the owner ever gets from keel is one of these:

| Subject (tau decision) | When | Choices | What annotations do |
| --- | --- | --- | --- |
| `keel:<w>:design:ground` | Ground found two defensible readings | proceed, decline | Rulings; the designer replies to each by number |
| `keel:<w>:design:mandate` | A Mandate revision is ready | approve, revise, base:`<c>`, arena, arena_fresh, decline | revise: numbered replies in the next revision; approve: instructions the coordinator replies to |
| `keel:<w>:design:rider/<r>` | One per rider the winning design introduced | bind, delegate, reject | reject: the designer replies in the next revision |
| `keel:project:queue:triage/<b>` | A batch of findings that takes one answer | build, defer, drop (bless, revoke, defer for patterns) | Notes carried to whoever acts |
| `keel:<w>:verify:handover` | A build landed on trunk | accept, findings | With findings: each annotation becomes a queue finding |

The owner also:

- **Marks a finding on anything in front of them.** They annotate a hand-over, or write into any keel conversation. That agent files it with `file_finding`. Keel records the owner as the source because the latest input before the call is a `pi.user` entry (keel's own inputs are `keel.input` entries), never because the model says so. A new keel conversation whose prompt is a finding also works: Ground routes it to the queue.
- **Cancels a piece of work.** They tell its designer conversation, which calls `cancel_work`. The tool is accepted only when the latest input was the owner's own.
- **Talks to any agent directly.** If that agent then moves its subject on, any decision open for the old situation is withdrawn in the same commit.

### 2. Agents, through tools

Each agent sees a closed tool list derived from `ROLES` and `ToolSpec.roles`, plus `principle` (with the principles index section). Roles that have seats also get `dispatch`.

| Role | Keel tools | Asked when |
| --- | --- | --- |
| designer (the anchor) | `ground`, `frame_arena`, `publish_mandate`, `cancel_work`, `file_finding`, `dispatch` | The owner's prompt; framing; synthesis; answering the challenger; revising; proposing a revision |
| coordinator | `publish_plan`, `brief_item`, `handoff_build`, `file_finding`, `dispatch` | Initial plan, re-plans (revision, finding, full-set failure, trunk conflict), briefing an item at start, closing |
| worker | `record_ruling`, `publish_build`, `file_finding`, `dispatch` | Brief, rework, integrate, resume |
| verifier | `publish_verdict`, `file_finding` | Verify, re-verify, re-verify after integration, full set |
| diagnoser | `publish_diagnosis`, `file_finding` | A block survived two fixes |
| investigator | `report_investigation`, `file_finding`, `dispatch` | Each filed finding |
| seats (explorers, prototype, arena candidates, judge, challenger) | none (read, bash, principle) | Dispatched; they answer in text |

A worker's whole life, from its side:

```text
<keel.input> Build item i2 in your worktree ... <mandate>…</mandate> <principles>…</principles> Reply to note 1 by number.
record_ruling { what: "Store fills as integer ticks", why: "...", cost: { level: "medium", text: "..." },
                cites: [{ kind: "mandate", node: "S2" }, { kind: "principle", name: "model-the-domain" }] }
bash "git commit -am ..."
publish_build { summary: "...", replies: [{ n: 1, text: "..." }] }      -> run ends; keel reads the commit from git
<keel.input> The verdict on 9b1c… is fail. <blocks>1. …</blocks> Fix every block at its cause …
```

No tool parameter is a commit hash, a decision ID, a conversation ID or a verdict scope. Keel takes those from state or from git.

### 3. Tau's host

`src/index.ts` exports `{ extension, entry, options }`.

- **`entry(tx)`** returns the designer's settings: the model from option `designer`, falling back to `design`; closed tools; the instructions in `prose/roles/designer.md`.
- **`options`** is one flat, closed schema derived from `ROLES`. Four lane models are required (`design`, `build`, `verify`, `queue`). Each role and sub-role has its own optional model key (`designer`, `arena_seat_2`, `diagnoser`, `queue_explorer`, and so on). `trunk`, `base` and `max_workers` have defaults.
- **Tasks.** The extension registers four task kinds: `keel.answer`, `keel.effect`, `keel.deliver` and `keel.stop`. All are short-lived. After a restart the host resumes them like any task, and they converge.

### 4. A future extension reusing dispatch

```ts
import { dispatchTool, fanOut } from "keel-dispatch"; // src/dispatch/ moved into its own npm package

const config = {
	toolName: "dispatch",
	seats: async (tx, caller) => ({
		explorer: { model, extensions: [extension, CodingTools], tools: [readTool, bashTool] },
	}),
};
export const extension = defineExtension({ name: "research", tools: [dispatchTool(config)] });
// or from its own task phase:
const results = await fanOut(runtime, config, [{ key: "a", seat: "explorer", prompt, cwd: null }], context);
```

It knows nothing about lanes, Mandates or keel's records. It refuses to run when the caller is itself a dispatched child.

### 5. The next engineer changing one lane

Say the owner wants a block to stop after three survived fixes instead of two. The engineer opens `lanes/verify/convergence.ts` and its test, then changes one constant and its tests. No other file changes.

Now say Build needs a new item situation. The engineer edits `lanes/build/state.ts`, then bumps the version, adds a `migrate` and a fixture (the state test fails until they do). Then they edit `lanes/build/lane.ts` (reduce plus its declarations) and add one input file under `prose/inputs/build/`. They never open the kernel. Declaring an expectation is enough for the input to be delivered exactly once. Declaring an ask is enough for the decision to open and for the withdrawal when the situation moves on.

Three real call sites:

```ts
// lanes/verify/lane.ts, reduce: a pure function of state and event
case "verdict": {
	const entry = state.items[item];
	if (entry?.check.kind !== "verifying") return { kind: "reject", reason: "No build of yours is awaiting a verdict." };
	const result = converge(state.threads, previousVerdict(state, item), verdict, item, nextThreadId(state));
	if (result.kind === "rework")
		return next(withReturned(state, item, verdict, result.threads), {
			send: [toBuild.send(world.scope.work, { kind: "item_failed", item, verdict: verdict.n })],
		});
	// "diagnose" -> diagnosing; "pass" -> awaiting_merge; "invalid" -> reject
}

// lanes/build/lane.ts, agents: a declaration, not a call
agents: (state, world) =>
	Object.values(state.items).flatMap((item) =>
		item.situation.kind === "building"
			? [{ key: item.situation.attempt.worker, role: "worker", cwd: item.situation.attempt.worktree, paused: false,
			     expects: [{ token: token(`item/${item.id}`, item.situation.seq), tools: ["publish_build"],
			                 input: () => texts.input(item, world) }] }]
			: [],
	),

// kernel: keel.answer, the only continuation keel ever names in `then`
await runtime.commit(async (tx) => {
	const d = await decision(tx, task.input.decision);
	const project = await tx.doc(ProjectState.doc);
	if (d?.status !== "answered" || project.asks[d.subject]?.decision !== d.id) return completed; // stale or repeated
	delete project.asks[d.subject];
	const { scope, lane, local } = parseSubject(d.subject)!;
	await transact(tx, { kind: "kernel", scope, lane, event: answered(local, d) }, runtime.now());
	return completed;
}, context);
```

## Shape

### Data structures first

| Record | Kind (doc) | Scope | Sole writer | Holds |
| --- | --- | --- | --- | --- |
| Project | `keel.project` | session | kernel | repo, project anchor, works index, open asks by subject, project agents and effects |
| Work | `keel.work` | anchor conversation | kernel | agent key → conversation, open tokens and nudges; effect key → task |
| Binding | `keel.binding` | each keel conversation | kernel | work, lane, agent key, role |
| Receipt | `keel.receipt` | each tool call's task | kernel | the saved output; retired with the task |
| Design | `keel.design` | anchor | Design lane | origin, Ground report, revisions, rounds, arenas (every candidate), riders, stage, bound revision |
| Build | `keel.build` | anchor | Build lane | status, coordinator situation, items (one situation each), published builds, rulings |
| Verify | `keel.verify` | anchor | Verify lane | per-item check, merge queue, verdicts, threads, full set, landing, hand-over |
| Trunk | `keel.trunk` | session | Verify lane (project part) | landing lock holder, waiting works, landed record |
| Queue | `keel.queue` | session | Queue lane | findings, batches, approved references, investigator generation |
| Pulls | `keel.pulls` | each agent conversation | principles | principles pulled, for citation checks |

A piece of work is addressed by its **anchor**. The anchor is the designer conversation, which either `create` made or the queue made. All of its lane states are conversation documents on the anchor, so N pieces of work are N anchors. Each has its own Mandate, conversations, plan and build branch (`keel/<anchor>`). The queue and the trunk lock are one per project.

Each stored type is versioned through `defineState` (`kernel/state.ts`), under one rule: no optional properties (absence is `null`), any type change bumps `version`, and from version 2 on a `migrate` is required. Each kind has a test fixture that compiles against the current type and records the key paths of every version. Adding a field breaks the fixture, which forces the bump. This answers the first slice's fourth lesson in structure, not in review.

Every situation is a discriminated union with exactly one value per subject. Examples are `DesignStage`, `ItemSituation`, `ItemCheck`, `FullCheck`, `Landing`, `Handover` and `Finding.situation`. Each variant's comment names who may move it: the owner (an ask), an agent and tool (an expectation), or code (an effect). There is no field combination to interpret. "Stopped for non-convergence" is `ItemCheck.diagnosing` followed by `escalated`, not "target is worker and stage is verifying".

### The kernel: lanes declare, the kernel reconciles

A lane (`kernel/lane.ts`) is five pure functions over its own state:

```text
reduce(state, event, world) -> next state + messages to other lanes + timeline notes | reject
view(state)                 -> the read-only face other lanes see
asks(state, world)          -> what the owner is asked now          [{ subject, title, choices, basis }]
agents(state, world)        -> which agents exist, paused or not, and what each owes [{ key, role, cwd, expects }]
effects(state, world)       -> which outside effects are needed now  [{ key, spec }]
```

The kernel (`kernel/kernel.ts`) is the only code that touches `Tx`, decisions, conversations, tasks, submissions or git. Every keel commit runs `transact`:

1. **Phase A (reads).** Load the lane states and kernel records. Do the table reads (the owner-provenance scan, adoption). Reduce the delivery. Route messages to their lanes until none remain (bounded).
2. **Phase B (writes).** Write the changed lane states. Then reconcile each changed lane, comparing declared against recorded:
   - **Asks.** A new subject, or a changed basis hash: append a `keel.basis` entry and `request(then: keel.answer)`. A subject that is no longer declared: `withdraw`.
   - **Agents.** A new key: create the conversation, configure it from the role and options, and write its binding. A key that disappears or becomes paused: create a `keel.stop` task. That task runs only after this commit is stored.
   - **Expectations.** A new token: create a `keel.deliver` task with the rendered input.
   - **Effects.** A new key: create a `keel.effect` task. A recorded effect that is no longer declared is marked `cancelled`. A task that has not started yet then exits without acting.
   - **Notes.** Emit them as events, naming any conversation just created.

Phase B performs no table reads and no submits. Submission always happens in a later `keel.deliver` commit, which is also what tau requires after creating a conversation. Lanes never see `Tx`, so they cannot break the commit order.

**Why this is the load-bearing choice.** A lane cannot open a decision without the situation that justifies it. Leaving that situation withdraws the decision, because the declaration is gone. Nothing to remember, no call to forget. The first slice's stale-decision defect becomes unrepresentable: `keel.answer` acts only when `asks[subject].decision` matches, and it clears the slot in the same commit. The lane then receives the answer only while that situation is current. The same holds for agent inputs (tokens) and git (effect keys).

### Each property, encoded once

| Property | Where it is encoded | Mechanism |
| --- | --- | --- |
| A replayed tool call publishes once | `kernel.tool` wrapper | A receipt in a task document on `api.taskId`, written in the publishing commit. Replay returns it. `observe` (git reads) may rerun; it is read-only. |
| A continuation created twice acts once | `keel.answer` | Acts only if `asks[subject].decision === input.decision`, clearing it in the same commit. Replacements and duplicates find it cleared. One `then` task for every decision, so no lane writes continuation code. |
| Git effects planned first; reruns repeat nothing and destroy nothing unproven | `keel.effect` + `repo.converge` | The effect key and spec are stored in lane state and kernel records before the task runs. Ops converge: they read disk, check proofs (lock reason `keel <key>`, trailer `Keel-Effect: <key>`, compare-and-swap from a recorded hash), and report `occupied` or `moved` rather than reset. |
| Cancel is durable before any agent stops | reconcile | Cancel moves each lane to `cancelled`; its agents leave the declared set; `keel.stop` tasks are created in that commit and run after it is stored. |
| Hashes come from state or git | `repo` | `Sha` is a brand only `repo/` constructs. No tool schema has a hash field. `publish_build` reads HEAD in `observe`. |
| Situations recorded, not inferred | lane state types | One union per subject; declarations derive from it. |
| An input reaches an agent once | `keel.deliver` | `requestId` is the token. The commit re-checks the token is still open before submitting. |
| An agent that stops owing a hand-off is noticed | `keel.deliver` watch phase | It re-attaches by `requestId` after a restart. On settle with the token still open, it nudges once, then sends `agent_stalled` to the lane. This covers answered-without-calling and failed runs; `afterRun` covers only the first. An `aborted` settlement is someone's deliberate stop and is left alone. |

### The lanes

**Design** (`lanes/design/`) owns the Mandate.

- **Ground.** The owner's prompt (or a queue seed) reaches the designer, who calls `ground`. Bug, perf and precedent-following work binds a small designer-written Mandate under the prompt's authority, with no stop. Precedent-setting work goes to the arena. Ground stops only for ambiguities: two defensible readings with different results. Its gaps go into the first review basis as nodes to rule on.
- **Shape is run by code.** Effects dispatch the arena seats (same prompt each), then the cross-family judge, then the challenger on the synthesis draft. The designer is asked only at judgment points: framing, synthesis, answering the challenger, revising.
- **Candidates are kept.** Every candidate is kept as a reference to its child conversation and answer entry, which tau never deletes.
- **Review.** A review opens one `mandate` decision plus one decision per undisposed rider. An approval binds when the last rider is disposed with none rejected.
- **Validation.** A revision must reply by number to every annotation it owes, or `publish_mandate` is rejected.
- **Later revisions.** A revision proposed from the queue does not bind while under review. Build keeps building on the bound revision; only affected items wait.

**Build** (`lanes/build/`) owns the live plan, briefs, attempts and rulings.

- **The plan.** The coordinator edits unstarted items and may add dependencies to held ones, never a started or merged item (`plan.ts` validates). Keel moves items: ready → briefing (the coordinator writes the brief at start) → preparing (worktree effect) → building (worker) → published → merged.
- **Rulings and publishing.** Rulings attach to the build they shipped in. Each cited principle is checked against pulls and bindings at publish.
- **Tripwire.** A protected path touched by a non-Encode item holds the item and files a finding.
- **Build never asks the owner.** What it cannot decide goes to the queue.

**Verify** (`lanes/verify/`) owns verdicts and threads, merging, the full set, Land and Hand over, plus the project trunk lock (`trunk.ts`).

- **Checks.** Item checks run in fresh detached checkouts per build, with the same verifier conversation per item.
- **Convergence.** Convergence is per finding (`convergence.ts`). Two survived fixes lead to a fresh diagnoser, then the queue, and the item is held. There is no round cap.
- **Merging.** Merges into the build branch are serialized per build and run the Mandate's proof commands on the merged result. A conflict or failed check goes back as `integrate`, which is never a verdict.
- **Landing.** A full-set pass requests the trunk lock. Landing takes trunk in, checks, then writes one commit on trunk by compare-and-swap. Hand over is a non-blocking decision.

**Queue** (`lanes/queue/`) has one intake and two sources.

- **Investigation.** Each finding gets a cheap investigation by the project's investigator, whose conversation is the project anchor. The investigator classifies the finding and decides batching.
- **Routing.** A defect in scope goes straight to the coordinator. The other classes go to owner triage, one decision per batch.
- **Holds.** A wrong Mandate holds only the affected items, from the moment of classification. A blocking filer holds only its own item.
- **Owner action.** If the owner acts directly, the finding is settled and its decision withdrawn.

### Dispatch, repo, roles, principles, prose

- **Dispatch** (`dispatch/`). `fanOut(owner, config, jobs)` and `dispatchTool(config)` are built on pi-durable's foreground pattern: children are owned by the dispatching task, and request IDs are derived from that task's ID. The owner is a structural subset of a tool's `api` and a task's `runtime`, so the designer's exploration and the arena's code-run fan-out share one implementation. The boundary test forbids `../` imports.
- **Repo** (`repo/`). `converge(exec, repo, op)` plus two reads. It holds the only knowledge of git, of keel's on-disk layout (`<git-common-dir>/keel/<work>/<name>`), and of ownership proofs. `land` refuses when trunk equals base.
- **Roles** (`roles/`). The `ROLES` table is the one list. Options, model resolution, closed tool lists and dispatch seats are derived from it. Instructions are re-rendered and models reconfigured at every delivery, so long-lived agents follow upgrades and option changes.
- **Principles** (`principles/`). One source with three deliveries:
  - The index section shows only to agents offered `principle`, in a fixed order, read at request time (project principles from cwd `.keel/principles/`).
  - The `principle` tool records pulls.
  - `bound(facts)` and `triggered(event)` name principles that lanes render in full into inputs. Project bound principles come from the worktree as it stood when the item started, reported by the worktree effect.
- **Prose** (`src/prose/`). Lanes render one file per situation through `prose()` at module scope in each lane's `texts.ts`.

  | Folder | Files |
  | --- | --- |
  | `roles/` | designer, coordinator, worker, verifier, diagnoser, investigator; `seats/` for explorer, prototype, arena-candidate, judge, challenger |
  | `inputs/design/` | seed, framing, synthesize, answer-challenge, revise, propose |
  | `inputs/build/` | plan, replan, close, brief-request, brief, rework, integrate, resume |
  | `inputs/verify/` | verify, reverify, reverify-integration, verify-full, diagnose |
  | `inputs/queue/` | investigate |
  | `inputs/` | owed |
  | `documents/` | mandate, review, rider, ground, triage, handover (decision bases) |

### Module map

| Module | Owns | May import |
| --- | --- | --- |
| `index.ts` | the module contract; composition | everything |
| `kernel/` | the commit protocol, reconciliation, tool gate and receipts, the four tasks, kernel records, `defineState`, IDs | `repo/`, `dispatch/`, `roles/`, `principles/` (for `pulled`), `tau*` |
| `lanes/<lane>/` | the lane's state, reducer, declarations, tools, texts | `kernel/` types, `repo/` types and `layout`, `roles/` names, `principles/` (`bound`, `triggered`), **other lanes only through `lanes/<other>/public.ts`** |
| `lanes/index.ts` | the one list of lanes and lane tools; typed views | lanes |
| `dispatch/` | fan-out and join | `tau`, `tau/durable`, `tau/schema`, `tau/chord` only |
| `repo/` | git, check commands, on-disk layout, `Sha` | `kernel/ids.ts` (Brand) |
| `roles/` | `ROLES`, options, settings, seats | `tau`, `tau/schema`, prose files |
| `principles/` | index section, `principle` tool, bindings, triggers, pulls | `tau*`, `repo/` types, prose files |
| `prose/` | Markdown only | none |

A keel-local boundary test enforces the two bold rules: cross-lane imports go only through `public.ts`, and dispatch imports no keel code. A wrong import fails the build.

### Interface depth

- **Lanes and the kernel.** A lane implements one five-function interface and gets a `World`. Behind it the kernel hides decision subjects, `request`, `withdraw` and supersede rules, conversation creation and configuration, delivery dedup and nudging, task creation, commit order, receipts, effect retries and stops.
- **Repo.** Callers of `repo` name a target state. They never see git commands.
- **Dispatch.** Callers of `dispatch` give jobs and get answers.

The surface that remains exposed is the vocabulary of the workflow itself: asks, agents, effects and messages.

### What keel deliberately does not do

- No long-lived task. All durable workflow state is in versioned documents, so an upgrade rarely meets a task of an old shape.
- No owner question from Build.
- No round cap.
- No write to main or base.
- No deletion without proof.
- No model-supplied identity of any kind.
- No scheduler or sweep before slice 5.

## Scenario traces

Each step names the caller, the module that owns the step, and the records that change. "Reconcile" is the kernel's phase B for the lanes the step changed. E, D and S are `keel.effect`, `keel.deliver` and `keel.stop` tasks.

### 1. A bug fix that follows precedent

| # | Caller → owner module | What happens | Records changed |
| --- | --- | --- | --- |
| 1 | Owner `create` → host → `index.entry` → `kernel.entry` | Ownerless conversation A with designer settings | tau: A's `pi.agent` |
| 2 | Owner `input(A, prompt)` | `pi.user` entry; the designer reads code and reproduces with `bash` | transcript |
| 3 | Designer `ground{shape:"bug", mandate:{text, nodes:[I1 intent, P1 proof check]}}` → kernel `adopt` → Design | Work A created. Revision 1 (cause ground) is bound under the prompt's authority. Message `mandate_bound(1)` → Build: `starting`, effect `start` | `keel.project.works[A]`, `keel.work(A)`, `keel.binding(A)`, `keel.design(A)`, `keel.build(A)`, `keel.verify(A)`, E1; receipt; run ends |
| 4 | E1 → `repo.converge(start_build)` | trunk created from main if absent, then `keel/A` at trunk T0. Result → Build `active{base T0, head T0}`, coordinator `planning(initial)` | refs `trunk`, `keel/A`; reconcile creates coordinator conversation C and D1 (`plan.md`) |
| 5 | Coordinator `publish_plan{add i1 "fix", deps []}` → Build (`applyPlan`; no Encode needed under prompt authority) | i1 planned → ready → `briefing` | `keel.build`; D2 (`brief-request.md`) |
| 6 | Coordinator `brief_item{i1, evidence, fences}` → Build | i1 `preparing(attempt 1)`, worktree planned at `layout.worktree(A, "i1-1")` | `keel.build`; E2 |
| 7 | E2 → `converge(worktree)` | `git worktree add --lock --reason "keel E2" -b keel/A/i1-1 … keel/A`; project principles read at T0 → Build `building(input brief)` | disk: worktree; reconcile creates worker W, D3 (`brief.md`) |
| 8 | Worker `record_ruling{…, cites:[document]}` → Build | Ruling R1, pending | `keel.build` |
| 9 | Worker commits, `publish_build` → `observe` reads HEAD S1 from git → Build | i1 `published(build 1, S1, rulings [R1])` → Verify `item_published` → `checking_out(K1)` | `keel.build`, `keel.verify`, E3; receipt |
| 10 | E3 → `converge(checkout K1 @ S1)` | Detached, locked checkout → Verify `verifying` | reconcile creates verifier V (cwd K1), D4 (`verify.md`) |
| 11 | Verifier `publish_verdict{fail, [block failing_run]}` → Verify (`validateVerdict`, `converge`) | Verdict 1; thread t1 (survived 0); i1 `returned` → Build `item_failed` → i1 `building(round 2, rework(1))` | `keel.verify`, `keel.build`; D5 (`rework.md`, blocks only) to W |
| 12 | Worker fixes, `publish_build` → S2 | Build 2 → Verify `checking_out(K2)`; K1 removal planned | E4 (checkout K2), E5 (remove K1) |
| 13 | E4 → Verify `verifying` | V moves to K2 (cwd reconfigured at delivery) | D6 (`reverify.md` with verdict 1's blocks) |
| 14 | Verifier `publish_verdict{pass, [note]}` → Verify | Verdict 2; t1 resolved; `awaiting_merge`; merge planned (expected head T0 from Build's view, item S2, checks [P1]) | E6 (remove K2), E7 (`merge_item`) |
| 15 | E7 → `converge(merge_item)` | Integration worktree (keel-locked, detached at T0); merge S2 with trailer; P1 runs; `update-ref keel/A M1 T0` → Verify `merged` → Build `item_merged(i1, M1)` | ref `keel/A`; Build head M1; coordinator `closing`, D7 |
| 16 | Coordinator `handoff_build` → Build | `handed_off(M1)` → Verify `build_complete` → full `checking_out` | E8; then `full/verifier` with `verify-full.md` |
| 17 | Full verifier `publish_verdict{pass, handover}` → Verify | Full `passed`; landing `queued` → Trunk `request(A)` → holder A → Verify `granted` → `taking_trunk(expected M1)` | `keel.verify`, `keel.trunk`; E9 |
| 18 | E9 → `converge(take_trunk)` | Trunk T0 is an ancestor of M1: combined = M1, already checked → `landing(T0, M1)` | E10 |
| 19 | E10 → `converge(land)` | `commit-tree M1^{tree} -p T0` with trailer `Keel-Effect: E10` = N; `update-ref trunk N T0` → `landed(N)` → Trunk `release(A)`; Build `landed`; hand-over `asking(N)` | ref `trunk`; reconcile requests `keel:A:verify:handover` (basis `handover.md`), removes the worker worktree, stops nothing that is running |
| 20 | Owner answers `accept` → store creates `keel.answer` in A → kernel | Ask matches → Verify `accepted` → no asks or agents remain | `keel.project.asks` cleared |
| 21 | Owner merges N into main by hand | Keel is not involved | |

### 2. A design that sets precedent

| # | Caller → owner module | What happens | Records changed |
| --- | --- | --- | --- |
| 1 | Owner `create` + prompt; designer explores with `dispatch{jobs:[how, why]}` → `dispatch.fanOut` | Children X1 and X2 are owned by the tool call's task; their answers return as tool output | tau: child conversations |
| 2 | Designer `ground{shape:"sets_precedent", ambiguities:[], frame:{task, rubric}}` → adopt → Design | Arena a1 framed; stage `arena(candidates)`; effect dispatches seats 1 and 2 with one prompt | `keel.design` (+ work records); E1 |
| 3 | E1 → `fanOut` (owner = the effect task) | Candidate children Y1 and Y2 answer → Design records c1 and c2 (conversation, answer entry, model); `arena(judge)` | `keel.design`; E2 |
| 4 | E2 judge → Design `synthesizing` | | D (`synthesize.md`: frame, both candidates in full, judge) |
| 5 | Designer `publish_mandate{draft, base c1, grafts [S2←c2], riders [r1 evidence, r2 incidental, r3 seeded]}` → Design | Revision 1 (synthesis); `challenge` | E3 (challenger) |
| 6 | E3 → Design `answering` → designer `publish_mandate{…}` | Revision 2 (challenge); round 1; `review` | reconcile requests `mandate` and `rider/r1..r3`: four decisions, each with a basis entry |
| 7 | Owner answers r1 `bind` and r2 `delegate` → `keel.answer` ×2 → Design | Dispositions recorded; asks are now `mandate` and `rider/r3` | `keel.design.riders` |
| 8 | Owner answers `mandate: revise` with annotations 1 and 2 → Design | Round 1 answered; `revising` | Decision `rider/r3` withdrawn (no longer declared); D (`revise.md`, numbered) |
| 9 | Designer `publish_mandate{…, replies:[1, 2], riders [r3]}` → Design (replies validated complete) | Revision 3; round 2; `review` | Asks `mandate`, `rider/r3` |
| 10 | Owner: r3 `bind`; `mandate: approve` with annotation 1 → Design | All riders disposed, none rejected → `bound(3)` → Build `mandate_bound(3)` | `keel.design`, `keel.build`; E (`start_build`) |
| 11 | Coordinator `publish_plan{add enc (encode), add ledger deps [enc], add cli deps [enc]; replies [1]}` → Build | `applyPlan`: `needsEncode` holds, both depend on enc, approval note 1 answered → i1 to i3 planned; i1 briefing | `keel.build` |
| 12 | i1 (Encode) runs as scenario 1 steps 6 to 15 | Merged as M1; its checks are now under protected paths | `keel/A` → M1 |
| 13 | Build `item_merged(i1)` → `ready` returns i2 and i3 | Both `briefing`: two coordinator expectations, two queued inputs | D ×2 (`brief-request.md`) |
| 14 | Two `brief_item` calls; two worktrees from M1; two workers in parallel | i2 is the item that depends on i1, now unblocked | E ×2, workers W2 and W3 |
| 15 | Both publish and pass. Verify's merge queue runs one at a time: i2 onto M1 → M2, then i3 onto M2 → M3, each checked against the branch as it stands then | Neither merge is a review round | `keel.verify.mergeQueue`, `keel/A` |
| 16 | Close, hand off, full set, land, hand over, as scenario 1 steps 16 to 20 | | |

### 3. A worker finds that a seam in the Mandate is wrong

State at the start: work A is bound at revision 3. i1 (Encode) is merged. i2 (touches S2) is being built by W2. i3 (touches S3) is being built by W3. i4 (deps [i2], touches S2) is planned.

| # | Caller → owner module | What happens | Records changed |
| --- | --- | --- | --- |
| 1 | W2 `file_finding{text, nodes:["S2"], blocking:true}`; `observe` reads W2's HEAD F → Queue | Finding #7 is filed (source: worker; context: rev 3, F). The queue resolves i2 through Build's view (`itemOf(W2)`) → Build `hold{#7, agent W2}` → i2 `held(attempt kept)`; W2 paused | `keel.queue`, `keel.build`; S (stop W2's run); the investigator is created if absent (conversation Q becomes the project anchor); D (`investigate.md`) |
| 2 | Investigator (optionally `dispatch` to reproduce) `report_investigation{#7, class mandate_wrong, affects {A, [i2, i4], [S2]}, recommendation build}` → Queue | Classified; batch b3 → Build `hold{#7, [i4]}` → i4 `held(no attempt)`; ask `triage/b3` | `keel.queue`, `keel.build`; decision in Q |
| 3 | Meanwhile W3 publishes i3 → verified → merged M4 | Unaffected work continues on revision 3 | `keel.verify`, `keel.build` |
| 4 | Owner answers b3 `build` with note 1 → `keel.answer` in Q → Queue | #7 routed → Design (work A) `propose{[#7], notes}` → `proposing` | `keel.queue`, `keel.design`; D (`propose.md`) |
| 5 | Designer `publish_mandate{rev 4 with S2 changed, riders [r4], replies [1]}` → Design | Revision 4 (proposal); round 3; `review`. Bound is still 3 | Asks `mandate`, `rider/r4` |
| 6 | Owner: r4 `delegate`; `mandate: approve` → Design | `bound(4)` → Build `mandate_revised{4, changed [S2], answers [#7]}` | `keel.design` |
| 7 | Build | i2 and i4 are marked `answered(4)` but stay held. Coordinator `planning(revised 4, [S2])` | `keel.build`; D (`replan.md`, listing the held items) |
| 8 | Coordinator `publish_plan{add i5 correction of i1 (encode: S2's checks), deps of i2 += [i5], edit i4 goal and deps [i2]}` → Build (`applyPlan`: held items may gain deps, i4 is unstarted, i1 stays a merged record) | i5 starts (ready). i2 and i4 stay held (answered) until their deps merge | `keel.build`; D (`brief-request.md` for i5) |
| 9 | i5 is built, verified and merged → `ready` | i2 → `building(resume: rev 4 changes, note 1)`, W2 unpaused in its own worktree; its resume input tells it to merge the build branch first. After i2 merges, i4 → `planned` and starts with a brief rendered from revision 4 | `keel.build`; D (`resume.md`) to W2 |

If the owner had answered `drop` at step 4, the queue would send `release{#7, resume}`, and i2 and i4 would continue under revision 3. If the owner had messaged W2 directly and W2 had published, Build would accept the call (`self.ownerInput`), publish, and send `settled_by_owner`. Batch b3 would then empty, and its decision would be withdrawn in that commit.

### 4. The server is killed twice

**(a) Between a worker publishing and the verifier starting.**

| Kill point | In the store | On disk | On restart |
| --- | --- | --- | --- |
| Inside `publish_build`, before its commit | The tool task's intent; no keel change | The worker's commit S on its item branch | The replay-safe tool reruns: no receipt, `observe` reads S again, then one commit. Published once. |
| After the publish commit, before or during E (checkout) | Build `published(b)`, Verify `checking_out(K)`, `keel.work.effects[K]` planned, the receipt | Nothing at K, or a partly made worktree registered with lock reason `keel K` | The tool task, if rerun, returns its receipt. E reruns `converge(checkout)`: a path locked as `keel K` is keel's, so it is forced to S and checked clean. A path that fails the proof returns `occupied`; Verify plans a new key and path and leaves the other alone. Then one commit: `verifying`, the verifier conversation, and D. |
| After the checkout commit, before D submits | `verifying(seq)`, agent record with the open token, D pending | Checkout ready | D reruns `submit`: the token is still open, so it submits with `requestId = token`. If it had submitted before the kill, tau returns the same submission. Then `watch` re-attaches the same way. |

**(b) While a build is landing on trunk.** Trunk's `holder = A` survives, so no other build's landing starts.

| Kill point | In the store | On disk | On restart |
| --- | --- | --- | --- |
| During `take_trunk` | Landing `taking_trunk(key T, expected H)` | Integration worktree possibly mid-merge or mid-checks. `keel/A` is either H or advanced by T's own commit (trailer `Keel-Effect: T`, parent H) | E(T) reruns. The integration worktree is proven keel's by its lock reason: abort any merge, detach at H. If `keel/A` already holds T's commit, use it; otherwise redo the merge and checks, then CAS from H. If `keel/A` is anything else, the result is `moved` → a finding; nothing is reset. |
| During `land` | Landing `landing(key L, expectedTrunk T0, combined C)` | Possibly an unreferenced commit object; possibly `trunk` already at N (trailer L, parent T0) | E(L) reruns. Trunk at T0: commit and CAS again (a stray object is harmless). Trunk at a commit with trailer L on T0: that is the landing, and nothing is made twice. Trunk anywhere else: `moved` → `taking_trunk` again, still holding the lock. |
| After the landed commit | `landed(N)`, lock released, hand-over decision open | Trunk at N | Nothing to redo. |

## Tradeoffs accepted

- **Reconciler bugs are systemic.** We accept one place where a reconciliation bug affects every lane, in exchange for no lane being able to forget to withdraw, dedup, plan or stop. The kernel gets the most tests: a toy lane, plus randomized event sequences checked against invariants such as "every open ask is declared" and "every declared token has exactly one delivery".
- **Redundant basis rendering.** Every commit that touches a lane recomputes its declarations and hashes each basis, which costs CPU on large Mandate bases. In exchange there is one source of truth with no stored copy of what was asked.
- **Many owner decisions per round.** One decision per rider plus one per Mandate revision means more items in the inbox. In exchange, blanket acceptance is impossible by construction, using tau's own primitive.
- **An extra coordinator turn per item.** The brief is written at start, so it is never stale.
- **Always a coordinator and a full-set pass.** Even a one-item bug gets them, at the cost of two short agent runs, in exchange for one code path.
- **Code-run arena.** The arena is run by code, which removes freedom from the designer. In exchange, at least two seats, every candidate kept, judge before synthesis, and challenger before the owner are guarantees, not hopes.
- **Merge checks run by code.** Merge-time checks are the Mandate's proof commands run by keel, not an agent. A semantic clash that no check catches reaches the full-set verifier, not the merge.
- **A long watch per delivery.** A `keel.deliver` task stays waiting in memory for the length of the agent's run. A crash costs a rerun that re-attaches by `requestId`. Five crashes during one run fault only that watcher, so that token loses its nudge.

## Alternatives considered

- **Imperative lanes calling kernel primitives** (`ask()`, `deliver()`, `effect()`, `withdraw()`). Fewer concepts, and every call site visible. It lost because every situation change must remember its paired withdrawal or dedup. That is the first slice's defect class, moved into discipline. Interface depth is lower: the kernel hides less, and lanes must learn decision and delivery rules.
- **A durable task per item or per piece of work as the state machine** (phases, `waiting` on child tasks). It uses pi-durable natively. It lost because agents report through tool calls, not tasks, so every tool would have to poke a task. Long-lived tasks also break on upgrades (a removed phase faults, restarts count), and their checkpoints are harder to migrate and inspect than documents.
- **Event-sourced keel entries per work, with projections.** It gives a perfect audit trail. It lost because entries cannot be scanned by kind and are never migratable, so every old event shape must be read forever. Documents are needed for fast reads anyway.
- **One work document with one reducer.** It is simpler routing. It lost because it fails the one-lane-one-folder test: every change touches the shared reducer and its state shape.
- **Background dispatch** (anchor and reporter tasks, pi-durable example 22). It suits fan-out that outlives the caller. It lost for now because keel's fan-outs are inside a stage, where the caller waits anyway. It adds two task kinds and a delivery path for no current caller.

## Open questions and risks

- **Ground.** Should it stop for the owner on gaps, not only ambiguities? The Minos session's two decisive turns came early and unprompted. With this design they reach the designer as direct messages, and the arena may already be running.
- **Merge integration.** Is the Mandate's proof commands, run by code, enough at merge? Or should a semantic integration check by an agent run when a merge was not a fast-forward?
- **Trunk moved before landing.** When trunk moved since the full-set pass, should the combined result get an agent's look, or are proof checks enough?
- **Same-provider seats.** Should arena seats on the same provider refuse to run instead of warning? Provider is used as the proxy for model family.
- **Owner `stop`.** What should keel do when the owner stops a keel agent from the client? The watcher treats an `aborted` settlement as deliberate and does not nudge, so the expectation stays open until the owner messages the agent again. Should keel instead show a stopped agent as a stall in the queue, so the work cannot sit silently?
- **Risk: receipt documents.** Receipts are task-scope documents on pi-durable's own `pi.tool` tasks. The sketch assumes extensions may create a document on a built-in task. Slice 1's first test checks this. The fallback is a conversation document keyed by task ID, pruned when the tool task is terminal.
- **Risk: commit-time preload.** Each commit preloads the views of every open piece of work. Fine at a handful; it needs an index if the owner runs dozens at once.
- **Risk: watch restart counts.** A long agent run under a crash-looping server can fault its watcher (restart limit). The work continues; only that token's nudge is lost.

## Slice order

Each slice starts by writing, before any code, every way it could fail. Tests for those come first, at the cheapest seam that exposes them: pure lane tests take milliseconds; kernel tests use MemoryStorage with the faux provider; repo tests use temporary git repositories; crash tests use the repository's SIGKILL child-process pattern at about 250 ms each.

1. **Kernel and the delivery loop.** Scenarios 1 and 4.
   - Ships `defineState`, `transact` and reconcile, the tool wrapper, the four tasks, every `repo` op, `ROLES` and options, and Design's Ground with the prompt-Mandate path (sets-precedent work gets "not yet").
   - Ships Build in full (a plan of N items is the same code as one), Verify in full (convergence, diagnosis, merge, full set, Land, trunk lock, Hand over), and the queue without the investigator: keel-filed findings carry a preset class and each forms its own batch.
   - Failure list (abridged): a replayed publish; a continuation run twice; an answer to a superseded situation; a decision left open after its situation moved; a duplicate input after a crash; a path keel did not make removed or reset; trunk overwritten after it moved; two landings at once; a hash from a model; a state shape changed without a bump; integration counted as a review; a third fix attempted without a stop; a block without grounds accepted; agents stopped before cancel was stored; a silent stall after a failed run.
2. **Mandate rounds and principles.** Shape without the arena: the designer writes the Mandate. Ships review rounds, numbered replies, riders as decisions, approval notes owed by the coordinator, the Encode rule, the principles index, the `principle` tool, bindings, triggers and the unbacked-citation check.
3. **Queue and live plan.** Scenario 3. Ships the investigator, classes, batching, routes, holds and resumes, revision proposals, `settled_by_owner`, owner findings (hand-over findings, owner-provenance filing, Ground's `finding` route) and approved references.
4. **Dispatch and the arena.** Scenario 2. Ships `dispatch/`, seats for the designer, worker and investigator, the code-run arena (candidates, judge, challenger), and `base:` and `arena` choices.
5. **Override-to-check and the sweep.** A rejected hand-over names its missing check. The architecture and verification sweep is a sleeping task that re-arms itself and files into the queue. Bindings are proposed from citation counts.

## Next implementation step

Write slice 1's failure list. Then write the kernel tests against a toy lane, covering asks, agents, expectations and effects reconciled against records, `keel.answer` acting once, and receipts under replay. Then implement `transact`.

## Synthesis decision

Not applicable: this is a single candidate.

## Red-flag screen

| Red flag | Verdict |
| --- | --- |
| Shallow module | Kernel, repo and dispatch each hide much behind one or two calls. Lanes are deep in the other direction: one interface, all workflow policy. |
| Information leakage | The decision subject format, token format, on-disk layout and git commands each live in one file. Lane state shapes never leave their lane: other lanes read `view()` through `public.ts`. |
| Temporal decomposition | Modules own knowledge (Mandate, plan, verdicts, queue, git, fan-out), not steps. Verify spans Verify, Land and Hand over because it owns "is this commit fit for trunk". |
| Pass-through method | The tool wrapper adds gate, receipt, observe and terminate policy; no forwarding layers. |
| Split ownership | Every record has one writer (table above). Item state is two records, Build's attempt and Verify's check, each with one writer, joined only through views and messages. |
| Two ways to do one task | One way to ask the owner (declare an ask), reach an agent (declare an expectation), touch git (declare an effect), and talk across lanes (`send`). Lanes have no `Tx`, so there is no second way. |
| Importable internals | Cross-lane imports go only through `public.ts`, and dispatch imports no keel code. A boundary test enforces both. `Sha` cannot be constructed outside `repo/`. |
| Hand-synced list | Roles, options, tool lists and seats derive from `ROLES` and `ToolSpec.roles`. Lanes and views derive from `lanes/index.ts`. Prose slots are checked by `prose()`. Effect executors are an exhaustive typed map. |

## Where the task or the grounding is wrong or contradictory

- **When non-convergence stops.** The task says "a stop when a block survives two fixes". The workflow's stop list says "survives two fixes and a fresh diagnosis by another agent". Its Verify lane says two fixes, "a fresh diagnosis by another agent, and then goes to the queue". I chose: two survived fixes, then a fresh diagnosis, then the queue (the stop). The owner's "build" resumes with the diagnosis.
- **Does filing stop the filer?** "Nothing that lands in the queue stops the work that found it" (§6, Findings) conflicts with scenario 3 and with "Only affected items pause". I resolved it with `blocking`: a filer that cannot continue holds only its own item.
- **Who writes a precedent-following Mandate?** "The prompt as the Mandate" leaves open who writes its predicate and proof. Here the designer writes a small Mandate under the prompt's authority, unseen by the owner until hand-over.
- **"An agent has no role name to check"** (§6, Structure) is true of tau. Keel's binding record gives every keel conversation one, and the section uses resolved tools anyway.
- **The grounding** matched every type I checked: task ownership is the same conversation, `requestId` returns the existing submission, and `conversationId` places a task in another conversation. Three claims this design leans on are inferred, not verified there or by me. These are task-scope documents on built-in `pi.tool` tasks (receipts), the content-insensitivity of `requestId` (the watch resubmits identical content, so it is unaffected), and whether `api.commit` rejects after an abort. All three are first tests in slice 1.
- **Rationale template.** The template asks for a "Synthesis decision", which a single candidate cannot fill.

## What this design decides that the task did not ask

Each line gives the choice, then the cost of changing it later.

1. Lanes are pure reducers that declare asks, agents and effects, and one kernel reconciles them. Changing this is a rewrite of every lane.
2. A piece of work is identified by its anchor (designer) conversation, and its lane states are documents on it. Changing this is a storage migration of every record.
3. The anchor designer stays as the owner's desk for the work after Mandate approval. Changing this is low cost: prose and one agent declaration.
4. Owner provenance means the latest input entry is a `pi.user` entry, not a `keel.input`. Changing this is medium cost: the tool gate semantics.
5. An owner's direct action on a held agent supersedes the open finding (`settled_by_owner`). Low cost: one message type.
6. Each rider is its own decision (bind, delegate, reject). Medium cost: Design's asks and prose.
7. An approval binds only when every rider is disposed with none rejected. Low cost.
8. Ground stops only on ambiguities (two readings), never on gaps. Low cost: one stage.
9. Precedent-following work binds a designer-written Mandate under the prompt's authority, with no owner stop. Medium cost: adds a stop.
10. Ground's `finding` route turns a created conversation into a queue filing. Low cost.
11. Code runs the arena; the designer only frames and synthesizes. Medium cost: Design stages and prose.
12. Arena candidates are their final answer text, kept as entry references. Medium cost: artifact storage.
13. The arena has as many candidates as configured seats, two or three. Low cost.
14. Same-provider seats proceed with a warning shown in the basis. Low cost.
15. The challenger runs once, before round 1 only. Low cost.
16. Every round's basis includes every candidate in full. Low cost: a template.
17. Proposal rounds use the same review, and `decline` there keeps the bound Mandate. Low cost.
18. Every build has a coordinator, even a one-item bug fix. Low cost.
19. Items start in two steps: the coordinator's `brief_item` at start, then the worktree. Medium cost: Build states.
20. Encode is required only when the Mandate has seams, crossings or probed rules. Low cost.
21. `max_workers` defaults to 3 per piece of work. Low cost.
22. Rework happens in place: same attempt, worker and worktree. A new attempt is made only for an occupied path. Low cost.
23. A held item's worker is paused (its run aborted), not retired. Low cost.
24. Merge-time integration checks are the Mandate's proof commands run by keel. Medium cost: a new agent step.
25. Conflicts or failed checks at merge go back to the item's own worker as `integrate`. Low cost.
26. The full set is verified on every hand-off by a fresh `full/verifier`, which also writes the hand-over summary. Low cost.
27. The combined result after taking trunk is checked only by proof commands. Medium cost.
28. Landing is one `commit-tree` commit with a `Keel-Effect` trailer, written to trunk by compare-and-swap. Medium cost: the repo op and the history shape.
29. Trunk is created from `base` (default `main`) when absent, and the branch names are options. Low cost.
30. The trunk lock is released on a landing conflict and requested again later. Low cost.
31. Non-convergence is two survived fixes, then a fresh diagnoser, then the queue. Low cost: one constant and one stage.
32. One verifier conversation per item across builds; a fresh diagnoser per thread. Low cost.
33. A superseded failed build's checkout is removed. Worker worktrees are removed after landing. The integration worktree is kept. Low cost.
34. Notes go to the hand-over; only notes marked `followUp` and edge cases are filed. Low cost.
35. Every finding is investigated, including keel-filed ones with a preset class. Low cost.
36. One investigator per project, and its conversation is the project anchor for triage decisions. Medium cost: open decisions point at it.
37. Triage choices and their meanings vary per class (bless, revoke and defer for patterns). Low cost.
38. The queue keeps a registry of owner-blessed patterns as approved references. Low cost.
39. A stall gets one automatic nudge per token, then goes to the owning lane. Low cost.
40. A failed effect is retried three times with a sleeping backoff, then reported to the lane. Low cost.
41. Worktrees and checkouts live in `<git-common-dir>/keel/<work>/`. Low cost before first use; afterwards, existing paths stay where they are.
42. Project principles and playbooks live in `.keel/`, and `.keel/` is protected. Medium cost: projects adopt the path.
43. The protected-path tripwire is checked at publish from the git diff, and it holds the item. Low cost.
44. A ruling's cost if wrong is a level plus text, so the hand-over can order rulings by level. Low cost.
45. Stored types have no optional fields, plus per-version shape fixtures. Medium cost: a test discipline.
46. Delivery watching (`keel.deliver`'s `watch` phase) is used instead of an `afterRun` hook. Low cost.
47. Four lane models are required; every role and sub-role model is optional. Low cost.
48. Decision subjects are `keel:<work|project>:<lane>:<local>`. High cost once decisions are open: changing it orphans them.
49. A changed basis text re-asks the owner (tau supersedes the old decision). Low cost.
50. Cancel is accepted only from the anchor, on owner provenance, and worktrees are kept for inspection. Low cost.
51. A blocking `file_finding` ends the filer's run and holds only its item. Low cost.
52. Instructions and models are reconfigured at every delivery. Low cost.
53. A delivery that settles `aborted` is treated as a deliberate stop: no nudge and no stall. Low cost.
54. Keel's own inputs are submitted as a custom entry kind, `keel.input`, to make owner provenance structural. Medium cost: provenance and the stall check rely on it.
55. Verdict scope comes from the verifier's expectation, never from arguments, and only six block grounds are accepted. Low cost.
