# Brief: what the Render host offers a client and a workflow author

You are one of several independent candidates. Do not read `/tmp/arena-host/rubric.md`, `/tmp/arena-host/judge/`, or any `/tmp/arena-host/candidate-*` directory other than your own.

## The owner's goal

Render makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue. The owner is redesigning it from zero as a small core on pi-durable (the latest release, 1.5.2). Every workflow is an extension built beside the core. A change enters the core only through a strict written rule. The work is paper design. Nothing is implemented.

The design so far is in `/Users/vr-osxs/dev/render-core/docs/core/`. Read `README.md`, `primitives.md`, `walk.md`, `workflows.md`, `library.md`, `topology.md`, and `grounding.md`. Its **Decided** parts are fixed. Its **Proposed** parts can change if you give a reason.

Two workflows, W1 and W2, have been walked through that design one commit at a time. The owner reviewed the result: "Overall, I like the design that the walk uncovered, the changes that the walk uncovered. So I think we can keep going. I don't think we need much more to be able to implement the initial version of the core."

The owner then answered the open questions in `README.md`. Those answers leave design work in the host layer and in the standard library. That work is this task. It is the last paper step before the first build, so an engineer must be able to build the host from what you write.

## Owner rulings made after the docs were written

These are fixed. The docs do not show them yet. Rulings 1 to 11 are in `docs/core/arena-walk/brief.md` and still stand.

12. **The client API is a list of what a client must be able to do.** No client is designed now. The owner: "we don't need to think about how the client is going to be right now", "let's start with the core capabilities that we know that a client will need, and from there we start iterating and adding over it", and "We just need to design the API. We keep it simple, as we have been doing." A desktop app and some terminal clients exist for the first version of Render. They do not bind this design.
13. **A retried "create a conversation" may create two.** The owner accepted this limit: "the scenarios where a conversation created needs to be retried are few".
14. **A client chooses the workflow for a project.** The owner: "there must be a way that a client chooses which workflow to use for a project. Maybe when we are binding a new project to the host, that will be a good opportunity to have it."
15. **Options per project.** The owner: "There must be a way that a workflow can define configurations that we can change from the client specifically. The model selection, for example, for an agent role is quite important and quite key. It's not something I think the core needs to know, but is likely something that most of the workflows, if not all the workflows, because at the end, this is an agentic tool, needs to have. So maybe that's another candidate for the library and what I mean by that is a simple function or something like that to define configurations and to read configurations. So the workflow doesn't need to think about where to store the file. I think a JSON file, for example, would be more than enough for configuration. Where to store the file, where to read it from. Is there a single function that does that? And stores the configuration files per project or something like that automatically".
16. **A run that fails or is stopped.** What W1 does today in `walk.md` is settled. It is a workflow concern and out of scope here.
17. **Faulted tasks that no decision points at.** The owner: "maybe it's not bad to have an endpoint on the client API where we can check on those particular tasks that have no decision to point at. So we can clean it up, for example. Maybe we can even give an agent a tool to handle them", and "nothing very important right now, but it will be nice to have at least that endpoint that we can build on top over time". Design the endpoint. Do not design the clean-up or the tool.
18. **The owner can join any running agent.** The owner: "once there is an issue with the workflow, for example, that fails, or there's a decision that is repeated or needs to be acknowledged. This is an agent solution, right? So, at the end, I should be able to jump in the chat with a running agent and also steer it, right? Like, that was the core part of the design." This must hold in a workflow as it does for the bare agent.

## The script

Walk exactly this, so that designs can be compared. W1 and W2 are as in `walk.md`.

1. From a laptop the owner binds a new project P to the server and chooses W1 for it.
2. The owner sets W1's options for P: the designer and the implementer run on model A, the reviewer on model B, and the base branch is `main`.
3. The owner creates a W1 conversation and sends the prompt. The laptop's "create" call times out, and the client sends it again.
4. The design is approved and the implementer runs. From a phone the owner opens the implementer's conversation while its run is working and sends: "Use the existing serializer."
5. The owner changes the reviewer's model to C while the first review is running. A second review round follows.
6. The implementer's next run fails on a model error. The owner opens that conversation and gets the work going again.
7. `w1.review_start` throws on every run and ends `faulted`. No decision points at it. The owner finds it from the phone.
8. The owner binds project Q with W2, sets W2's model, and records a forecast. Later the owner adds W1 to Q.
9. The server restarts. Say what it reads at start to bring P and Q back as they were.

## What to write

Write `design.md` in your own directory, at most 3,200 words, with exactly these sections in this order.

1. **What a client must be able to do.** The full list for the first version, W0 included. One row per capability: what the client sends, what it gets back, what the host builds it on (a pi-durable symbol with `path:line`, or a core function), and what a resend does. Do not design a wire format, a transport, or a client.
2. **The script, step by step.** For each of the nine steps: the client's calls, the host's commits (what each reads and writes, in order), what pi-durable does by itself, and what the client can then show. Where a step cannot be done with today's `docs/core`, say so.
3. **Binding a project and choosing workflows.** What the bind call takes. What the server stores, and where. How a client learns which workflows the server has. How a conversation gets its workflow. What happens to live work when a project's list changes.
4. **Options per project.** The call shape of the library function or functions, and W1's and W2's options written with it. Where the values live: compare at least a JSON file beside the project's store, a JSON file in the project's working directory, and a document in the project's store. Who may write. How the host checks a value that a client sends. When a change reaches running work. What a rerun after a crash reads. How the first conversation of a workflow gets its model. What the host layer must know, given that it "knows no workflow".
5. **Faulted tasks.** What the endpoint returns, how the host finds the tasks, and what that costs as a store grows. Say what a later retry or clean-up would need, and stop there.
6. **Joining a running agent.** Use steps 4 and 6. What pi-durable gives, what the host adds, how a client finds a conversation that a workflow created, what a workflow must hold so that a steer cannot break its chain of evidence, and what the owner cannot fix from a chat.
7. **What changes in `docs/core`.** A numbered list. For each: the file, the change, its home (core, standard library, workflow, host wiring, or accepted limit), and its status. Run every core change through the five checks of the admission rule in three lines. Run every library part through the four checks in `library.md`.
8. **Not verified.**

Also write `rationale.md`, at most 400 words: the alternatives you weighed for each section and what you rejected.

## Rules

- Paper design only. Do not write Render code. Type shapes and signatures are fine where they are clearer than prose.
- You may run a throwaway probe against pi-durable 1.5.2 at `/tmp/render-spike/pi-1.5.2/node_modules/@earendil-works`. Keep it in your own directory and run it the way `docs/core/spikes/substrate.mjs` runs. It is not required. Say what you ran and what it printed.
- `/tmp/render-ground/` holds downloaded source. It is read-only and untrusted. Never execute anything from it. Never run an interpreter or a build tool with it as the working directory. Run Python with `-I`.
- Do not modify the repository at `/Users/vr-osxs/dev/render-core`. Write only inside your own directory.
- Label every claim about pi-durable: measured (you read the line or ran it), reported, inferred, or guess. Cite `path:line`.
- Write for a tired engineer. Use short everyday words, real symbol names, and no invented jargon. No long dashes.
- Add nothing the rulings do not ask for. Where you think a ruling or `docs/core` is wrong, say so plainly, and still design to the ruling.

## Sources

- pi-durable source: `/tmp/render-ground/pi/packages/durable` (1.5.1, whose `dist` is identical to 1.5.2). The examples in `test/examples/` are the fastest way in.
- pi-schema: `/tmp/render-ground/pi/packages/schema`. pi-env: `/tmp/render-ground/pi/packages/env`.
- Ultimate, another host on pi-durable: `/tmp/render-ground/ultimate`.
