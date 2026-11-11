# How one server hosts many projects

**Decided.** One server hosts all work. Each project selects its workflows. You connect to that one server from several machines. Projects can later share some knowledge.

**Proposed.** Inside that server, each project has its own store, its own harness, and its own registry. All three arena candidates chose this independently.

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

## Shared knowledge, later

Shared knowledge is a fixed revision, so sharing can be a copy into the receiving store, with a note of where it came from. The server holds both stores and can make the copy. A Decision can gate it.

None of that is designed. It is deferred, it is not free, and it enters through the admission rule when a workflow needs it.

## Local use

Local use is the same server with one project. It is not a second runtime.

## What the server must do

- **Hold one lock per store.** pi-durable has no locking across processes. "One process writes a storage at a time" (measured, `README.md:894`). Ultimate takes a lock file per store (measured, `server/harness.ts:228`).
- **Map project IDs to directories in its own configuration.** A client never names a file path.
- **Record the project's identity in its store,** so a directory that is moved or copied is still recognised.
- **Wake sleeping projects.** A harness reports when it next needs a running process (measured, `wake()` in check 6 of `spikes/substrate.mjs`).

## What was checked

`spikes/substrate.mjs` ran on pi-durable 1.5.2 with SQLite files:

- One process drove two harnesses with separate stores and registries. Both survived a close and a reopen, and each store held only its own transcript (check 1).
- A task slept for a week across a closed store and woke on reopen (check 6).

`spikes/two-harnesses.mjs` ran on in-memory storage. Project B finished a run while project A was in the middle of a generation.

To run them:

```sh
mkdir /tmp/pi-latest && cd /tmp/pi-latest && npm init -y && npm install --ignore-scripts @earendil-works/pi-durable@1.5.2
cd - && export PI_MODULES=/tmp/pi-latest/node_modules/@earendil-works
node docs/core/spikes/substrate.mjs
node docs/core/spikes/two-harnesses.mjs
```

Limits: two projects, clean closes, no load. Memory use and open time with many projects are unknown.

## Open

- The layout of a project's directory. One candidate proposed `project.json` and `store.sqlite` under `~/.render/projects/<id>/`.
- Whether the server opens every project at start or opens each on first use.
- Whether the server needs a limit on concurrent model calls across projects.
- A harness can open a store read-only "as a viewer of a session that another process drives" (measured, `src/harness/types.ts:759-765`). Whether that is useful here was not explored.
