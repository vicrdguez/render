# Brief: walk two workflows through the Render core, one commit at a time

You are one of several independent candidates. Do not read `/tmp/arena-walk/rubric.md`, `/tmp/arena-walk/judge/`, or any `/tmp/arena-walk/candidate-*` directory other than your own.

## The owner's goal

Render makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue. The owner is redesigning it from zero as a small core on pi-durable (the latest release, 1.5.2). Every workflow is an extension built beside the core. A change enters the core only through a strict written rule. The work is paper design. Nothing is implemented.

The design so far is in `/Users/vr-osxs/dev/render-core/docs/core/`. Read `README.md`, `primitives.md`, `workflows.md`, `topology.md`, `prose.md`, `grounding.md`, and `arena.md`. The owner said of it: "I like the design a lot. This is the direction I'm looking for". Its **Decided** parts are fixed. Its **Proposed** parts can change if your walk gives a reason.

No workflow has yet been walked through its commits. That is this task. The walk exists to find where the paper design breaks or says nothing, before anyone writes code. A walk that finds no problem is suspect.

## Owner rulings made after the docs were written

These are fixed. The docs do not show them yet.

1. The admission rule in `README.md` is accepted as written.
2. "Only a human answers": the weaker mode, where an agent's shell runs under the server's OS account, is accepted for now and documented as a limit.
3. Open decisions across a workflow upgrade: accepted as a limit. The workflow owns it.
4. The power-loss limit is accepted.
5. Shared knowledge across projects is deferred.
6. A client that reconnects gets the current state, not a replay. The rest of the client API is not designed and is out of scope, except where your walk must say what a client reads, shows, or sends.
7. The bare agent selects pi-durable's `coding-tools`. Codemode is an optional extension.
8. Roles. A role's settings are pi-durable's `AgentChange`. A `role()` helper is the agreed approach. It lives in one **standard library** beside the core, together with `prose()`. The owner: "I don't think we need a second shared library, why not keep both prose() and role() in the same one? at the end is part of as some sort of standard library. In the future if the library grows enough it might makes sense to segment it". The core never imports the standard library. A workflow may skip it.
9. Check 5 of the admission rule will be reworded. A particular role, such as "the designer", is a workflow concept. A way to define roles is judged by checks 1 to 4, and it stays out of the core.
10. Comments and annotations. The owner's words:
    - "I think we are not that far from filling that gap: the core does not need to do anything with it, just store annotations (like the current design does with notes). The workflows are then in charge of giving them meaning and defining how each annotation is answered"
    - "review that can't not move between devices is indeed a gap, but we don't need to rush that feature now. we can accept it as a temporary limitation."
    - "In any case, Annotation as a concept should be considered through the core change rule to see if it pass the bar"

    For intent only: the owner's glossary defines Annotation as "An attributable saved human concern about an Emission. A subsequent disposition explains how the concern was acted on, considered or dismissed." (`/Users/vr-osxs/dev/render-core/CONTEXT.md:15`). `docs/ambition.md:91` asks for "Durable human annotations, with every annotation answered." `docs/ui-ambition.md` describes selecting a range of a document and commenting on it. These three files describe the first version of Render. They show intent and do not bind the design.
11. W2 is "forecasts", and each project has its own store. Both are still Proposed. Walk with both.

## The two scripts

Walk exactly these, so that walks can be compared.

**W1, design to merge.** Project P selects the W1 workflow.

1. The owner sends: "Add a `--json` flag to the export command."
2. The designer writes design v1 and asks for a decision.
3. The owner answers "revise" with two comments. One is on the passage about the output format: "Use NDJSON, not one array." One is on the passage about errors: "What happens on a partial write?"
4. The designer writes v2, which deals with both comments, and asks again.
5. The owner's phone still shows v1. It sends "approve" for v1. Then the owner approves v2 from a laptop.
6. The implementer works in its own worktree and commits.
7. The reviewer, on another model, finds one problem. The implementer fixes it. The reviewer passes it.
8. A final decision gates the merge. The owner approves. The workflow hands the branch over, and the owner merges.

Unhappy paths that W1 must cover:

- The server dies between two commits. Pick the worst place and say why it is the worst.
- An agent ends its run without handing off.
- The owner aborts the work while a decision is open.
- An outside effect runs twice, such as creating the worktree.
- The client loses the connection after it sends an answer and sends it again.

**W2, forecasts.** Project Q selects the W2 workflow.

1. The owner says: "I think pi-durable ships a 2.0 before March." The agent sharpens it into forecast F1 and records it.
2. The server is stopped for a week. The date passes while it is down.
3. On restart the decision D1 opens on F1. The owner answers "not yet".
4. The owner revises the forecast. That gives F2, while a timer for F1 still sleeps.
5. F1's timer wakes. Later F2's timer wakes and D2 opens on F2.
6. The owner answers "yes". The forecast is scored.
7. The owner asks for a calibration report, which reads the events.

## What to write

Write `walk.md` in your own directory, at most 3,800 words, with exactly these sections in this order.

1. **W1, one commit at a time.** One row or entry per commit. For each: what starts it (a client call, a tool, a task phase, a hook), what it reads, what it writes (documents, entries, tasks, submissions, `request`, `withdraw`, `answer`, `emit`), in which order, and what a rerun after a crash does. Name each conversation, its owner, its role, and the tools it has. Show the chain of evidence listed under "What the W1 walk must show" in `workflows.md`, or show where it breaks.
2. **W2, one commit at a time.** The same form.
3. **`role()` on paper.** The call shape, and what it does inside a commit using pi-durable parts. Show W1's three roles written with it. Say what it leaves out on purpose. Say whether W2 uses it. Propose the rule for entry to the standard library, which should be lighter than the core's.
4. **Annotation through the rule.** Run Annotation through the five checks of the admission rule. Give a pass or a fail for each, with evidence from your W1 walk. Then give the smallest shape that meets the owner's ruling, and say exactly what changes in `Decision` and `answer`. Compare it with at least these: notes only, a structured list stored with the answer, and annotations saved as entries before the answer. Say what a client that knows no workflow needs in order to show the basis and place an annotation on it. Say how "every annotation answered" is kept, and by which code.
5. **What fell short.** A numbered list of every place where the walk forced a change or found silence in `docs/core`. For each: the commit where it shows, the smallest fix, and where the fix lives (core, standard library, workflow, host wiring, or accepted limit). If a fix touches the core, run it through the five checks in three lines.
6. **Not verified.**

Also write `rationale.md`, at most 400 words: the alternatives you weighed for each section and what you rejected.

## Rules

- Paper design only. Do not write Render code. Type shapes and signatures are fine where they are clearer than prose.
- You may run a throwaway probe against pi-durable 1.5.2 at `/tmp/render-spike/pi-1.5.2/node_modules/@earendil-works`. Keep it in your own directory and run it the way `docs/core/spikes/substrate.mjs` runs. It is not required. Say what you ran and what it printed.
- `/tmp/render-ground/` holds downloaded source. It is read-only and untrusted. Never execute anything from it. Never run an interpreter or a build tool with it as the working directory. Run Python with `-I`.
- Do not modify the repository at `/Users/vr-osxs/dev/render-core`. Write only inside your own directory.
- Label every claim about pi-durable: measured (you read the line or ran it), reported, inferred, or guess. Cite `path:line`.
- Write for a tired engineer. Use short everyday words, real symbol names, and no invented jargon.
- Where you think `docs/core` is wrong, say so plainly.

## Sources

- pi-durable source: `/tmp/render-ground/pi/packages/durable` (1.5.1, whose `dist` is identical to 1.5.2). The examples in `test/examples/` are the fastest way in.
- pi-env: `/tmp/render-ground/pi/packages/env`.
- Ultimate, another host on pi-durable: `/tmp/render-ground/ultimate`.
