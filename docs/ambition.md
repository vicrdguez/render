**The more ambitious task is not “build a cleaner `skl`.” It is “make delegated development trustworthy enough that you can leave, reconnect elsewhere, and continue without reconstructing what happened or wondering what was authorized.”**

Keep **render**. It fits the distinctive idea: rendering an accepted intention into the right work, instructions, capabilities, and evidence for the current moment.

I’ve grounded this in the transcript, research into `../skills` and its recorded `design-workflow` proposal, and Pi Durable’s current documentation. Two important distinctions:

- The target workflow is substantially richer than planner → implementer → reviewer: it includes annotated checkpoints, challengers, competing candidates, isolated experiments, and explicit human decisions.
- `design-workflow` is only partially delivered: three of six slices are recorded as integrated into its proposal branch, not fully delivered to main. **The accepted target—not merely today’s executable behavior—must inform Render.**

## ALTITUDE — What you are really after

You want to stop being the system’s memory, scheduler, and recovery mechanism—without surrendering control over consequential decisions.

That means Render should let you:

- Begin with an uncertain idea without prematurely turning it into implementation commitments.
- Resolve uncertainty through challenges, alternatives, and experiments.
- Approve explicit commitments rather than vaguely approving a conversation.
- Delegate implementation and independent review against those commitments.
- Close a client, restart the host, or change machines without losing ownership, evidence, or pending decisions.
- Discover what happened and what needs you without rereading an entire transcript.

### The task aimed at that outcome

**Design Render as a small, evidence-backed workflow authority, and demonstrate that its critical architectural promises are achievable before committing to the implementation.**

The output should be more than a module diagram. It should be an **architecture with an assurance case**: each important promise has an owner, a failure scenario, and an independent check.

“Independent modules” should mean responsibilities can change locally—not that every concept gets a package or every dependency gets an abstract interface. Using `/design`, we should seek a handful of **deep modules**, each hiding substantial complexity behind a small interface.

### Access and setup I would need

| Need | Why |
|---|---|
| Read access to `skl` source, accepted proposal revisions, Contracts, reports, and relevant workflow history | Separate enduring invariants from implementation accidents; recover intended but undelivered behavior. |
| A pinned Pi Durable version, its specification/source, and the required everyday Pi features | Verify capabilities rather than design against transcript examples or assume ordinary Pi extensions are interchangeable with Durable extensions. |
| A disposable local host instance, temporary storage, and isolated workspaces | Kill, restart, corrupt test inputs, and exercise recovery without touching your real ledger. |
| A sandbox GitHub repository and narrowly scoped credentials | Test uncertain issue/PR creation, stale evidence, review, and publication safely. |
| Two scripted clients; eventually one actual second machine | Test concurrent commands, disconnection, reattachment, and network/authentication behavior. |
| A scripted model provider, plus a capped budget for real-model trials | Make correctness tests deterministic, then separately evaluate instruction quality and practical usability. |
| Permission to collect redacted traces, timings, usage, and recovery outcomes | Produce reproducible evidence rather than screenshots and assurances. |

I can automate the verification of approval mechanics. I cannot replace your actual product decisions, acceptance, or final merge with simulated approval.

## DEPTH — What a top practitioner would add

### 1. Start from histories and counterexamples, not directories

The raw material should include:

- A successful workflow.
- A workflow interrupted during a handoff.
- A stale or duplicated worker submission.
- A checkpoint with human annotations and rework.
- An experiment that disproved the favored design.
- A review whose evidence became stale after another commit.
- An external operation that succeeded but whose response was lost.

From these, build a traceable catalogue:

**observable promise → invariant or policy → responsible module → evidence → failure behavior.**

This prevents a beautiful architecture from quietly omitting the hardest parts of `skl`.

### 2. Preserve the distinction between integrity and scheduling

Your functional-core approach is right. But one sentence in the transcript needs tightening: independent-review requirements cannot live *only* in the orchestration loop if another entry point could bypass them.

The distinction should be:

- **Domain integrity and mandatory authorization:** cannot be bypassed by changing the loop.
- **Workflow policy:** selects among legal actions.
- **Execution:** performs effects and records outcomes.

The core can remain ignorant of Pi, graph nodes, and scheduling while still protecting the rules that make an accepted transition legitimate.

Similarly, rendered instructions and available tools should describe the same accepted assignment—but **tool handlers must revalidate authority and state**. A stale prompt is not authorization.

### 3. Make the design workflow a first-class acceptance journey

The architecture must support the target:

**Ground → Seams → Modules → Proposal → Record**

including:

- Seams, Modules, and Proposal review checkpoints.
- Challenger objections and their dispositions.
- Competing candidates where requested.
- Prewritten experiment protocols and isolated candidate workspaces.
- Durable human annotations, with every annotation answered.
- Product questions that stop for a human.
- Explicit disclosure of incidental decisions the original question never asked for.

This is not supplementary documentation around an implementation engine. It is part of the product.

### 4. Test the dangerous seams early

I would use:

- **Property-based and model-based tests** for ownership, authorization, transitions, and stale commands.
- **A deterministic scheduler and fake clock** for retries, concurrent commands, cancellation, and wakeups.
- **Subprocess fault injection** around persistence and external effects.
- **Real storage conformance tests**, rather than trusting only in-memory substitutes.
- **Capability tests** attempting to bypass role restrictions through shell access, inherited credentials, or nested tools.
- **Structured telemetry** correlating workflow, assignment, revision, operation, and evidence identities.

A profiler is useful later if measurements show scheduling, rendering, or storage overhead matters. It is not the first tool for this problem; recovery and authority errors are more consequential than shaving milliseconds off transitions.

### An ambitious but achievable target

> For every named failure point in the representative workflow, Render either resumes safely or stops with a precise, actionable explanation—without manual ledger repair, invented approval, or silently duplicated accepted work.

A concrete stress target would exercise distinct meaningful execution interleavings with independent invariant checks, plus targeted real-process crash tests. Seeded schedules can explore a large state space, but a repetition count alone is neither evidence of distinct behavior nor proof against every possible failure.

Do not promise exactly-once GitHub effects. Promise identifiable operations, reconciliation, and safe handling of uncertainty.

## RANGE — Restate the task as verbs

Render must:

**clarify, challenge, compare, experiment, commit, assign, constrain, render, execute, verify, reconcile, resume, explain, and ask.**

That is a better scope definition than “state machine, ledger, extension, server, clients.”

Here are five outside-software techniques I would actually apply:

| Field | Technique applied to Render |
|---|---|
| **Aviation safety** | Perform a failure-mode analysis on handoffs: what can be lost, repeated, misattributed, or acted on after becoming stale? Give each consequential failure a detection and recovery path. |
| **Accounting** | Reconcile intended effects, observed external outcomes, and accepted workflow records. An unexplained difference remains unresolved; it does not become “probably succeeded.” |
| **Experimental science** | Define experiment protocols and falsification criteria before candidates run. Preserve negative results and uncertainty, not just the winning design’s narrative. |
| **Human factors** | Use a handover test: can someone returning on another client identify the current commitment, blocker, evidence, and next required decision without reading the conversation? |
| **Industrial operations** | Track work in progress and distinguish productive work from waiting on models, CI, review, or humans. Introduce concurrency limits where they prevent contention or wasted work—not merely because parallelism is available. |

**Adversarial perspective:** treat an agent as persuasive but unreliable, and a client as stale or compromised. Try to approve the wrong revision, release another worker’s claim, substitute evidence, bypass restrictions through credentials, or interpret a conversational “looks good” as formal authorization.

The architecture succeeds only if those attempts fail through enforced rules—not because the instructions told the agent to behave.

## VERIFICATION — Evidence beyond my judgment

There should be two gates.

### Gate 1: Is the initial design credible?

Before production implementation:

- Every must-preserve invariant and accepted target behavior has a named owner and verification method.
- Every role has explicit authority, inputs, outputs, workspace access, and lifecycle semantics.
- Critical Pi Durable assumptions have version-specific evidence; uncertain ones have narrowly scoped executable probes.
- At least two materially different module decompositions are compared using `/design`: depth, locality, interface burden, and seam placement.
- Failure scenarios are specified **before** prototype code.
- Unverified claims and missing access are listed explicitly.

### Gate 2: Does the eventual system keep its promises?

| Promise | Independent check |
|---|---|
| Changing the loop does not rewrite domain meaning | Drive the same domain scenarios through a simple test driver and the Durable executor; compare accepted outcomes. |
| Interrupted work is recoverable | Kill at each named persistence/effect point; compare recovered commitments, ownership, and evidence with the uninterrupted case. |
| Duplicate and stale commands cannot corrupt later work | Replay old handoffs and approvals after newer assignments or revisions; assert rejection or idempotent results. |
| Human control survives conversation loss | Resume a design checkpoint in a fresh conversation; preserve all annotations, unresolved questions, and required approvals. |
| Review concerns the actual delivered work | Change the submitted revision; verify old evidence cannot authorize the new revision. |
| Clients are not workflow owners | Disconnect one client, attach another, and race commands; accepted state remains consistent and disconnect does not implicitly cancel work. |
| Role restrictions are real | Attempt forbidden actions through direct tools, nested calls, filesystem access, and available credentials. |
| Durability is honestly specified | Test process crashes separately from backup/restore; explicitly document power-loss guarantees and limitations. |

That last distinction matters: [Pi Durable’s current README](https://github.com/earendil-works/pi/blob/main/packages/durable/README.md) describes experimental interfaces and a SQLite default under which recent commits may be lost on power or host failure. “Durable” needs a declared failure model.

## Rewritten task prompt

> **Design Render as a trustworthy, centrally hosted development workflow—not as a one-to-one port of `skl`.**
>
> Work in `/Users/vr-osxs/dev/render`. Read `skl_conversation_transcript.md` completely, giving precedence to its later clarified requirements. Study `../skills`, its domain rules, and the accepted `design-workflow` proposal, distinguishing delivered behavior, accepted future behavior, and explicitly deferred ideas. Do not use `skl` tests as any sort of reference: they are slow and bloated. Redesign the testing strategy from the intended behavior and Render’s ambition.
>
> The outcome is that I can take an uncertain idea through design, explicit commitments, implementation, verification, and independent review; leave or switch clients at any point; and resume without reconstructing workflow state or losing human control.
>
> **Use `/design` throughout.** Propose a handful of deep modules with small interfaces, clear seams, bounded responsibilities, and local reasons to change. Compare at least two genuinely different decompositions before recommending one. Do not create a generic workflow framework, DSL, or speculative adapter ecosystem.
>
> Preserve a functional core of pure domain transformations independent of side effects and orchestration topology. Separate mandatory integrity and authorization rules from workflow scheduling policy. Keep Pi Durable execution and external effects outside the core. Changing the loop must not bypass invariants.
>
> Design for one authoritative host on this machine and remote clients only. Cover authentication, concurrent commands, observation and reattachment, task ownership, cancellation, isolated workspaces, credentials, persistence, external-effect reconciliation, recovery, and version evolution. Verify Pi Durable assumptions against a pinned version; do not assume compatibility with ordinary Pi extensions.
>
> Make the full intended `design-workflow` journey first-class: Ground, Seams, Modules, Proposal, Record; annotated human checkpoints; challengers; competing candidates; isolated experiments with prewritten protocols; retained evidence; and explicit product decisions.
>
> Define how each relevant role runs: coordinator, challenger, candidate, experiment-candidate, experiment-parent, implementer/audit, Watchdog, and human. Specify authority, inputs, outputs, rendered instructions, capabilities, evidence provenance, workspace access, and lifecycle. Preserve human-owned final merge while distinguishing any permitted integration into proposal branches.
>
> Extract invariants rather than copying CLI commands, Git-ledger layout, or supervisor choreography. Preserve intentional user-facing behavior such as editable review documents and durable annotations. Treat Jujutsu and decision models as optional, evidence-driven additions—not prerequisites.
>
> Start from representative workflow histories and failure cases. Apply failure-mode analysis, reconciliation, predeclared experiment criteria, and a cross-client handover test.
>
> Deliver:
>
> 1. A concise outcome, scope, and non-goals.
> 2. A source-backed invariant and target-behavior catalogue.
> 3. Compared architectural alternatives and the recommended module interfaces.
> 4. Host/client and role execution designs.
> 5. Representative success, interruption, stale-command, and uncertain-effect traces.
> 6. A verification matrix with independent expected outcomes and measurable acceptance targets.
> 7. A staged implementation plan, unresolved decisions, and required access.
>
> This is an initial design task, not production implementation. Where essential to validate a risky architectural assumption, use only narrowly scoped, disposable probes, defining failure cases and tests first. Do not mutate the live ledger, existing workflows, or production configuration.
>
> Aim for safe recovery or explicit actionable blockage at every named failure point, no manual ledger repair in the tested scenarios, and no inferred human authorization. Clearly separate demonstrated results, proposed targets, and remaining uncertainty.

**I’ll wait for your go-ahead before executing that design task.**
