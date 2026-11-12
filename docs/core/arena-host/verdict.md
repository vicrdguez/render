# Host design verdict

## Scores

Scores are 1 to 5, equally weighted. Labels refer only to paths under `/tmp/arena-host/`.

| Criterion | candidate-1 | candidate-2 | candidate-3 |
| --- | ---: | ---: | ---: |
| 1. Buildable capability list | 3 | 5 | 3 |
| 2. Legal on pi-durable | 4 | 4 | 2 |
| 3. Options | 4 | 3 | 4 |
| 4. Small and by the rules | 2 | 4 | 2 |
| 5. Nine-step script | 4 | 4 | 4 |
| 6. Candor and evidence | 4 | 5 | 3 |
| **Total / 30** | **21** | **25** | **18** |

`wc -w` gave design/rationale counts of **3169/398**, **2940/362**, and **3196/396**, respectively. All pass 3200/400. All designs have exactly the eight required sections, in order.

Below, `d/` means `/tmp/render-ground/pi/packages/durable/`. Source was read, never executed. Each candidate has at least three load-bearing source checks below.

## Evidence per candidate

### candidate-1

1. **3:** “`from` or a cursor” promises history access without defining it. `Conversation.watch` accepts a window, not a paging cursor (`d/src/harness/view.ts:50-66`). No guard keeps agent calls off the event log.
2. **4:** “`configure` writes only a document” checks out (`d/src/harness/agent.ts:92-95`). Submission-before-table-write is legal (`submissions.ts:75-82`, same directory). Models resolve per request (`generation.ts:176-186`). H2-H5 passed. The Stop resend claim is false, below.
3. **4:** “stores the patch over the stored values, never the defaults” meets per-project use without author storage work. Dispatch reads and saved outside-effect values are sound. The JSON comparison unfairly implies torn writes are unavoidable; temporary-file replacement is an alternative.
4. **2:** “must be core, because only the host serves clients” does not prove storage must be core-owned. It skips admission check 3's serious extension alternative, illustrated by candidate-2's descriptor. Library checks are supplied. Removal adds needless scope.
5. **4:** “first review ends on B” and “round 2 on C” cover the key option change. All nine steps are present. Fault filtering checks `then.task` by kind, not the actual `continuation` ID, so it can hide old faults no longer referenced.
6. **4:** “closed its store cleanly” correctly limits the broad, passing probe. However, “`limit` bounds the pause” is not established: SQL limits returned rows, not work examining rejected rows (`d/src/storage/sqlite/storage.ts:466-505`).

### candidate-2

1. **5:** “Discovery omits the core event-log conversation. Agent actions refuse its ID.” This protects an existing invariant. History, submission receipts, W0, and retry behavior are explicit, without designing a transport.
2. **4:** “init reads selection and options ... all in one commit” is legal (`d/src/harness/harness.ts:429-445`). Explicit extension selections stay fixed on additions (`d/src/harness/agent.ts:352-371`). Task queries support status, not outcome (`d/src/types.ts:849-858`). All three checks pass; no probe supplies execution evidence.
3. **3:** “takes a document the workflow defines” leaves the author storage work: kinds, versions, initial state and tokens. That misses the one-function ask. Validation, first-model setup, crash snapshots and live changes are otherwise clear.
4. **4:** “Version one supports additions only” keeps scope small. Core and library checks are explicit and mostly honest. The separate catalogue plus stored identity adds a second durable record and publication rules without proving why directory discovery would fail.
5. **4:** “A phase that never committed can select newer options” handles reruns well. All nine steps have commit order. Startup makes invalid configured options render a whole project unavailable, potentially stopping unrelated valid W2 timers; that broad consequence lacks justification.
6. **5:** “measured by source reading, not execution” and “No pi-durable probe ran” are exact. Missing integration and crash checks are named rather than disguised.

### candidate-3

1. **3:** “with no check of who created it” also admits agent actions against the event log. Stop and model-setting rows omit results. Older history and failed-agent discovery are useful.
2. **2:** “Removing one parks its work” is false for running tasks (`d/src/harness/scheduler.ts:2340-2371`; judge probe below). Two other checks pass: document access after table writes (`d/src/session/transaction.ts:1140-1154`) and no `afterRun` after failure (`d/src/harness/types.ts:1018-1025`).
3. **4:** “author never names a place” delivers the requested ease. The three-store comparison and crash rules are clear. Unknown models are accepted; the reference to step 6 confuses `no_model` with `model_error`.
4. **2:** “the extension tried is a workflow document that a tool writes” is a weak check 3: client-driven descriptor writes are not tried. Its library rejection correctly applies the four checks to its chosen storage-owning helper, not to every possible helper. Several host-wiring changes skip five-check review.
5. **4:** “Round two runs on C” and the nine numbered steps cover the required journey. Initial event-log creation is not walked. Removal policy goes beyond the script and is unsafe.
6. **3:** “`uninstall` with live work was not run” is candid, but H1 still backs the removal claim elsewhere. H1 tests reopening without definitions, not uninstalling live code. The passing probe does not repair that overreach.

## Disagreements settled

- **Stop resends:** candidate-2 is right. Candidate-1 says “finds nothing to stop”; candidate-3 says “Nothing to stop”. A resend aborts whatever ordinary work exists then, including a newer run (`d/src/harness/scheduler.ts:668-691`).
- **Removal:** candidate-2's refusal avoids candidate-3's false parking promise. The scheduler keeps an active task's old definition. My `uninstall-probe.mjs` completed both phases after removal and reported `task_outdated`. Candidate-1's guard is safer but unnecessary scope.
- **Unknown models:** candidate-2 correctly names `no_model`; candidate-3's step-6 link is wrong (`d/src/harness/generation.ts:184-186`). Candidate-1 checks availability before accepting values.
- **Option ownership:** documents are well supported, but neither JSON storage nor core-owned storage is forced by pi-durable. Candidate-2 proves a host can call an opaque descriptor without importing the library. It does not prove the owner gets zero storage work.

## Base and ports

**Use candidate-2 as the base, not as a build-ready spec.** Resolve its author-storage burden before building. Its client contract, admission discipline and refusal to add removal policy outweigh its weaker execution evidence.

From **candidate-1**, port the tested model-availability check and its explicit-value/default distinction. From **candidate-3**, port client request-ID separation from workflow IDs, and failed-run summaries in conversation discovery. Do not port its removal claim or core-options admission argument.

## What all missed

None walks an owner-started run overlapping the next workflow dispatch. Every design configures the role before submitting. If the owner has already started that conversation, this can change its model mid-run despite claims of pinned settings. `configure` has no idle guard; busy input queues (`d/src/harness/submissions.ts:251-294`). Candidate-2 guards client `setModel`, not workflow dispatch. This is a concrete gap in joining agents, not a request for a new scheduler.

## Probe reruns

Both requested commands ran from `/tmp/arena-host/judge/` and exited 0. A `NODE_OPTIONS` preload redirected only `mkdtempSync` paths into that directory, since the originals write elsewhere. Candidates were unchanged. Exact combined output follows.

### candidate-1

```text
H1 ok: project.workflows=["wf"]; before install blocked/missing_task; after install pending
H2 ok: task result faux/m-b; first request model m-b
H3 ok: configure during the tool round; request models in one run ["m-b","m-c"]
H4 ok: transcript ["user(Review build B1.)","assistant(m-b)","toolResult","user(Use the existing serializer.)","assistant(m-c)"]; resend returned the same submission true
H5 ok: first run unanswered/model_error, runFailure.reason=model_error; continue done
H6 ok: by kind 1 faulted, error "review_start broke", endedAt set true; terminal kinds by status alone ["pi.generation","pi.tool","wf.boom","wf.review_start"]
H7 ok: known model accepted; errors for unknown model and extra field [{"path":"/reviewer","keyword":"format","message":"expected format model"},{"path":"/extra","keyword":"additionalProperties","message":"unknown field"}]
H8 ok: named selection ["wf"]; no selection ["wf","wf2"]
ok: checks H1-H8 passed
```

### candidate-3

```text
H1 ok: reopened with an empty registry, the due task was blocked (missing_task) and ran after install
H2 ok: one commit created a conversation, read the options document, and set the model from it
H3 ok: a steer sent during a tool round was in the next model request of the same run
H4 ok: a model change during the run applied from the next model request
H5 ok: the run ended unanswered (model_error), runFailure said model_error, and a continue answered
H6 ok: the task ended faulted, onReport heard it (after waitForTask resolved), and the scan by kind returned it. A scan with no kind read 8 finished tasks to find 1: {"wf.due":1,"wf.spawn":1,"pi.generation":4,"pi.tool":1,"wf.review_start":1}
ok: checks H1-H6 passed
```
