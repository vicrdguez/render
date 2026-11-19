# Task: design keel's architecture from first principles

## What keel is

Keel is a development workflow for one developer (the owner) who builds serious software with agents, including a greenfield quant engine where money moves. It ships as an extension of **tau**, a small durable agent harness (`/Users/vr-osxs/dev/tau-workflow`, built on pi-durable). The owner owns the *shape* of the work: direction, seams, what crosses a seam, domain rules, and what counts as proof. Agents own everything an approved reference already determines. The owner should be near the loop, not on it.

The workflow itself is designed and settled. Read `/Users/vr-osxs/dev/tau-workflow/workflow-distillation.md`, section "6. The workflow" through section "8", in full. That document is the requirement. This task is the software architecture that implements it.

## What to produce

One candidate design for the whole of keel as a tau extension: its modules, what each owns, the durable data structures, the public interface of each module as TypeScript types and signatures with `not implemented` bodies, and the build order in slices. The design must cover the full workflow, not only its first slice, because the first slice has to be the right foundation for the rest.

Design as if no workflow extension existed. Tau ships two sample workflows, `extensions/w1` and `extensions/w2`. They are toys that test tau's core. **Do not read `extensions/w1`, `extensions/w2`, or any `.ts` file under `extensions/keel/src` or `extensions/keel/test`**, and do not model keel on them. (An earlier first slice of keel was a fork of W1 and is being replaced; what it taught is listed under "Known facts".) You may and should read tau's own documentation and core, pi-durable's README, the grounding document, and keel's prose.

## Who calls keel

Write the usage from each of these callers' points of view before any types.

1. **The owner, through a tau client.** Starts work with a prompt, answers decisions with a choice and ranged annotations, marks a finding on anything in front of them, triages the queue (build, defer, drop), and promotes a trunk commit to main by hand. The owner never operates keel's internals.
2. **Agents, through tools.** A designer, a build coordinator, workers, verifiers, an investigator, and the sub-roles that fan out inside a stage (explorers, investigators, arena candidates, a judge, a challenger). Each sees only its role's tools and prose.
3. **Tau's host**, which loads the extension, lists it as a workflow, reads its options schema, and runs its tasks after a restart.
4. **A future extension** that wants to reuse keel's dispatch (fan-out to sub-agents and join) without taking keel.
5. **The next engineer or agent** changing one lane, who should be able to do the right thing having opened only that lane's files.

## What the architecture must support

All of this is specified in the workflow document. The list is a checklist, not a substitute for reading it.

- Three lanes with internal stages: Design (Ground, Shape), Build (Encode, Build), Verify (Verify, Land, Hand over). Moving work between lanes is code. Agents are asked only at judgment points.
- One Mandate per piece of work, settled in rounds, with labelled nodes, riders that need item-by-item disposition, every arena candidate kept, and numbered replies to every annotation.
- A live plan owned by a build coordinator: work items that are only a goal and dependencies until started, with the brief rendered at start from the current Mandate and code. Items already verified are a record and are never rewritten.
- Rulings recorded by workers with what they cite. Verdicts of block and note findings. Convergence tracked per finding, no round cap, a stop when a block survives two fixes.
- A queue with one intake and two sources (the owner and agents), cheap investigation first, triage by the owner, batching decided by the investigator.
- Three branch tiers: a worktree per worker off the build branch, verified items merged into the build branch one at a time, a fully verified build landed on trunk as one revertible commit with landings serialized across builds. Keel never merges into main. Verifier checkouts are removed after a pass.
- Principles: one file each with a description and a body. Always pullable through a `principle` tool, with the index in a prompt section. Optionally bound by fact into a brief or triggered by an event. Citations are recorded. Project-level principles and playbooks are read from the repo.
- Dispatch: one bounded module with a narrow interface and no knowledge of lanes, extractable later. Children cannot dispatch.
- A model option for every lane, role and sub-role, each configurable on its own.
- Prose kept apart from code under `src/prose/` (`roles`, `inputs`, `documents`, `playbooks`, `principles`; see `extensions/keel/src/prose/README.md`). Every prompt is rendered from facts the code already knows, one file per role and situation. Agents never edit prose.
- Several pieces of work at once in one project, each with its own Mandate, conversations, plan and build branch. One queue per project.

## Known facts and constraints

- Read `keel-design/grounding.md` first. It describes tau's and pi-durable's primitives and their guarantees as verified from the documentation and source. Treat it as the shared ground truth and say so if you find it wrong.
- Tau's core does not change for keel. If your design needs something tau lacks, name it and test it against the admission rules in `docs/design.md`. A design that needs no core change is preferred.
- An extension ships only its `src` directory. The server loads `src/index.ts`. TypeScript with erasable syntax only, no build step, relative imports end in `.ts`.
- These are properties the running system must have, however you achieve them. Encode each once, not per tool or per task:
  - A tool call may be replayed after a crash. A publication must happen exactly once.
  - A continuation task may be created more than once for one decision. It must act once.
  - An effect outside the store (git) must be planned in the store before it happens, and a rerun must neither repeat it nor destroy anything it cannot prove is keel's own.
  - Cancelling must be durable before any agent is stopped.
  - A commit hash that matters always comes from keel's state or from git, never from a model.
- What the replaced first slice taught, from two independent reviews:
  - Inferring a situation from a combination of state fields caused a real defect. A stop for non-convergence was recognised by "target is the worker and stage is verifying", and a stale decision reached the same combination. Situations must be recorded, not inferred.
  - A decision left open after the owner messaged an agent directly stayed answerable and acted on stale state.
  - A single work record with one stage enum does not stretch to a plan of several items, several workers, a queue, or sub-agents.
  - State fields were added to a stored document without a version or migration story.
- Repository rules in `AGENTS.md` apply, in particular: least complexity that satisfies the scope, tests written before the code they test, and no speculative robustness without the owner's buy-in.

## Done

A reader can trace these four scenarios through your types and signatures alone, naming the module that owns each step and the stored record that changes:

1. A bug fix that follows precedent: prompt to verified commit on trunk, with one worker, one ruling, one failed verdict and a rework.
2. A design that sets precedent: Ground, an arena of two candidates with a judge, a Mandate with three riders, two rounds of owner annotations, then a build of three items where the second depends on the first.
3. A worker finds mid-item that a seam in the Mandate is wrong: the finding, the queue, the owner's triage, a Mandate revision, the affected item pausing while an unaffected one continues, and the plan changing for unstarted items.
4. The server is killed between a worker publishing its build and the verifier starting, and again while a build is landing on trunk. What is in the store, what is on disk, and what happens on restart.

## Output

Write your package to the output directory you are given:

- `design.md`: shaped per `extensions/keel/src/prose/playbooks/architect/rationale-template.md` (Problem, Usage from each caller's view, Shape, Tradeoffs accepted, Alternatives considered, Open questions and risks, Next implementation step), plus the four scenario traces, the module map with what each module owns and may import, and the slice order.
- `sketch/`: TypeScript files with the types and signatures, bodies `not implemented`, doc comments stating intent and invariants. They do not need to compile against tau, but use tau's real names where you rely on them.

Follow the discipline in `extensions/keel/src/prose/playbooks/architect/runner-prompt.md` and screen your own design against `extensions/keel/src/prose/playbooks/architect/design-red-flags.md` before you finish. Where that prompt says "read the architect skill", read `extensions/keel/src/prose/playbooks/architect.md`.

Change no file outside your output directory. Do not run `nix flake check`. If you spawn subagents, do not use any "fable" model.
