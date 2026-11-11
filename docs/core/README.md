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
- The core sits on pi-durable and does not rebuild what pi-durable provides. The target is the latest release, now 1.5.2.
- The core adds what pi-durable lacks for the goal. Today that is Decision and Event.
- Everything else is an extension. A workflow is an extension that defines a way of working. Earlier documents call the same thing a kernel.
- Extensions are trusted code that runs in the server's process.
- The core grows only on purpose. The admission rule below makes "on purpose" checkable.
- The language is strict TypeScript, with pi-schema at each boundary where outside data enters. Effect and Vite are out.
- Prose belongs to the workflow that uses it.
- One server hosts all projects. Each project selects its workflows. You connect to that one server from several machines.

## How this version was tested

The first draft of this folder was one of three designs in an arena. Two other models wrote their own designs from the same brief, and a judge from a third model family scored all three. This version is the synthesis. [Arena](arena.md) names the base, each part taken from the others, and what was rejected.

## What Render ships

| Layer | Owns | Status |
| --- | --- | --- |
| Client | A CLI, a TUI, or a web UI. It holds one connection to the server. | Open |
| Host layer | The server process. It keeps the project catalogue, opens one store per project under a lock, checks device tokens, serves the client, and merges the open decisions of all projects into one inbox. It also wires models and the execution environment into each harness. | Proposed |
| Store layer | One store. It opens a pi-durable harness and adds Decision and Event. | Decided |
| pi-durable | Conversations, submissions, tasks, documents, extensions, and the registry. | Decided |
| Extensions | Workflows, tools, and roles. Each one is a pi-durable `Extension`. | Proposed |

"The core" means the host layer and the store layer together. Both follow the admission rule. The first draft let the host layer escape it, and the judge was right to object.

The layers keep one import rule. The store layer knows no project. The host layer knows no workflow. Neither imports an extension or a shared library such as `prose()`.

With no extension, a project can create a conversation, pick a model, send input, watch progress, abort, and reconnect. That is W0 in [Proving workflows](workflows.md).

## A change enters the core only by this rule

**Proposed.** A change enters only when you decide it, on a written proposal of one page. The proposal shows five things.

1. **A real failure.** The bare agent or a proving workflow cannot do something today. The proposal names it.
2. **pi-durable does not provide it.** The proposal cites what was checked.
3. **An extension cannot keep the promise.** The change guards who may act at the boundary to the human and the client. Or it is a record that every client and every extension must read the same way. The proposal includes the extension that was tried and where it fell short. Convenience fails this check.
4. **Two unlike users.** Two workflows that differ use it with the same meaning, or a client that knows no workflow cannot work without it. A repair to the server's safety is the one exception.
5. **A small shape that names no workflow concept.** It is a type and a few functions over a `Tx` or the host. It adds no scheduler, loop, background process, or storage engine. A role, a phase, and an artifact type are workflow concepts.

Two rules remove things:

- When pi-durable gains a feature, the core's copy is deleted.
- A core part with fewer than two users goes back out.

How the current parts score:

| Part | Result | Reason |
| --- | --- | --- |
| Decision | Core | A pi-durable task cannot wait for a human. Answering must stay on the client's side of the boundary. Both proving workflows use it. |
| Event | Core, narrowly | A client shows one timeline without knowing the workflow. The core itself emits nothing, and the readers so far are the client and one W2 tool. If the paper walk finds no other reader, Event is the first part to question. |
| Project catalogue, device tokens, client transport | Core, host layer | The bare agent cannot be reached from a second machine without them. |
| `prose()` | A library beside the core | It guards no boundary. |
| The execution environment | Host wiring only | The host passes one to each harness. pi-durable and pi-env provide the environments. |
| A factory that hands each extension its project | Out | The `tx` already names the store. |
| Reactors | Out | No two extensions need to hear each other yet. |
| Lifecycle callbacks, client actions, document exposure, typed services | Out | Tasks cover lifecycle, Decision covers actions, and imports cover services. |
| Expiry, quorum, comment threads, approval policy | Out | A workflow builds each from a sleeping task, `withdraw`, and entries. |

## Decision log

| Topic | Status | Detail |
| --- | --- | --- |
| The core sits on pi-durable | Decided | [Grounding](grounding.md) |
| The target is the latest pi-durable, now 1.5.2. No older version is pinned. | Decided | [Grounding](grounding.md) |
| The core does not use a Chord host | Proposed | [Grounding](grounding.md) |
| Decision and Event are core primitives | Decided | [Primitives](primitives.md) |
| The shapes and rules of Decision and Event | Proposed | [Primitives](primitives.md) |
| `request` writes documents only, and the core emits no events about decisions | Proposed | [Primitives](primitives.md) |
| Extensions are trusted in-process code | Decided | |
| An extension is a pi-durable `Extension`, unwrapped, that imports `request`, `withdraw`, and `emit` | Proposed | [Primitives](primitives.md) |
| Strict TypeScript, pi-schema at boundaries, no Effect, no Vite | Decided | |
| `node --test` as the test runner | Proposed | |
| Prose is owned by the workflow | Decided | [Prose](prose.md) |
| A shared `prose()` library beside the core, loaded when the module loads | Proposed | [Prose](prose.md) |
| One server for all projects, workflows selected per project | Decided | [Topology](topology.md) |
| One store, harness, and registry per project inside that server | Proposed | [Topology](topology.md) |
| Local use is the same server with one project | Proposed | [Topology](topology.md) |
| The admission rule | Proposed | This file |
| W0, the bare agent, and W1, design to merge, as proving workflows | Decided | [Proving workflows](workflows.md) |
| W2, forecasts, as the second proving workflow | Proposed | [Proving workflows](workflows.md) |

## Open questions

- **How far "only a human answers" holds.** With the default setup, an agent's shell runs as the server's OS user. It can read the server's environment and its store, and so answer its own decision or push a merge. The judge called this the most serious gap in all three designs.

  A part that closes it already exists. pi-env's `RemoteExecutionEnv` runs an agent's tools on another machine or account over SSH, "while the Durable worker, its storage and credentials stay local" (measured, `packages/env/README.md:3-4` at pi `b2aabe0`, published as `@earendil-works/pi-env` 1.5.2). It was not run for this design.

  The proposal is that Render states the guarantee per project. A project whose tools run outside the server's account gets "only a human answers". A project whose tools run on the same account gets a guard against mistakes, and the client says so. Your decision is whether the weaker mode is acceptable for W1, which ends in a merge.

- **Open decisions across a workflow upgrade.** New code can give an old decision a new meaning. The duty sits with the workflow for now. See [Primitives](primitives.md).
- **Power loss.** pi-durable opens SQLite with `synchronous = NORMAL`. Commits survive a process crash, and the newest may be lost when the power fails (measured, `README.md:869` and `chord/src/sqlite/node.ts:220-221`). An answer inherits that limit.
- **Shared knowledge.** How one project adopts knowledge from another. See [Topology](topology.md).
- **Client API.** The protocol and the first client. A pi-durable watch gives the current structure, not a replay, so a client that reconnects takes a new snapshot (measured, `src/harness/types.ts:886-889`).
- **Bare tool set.** pi-durable ships `read`, `write`, `edit`, and `bash` as the `coding-tools` extension, and "nothing installs it automatically" (measured, `src/tools/index.ts:27-36`). Whether the bare agent selects it is not decided.
- **Explorer reports.** Eight reports under `/tmp/render-ground/findings/` are not in the repository. [Grounding](grounding.md) says the commits are enough to fetch the sources again.

## Next steps

1. Review this synthesis. Lock or change W2 and the topology.
2. Walk W1 and W2 through Decision and Event on paper, one commit at a time. For each commit, write what it reads, what it writes, in which order, and what a rerun does. [Proving workflows](workflows.md) lists what the W1 walk must show.
3. Spike `answer` for real. Build the decision documents, kill the process in the middle of the commit, and check the store afterwards.

## Files

- [Primitives](primitives.md) has the shapes and rules of Decision and Event, and how an extension reaches them.
- [Topology](topology.md) compares three ways to host many projects.
- [Prose](prose.md) compares four ways to bind facts into instructions.
- [Proving workflows](workflows.md) describes W0, W1, and W2.
- [Grounding](grounding.md) lists the facts this design rests on, with sources.
- [Arena](arena.md) records how this version was chosen. The folder `arena/` holds the brief, the rubric, the three designs, and the judge's verdict.
- `spikes/substrate.mjs` runs seven checks against pi-durable on SQLite.
- `spikes/two-harnesses.mjs` checks that one process can drive two harnesses at once.
