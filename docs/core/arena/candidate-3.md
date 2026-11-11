# Render core: working design

This folder tracks the redesign of Render from zero. It is a working record, not a specification. Nothing in it is implemented, and `docs/spec.md` does not bind it.

Every entry has a status:

- **Decided** means the project owner agreed.
- **Proposed** is a recommendation that waits for a decision.
- **Open** has no recommendation yet.

## The goal

Render makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue. `docs/ambition.md` holds the full statement.

The first version welded one software-development workflow into its authority and its runtime. It grew to 18,826 source lines and never ran its full journey end to end. The redesign keeps the guarantees and moves every workflow out of the core.

## The shared understanding

**Decided.**

- The core is small. It runs alone as a basic durable agent.
- The core sits on pi-durable and does not rebuild what pi-durable provides.
- The core adds what pi-durable lacks for the goal. Today that is Decision and Event.
- Everything else is an extension. A workflow is an extension that defines a way of working. Earlier documents call the same thing a kernel.
- Extensions are trusted code that runs in the host process.
- The core grows only on purpose. The admission test below makes "on purpose" checkable.
- The language is strict TypeScript, with pi-schema at each boundary where outside data enters. Effect and Vite are out.
- Prose belongs to the workflow that uses it.
- One server hosts all projects. Each project selects its workflows. You connect to that one server from several machines.

## The layers

| Layer | Owns | Status |
| --- | --- | --- |
| Client | A CLI, a TUI, or a web UI. It holds one connection to the host. | Open |
| Host | The process. It authenticates devices, keeps the project catalogue, routes each call to a project, and merges the decisions of all projects into one inbox. | Proposed |
| Core | One store. It opens a pi-durable harness and adds Decision and Event. | Decided |
| pi-durable | Conversations, submissions, tasks, documents, extensions, and the registry. | Decided |
| Extensions | Workflows, tools, and roles. Each one is a pi-durable `Extension`. | Proposed |

The core imports pi-durable. The host imports the core. Extensions import pi-durable and three core functions. The core never imports an extension or a shared library such as `prose()`.

## A change enters the core only if it passes four checks

**Proposed.**

1. The bare agent cannot run without it, or both proving workflows need it.
2. An extension cannot build it from what exists. One of these must be true:
	- It needs the store's commit, the client API, or the device identity.
	- A client must understand it without knowing the workflow.
	- Two extensions must agree on it to work together.
3. It names no workflow concept. A role, a phase, and an artifact type are workflow concepts.
4. Its data shape is written in this folder first, and the shape survives a paper walk through both proving workflows.

The reverse rule also holds. When pi-durable gains a feature, the core's copy is deleted.

How the current candidates score:

| Candidate | Result | Reason |
| --- | --- | --- |
| Decision | Core | It needs the client API and the device identity. A client shows it without knowing the workflow. |
| Event | Core | A client shows a timeline without knowing the workflow. |
| Project | Host | With one store per project, the core needs no project concept. |
| `prose()` | Shared library | It needs nothing from the store, the client API, or the device identity. |
| Reactors | Out for now | No two extensions need to hear each other yet. |
| Lifecycle callbacks, client actions, document exposure | Out for now | Neither proving workflow is known to need them. |

## Decision log

| Topic | Status | Detail |
| --- | --- | --- |
| The core sits on pi-durable | Decided | [Grounding](grounding.md) |
| The target is the latest pi-durable, now 1.5.2. No older version is pinned. | Decided | [Grounding](grounding.md) |
| The core does not use a Chord host | Proposed | [Grounding](grounding.md) |
| Decision and Event are core primitives | Decided | [Primitives](primitives.md) |
| The shapes of Decision and Event | Decided, with three proposed refinements | [Primitives](primitives.md) |
| Extensions are trusted in-process code | Decided | |
| Strict TypeScript, pi-schema at boundaries, no Effect, no Vite | Decided | |
| `node --test` as the test runner | Proposed | |
| Prose is owned by the workflow | Decided | [Prose](prose.md) |
| A shared `prose()` library beside the core | Proposed | [Prose](prose.md) |
| One server for all projects, workflows selected per project | Decided | [Topology](topology.md) |
| One store per project inside that server | Proposed | [Topology](topology.md) |
| An extension is a pi-durable `Extension`, unwrapped | Proposed | [Primitives](primitives.md) |
| The admission test | Proposed | This file |
| W1, design to merge, as a proving workflow | Decided | [Proving workflows](workflows.md) |
| W2, thesis to verdict, as a proving workflow | Proposed | [Proving workflows](workflows.md) |

## Open questions

- **Forged answers.** An agent with a shell runs as the same OS user as the host. It can call the client API or edit the store, and so answer its own decision. Closing the gap needs agent shells in a sandbox or under another OS user. The lean is to accept the limit for now and record it.
- **Shared knowledge.** How one project adopts knowledge from another. See [Topology](topology.md).
- **Client API.** The protocol and the first client.
- **Store location.** Where a project's store and the project catalogue live on disk.
- **Bare tool set.** Whether the bare agent selects pi-durable's coding tools by default.

## Next steps

1. Lock W2.
2. Decide the topology.
3. Walk W1 and W2 through Decision and Event on paper. Change the shapes where the walk breaks them.
4. Spike the one mechanism that reading cannot settle. That is `answer` creating the continuation task in one commit.

## Files

- [Primitives](primitives.md) has the shapes of Decision and Event, and how an extension reaches them.
- [Topology](topology.md) compares three ways to host many projects.
- [Prose](prose.md) compares four ways to bind facts into instructions.
- [Proving workflows](workflows.md) describes W0, W1, and W2.
- [Grounding](grounding.md) lists the facts this design rests on, with sources.
- `spikes/two-harnesses.mjs` checks that one process can drive two harnesses.
# Primitives the core adds to pi-durable

pi-durable already persists conversations, tasks, and documents. It has no way to ask a human, to record what the human decided on, or to show what happened in terms a client understands without knowing the workflow. The core adds two primitives for that. Both are built from pi-durable parts.

The shapes below are **Decided**, except where a line says **Proposed**. None of it has run. The paper walk through the proving workflows comes first.

## Why a decision is not a waiting task

A pi-durable task parks on other tasks or on a clock. It has no state for "wait for something outside" (measured, `packages/durable/src/types.ts:660-693` at pi `b2aabe0`). A wait held in memory counts as a crash on each unclean restart (reported).

So the work that asks ends. The answer starts new work.

## Decision

A Decision is a durable request to the human. It names exactly what the human reviews, and it records who answered.

```ts
type Decision = {
	id: DecisionId;
	subject: string; // stable key chosen by the workflow, one open decision per subject
	title: string; // one line a client shows without knowing the workflow
	basis: EntryId; // the entry the human reviews
	choices: readonly string[]; // opaque to the core, for example ["approve", "revise"]
	then: { task: string }; // extension task that runs once the decision is answered
} & (
	| { status: "open" }
	| { status: "answered"; choice: string; notes?: string; by: DeviceId; at: number }
	| { status: "superseded" }
	| { status: "withdrawn" }
);
```

Three refinements since the shape was agreed are **Proposed**:

- **`basis` is always an entry ID.** The workflow appends an entry that holds the reviewed content, such as a design revision. Entries never change and have global IDs, so the ID names exact content with no hash. A client renders the entry without knowing the workflow. For work outside the store, the entry records a content address such as a commit SHA.
- **`title` is new.** Without it an inbox can only show a key.
- **`by` is a device ID, not an actor.** One human uses several devices. Agents never answer, so no wider actor type is needed.

### Operations

| Operation | Caller | Behavior |
| --- | --- | --- |
| `request(tx, { subject, title, basis, choices, then })` | Extension code, inside its own commit | Opens a decision. If the subject has an open decision with the same basis, `request` returns that decision. If the basis differs, `request` marks the open decision superseded and opens a new one. |
| `withdraw(tx, subject)` | Extension code, inside its own commit | Closes the open decision without an answer. |
| `answer(id, { basis, choice, notes }, device)` | The host, for a client | Does all of the following in one commit, or nothing. |

`answer` checks that the decision is open, that the quoted basis equals the stored basis, and that the choice is one of the choices. Then it records the answer, emits `decision.answered`, and creates the `then` task with the decision ID as input.

`answer` returns a value for each refusal. It does not throw.

| Refusal | Cause | What the client does |
| --- | --- | --- |
| `stale_basis` | The workflow revised the content after the client loaded it. | Reload and show the new basis. |
| `not_open` | The decision was answered differently, superseded, or withdrawn. | Reload. |
| `unknown_choice` | The choice is not in `choices`. | Fix the client. |
| `workflow_not_loaded` | No installed extension provides the `then` task. | Leave the decision open. |

A repeat of the recorded answer returns the recorded answer. A client that retries after a lost reply converges on one result.

### What stays out

Approval policy, routing per choice, timeouts, and comment threads are workflow concerns. A workflow reads `choice` and `notes` in its `then` task and does what its rules say.

### Only a human answers, and how far that holds

`answer` is exported to the host only. The entry point that extensions import does not have it, and no tool wraps it. A lint rule on imports can check that.

Extensions are trusted code, so the rule is a boundary and not a wall. See the forged-answers question in the [README](README.md).

## Event

An Event is one line in a timeline that every client can show.

```ts
type Event = {
	id: EntryId; // global order
	at: number;
	type: string; // for example "decision.answered" or "design.revised"
	text: string; // one line a client shows without knowing the workflow
	conversation?: ConversationId;
	data?: Json; // for the workflow that emitted it
};
```

`emit(tx, { type, text, conversation, data })` appends the event inside the caller's commit. The event exists only if the change it describes committed.

The log is one conversation that no agent owns and that never runs. Each event is a typed entry in it, so entry IDs give one order. Ultimate uses the same construction (measured, `server/events.ts:1-5` at ultimate `7eb49b8`).

The core emits `decision.requested`, `decision.answered`, `decision.superseded`, and `decision.withdrawn`. Workflows emit their own types.

### What stays out

Reactors with cursors stay out until two extensions must hear each other. A `refs` field for evidence entries stays out until the paper walk needs it.

## What each need reuses

| Need | pi-durable part | New in the core |
| --- | --- | --- |
| The decision record | A typed document written in the caller's commit | The shape above |
| The exact basis | Immutable entries with global IDs | An equality check in `answer` |
| Work after the answer | `tx.createTask` in the commit that records the answer | Nothing |
| Finding the `then` task by name | `registry.snapshot().task(name)` | Nothing |
| Telling an agent the answer | `submit(tx, draft)` from the `then` task | Nothing |
| The event record | A typed entry | The envelope and `emit` |
| A live timeline | A watch on the log conversation | Nothing (inferred) |

Sources for the pi-durable column are in [Grounding](grounding.md).

## How an extension reaches the core

**Proposed.** A Render extension is a pi-durable `Extension` with no wrapper. It bundles tools, prompt sections, hooks, wraps, and tasks under a name.

It reaches the core through three functions: `request`, `withdraw`, and `emit`. Each takes the `tx` that the extension already holds. No handle is passed in and no registration step exists.

A project's configuration names the extension modules to load. The host installs them in that project's registry. With no explicit selection, a conversation gets every installed extension in install order (measured, `packages/durable/src/harness/types.ts:632-633`).

Ultimate adds four more surfaces to its extensions: lifecycle callbacks, client actions, document exposure, and typed services (reported). Each one enters Render when a proving workflow cannot be built without it, and not before.

## Not verified

- The storage layout of decisions as a keyed document family has not been checked against the family API.
- The ownership options for the `then` task have not been traced.
- `answer` has not run. The spike in the [README](README.md) next steps covers it.
# How one server hosts many projects

**Decided.** One server hosts all work. Each project selects its workflows. You connect to that one server from several machines. Projects can later share some knowledge.

**Proposed.** Inside that server, each project has its own store.

## Three ways to do it

| | A. One store for everything | B. One server, one store per project | C. One process per project |
| --- | --- | --- | --- |
| Precedent | The pluggable-kernels design, revision 2 | None read | Ultimate |
| Client connections | One | One | One per project, or a hub |
| Project inside the core | Yes. Every decision, event, and query carries a project scope. | No. A store is a project. | No |
| Isolation between projects | By convention. Every extension holds a `tx` over all projects. | By construction. An extension holds a `tx` for one store. | By process |
| Workflow per project | Selection per conversation from one registry | One registry per project | One registry per project |
| Two versions of one workflow | Not possible. Task names resolve across the whole registry. | Possible | Possible |
| Shared knowledge | A read in the same store | The host copies a revision between stores, or serves a library store | Over the network |
| A bad store or a crash-looping task | Affects every project | Affects one project | Affects one project |
| One inbox across projects | One query | The host merges N open sets | Needs a hub |
| Solo use in one folder | A server with one project. The project scope is still there. | The same core on one store | Native |
| New code | Scope checks on every access path, and tests for them | A project catalogue, routing, and a merged inbox, all outside the core | A supervisor and discovery |

Evidence for the rows:

- Task names resolve "for every task, whichever conversations select this extension" (measured, `packages/durable/src/harness/types.ts:432`).
- The pluggable-kernels design lists the cost of A in its own table: "Every relevant access path needs project scope. Storage failure, schema incompatibility, or a fatal host error can affect all projects" (measured, `storage-and-knowledge.md:17` at `afc95d4`).
- Ultimate's README says "every project gets its own process and state home instead of one server for all of them" (measured, `README.md:160-164` at `7eb49b8`).

## Why B

B gives the single server and the single connection. It also keeps the core free of a project concept, and it makes isolation structural instead of tested.

A was chosen in the pluggable-kernels design to keep "project records, knowledge provenance, receipts, and runtime work in one transaction space" for a central ledger (measured, `storage-and-knowledge.md:13`). The new core has no central ledger, so that reason no longer applies (inferred).

B also fits the explicit sharing that design wanted. It says "a globally unique ID is a location, not a permission". Under A, any extension can read any project's documents, so a grant is a convention. Under B, an extension cannot read another project without a handle from the host (inferred).

## What B gives up

- **One commit across projects.** No current need is known. A knowledge revision is immutable, so a copy between stores can repeat safely (inferred).
- **One event order across projects.** The host merges by time for display.
- **One file to back up.** The data directory holds one store per project.

## What was checked

One Node process drove two pi-durable harnesses at once. Each had its own store and its own registry. Project B finished a run while project A was in the middle of a generation. Neither transcript nor extension selection leaked (measured, `spikes/two-harnesses.mjs`).

Limits of that check: in-memory storage and two projects. It passed on pi-durable 1.5.2, the target version.

To run it again:

```sh
mkdir /tmp/pi-latest && cd /tmp/pi-latest && npm init -y && npm install --ignore-scripts @earendil-works/pi-durable@1.5.2
cd - && PI_MODULES=/tmp/pi-latest/node_modules/@earendil-works node docs/core/spikes/two-harnesses.mjs
```

## Facts that shape the host

- pi-durable has no locking across processes. "One process writes a storage at a time" (measured, `packages/durable/README.md:894`). The host must hold one lock per store, as Ultimate does with `storage.lock` (measured, `server/harness.ts:228`).
- A harness can open a store read-only "as a viewer of a session that another process drives" (measured, `packages/durable/src/harness/types.ts:759-765`). A local run and the server could then share one store, with one of them as the writer. This was not run.
- A harness reports when it next needs a running process, so the host can close idle projects and reopen them on a timer (reported).

## Open

- Where a project's store lives, and where the project catalogue lives.
- How a project adopts knowledge from another project. The two candidates are a copy into the adopting store and a read from a library store that the host owns.
- Whether the host needs a limit on concurrent model calls across projects.
# How workflows bind facts into instructions

**Decided.** Prose belongs to the workflow that uses it.

**Proposed.** Workflows share one small function, `prose()`, that binds facts into Markdown files. It lives beside the core. The core does not import it.

## What pi-durable already renders

A workflow does not need its own renderer for the system prompt. pi-durable has one (measured, `packages/durable/README.md`, sections "System Prompt" and "Per-Conversation Agent"):

- An extension's sections render in order before each request. Each section reads committed documents.
- Each section is wrapped as `<key>...</key>`.
- Only a changed section is sent again, so the provider's prompt cache stays warm.
- What the model was told is stored in the transcript as `pi.system` entries.
- A conversation's `instructions` are stored on the conversation and render last.

So three delivery slots exist. `instructions` hold prose pinned to one run. Sections hold prose that follows live state. The input carries guidance for one step.

What is missing is narrower. A workflow has long prose with a few facts to fill in, and nothing checks that the facts and the prose match.

## Four ways to bind facts

| Option | Checks | Cost |
| --- | --- | --- |
| 1. TypeScript functions with template literals. Nothing is shared. | The compiler checks every fact. | Prose lives in code. Every backtick needs an escape. Conditions can move into the prose. |
| 2. Markdown files with named slots, and one shared `prose()` function. | The call site is typed. The file is checked against its declared slots when the module loads. | One small concept. Values are strings. |
| 3. A template language such as Handlebars or Liquid. | Run-time only. | A dependency. Conditions and loops live in prose, where the workflow's rules then hide. |
| 4. A typed catalogue of content blocks, as the pluggable-kernels design sketched. | Strong. | The most syntax. A format that grows into a language. |

Evidence:

- Real agent prose is full of backticks. Ultimate's 8 agent files have 342 backticks in 404 lines. The 23 pstack playbooks have 616 in 527 lines (measured, a character count over `agents/*.md` at ultimate `7eb49b8` and over `.agents/skills/poteto-mode/playbooks/*.md`).
- The pluggable-kernels design already ruled out option 3. "Body substitutions bind established facts; they do not contain `if new pass`", and "Do not commit a compiler or template dependency" (measured, `execution-skills.md:120-122` at `afc95d4`).
- `skl` binds named inputs into a resource with `--input name=value` and lists them with `--describe-inputs` (measured, `skl skill --help`). Option 2 is the same idea. The `skl` source was not read.
- Ultimate keeps agent prose as Markdown with frontmatter and has no slots (measured, `lib/agents.ts`).

## The recommendation is option 2, kept strict

```ts
const implement = prose(import.meta.dirname, "implement.md", ["pass", "contract", "base", "findings"]);

const instructions = implement({ pass: "2", contract: "C4", base: "B2", findings: bullets(findings) });
```

```md
You own implementation pass {{pass}} for {{contract}}.
Start from `{{base}}`. Address these findings:

{{findings}}

Run `npm run check` before you hand off.
```

The rules:

- A slot is `{{name}}`. A value is a string. Code formats a list before it passes the list in.
- `prose()` fails when the slots in the file differ from the declared names. The failure happens when the module loads, not in the middle of a run.
- Substitution is one pass. A value that contains `{{x}}` stays as text.
- A file has no conditions, no loops, and no includes. A different case is a different file, and workflow code picks the file.
- Composition uses what exists. Live prose is one section per file. Pinned prose is a string join into `instructions`.

One check covers every workflow: each prose file loads against its declared slots. No workflow needs its own test for that.

## Why it is a library and not a core primitive

`prose()` needs nothing from the store, the client API, or the device identity. No client has to understand it. It fails the second check of the admission test in the [README](README.md).

It still earns a shared home. Both proving workflows need it, and a prose file written for one workflow can be reused by another only if the slot format is the same.

## What `prose()` cannot do

It cannot pick the procedure. Which case applies to this run is a decision of the workflow's code, and no neutral layer can make it.

It does not separate instructions from data. A slot value that came from a repository or from a human is inserted as given. The prose author marks such values with tags.

## The line to hold

Template formats grow. The first request for an optional block or a loop is the point where option 2 turns into option 3. The answer to that request is a second file.
# Proving workflows

The core is proved by workflows that differ. A concept that two unlike workflows need is a candidate for the core. A concept that one needs stays in its extension.

These are tests of the primitives, not products. Each one is as small as it can be while still stressing something the others do not.

## W0, the bare agent

**Decided.** No extension is loaded. You open a project, send a message, close the client, restart the host, and continue the conversation.

W0 proves that the core runs alone.

## W1, design to merge

**Decided.** A slim version of the pstack flow and of the workflow in Render v1.

1. You send a prompt in a project that selects the workflow.
2. A designer agent writes a design document and opens a decision on it.
3. You comment, and the designer revises and asks again. Or you approve.
4. An implementer agent works in its own worktree.
5. A reviewer agent on another model checks the result.
6. A final decision gates the merge. Only you merge.

## W2, thesis to verdict

**Proposed.** W2 needs a model, the store, and a clock. It needs no shell, no Git, no network, and no files.

1. You state a claim that you can later check by hand.
2. An agent turns the claim into a protocol. The protocol has a statement that can fail, the observation that settles it, the criteria that kill it, a review time, and a probability.
3. A decision asks you to approve the protocol or to comment on it. Approval freezes the protocol.
4. A plain task sleeps until the review time. No model runs.
5. A decision asks you for the observation. The choices are "happened", "did not happen", and "unclear", with notes.
6. A plain task scores the observation against the frozen criteria. A critic agent writes what the result shows and what it does not show.
7. A decision asks you to keep, revise, or kill the thesis.

A live trial sets the review time two minutes ahead. A test passes its own clock to the harness and does not wait (measured, `now` in `packages/durable/src/harness/types.ts:732`).

W2 has the shape of quant research without the compute job: a protocol fixed before any result, then a verdict. A later quant workflow replaces steps 4 and 5 with a backtest task that produces the observation. That mapping is a guess about work not yet described.

## What each workflow stresses

| | W1 | W2 |
| --- | --- | --- |
| Basis of a decision | A design document that changes under review | A protocol frozen before any result |
| Choices | Approve or revise | Three observations, then keep, revise, or kill |
| Role of the human | Approves commitments | Approves, and also supplies evidence |
| Work after an answer | Starts an agent | Starts code with no model |
| Time | Minutes, driven by answers | Parked on a clock |
| Agents | Three roles | One or two |
| Outside effects | Git, a worktree, a shell | None |
| Timeline | Role handoffs | Long gaps between events |

Step 5 of W2 uses a decision to collect an observation and not an approval. If that reads wrong on paper, an observation is a plain message and Decision stays narrower. Either result is useful.

## The runner-up for W2

Panel to pick: several agents answer one question independently, a judge compares them, and you pick one. It stresses fan-out and a choice set that is built at run time. Its decision loop is close to W1's design review, so it separates the primitives less.

## Not done yet

Neither workflow has been walked through Decision and Event step by step. That walk follows the lock of W2.
