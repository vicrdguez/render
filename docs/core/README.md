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
- One server hosts all projects. Each project selects its workflows. You connect to that one server from several machines.
- The bare agent selects pi-durable's `coding-tools`. Codemode is an optional extension.
- A client that reconnects gets the current state, not a replay.
- The client API is a list of what a client must be able to do. No client and no protocol is designed yet. The list grows as a real client is used.
- A client chooses a project's workflows when it binds the project to the server.
- A workflow has options per project that a client can change, such as the model of a role. The core does not know what they are.
- You can open the conversation of any running agent and steer it, in a workflow as with the bare agent.
- The extension is the main unit, and a workflow is one kind of extension. Tau names and supports workflows, and other extensions do other jobs, such as web search. These notes were written around workflows, and the next pass corrects that.
- A project's working directory is a path that the client names when it binds the project.

## How this version was tested

Three times, each time in an arena: three authors work apart from one brief, and a judge from another model family scores them.

1. **The design.** The first draft of this folder was one of three designs. [Arena](arena.md) names the base, each part taken from the others, and what was rejected.
2. **The walk.** Three authors then walked W1 and W2 through that design, one commit at a time, to find where it breaks. [Walk arena](arena-walk.md) records the result, and [the walk](walk.md) is the merged walk. It found 23 gaps. Seven of them change the core, and each of those is marked "From the walk" where it lands. The owner reviewed the walk and accepted them.
3. **The host.** The owner then answered the walk's open questions. Three authors designed what the answers left: the client's calls, binding a project, a workflow's options, the faulted tasks, and joining a running agent. [Host arena](arena-host.md) records the result, and [Host](host.md) is the merged design.

After the second arena the picker ran a crash test, `spikes/crash.mjs`, that kills the process at the points the walks argued about. After the third, `spikes/host.mjs` ran the moves that the merged host design makes.

## What Tau ships

| Layer | Owns | Status |
| --- | --- | --- |
| Client | A CLI, a TUI, or a web UI. It holds one connection to the server. | Open. [Host](host.md) lists what it must be able to do. |
| Host layer | The server process. It binds projects, opens one store per project under a lock, checks device tokens, serves the client, and merges the open decisions of all projects into one inbox. It also wires models and the execution environment into each harness. | Proposed |
| Store layer | One store. It opens a pi-durable harness and adds Decision and Event. | Decided |
| pi-durable | Conversations, submissions, tasks, documents, extensions, and the registry. | Decided |
| Extensions | Workflows and tools. Each one is a pi-durable `Extension`. | Proposed |
| Standard library | `prose()`, `role()`, and `options()`, for workflow authors. | Decided. `options()` is Proposed. |

"The core" means the host layer and the store layer together. Both follow the admission rule. The first draft let the host layer escape it, and the judge was right to object.

The layers keep one import rule. The store layer knows no project. The host layer knows no workflow. Neither imports an extension or the standard library.

With no workflow, a project can create a conversation, pick a model, send input, watch progress, abort, and reconnect. That is W0 in [Proving workflows](workflows.md). It is a chat with a coding agent, as in pi, that lives on the server.

## A change enters the core only by this rule

**Decided.** A change enters only when you decide it, on a written proposal of one page. The proposal shows five things.

1. **A real failure.** The bare agent or a proving workflow cannot do something today. The proposal names it.
2. **pi-durable does not provide it.** The proposal cites what was checked.
3. **An extension cannot keep the promise.** The change guards who may act at the boundary to the human and the client. Or it is a record that every client and every extension must read the same way. The proposal includes the extension that was tried and where it fell short. Convenience fails this check.
4. **Two unlike users.** Two workflows that differ use it with the same meaning, or a client that knows no workflow cannot work without it. A repair to the server's safety is the one exception.
5. **A small shape that names no workflow concept.** It is a type and a few functions over a `Tx` or the host. It adds no scheduler, loop, background process, or storage engine. A particular role such as "the designer", a phase, and an artifact type are workflow concepts. A way to define roles is not one. Checks 1 to 4 judge it.

The owner accepted the rule as written and asked that check 5 be reworded on roles. Its last three sentences are the new wording, and that wording is **Proposed**.

Two rules remove things:

- When pi-durable gains a feature, the core's copy is deleted.
- A core part with fewer than two users goes back out.

How the current parts score:

| Part | Result | Reason |
| --- | --- | --- |
| Decision | Core | A pi-durable task cannot wait for a human. Answering must stay on the client's side of the boundary. Both proving workflows use it. |
| Annotations on an answer | Core, as one field | Only the host records who sent a comment, and a client that knows no workflow needs one shape. It passes check 4 on the client clause only. |
| Event | Core, narrowly | A client shows one timeline without knowing the workflow. Both workflows emit. The walk found no extension that has to read events, so Event rests on the client alone. |
| Project binding, device tokens, and the client's calls | Core, host layer | The bare agent cannot be reached from a second machine without them. [Host](host.md) lists the calls. |
| The list of faulted tasks | Core, host layer | A faulted task runs no code, so it cannot report itself, and only the host can show it to a client. |
| A workflow's options | The workflow's own document, with a contract on its module for the host | A workflow can store and read its options alone, so the storage fails check 3. It cannot hear a client, so the host reaches the values through three members that the module exports. |
| `prose()`, `role()`, and `options()` | The standard library | None guards a boundary. [Standard library](library.md) has its own, lighter rule. |
| The execution environment | Host wiring only | The host passes one to each harness. pi-durable and pi-env provide the environments. |
| A factory that hands each extension its project | Out | The `tx` already names the store. |
| Reactors | Out | No two extensions need to hear each other yet. |
| Lifecycle callbacks, client actions, document exposure, typed services | Out | Tasks cover lifecycle, Decision covers actions, and imports cover services. |
| Expiry, quorum, comment threads, replies to annotations, approval policy | Out | A workflow builds each from a sleeping task, `withdraw`, and entries. |
| Annotations saved before the answer | Out for now | They need a second write call for clients. See "Accepted limits". |
| Removing a workflow from a project | Out | Uninstalling does not park running work, and no ruling asks for it. See [Host](host.md). |
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
| A client chooses a project's workflows when it binds the project | Decided | [Host](host.md) |
| `bind`, the `Project` document, and a directory per project as the catalogue | Proposed | [Host](host.md), [Topology](topology.md) |
| `bind` takes the working directory as a path on the server | Decided | [Host](host.md) |
| A workflow is added to a project and never removed | Proposed | [Host](host.md) |
| Local use is the same server with one project | Proposed | [Topology](topology.md) |
| The admission rule | Decided. The new wording of check 5 is Proposed. | This file |
| W0, the bare agent, and W1, design to merge, as proving workflows | Decided | [Proving workflows](workflows.md) |
| W2, forecasts, as the second proving workflow | Proposed | [Proving workflows](workflows.md) |
| The rules for workflow authors | Proposed | [Proving workflows](workflows.md) |
| A client that reconnects gets the current state, not a replay | Decided | [Host](host.md) |
| The client API is a list of capabilities. No client or protocol is designed yet. | Decided | [Host](host.md) |
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

- **The protocol.** [Host](host.md) lists what a client must be able to do. How a call travels is the next design step: the transport, the message shapes, how a watch streams, where the device token goes and how a device gets one, and how an old client talks to a newer server.
- **Extensions that are not workflows.** These notes treat a workflow as the only kind of extension. The owner asked that the extension be the main unit. The next pass covers what a project selects, how an agent gets the tools of an extension such as web search, and what makes a workflow a workflow.
- **Lane.** The owner is considering a new concept: a long-running conversation for one role that keeps the history of the project and hands the work itself to other agents. It goes through the admission rule in the next pass.
- **The name of the standard library.** The owner finds it pretentious for what it is. A new name is to be picked.
- **Explorer reports.** Eight reports under `/tmp/render-ground/findings/` are not in the repository. [Grounding](grounding.md) says the commits are enough to fetch the sources again.

[Topology](topology.md) lists its own open points.

## Next steps

1. The next design pass: extensions that are not workflows, Lane, and the protocol.
2. Still Proposed from before: the wording of check 5, the shape of `role()`, W2, and the store per project.
3. Build the store layer: Decision and Event as designed here. The `answer` table and the failure paths of the walk are the list of ways it can fail. The tests come from that list, before the code. Then run K1 to K6 again, against the real functions.
4. Build the host layer on it: `bind`, the start order, and the calls in [Host](host.md). The script in that file and H1 to H12 are the list of ways it can fail. The transport is chosen then, as the smallest thing the first client needs.
5. Build W2 on both, and then W1. W2 comes first because it has no outside effects. This order is a proposal.

## Files

- [Primitives](primitives.md) has the shapes and rules of Decision and Event, and how an extension reaches them.
- [The walk](walk.md) takes W1 and W2 through the design one commit at a time, and lists what it changed.
- [Proving workflows](workflows.md) describes W0, W1, and W2, and has the rules for workflow authors.
- [Host](host.md) lists what a client must be able to do, and has binding, a workflow's options, the faulted tasks, and joining a running agent.
- [Standard library](library.md) has `role()`, `options()`, and the rule for what enters the library.
- [Prose](prose.md) compares four ways to bind facts into instructions.
- [Topology](topology.md) compares three ways to host many projects.
- [Grounding](grounding.md) lists the facts this design rests on, with sources.
- [Arena](arena.md) records how the design was chosen. The folder `arena/` holds the brief, the rubric, the three designs, and the judge's verdict.
- [Walk arena](arena-walk.md) records how the walk was chosen. The folder `arena-walk/` holds the brief, the rubric, the three walks, two probes, and the judge's verdict.
- [Host arena](arena-host.md) records how the host design was chosen. The folder `arena-host/` holds the brief, the rubric, the three designs, three probes, and the judge's verdict.
- `spikes/substrate.mjs` runs seven checks against pi-durable on SQLite.
- `spikes/two-harnesses.mjs` checks that one process can drive two harnesses at once.
- `spikes/crash.mjs` kills the process at six points and checks the store afterwards.
- `spikes/host.mjs` runs twelve checks of the moves the host design makes.
