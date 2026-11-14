# Unit R6

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Stopping refusal | The kickoff refers to an existing stopping code. The host has `busy` for calls and `stopping` only for stream ends. | Use `busy` for waiting and new structural calls. | No new protocol code or call is allowed. |
| Shutdown drain | Finish every queued call, or finish the running call and refuse the waiting calls. | Finish the running call. Refuse waiting and new calls. Then close streams and stores. | The kickoff's shutdown test specifies this order. |
| Snapshot ownership | Separate host and project maps, or one catalogue owned by Projects. | Projects holds one Catalogue. Each entry pairs a module with its Options validator. | One assignment can replace it in R7. There is no replacement operation in R6. |
| Snapshot immutability | Freeze all extension runtime objects, or freeze the host's catalogue associations. | Freeze the catalogue entries and their name table. Do not recursively freeze trusted extension objects. | This prevents host map mutation without changing the extension runtime contract. |
| Arrival order | Socket arrival, incomplete body arrival, or validated dispatch arrival. | Queue at validated dispatch, before project lookup or project queues. | Authentication and body validation remain at their existing boundary. |
| Held ordinary work check | Hold options.get inside a transaction, or hold a structural call before its transaction. | Hold addExtensions at the project boundary before its commit. | A held harness transaction already serializes same-project transactions. The test isolates blocking added by the structural queue. |
| Queue location | Put queues in Projects methods, or wrap the structural call handlers. | Wrap bind, addExtensions, options, setOptions and both forms of create. | Lookup, module capture and every await stay inside the queue. Existing project queues remain inside it. |
| Review tools | Spawn reviewers, or inspect the diff directly. | Inspect directly. | This unit's instructions forbid subagents and running the playbook. No new code comments remain. |
| PR tool | Origin, or gh. | gh. | Origin is not installed. The kickoff also names gh. |

## Work order

Write the failing tests. Add the snapshot and dispatch queue. Run the focused host tests. Break three separate implementation lines and restore each. Run all tests and the fresh-checkout gate. No subagents run.

Model the Domain shaped the paired catalogue entries and the FIFO queue. Laziness Protocol kept the queue at dispatch instead of adding project-level state. Test Behavior, Not Implementation shaped the HTTP replies, project ordering and live stream assertions.

## Handler audit

Before R6, setOptions captured `host.options.get(name)` before awaiting `harness.commit`. Workflow create captured the module, entry and Options before awaiting its commit too. Neither had a server-wide queue.

After R6, `structural` enters `host.structural.run` before reading `host.projects.catalogue`. It passes that one snapshot through the whole call. `structuralProject` performs project lookup inside that callback. Projects receives the snapshot explicitly before entering its per-project queue.

| Handler | Snapshot and await check |
| --- | --- |
| bind | Structural. Passes one snapshot to bind, compare, finish, install and view. |
| addExtensions | Structural. Passes one snapshot through the project commit and install. |
| options | Structural. Every options view comes from its captured snapshot. |
| setOptions | Structural. Captures `catalogue.get(name)?.options` inside the queue. The queue covers patch and its commit. |
| create | Structural for workflows and bare agents. Captures module, entry and Options inside the queue. The queue covers validation and configuration. |
| extensions | Reads the catalogue synchronously and returns descriptions. No await follows capture. |
| projects | Reads project views synchronously. No await follows capture. |
| faults | Builds task-name strings synchronously from one snapshot before awaiting the scan. It does not use modules or Options after the await. |
| models | No module or Options capture. Not queued. |
| conversations, open, history | No module or Options capture. Not queued. |
| input, continue, stop, setModel | No module or Options capture. Not queued. |
| inbox, decision, answer, timeline | No module or Options capture. Not queued. |

Checked every key in the 20-call `calls` table, every catalogue reference in host source, both project queue callers, and the start and close paths. Projects builds the default only through `Catalogue.defaults`, from the project's own extension order. CodingTools comes first. Missing names and workflows are excluded.

## Test evidence

The before run passed 319 tests. The after run passed 330 tests. The prescribed sorted lists are `/tmp/r6-before.txt` and `/tmp/r6-after.txt`. `comm -23` prints nothing. No test name was removed or replaced.

New names, all in `packages/host/test/structural.test.ts`:

- a held setOptions orders setOptions server-wide
- a held setOptions orders create server-wide
- a held setOptions orders options server-wide
- a held setOptions orders bind server-wide
- a held setOptions orders addExtensions server-wide
- bind precedes addExtensions before either project queue is taken
- addExtensions completes before create reads the project selection
- a thrown structural call and a refused call leave the queue usable
- close finishes the running structural call and refuses waiting and new calls
- held structural work in p does not block input, answer, streams or tools in p
- held structural work in q does not block input, answer, streams or tools in p

The lock-order test holds a repeated bind before its project queue. A waiting addExtensions must not enter its project queue. Releasing bind lets both finish. Taking the waiting call's project queue first would obstruct the running bind when it proceeds into that same project queue.

The new blocking behavior was red on the original host, with all implementation changes temporarily removed. Real output from `/tmp/r6-red-final.log`:

```text
✖ a held setOptions orders setOptions server-wide (51.517ms)
✖ a held setOptions orders create server-wide (23.185542ms)
✖ a held setOptions orders options server-wide (21.914125ms)
✖ a held setOptions orders bind server-wide (23.721125ms)
✖ a held setOptions orders addExtensions server-wide (19.459334ms)
✖ bind precedes addExtensions before either project queue is taken (12.946625ms)
✖ addExtensions completes before create reads the project selection (11.219125ms)
✖ close finishes the running structural call and refuses waiting and new calls (10.4285ms)
ℹ tests 11
ℹ pass 3
ℹ fail 8
```

The three preservation checks already passed on the original host. Failure-path cleanup on the old shutdown implementation also produced socket hang-up errors. The baseline reproduction used Node's test-force-exit flag to avoid keeping those broken requests alive. The passing candidate uses the normal test command, without that flag.

After restoration, the focused test command passed. Real output from `/tmp/r6-green-final.log`:

```text
ℹ tests 11
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 586.177875
```

All tests passed after the mutations were restored. Real output from `/tmp/r6-after.log`:

```text
ℹ tests 330
ℹ suites 3
ℹ pass 330
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 19749.391583
```

## Mutation evidence

Each mutation changed one implementation line or expression. Each was restored before the next. Each command typechecked the changed source before running the selected emitted tests.

| Mutation | Selected test | Result |
| --- | --- | --- |
| Bypass StructuralQueue in the structural dispatcher. | The five held setOptions pairs. | Five failures. Each reports `the second structural call must not start`, with `true !== false`. |
| Assign the rejected promise to the tail without catch. | The thrown and refused structural call check. | One failure with `controlled get failure`. The next operation cannot recover from the rejected tail. |
| Include workflows instead of ordinary extensions in defaults. | The existing bare-agent default and added-extension check. | One failure. The actual tools include workflow tools and omit web_search. |

Real summaries from `/tmp/r6-mutation-unqueued.log`, `/tmp/r6-mutation-poisoned.log` and `/tmp/r6-mutation-defaults.log`:

```text
ℹ tests 5
ℹ pass 0
ℹ fail 5

✖ a thrown structural call and a refused call leave the queue usable (45.587958ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1

✖ the bare agent follows the project default, and an added extension reaches it from its next request (77.980208ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

## Runtime and limits

The test runner times Node's test process. It excludes the preceding TypeScript build. A single host run before the change passed 75 tests in 2892.337917 ms. A single host run after the change passed 86 tests in 2967.532125 ms. The new file alone passed in 586.177875 ms on a later run. These are suite observations, not a speedup claim. The machine had 12 CPUs and load averages of 12.28, 10.89 and 8.94 when inspected. Concurrent work and process-restart tests make a latency comparison inconclusive.

The live checks establish that ordinary calls, streams and tools have no wait for the held structural latch, in the same project and another project. Another structural call waits for the held call's full remaining duration. Existing harness transaction serialization remains unchanged.

No reload, publication failure, directory loading, Linux execution or real model call was tested in this unit. Reload and the loader are outside scope. Tests use faux models, temporary homes and loopback ephemeral ports.
