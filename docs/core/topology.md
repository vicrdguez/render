# How one server hosts many projects

**Decided.** One server hosts all work. Each project selects its workflows. You connect to that one server from several machines. Projects can later share some knowledge.

**Proposed.** Inside that server, each project has its own store, its own harness, and its own registry. All three candidates of the first arena chose this independently. The [walk](walk.md) used it and added two points: the server opens every project when it starts, and every client call names its project. The [host](host.md) pass then settled where a project lives on disk and what the server reads at start.

## Three ways to do it

| | A. One store for everything | B. One server, one store per project | C. One process per project |
| --- | --- | --- | --- |
| Precedent | The pluggable-kernels design, revision 2 | None read | Ultimate |
| Client connections | One | One | One per project, or a router |
| Project inside the core | Yes. Every decision, event, and query carries a project key. | No. A store is a project. | No |
| What a `tx` reaches | Every project | One project | One project |
| Workflow per project | An explicit extension list on every conversation, from one shared registry | One registry per project | One registry per project |
| Shared knowledge | A read in the same store | The server copies a revision between stores | Over the network |
| A storage failure | Fails the one session, so every project | Fails one project | Fails one project |
| A process crash | Stops every project | Stops every project | Stops one project |
| One inbox across projects | One query | The server merges N lists by time | Needs a router |
| Moving a project | Not possible as a file | Move one directory | Move one directory |
| New code | A project key on every access path | A project catalogue, routing, and a merged inbox | A supervisor and discovery |

Evidence for the rows:

- Under A, one registry holds every workflow, and the default gives each conversation every installed extension (measured, `src/harness/types.ts:632-633`). Each conversation then needs an explicit list.
- The pluggable-kernels design lists the cost of A in its own table: "Every relevant access path needs project scope. Storage failure, schema incompatibility, or a fatal host error can affect all projects" (measured, `storage-and-knowledge.md:17` at `afc95d4`).
- Ultimate's README says "every project gets its own process and state home instead of one server for all of them" (measured, `README.md:160-164` at `7eb49b8`).

## Why B

B gives the single server and the single connection, and it keeps the core free of a project concept.

A was chosen in the pluggable-kernels design to keep "project records, knowledge provenance, receipts, and runtime work in one transaction space" for a central ledger (measured, `storage-and-knowledge.md:13`). The new core has no central ledger, so that reason no longer applies (inferred).

C gives the best isolation. But you would connect to several hosts, which you ruled out, or a router would be built, which is B with more processes.

## What B does not give

- **Isolation from trusted code.** An extension's `tx` reaches one store. The extension is still trusted code in the server's process, and it can reach anything the process can.
- **Isolation from a crash.** One process is one crash domain. A supervisor must restart it.
- **One commit across projects.** If you later need that, this topology is wrong.
- **One event order across projects.** The server merges by time.
- **IDs that mean something across projects.** A decision ID, a conversation ID, and an entry ID belong to one store. So every client call names the project as well as the ID.

## Shared knowledge, later

Shared knowledge is a fixed revision, so sharing can be a copy into the receiving store, with a note of where it came from. The server holds both stores and can make the copy. A Decision can gate it.

None of that is designed. The owner deferred it. It is not free, and it enters through the admission rule when a workflow needs it.

## Local use

Local use is the same server with one project. It is not a second runtime.

## What the server must do

- **Hold one lock per store.** pi-durable has no locking across processes. "One process writes a storage at a time" (measured, `README.md:894`). Ultimate takes a lock file per store (measured, `server/harness.ts:228`).
- **Keep each project in a directory named by its ID.** The directories under `~/.tau/projects/` are the catalogue. No second list exists that could disagree with the stores.
- **Record the project in its store.** One session document, `Project`, holds the ID, the working directory, and the workflow names. A store whose document is missing, or names another project, is skipped and reported.
- **Take one path from a client.** A client never names a store. It names the project's working directory once, when it binds the project. The first version of this file said that a client never names a file path at all. That cannot hold for the place where the agents work.
- **Open every project when it starts.** See the next section.

[Host](host.md) has the bind call and the order at start.

## From the walk: the server opens every project at start

**Decided.** The first version left open whether the server opens a project at start or on first use. The walk settled it, and the owner accepted the walk's changes.

When the server starts, it opens the store of every project in its catalogue and calls `resume()` on each harness. Task scheduling starts with `resume()`, or with a call that asks for progress (measured, `README.md:127`).

- **Check 1, a real failure.** In W2 row 4 the server was down for a week and a forecast came due. A store that opens on first use stays closed until you touch that project. The decision is never asked, and the inbox does not show it.
- **Check 2, pi-durable does not provide it.** A harness reports when it next needs a running process (measured, `wake()` in check 6 of `spikes/substrate.mjs`). Nothing reads that for a store that no process has open.
- **Check 3, an extension cannot.** An extension runs inside a harness that is already open.
- **Check 4, two unlike users.** W2's timers are one. The other is any work that a crash cut off: W0's run and W1's `then` tasks stay pending until the store opens (measured, `README.md:127`).
- **Check 5, a small shape.** One loop over the catalogue at start. It adds no scheduler.

The cost is that every project is open all the time. Memory use and open time with many projects are unknown. If that hurts, the catalogue can keep each project's next wake time, and the server can open a project only then. That is more code, and nothing needs it yet.

## What was checked

`spikes/substrate.mjs` ran on pi-durable 1.5.2 with SQLite files:

- One process drove two harnesses with separate stores and registries. Both survived a close and a reopen, and each store held only its own transcript (check 1).
- A task slept for a week across a closed store and woke on reopen (check 6).

`spikes/two-harnesses.mjs` ran on in-memory storage. Project B finished a run while project A was in the middle of a generation.

`spikes/crash.mjs` ran on SQLite files. It starts child processes and kills each one with `SIGKILL`. [The walk](walk.md) and [Primitives](primitives.md) use its six checks, K1 to K6.

`spikes/host.mjs` ran on SQLite files. Three of its twelve checks bear on this file:

- A store was reopened with an empty registry and resumed. A timer that had come due waited as `blocked`, and ran once the host had read the workflow list from the store and installed the extension (H1).
- A second extension, installed while the store was open, did not reach a conversation that names its extensions (H11).
- A task that was running when its extension was uninstalled went on through its next phase (H12). So a workflow is not removed from a project.

To run them:

```sh
mkdir /tmp/pi-latest && cd /tmp/pi-latest && npm init -y && npm install --ignore-scripts @earendil-works/pi-durable@1.5.2
cd - && export PI_MODULES=/tmp/pi-latest/node_modules/@earendil-works
node docs/core/spikes/substrate.mjs
node docs/core/spikes/two-harnesses.mjs
node docs/core/spikes/crash.mjs
node docs/core/spikes/host.mjs
```

Limits: two projects and no load. Only `crash.mjs` kills a process. The other three close cleanly. Memory use and open time with many projects are unknown.

## Open

- How a workflow is removed from a project. It is not offered, and the owner accepted that for now.
- Whether the server needs a limit on concurrent model calls across projects.
- A harness can open a store read-only "as a viewer of a session that another process drives" (measured, `src/harness/types.ts:759-765`). Whether that is useful here was not explored.
