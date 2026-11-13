# Tau: working design

This folder tracks Tau, a redesign of Render from zero. It is a working record, not a specification. Nothing in it is implemented, and `docs/spec.md` does not bind it.

**The name.** The project was called Render until 2026-11-13. The owner renamed it: the core keeps continuity and human control, and workflows define how work happens, so "render" fits a workflow better than it fits the core. `render` may become the name of a workflow built on Tau. "Render v1" in these notes still means the first version. The repository, its branch, and the raw files of the arenas keep the old name.

Every entry has a status:

- **Decided** means the project owner agreed.
- **Proposed** is a recommendation that waits for a decision.
- **Open** has no recommendation yet.

## The goal

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue. `docs/ambition.md` holds the full statement, written under the old name.

The first version welded one software-development workflow into its authority and its runtime. It grew to 18,826 source lines and never ran its full journey end to end. The redesign keeps the guarantees and moves every workflow out of the core.

## The shared understanding

**Decided.**

- The core is small. It runs alone as a basic durable agent.
- The core sits on pi-durable and does not rebuild what pi-durable provides. The target is the latest release, now 1.5.2.
- The core adds what pi-durable lacks for the goal. Today that is Decision and Event.
- Everything else is an extension. A workflow is an extension that defines a way of working. Earlier documents call the same thing a kernel.
- Extensions are trusted code that runs in the server's process.
- The core grows only by the admission rule below.
- The language is strict TypeScript, with pi-schema at each boundary where outside data enters. Effect and Vite are out.
- Prose belongs to the workflow that uses it.
- One standard library sits beside the core. It holds `prose()` and `role()`. The core never imports it.
- One server hosts all projects. Each project selects its extensions, workflows among them. You connect to that one server from several machines.
- The bare agent selects pi-durable's `coding-tools`. Codemode is an optional extension.
- A client that reconnects gets the current state, not a replay.
- The client API is a list of what a client must be able to do. No client is designed yet, and the list grows as a real client is used. [Protocol](protocol.md) says how a call travels.
- A client chooses a project's extensions when it binds the project to the server.
- A workflow has options per project that a client can change, such as the model of a role. The core does not know what they are.
- You can open the conversation of any running agent and steer it, in a workflow as with the bare agent.
- The extension is the main unit, and a workflow is one kind of extension. Tau names and supports workflows, and other extensions do other jobs, such as web search. [Extensions](extensions.md) has the model.
- A project's working directory is a path that the client names when it binds the project.

## How this version was tested

Five times, each time in an arena: three authors work apart from one brief, and a judge from another model family scores them.

1. **The design.** The first draft of this folder was one of three designs. [Arena](arena.md) names the base, each part taken from the others, and what was rejected.
2. **The walk.** Three authors then walked W1 and W2 through that design, one commit at a time, to find where it breaks. [Walk arena](arena-walk.md) records the result, and [the walk](walk.md) is the merged walk. It found 23 gaps. Seven of them change the core, and each of those is marked "From the walk" where it lands. The owner reviewed the walk and accepted them.
3. **The host.** The owner then answered the walk's open questions. Three authors designed what the answers left: the client's calls, binding a project, a workflow's options, the faulted tasks, and joining a running agent. [Host arena](arena-host.md) records the result, and [Host](host.md) is the merged design.
4. **Extensions and Lane.** The owner asked that the extension be the main unit, and was considering a concept called Lane. Three authors designed the first and put the second through the admission rules. [Extension arena](arena-ext.md) records the result, and [Extensions](extensions.md) and [Lane](lane.md) are the merged notes.
5. **The protocol.** Three authors designed how a call travels. [Protocol arena](arena-wire.md) records the result, and [Protocol](protocol.md) is the merged design.

In the first three arenas the picker wrote the third design. Its designs scored lowest each time, and writing one biased its pick once. In the last two, all three authors were other agents, and the picker framed, probed, picked, and merged.

After each arena the picker ran a spike of the moves the merged design makes: `spikes/crash.mjs` kills the process at the points the walks argued about, and `spikes/host.mjs`, `spikes/ext.mjs`, and `spikes/wire.mjs` run the host, the extension model, and the protocol on stand-ins.

## What Tau ships

| Layer | Owns | Status |
| --- | --- | --- |
| Client | A CLI, a TUI, or a web UI. It holds one connection to the server. | Open. [Host](host.md) lists what it must be able to do, and [Protocol](protocol.md) how a call travels. |
| Host layer | The server process. It binds projects, opens one store per project under a lock, checks device tokens, serves the client, and merges the open decisions of all projects into one inbox. It also wires models and the execution environment into each harness. | Proposed |
| Store layer | One store. It opens a pi-durable harness and adds Decision and Event. | Decided |
| pi-durable | Conversations, submissions, tasks, documents, extensions, and the registry. | Decided |
| Extensions | Workflows, and extensions that do other jobs, such as web search. Each one is a pi-durable `Extension`. | Proposed |
| Standard library | `prose()`, `role()`, and `options()`, for workflow authors. | Decided. `options()` is Proposed. |

"The core" means the host layer and the store layer together. Both follow the admission rule. The first draft let the host layer escape it, and the judge was right to object.

The layers keep one import rule. The store layer knows no project. The host layer knows no particular extension. Neither imports an extension or the standard library.

With no workflow, a project can create a conversation, pick a model, send input, watch progress, abort, and reconnect. That is W0 in [Proving workflows](workflows.md). It is a chat with a coding agent, as in pi, that lives on the server.

## A change enters the core only by this rule

**Decided.** A change enters only when you decide it, on a written proposal of one page. The proposal shows five things.

1. **A real failure.** The bare agent or a proving workflow cannot do something today. The proposal names it.
2. **pi-durable does not provide it.** The proposal cites what was checked.
3. **An extension cannot keep the promise.** The change guards who may act at the boundary to the human and the client. Or it is a record that every client and every extension must read the same way. The proposal includes the extension that was tried and where it fell short. Convenience fails this check.
4. **Two unlike users.** Two workflows that differ use it with the same meaning, or a client that knows no workflow cannot work without it. A repair to the server's safety is the one exception.
5. **A small shape that names no workflow concept.** It is a type and a few functions over a `Tx` or the host. It adds no scheduler, loop, background process, or storage engine. A particular role such as "the designer", a phase, and an artifact type are workflow concepts. A way to define roles is not one. Checks 1 to 4 judge it.

The owner accepted the rule as written and asked that check 5 be reworded on roles. Its last three sentences are the new wording, and that wording is **Proposed**.

Check 4 speaks of two workflows. With the extension as the main unit, its proposed wording is: "Two extensions that do different jobs use it with the same meaning, or a client that knows no extension cannot work without it." W1 and W2 still count as two, and two search providers do not. This wording is **Proposed** too.

Two rules remove things:

- When pi-durable gains a feature, the core's copy is deleted.
- A core part with fewer than two users goes back out.

How the current parts score:

| Part | Result | Reason |
| --- | --- | --- |
| Decision | Core | A pi-durable task cannot wait for a human. Answering must stay on the client's side of the boundary. Both proving workflows use it. |
| Annotations on an answer | Core, as one field | Only the host records who sent a comment, and a client that knows no workflow needs one shape. It passes check 4 on the client clause only. |
| Event | Core, narrowly | A client shows one timeline without knowing the workflow. Both workflows emit. The walk found no extension that has to read events, so Event rests on the client alone. |
| Project binding, the client's calls, the protocol, and device tokens | Core, host layer | The bare agent cannot be reached from a second machine without them. [Host](host.md) lists the calls, and [Protocol](protocol.md) carries them. |
| A project's default selection of extensions | Core, host wiring | Only the host passes a harness its settings. The bare agent and an open role both follow it. See [Extensions](extensions.md). |
| The `secret` format on an option | Core, host layer | Only the host writes the reply to a client. It passes on the client clause alone. |
| The list of faulted tasks | Core, host layer | A faulted task runs no code, so it cannot report itself, and only the host can show it to a client. |
| A workflow's options | The workflow's own document, with a contract on its module for the host | A workflow can store and read its options alone, so the storage fails check 3. It cannot hear a client, so the host reaches the values through three members that the module exports. |
| `prose()`, `role()`, and `options()` | The standard library | None guards a boundary. [Standard library](library.md) has its own, lighter rule. |
| The execution environment | Host wiring only | The host passes one to each harness. pi-durable and pi-env provide the environments. |
| A factory that hands each extension its project | Out | The `tx` already names the store. |
| Reactors | Out | No two extensions need to hear each other yet. |
| Lifecycle callbacks, client actions, document exposure, typed services | Out | Tasks cover lifecycle, Decision covers actions, and imports cover services. |
| Expiry, quorum, comment threads, replies to annotations, approval policy | Out | A workflow builds each from a sleeping task, `withdraw`, and entries. |
| Annotations saved before the answer | Out for now | They need a second write call for clients. See "Accepted limits". |
| Removing an extension from a project | Out | Uninstalling does not park running work, and the owner accepted the limit. See [Host](host.md). |
| Lane | Out | It fails four checks for the core and two for the library. A workflow can build one, and notes come first. See [Lane](lane.md). |
| A key that makes "create a conversation" safe to repeat | Out | The owner accepted the duplicate. |

## Decision log

| Topic | Status | Detail |
| --- | --- | --- |
| The core sits on pi-durable | Decided | [Grounding](grounding.md) |
| The target is the latest pi-durable, now 1.5.2. No older version is pinned. | Decided | [Grounding](grounding.md) |
| The core does not use a Chord host | Proposed | [Grounding](grounding.md) |
| Decision and Event are core primitives | Decided | [Primitives](primitives.md) |
| The shapes and rules of Decision and Event | Proposed | [Primitives](primitives.md) |
| `request` writes documents only, and the core emits no events about decisions | Proposed | [Primitives](primitives.md) |
| A basis entry carries `text` | Decided, from the walk | [Primitives](primitives.md) |
| An answer carries `annotations`, and `notes` is gone | Decided, from the walk | [Primitives](primitives.md) |
| The `then` task belongs to the decision's conversation and is `background` | Decided, from the walk | [Primitives](primitives.md) |
| An equal resend creates a `then` task again when the old one ended `faulted` | Decided, from the walk | [Primitives](primitives.md) |
| Extensions are trusted in-process code | Decided | |
| An extension is a pi-durable `Extension`, unwrapped, that imports `request`, `withdraw`, `emit`, `decision`, and `eventLog` | Proposed. The last two are from the walk and Decided. | [Primitives](primitives.md) |
| The host sets the selection on each conversation it creates, from a workflow's `entry` | Decided, from the walk | [Primitives](primitives.md) |
| `entry` may be a function of a `tx`, and the host adds the project's working directory | Proposed | [Primitives](primitives.md), [Host](host.md) |
| The bare agent selects `coding-tools`. Codemode is optional. | Decided | [Proving workflows](workflows.md) |
| Strict TypeScript, pi-schema at boundaries, no Effect, no Vite | Decided | |
| `node --test` as the test runner | Proposed | |
| Prose is owned by the workflow | Decided | [Prose](prose.md) |
| One standard library beside the core holds `prose()` and `role()` | Decided | [Standard library](library.md) |
| The shape of `role()`, and the rule for what enters the standard library | Proposed | [Standard library](library.md) |
| A workflow has options per project that a client sets | Decided | [Host](host.md) |
| Options live in the workflow's own document, and the host reaches them through a contract on the module | Proposed | [Host](host.md) |
| `options()` and `modelRef()` in the standard library | Proposed | [Standard library](library.md) |
| A library helper may define a document for its caller | Decided | [Standard library](library.md) |
| `prose()` loads when the module loads | Proposed | [Prose](prose.md) |
| One server for all projects, workflows selected per project | Decided | [Topology](topology.md) |
| One store, harness, and registry per project inside that server | Proposed | [Topology](topology.md) |
| The server opens every project when it starts | Decided, from the walk | [Topology](topology.md) |
| A client chooses a project's extensions when it binds the project | Decided | [Host](host.md) |
| The extension is the main unit, and a workflow is one kind | Decided | [Extensions](extensions.md) |
| A workflow is an extension whose module exports `entry` | Proposed | [Extensions](extensions.md) |
| The host passes each project a default selection, which a conversation follows, edits, or replaces with an exact list | Proposed | [Extensions](extensions.md) |
| The bare agent follows the project default | Proposed. It changes a Decided line. | [Extensions](extensions.md) |
| A secret is an option with the format `secret`, stored in the project's store | Proposed | [Extensions](extensions.md) |
| Check 4 of the admission rule speaks of two extensions | Proposed | This file |
| Lane is not in the core and not in the library | Proposed | [Lane](lane.md) |
| `bind`, the `Project` document, and a directory per project as the catalogue | Proposed | [Host](host.md), [Topology](topology.md) |
| `bind` takes the working directory as a path on the server | Decided | [Host](host.md) |
| An extension is added to a project and never removed | Decided, as a limit | [Host](host.md) |
| Local use is the same server with one project | Proposed | [Topology](topology.md) |
| The admission rule | Decided. The new wording of check 5 is Proposed. | This file |
| W0, the bare agent, and W1, design to merge, as proving workflows | Decided | [Proving workflows](workflows.md) |
| W2, forecasts, as the second proving workflow | Proposed | [Proving workflows](workflows.md) |
| The rules for workflow authors | Proposed | [Proving workflows](workflows.md) |
| A client that reconnects gets the current state, not a replay | Decided | [Host](host.md) |
| The client API is a list of capabilities. No client is designed yet. | Decided | [Host](host.md) |
| The protocol: HTTP, one POST for a call, and an event stream of ops for a watch | Proposed | [Protocol](protocol.md) |
| A device is paired with a code, and the server keeps a hash of its token | Proposed | [Protocol](protocol.md) |
| A request ID is stored under its device's name | Proposed | [Protocol](protocol.md) |
| The open list holds four fields for each subject | Proposed | [Primitives](primitives.md), [Protocol](protocol.md) |
| The calls of the first version | Proposed | [Host](host.md) |
| You can join and steer any running agent | Decided | [Host](host.md) |
| A client can read the faulted tasks | Decided | [Host](host.md) |
| The `faults` call scans by task kind and stores nothing | Proposed | [Host](host.md) |
| A run that fails or is stopped is the workflow's concern | Decided | [The walk](walk.md) |
| The accepted limits | Decided | "Accepted limits" below |
| Shared knowledge across projects is deferred | Decided | [Topology](topology.md) |

## Accepted limits

**Decided.** The owner accepted each of these for now. Each one is a real gap, written down so that nobody takes it for a guarantee.

- **"Only a human answers" is a guard against mistakes, not against an agent with a shell.** With the default setup an agent's shell runs as the server's OS user. It can read the server's environment and its store. So it can answer its own decision, and in W1 it can merge. The first judge called this the most serious gap in all three designs.

  A part that closes it already exists. pi-env's `RemoteExecutionEnv` runs an agent's tools on another machine or account over SSH, "while the Durable worker, its storage and credentials stay local" (measured, `packages/env/README.md:3-4` at pi `b2aabe0`, published as `@earendil-works/pi-env` 1.5.2). It was not run for this design. A project whose tools run outside the server's account gets the full guarantee.

- **A workflow upgrade can give an open decision a new meaning.** The workflow owns this. See [Primitives](primitives.md).
- **The newest commit can be lost when the power fails.** pi-durable opens SQLite with `synchronous = NORMAL`. Commits survive a process crash (measured, `README.md:869`, `chord/src/sqlite/node.ts:220-221`, and K6 of `spikes/crash.mjs` for a killed process). An answer inherits the limit.
- **A review does not move between devices.** Annotations travel with the answer. Until you send it, they stay on the device you wrote them on.
- **A retried "create a conversation" makes two.** The second is empty, with no input and no task. Nothing deletes it.
- **A run that fails or is stopped opens no decision in W1.** A client shows the conversation as failed, and you open it and continue the run. A workflow that wants more builds it.
- **A faulted task cannot be run again or cleaned up.** A client can read the list. [Host](host.md) says what the next step would need.
- **A workflow cannot be removed from a project, a project cannot be unbound, and a conversation cannot be deleted.** None is offered.

## Open questions

Four decisions wait for the owner.

- **The bare agent and the project default.** The owner ruled that the bare agent selects `coding-tools`. [Extensions](extensions.md) proposes that it follows the project's default, which starts with `coding-tools` and then holds the tool extensions the owner added to the project. Web search cannot reach the bare agent without this.
- **Check 4's wording.** "Two workflows" becomes "two extensions that do different jobs". The rule is Decided, so the change is the owner's.
- **Lane.** [Lane](lane.md) answers that it is not a core part and not yet a library helper, and that a notes document comes first. The owner was considering the idea, so the verdict is the owner's to take or leave.
- **The name of the standard library.** The owner finds it pretentious for what it is. A new name is to be picked.

Open, with no decision asked yet:

- **The first client.** Not designed, by the owner's ruling. [Host](host.md) and [Protocol](protocol.md) are what it will speak.
- **Where a secret lives.** [Extensions](extensions.md) keeps an API key in the project's store, in plain text. One key for all projects would need a home in the server's configuration that no call sets today.
- **Sandboxing as an extension.** pi-durable takes an execution environment for a whole harness. An extension that supplies one needs a new member on its module.
- **Two work items at once in one repository.** The judge of the extension arena showed that the second hand-over no longer fast-forwards after the first is merged. W1 does not walk it.
- **Explorer reports.** Eight reports under `/tmp/render-ground/findings/` are not in the repository. [Grounding](grounding.md) says the commits are enough to fetch the sources again.

[Topology](topology.md) lists its own open points.

## Next steps

1. The four decisions under "Open questions".
2. Still Proposed from before: the wording of check 5, the shape of `role()`, W2, and the store per project.
3. Build the store layer: Decision and Event as designed here. The `answer` table and the failure paths of the walk are the list of ways it can fail. The tests come from that list, before the code. Then run K1 to K6 again, against the real functions.
4. Build the host layer on it: `bind`, the start order, the project default, and the calls in [Host](host.md), carried as [Protocol](protocol.md) says. The scripts in those files and the checks of the three spikes are the list of ways it can fail.
5. Build web search, then W2, then W1. Web search comes first because it is the smallest extension and has no decision. This order is a proposal.

## Files

- [Primitives](primitives.md) has the shapes and rules of Decision and Event, and how an extension reaches them.
- [The walk](walk.md) takes W1 and W2 through the design one commit at a time, and lists what it changed.
- [Proving workflows](workflows.md) describes W0, W1, and W2, and has the rules for workflow authors.
- [Extensions](extensions.md) says what an extension is, what makes one a workflow, how an agent gets one, and where its options and secrets live.
- [Host](host.md) lists what a client must be able to do, and has binding, an extension's options, the faulted tasks, and joining a running agent.
- [Protocol](protocol.md) says how a call travels: the transport, the message shapes, the streams, devices and tokens, and versions.
- [Lane](lane.md) puts the owner's idea of a long-running role through the rules.
- [Standard library](library.md) has `role()`, `options()`, and the rule for what enters the library.
- [Prose](prose.md) compares four ways to bind facts into instructions.
- [Topology](topology.md) compares three ways to host many projects.
- [Grounding](grounding.md) lists the facts this design rests on, with sources.
- [Arena](arena.md) records how the design was chosen. The folder `arena/` holds the brief, the rubric, the three designs, and the judge's verdict.
- [Walk arena](arena-walk.md) records how the walk was chosen. The folder `arena-walk/` holds the brief, the rubric, the three walks, two probes, and the judge's verdict.
- [Host arena](arena-host.md) records how the host design was chosen. The folder `arena-host/` holds the brief, the rubric, the three designs, three probes, and the judge's verdict.
- [Extension arena](arena-ext.md) and [Protocol arena](arena-wire.md) record the last two arenas. The folders `arena-ext/` and `arena-wire/` hold their raw files.
- `spikes/substrate.mjs` runs seven checks against pi-durable on SQLite.
- `spikes/two-harnesses.mjs` checks that one process can drive two harnesses at once.
- `spikes/crash.mjs` kills the process at six points and checks the store afterwards.
- `spikes/host.mjs` runs twelve checks of the moves the host design makes.
- `spikes/ext.mjs` runs twelve checks of the extension model and of what a lane leans on.
- `spikes/wire.mjs` runs nine checks of the protocol over real HTTP on loopback.
