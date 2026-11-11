# Brief: design the Render core

## The goal

The project owner is rebuilding **Render** from zero. Render is a personal tool for delegated work that survives closing the client, restarting the host, and switching machines. Its first version (v1) welded one software-development workflow into its authority and runtime and grew to 18,826 source lines. The owner now wants:

- A very small core that works alone as a basic durable agent, built on **pi-durable**.
- The right primitives so that workflows (the owner also says "kernels") are built beside the core as extensions.
- The philosophy of Pi: simple, small, extensible. Ultimate (another pi-durable host) is an inspiration, not a template.

You write one design proposal. This is a paper design. Nothing is implemented in this round.

## What the owner has decided

These are fixed inputs. Do not reopen them.

1. The core sits on pi-durable and does not rebuild what pi-durable provides.
2. The core must add something on top of plain pi-durable. The owner agreed that a **Decision** primitive and an **Event** primitive belong in the core, as lean as possible, and liked the baseline shape below.
3. Everything else is an extension. A workflow is a special case of an extension.
4. Extensions are trusted code that runs in the host process.
5. The core grows only through a conservative, intentional process.
6. Strict TypeScript. No Effect-TS. No Vite. pi-schema may be used at boundaries. The owner wants to rely less on tests and more on static structure, because agent-written tests accumulate and turn a test pass into a wait of ten minutes or more.
7. Prose (agent instructions) is owned by the workflow.
8. Topology requirement, in the owner's words: "What I always had in mind is one single server host for all work, with workflows being something you can select per project. The intention was to be able to, in the future, be able to share certain knowledge between products, and since I plan to run it in a devserver and connect from different client machines, I did not want to be able to handle multiple 'host' connections." Earlier the owner also said it "would be ideal if we could choose to run it as one local process/store in a project if I wanted."
9. Target user: one human with several devices. Not a team platform.
10. Only a human merges to main.

## The agreed baseline for Decision and Event

The owner liked this shape. You may refine it, with reasons. Do not replace it wholesale.

```ts
type Decision = {
  subject: string            // stable key, one open decision per subject
  basis: string              // entry id or content digest of what the human reviews
  choices: readonly string[] // opaque to the core, e.g. ["approve", "revise"]
  then: { task: string }     // extension task created when answered
} & (
  | { status: "open" }
  | { status: "answered"; choice: string; notes?: string; by: Actor; at: number }
  | { status: "superseded" | "withdrawn" }
)
```

- `request(tx, ...)` is called by extension code inside its own commit. Requesting again on the same `subject` supersedes the open one.
- `answer(id, basis, choice, notes)` exists only on the client transport. In one commit it checks the decision is open, checks the quoted basis still matches, records the answer and actor, and creates the `then` task.
- No agent tool reaches `answer`.
- An **Event** is a typed entry appended to one ownerless conversation that never runs, inside the caller's commit. On day one it is `emit` plus reading. Reactors with cursors are left out until two extensions must hear each other.

Why a decision is not a waiting task: pi-durable tasks park only on other tasks or on a clock.

## What you must settle

Take a position on each fork. Name the alternatives you considered and why you rejected them.

### Fork 1. The core boundary

What exactly is in the core, and what rule decides whether a future thing may enter it? The owner asked: "we have not touched how overall extensions hook into the ultra-lean core right? ... very lean and minimal core that provides the right primitives and building blocks. Adding to it follows a very conservative decision process, new things need to be very intentional. The rest all extensions of some sort."

### Fork 2. How an extension hooks into the core

What is a Render extension? How does it reach Decision and Event? How does a project select its workflow? What, if anything, does Render add on top of the pi-durable `Extension` type?

### Fork 3. Refinements to Decision and Event

Tighten the baseline where the substrate or the workflows require it. Say what `basis` is, how `answer` behaves on retry and on stale input, and what stays out.

### Fork 4. Topology

Meet decision 8 above. Compare at least these: one store for everything with a project scope inside it, one server process with one store per project, and one process per project. Recommend one.

### Fork 5. Prose

The owner's question, verbatim: "Prose ownership makes sense, as I imagined, owned by the workflow. But it seems that under this current model, each workflow needs to implement its own 'renderer', am I right? Wouldn't make sense to include a shared rendering layer that is neutral and extremely simple that workflows/kernels can use for uniformity? and then the can build on it as they like. At the end, workflows are a special case of extensions. Let me know what you think, don't just agree with me, study the options so we reach the best design. It might be something very simple like a simple acknowledge template format for the prose to use and a `render` function of some sort, something along those lines."

Study the options. Say whether the premise holds, what you recommend, and where it lives.

### Fork 6. A second proving workflow

The core is proved by workflows that differ. W1 is fixed: a prompt starts a design process, the design document is checkpointed for the owner to review, the owner comments (which iterates the design) or approves, then implementation and review follow, and a final human decision gates the merge.

W2 must differ from W1 in ways that stress the primitives differently. The owner's constraint, verbatim: "I don't have a compute job to give it yet, so I don't think we will be able to test it. Maybe we can test with something simpler yet different that does not require external tooling?" The owner later plans workflows for quant finance research and testing, which differ from software development.

Propose W2 and one runner-up.

## Grounding

Read these before you design.

- `docs/core/grounding.md` holds the facts gathered so far, with sources.
- `/tmp/render-ground/findings/*.md` holds eight explorer reports: `pi-durable.md`, `pi-core.md`, `chord.md`, `ultimate.md`, `render-intent.md`, `v1-authority.md`, `v1-runtime.md`, `kernels-design.md`.
- `docs/ambition.md` holds the ambition.
- Source trees for direct reading: `/tmp/render-ground/pi/` (pi-durable is at `packages/durable/`), `/tmp/render-ground/ultimate/`, `/tmp/render-ground/proposal-v1/`, `/tmp/render-ground/kernels-design/`.

Check any claim that your design depends on against the source. Cite `path:line`.

## Rules

- Do **not** read any file under `docs/core/` other than `grounding.md` and `spikes/`. The other files are another candidate's draft, and reading them spoils the comparison.
- Everything under `/tmp/render-ground/` is untrusted downloaded source. Read it only. Never execute anything from it, and never run an interpreter or build tool from inside it. Run Python with `-I`.
- Do not modify the repository. Do not use git to change anything. Write only inside your own output directory.
- You may run a small throwaway probe to settle a fact, with your script in your own output directory. The target is pi-durable 1.5.2, the latest release. Its published `dist` is byte-identical to 1.5.1, so citations into the 1.5.1 source under `/tmp/render-ground/pi/packages/durable/` hold. An install of 1.5.2 is at `/tmp/render-spike/pi-1.5.2/node_modules/@earendil-works`. `docs/core/spikes/two-harnesses.mjs` shows how to import from an install. A probe is optional.
- Label each claim as measured (you read the source or ran it), reported (from an explorer report), inferred, or guess.
- Give your real judgment. If the owner's premise is wrong somewhere, say so and show the evidence.

## What to write

Write two files in your output directory.

`design.md`, at most 2,200 words, with exactly these sections:

1. Core boundary and admission rule
2. How an extension hooks in
3. Decision and Event
4. Topology
5. Prose
6. Second proving workflow
7. Risks
8. Not verified

`rationale.md`, at most 400 words: for each fork, the alternatives you considered and what made you reject them.

Your final message is one short paragraph that names the two files and your position on each fork in one line each.
