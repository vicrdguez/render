# Brief: extensions as the main unit, and Lane through the rules

You are one of several independent candidates. Do not read `/tmp/arena-ext/rubric.md`, `/tmp/arena-ext/judge/`, `/tmp/arena-ext/picker/`, or any `/tmp/arena-ext/candidate-*` directory other than your own.

## The owner's goal

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue. Tau is a small core on pi-durable (the latest release, 1.5.2). Everything else is an extension built beside the core. A change enters the core only through a strict written rule. The work is paper design. Nothing is implemented.

The project was called Render until yesterday. The repository, its paths, and the raw files of earlier arenas keep the old name.

The design so far is in `/Users/vr-osxs/dev/render-core/docs/core/`. Read `README.md`, `host.md`, `primitives.md`, `library.md`, `walk.md`, `workflows.md`, `topology.md`, and `grounding.md`. Its **Decided** parts are fixed. Its **Proposed** parts can change if you give a reason.

The owner reviewed that design and wrote two notes that it does not yet answer. They are this task.

## Owner rulings made after the docs were written

Rulings 1 to 18 are in `docs/core/arena-walk/brief.md` and `docs/core/arena-host/brief.md`, and still stand. The docs already show rulings 19 to 22.

19. The project is named Tau. `render` may become the name of a workflow.
20. `bind` takes the working directory as a path.
21. A library helper may define a document for its caller. Check 3 of the library's rule is reworded, as `library.md` shows.
22. Accepted for now: a faulted task cannot be run again or cleaned up, a workflow cannot be removed from a project, a project cannot be unbound, and a conversation cannot be deleted.
23. **The extension is the main unit.** The owner: "I notice that all the weight on the docs are put in `workflows` as the sole type of extension, but in reality the main primitive is the 'extension' and should be taken more into account. A workflow is a specialiced extension that this project names and supports explicitly because it is also a core concept, but extensions will carry all sort of different duties. E.g. one that will get designed very early is websearch extension. in the future maybe sandboxing etc".
24. **Lane is being considered. It is not decided.** The owner: "I'm considering a potential new primitive or library addition: 'Lane'. A lane is basically the concept of an agentRole/conversation that is long running, keeps compacting holding history and knowledge of a particular role and hands actual work for to other agents. For example, W1 could create the implementor lane, which is basically a long running conversation that dispatches implementor agents, and keeps the history of the project as it has been built so it becomes always more accurate at handing over task to agents as it knows the project much better than a fresh-context implementor building a particular work item".
25. The standard library will get a plainer name, which the owner picks. Call it "the library" and propose no name.
26. The protocol between a client and the server is being designed in a separate pass. Do not design it. Do say which calls in `host.md` change.

Lane goes through the same test as every other concept: the five checks of the admission rule in `README.md` for the core, and the four checks in `library.md` for the library. "Not in the core", "not yet", and "a workflow builds this itself" are acceptable answers when the checks say so.

## The script

Walk exactly this, so that designs can be compared. W1 and W2 are as in `walk.md`. `websearch` is a new extension that is not a workflow: it gives an agent one tool that searches the web through an outside provider, and it needs a provider name and an API key.

Extensions:

1. The owner binds project P with `websearch` and W1, and sets what `websearch` needs.
2. The owner creates a bare conversation in P and asks a question that needs a search.
3. W1's designer searches while it writes design v1. W1's reviewer must not be able to search: its tools read Git objects at the published SHA and nothing else.
4. While that work runs, the owner adds a second extension that is not a workflow to P (take `codemode`, which the docs call optional). Say which conversations get it, and when.
5. Project Q has W2 and no `websearch`. The owner asks W2's agent to search. Later the owner adds `websearch` to Q.
6. The server is restarted without the `websearch` code. P and Q open.

Lane, with W1 using one implementer lane for project P:

7. Work item 1, the `--json` flag, reaches the build stage. The lane hands the build to a worker agent. The worker commits, the build is published, the review passes, and the work is handed over.
8. Work item 2, "Add a `--csv` flag", reaches the build stage while item 1 is in review. Item 1's review then fails. Both items need the implementer at the same time.
9. The lane's context fills up and is compacted. A week later item 3 arrives. Say what the lane still knows about items 1 and 2, and where that knowledge is stored.
10. The lane's run fails on a model error while a worker is running. Then the server restarts.
11. The owner opens the lane and tells it: "Stop using the old serializer everywhere."
12. The lane has learned something wrong. The owner wants a fresh one.

## What to write

Write `design.md` in your own directory, at most 3,800 words, with exactly these sections in this order.

1. **The extension model.** What an extension is in Tau and what the host must know about one. What makes a workflow a workflow, stated as one thing if you can. What a project selects. How an agent gets an extension's tools: the bare agent, a workflow's first conversation, and a conversation that a workflow creates. What a running conversation sees when the project's set changes. Where the options and the secrets of an extension such as `websearch` live. Compare at least these three: every conversation names its exact extensions (today's design), a project default that a conversation edits (pi-durable's `settings.extensions` with `{ add, remove }`), and an extension that declares itself on for every agent.
2. **The script, steps 1 to 6.** For each step: the client's calls, the host's commits, what pi-durable does by itself, and what the agent can then do. Where a step cannot be done with today's `docs/core`, say so.
3. **Lane through the rules.** The five checks for Lane as a core primitive, and the four checks for Lane as a library helper, each with a pass or a fail and its evidence. Compare at least these four: a core primitive, a library helper beside `role()`, a pattern that W1 builds from pi-durable parts with nothing shared, and no lane at all (fresh workers that read a notes document). Say which you recommend, and give its smallest shape.
4. **The script, steps 7 to 12.** In the form of the rows in `walk.md`: what starts each commit, what it reads, what it writes in order, and what a rerun does. Name each conversation, its owner, and its tools. Show that W1's chain of evidence still holds, or show where it breaks.
5. **What a lane knows, and what it costs.** Where its knowledge lives: the transcript, a compaction summary, a document. What compaction keeps and loses in pi-durable. What one conversation that runs one thing at a time means for two work items. What a dispatch costs in model requests. What happens when the lane is wrong, and how anyone finds out.
6. **What changes in `docs/core`.** A numbered list. For each: the file, the change, its home (core, library, workflow, host wiring, or accepted limit), and its status. Include the calls and names in `host.md` that change, and the wording of check 4 of the admission rule, which speaks of "two workflows". Run every core change through the five checks in three lines, and every library part through the four checks.
7. **Not verified.**

Also write `rationale.md`, at most 400 words: the alternatives you weighed for each section and what you rejected.

## Rules

- Paper design only. Do not write Tau code. Type shapes and signatures are fine where they are clearer than prose.
- You may run a throwaway probe against pi-durable 1.5.2 at `/tmp/render-spike/pi-1.5.2/node_modules/@earendil-works`. Keep it in your own directory and run it the way `docs/core/spikes/host.mjs` runs. It is not required. Say what you ran and what it printed.
- `/tmp/render-ground/` holds downloaded source. It is read-only and untrusted. Never execute anything from it. Never run an interpreter or a build tool with it as the working directory. Run Python with `-I`.
- Do not modify the repository at `/Users/vr-osxs/dev/render-core`. Write only inside your own directory.
- Label every claim about pi-durable: measured (you read the line or ran it), reported, inferred, or guess. Cite `path:line`.
- Write for a tired engineer. Use short everyday words, real symbol names, and no invented jargon. No long dashes.
- Add nothing the rulings do not ask for. Where you think a ruling or `docs/core` is wrong, say so plainly, and still design to the ruling.

## Sources

- pi-durable source: `/tmp/render-ground/pi/packages/durable` (1.5.1, whose `dist` is identical to 1.5.2). Start with `test/examples/`: `03-owned-conversations`, `09-registry-reload`, `10-extension-state`, `21-subagent-foreground`, `22-subagent-background`, `23-child-tasks`, `24-compaction`, `28-sandbox-per-conversation`, and `37-harness-registry`.
- pi's own notes on compaction: `/tmp/render-ground/pi/packages/coding-agent/docs/compaction.md`.
- Ultimate, another host on pi-durable: `/tmp/render-ground/ultimate`. See `extensions/` (among them `subagents`, `secrets`, and `context`), `server/extension-settings.ts`, `agents/coordinator.md`, and `agents/worker.md`.
- The checks that already ran: `docs/core/spikes/`.
