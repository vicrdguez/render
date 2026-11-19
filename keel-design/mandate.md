# Keel architecture: Mandate draft, round 1

For your review. Nothing here is approved. Annotate anything, then answer one of: approve, rework, take
candidate A as it stands, take candidate B as it stands, run a new arena (seeded by this one or fresh),
or decline. Each node labelled N or R below needs its own answer. Approving the draft does not approve
them.

Everything the arena produced is kept beside this file:

| File | What it is |
|---|---|
| `task.md` | The task both candidates were given |
| `grounding.md` | What tau and pi-durable guarantee, verified from docs and source |
| `candidates/a/` | Candidate A in full, by `claude-opus-5-5` |
| `candidates/b/` | Candidate B in full, by `gpt-6.2-astra` |
| `rubric.md`, `judge.md` | The rubric the candidates did not see, and the cross-judge's report, by `gpt-6.2-astra` |

Both sketches type-check. I ran that myself. Nothing else about either design has been run.

## Intent

**Goal.** Give keel its own architecture, designed as if no workflow extension existed, so that every
later slice is an addition and not a rewrite. The workflow it implements is settled in
`workflow-distillation.md`, sections 6 to 8.

**Done.** The four scenarios in `task.md` can be traced through types and signatures, naming the module
that owns each step and the stored record that changes: a bug fix through to trunk, a design that sets
precedent, a seam found wrong mid-build, and two server kills.

**Callers.**

| Caller | Now | Later |
|---|---|---|
| You, through a tau client | Start work, answer decisions with annotations, read the hand-over | Mark findings, triage the queue |
| Agents, through tools | Designer, coordinator, worker, verifier | Investigator and the sub-roles that fan out |
| Tau's host | Loads `src/index.ts`, reads the options schema, resumes tasks after a restart | The same |
| Another extension | Nobody | Reuses dispatch without taking keel |
| The next engineer or agent | Changes one lane having opened only that lane's files | The same |

## What the two candidates agree on

These came out the same in both designs, independently. I treat them as settled unless you object.

- A piece of work is identified by its designer conversation. Its Mandate, plan and verification records
  hang off that conversation. The queue and the trunk landing slot are one per project.
- Moving work between lanes is code. No agent gets a tool that advances a stage, approves, or names a
  commit.
- Tau's core does not change. Dispatch, the principles section, git recovery and the queue are all
  extension code.
- Each lane owns its own stored record, and no other lane can write it.
- Git is planned in the store before it is touched, and anything keel cannot prove is its own is left
  alone and reported.
- A build lands on trunk as one commit with trunk as its only parent, by compare-and-swap.
- Dispatch is foreground: the caller waits, children belong to the calling task, and children cannot
  dispatch.
- Each rider is its own decision. Approving a Mandate cannot approve its riders by accident.
- Project principles and playbooks live in the repo under `.keel/`.
- Every stored record starts at version 1, and a changed shape needs a version bump and a migration.

## N1. The fork: how lanes act on the world

This is the one structural choice the candidates disagree on, and the two reviewers disagree on it too.

**Candidate A: lanes declare, one kernel reconciles.** A lane is five pure functions over its own stored
state.

```ts
interface Lane<S, E, V> {
	reduce(state: S, event: E | KernelEvent, world: World): Reduction<S>; // next state, or reject
	view(state: S): V;                                 // the read-only face other lanes see
	asks(state: S, world: World): readonly Ask[];      // what the owner is asked now
	agents(state: S, world: World): readonly AgentDecl[]; // which agents exist and what each owes
	effects(state: S, world: World): readonly EffectDecl[]; // which git or dispatch effects are needed
}
```

The kernel is the only code that touches tau or git. After every commit it compares what each lane
declares with what exists, and opens or withdraws decisions, creates or stops agents, delivers inputs and
runs effects to match. A lane never sees a transaction.

**Candidate B: lanes act through a turn, and a crossings module routes between them.** Each lane has a
receiver that is handed a `Turn` and calls it to write records, open decisions and schedule tasks. One
file, `crossings.ts`, is an exhaustive switch from each lane's exits to the next lane's inputs.

| | A | B |
|---|---|---|
| A decision left open after its situation moved on | Cannot happen: the declaration is gone, so it is withdrawn | Each change must withdraw what it invalidates |
| A new tool or lane forgetting a durability rule | Cannot reach tau to break one | Depends on going through the adapters |
| Where a bug in the mechanism lands | Everywhere, since every lane runs through the kernel | In the lane that has it |
| Reading the flow | By what is declared, not by who called whom | Top to bottom, like ordinary code |
| Testing a lane | Pure functions, milliseconds, no store | Needs a store and a turn |

**The judge recommends B as the base**, scoring it 22 against 16 for A. Its main reasons are that B is
more exact about authority and about git, and that A's reconciler is an engine to learn. It still
grafts A's central idea, deriving open questions from the stored situation.

**I recommend A as the base.** On the rubric I score them level (A 21, B 21.5 out of 30), so the
rubric does not decide it for me. My reasons are these:

- The two defects found in the first slice were both of the kind A makes impossible: a situation inferred
  from state, and a decision that outlived its situation.
- Keel's code will be written by agents that read only the files they open. A lane that cannot reach tau
  cannot break replay, ordering or cancellation, whatever it copies.
- It is the same shape you chose for tau: a small kernel, with the workflow plugged in as lanes.
- B's strengths are in what it records, not in how lanes are wired, and they port into A's lane state.

Treat the two reviewers' disagreement with care. The judge is the same model that wrote B, and I am the
same family that wrote A. Neither of us is a neutral reader here, which is a reason for you to rule.

## Recommended shape (if N1 is A)

| Module | Owns | May import |
|---|---|---|
| `kernel/` | The commit protocol, reconciliation, tool receipts, the four tasks (`answer`, `effect`, `deliver`, `stop`), versioned state | `repo/`, `dispatch/`, `roles/`, tau |
| `lanes/design/` | The Mandate: Ground report, revisions, rounds, arenas with every candidate, riders | kernel types, other lanes only through their `public.ts` |
| `lanes/build/` | The live plan, briefs, attempts, rulings | the same |
| `lanes/verify/` | Verdicts, finding threads, merging, the full-set pass, landing, hand-over, the trunk slot | the same |
| `lanes/queue/` | Findings, investigation, batches, triage, approved references | the same |
| `repo/` | Git, keel's on-disk layout, ownership proofs. The only code that can produce a commit hash | nothing in keel |
| `dispatch/` | Fan-out and join | tau only, no keel code |
| `roles/` | The one list of roles, with each role's model option, tools and prose | tau, prose |
| `principles/` | The index section, the `principle` tool, bindings, triggers, citation records | tau, prose |
| `prose/` | Markdown only | nothing |

A boundary test fails the build on a cross-lane import that skips `public.ts`, and on any keel import in
`dispatch/`.

**Grafted from B.**

1. **Authority follows Mandate nodes.** A brief records which nodes it relies on. Revising one node
   pauses only the items that rely on it. An item can carry several holds at once.
2. **Rounds review nodes.** A round asks you about the nodes no approved reference determines, not about
   a whole revision.
3. **Findings have stable identity.** A block that survives is counted against a fix that was actually
   made and observed to fail, not against a position in the last verdict.
4. **A stated compatibility policy.** Old decisions keep their meaning, in-flight installs are never
   defaulted away, and a migration is tested against a real old snapshot.

**Cut from A.**

- An owner's direct message acting as authorization (see R1).
- Preloading every open piece of work on every commit. Load the work in hand and the project records.
- The 32-hop message loop. A message goes to one lane and is handled in that commit.

**Fixed in A.** Branch names: `keel/<work>` and `keel/<work>/<item>` cannot both exist as git refs. And
the dispatch adapter for task callers, which the judge's source check says does not match pi-durable's
commit signature. I have not checked that one myself.

**Not taken from B.** Confined edit tools and a trusted check runner in place of `bash` (see R2), the
universal immutable-page framework, witness refs, and the watcher that arms decisions.

## Rules and probes

| Rule | Probe that would prove it false |
|---|---|
| A replayed tool call publishes once | Kill after the publishing commit, replay, and find two entries |
| A decision acts once, and only while its situation is current | Answer a decision whose situation has moved and see it change state |
| Git is planned before it happens | Kill mid-effect and find a branch or worktree the store does not name |
| Keel never resets or deletes what it cannot prove is its own | Put a foreign directory at a planned path and find it changed |
| Cancel is stored before any agent stops | Kill between cancel and stop, restart, and find the work still running |
| No commit hash comes from a model | Find a tool schema with a hash field |
| Situations are recorded, never inferred | Find a branch on two state fields that no single recorded value names |
| A lane cannot reach tau | Import `tau/durable` from a lane file and see the build pass |
| Keel never writes main | Find any ref update whose target is the base branch |
| A stored shape cannot change without a version bump | Add a field and see the shape fixture still pass |

**Never to exist:** a second way to ask you something, reach an agent, or touch git. A lane-to-lane
import that skips `public.ts`. A tool that advances a stage. A hand-synced list of roles or lanes.

## Proof

Tests are written before the code they test, at the cheapest seam: pure lane tests, kernel tests on an
in-memory store with a scripted model, `repo/` tests on temporary git repositories, and kill-and-restart
tests in a child process. The acceptance gate is `nix flake check -L`.

**Build order.** Both candidates' first slices are too large. I would cut the first one in three:

1. The kernel alone, proven against a toy lane: reconciling asks, agents, inputs and effects, the
   `answer` task acting once, receipts under replay, versioned state.
2. `repo/` alone, against real temporary repositories, including both kill points.
3. The three lanes for one item: prompt to Mandate, build, verify with convergence, land on trunk, hand
   over. Checkout cleanup after a pass is part of this.

Then Mandate rounds and principles, the queue and live plan, dispatch and the arena, and the
override-to-check loop, as already agreed.

The current first slice is replaced. Its prose, its failure inventory and what its two reviews found
carry over. Its code does not.

## Riders: what the candidates decided that the task did not ask

Each needs your ruling. Candidate A lists 55 such choices and candidate B lists 31, in the last section
of each `design.md`. The judge adds 18 more in section 5 of `judge.md`. These are the ones with the
highest cost to change later.

| # | Choice | Options | My recommendation |
|---|---|---|---|
| R1 | Does a direct message from you to an agent count as direction? | A: yes, it can settle a finding or release a hold. B: no, and keel watches for it to withdraw stale decisions. | No. Only an answer moves work. Reconciliation withdraws a decision when its situation changes. |
| R2 | What may a worker or verifier execute? | A: tau's coding tools, including `bash`. B: fenced edit tools and a trusted check runner, no shell. | `bash` for now, with a protected-path check at publish. B's option needs a runner that does not exist. |
| R3 | Who may move trunk? | Keel only, or anyone. | Keel only. Then a stored old and new commit and one compare-and-swap are enough. |
| R4 | When trunk moved since the full-set pass, what re-checks the combined result? | A: the Mandate's proof commands, run by code. B: a verifier on the exact commit that will land. | A verifier, but only when trunk moved. |
| R5 | Who approves the Mandate of a bug or other precedent-following change? | A: nobody. The designer writes it, with proof commands, and you first see it at hand-over. | Your call. This is what the workflow document says, but it means proof commands run that you have not read. |
| R6 | Who runs the arena? | A: code runs candidates, then judge, then challenger. B: the designer dispatches them. | Code. It guarantees every candidate is kept and the challenger runs before you see anything. |
| R7 | Both arena seats resolve to the same model family | A: warn. B and the judge: refuse. | Refuse. Different families is the point of the arena. |
| R8 | A one-item bug still gets a coordinator and a full-set pass | One code path, at the cost of two short agent runs. | Accept. |
| R9 | Cancelling while a landing is already authorized | B: the landing finishes and is reported. | Accept, and say so in the hand-over. |
| R10 | One decision per rider | More rows in your inbox. | Accept. Both candidates chose it. |

## Corrections to the workflow document

Both candidates found the same two contradictions in `workflow-distillation.md`, and resolved them the
same way. I recommend adopting their reading.

- **When non-convergence stops.** One place says a stop when a block survives two fixes. Another says
  after two fixes and a fresh diagnosis. Reading adopted: two failed fixes, then a fresh diagnosis by
  another agent, then the queue.
- **Does filing a finding stop the filer?** "Nothing that lands in the queue stops the work that found
  it" conflicts with "only affected items pause". Reading adopted: filing stops nothing, a filer that
  cannot continue holds only its own item, and a finding classified as a wrong Mandate holds the items
  that rely on the affected nodes.

## What the judge says you most need to rule on

R1, R2 and R3, in that order. I agree.
