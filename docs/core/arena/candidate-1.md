# Render core: candidate 1

Target: pi-durable 1.5.2. Citations point into `/tmp/render-ground/pi/packages/durable/` (1.5.1 source, `dist` identical to 1.5.2). `probe.mjs` here ran six checks on 1.5.2; all passed. Labels: **measured** (read or ran), **reported** (explorer report), **inferred**, **guess**.

## 1. Core boundary and admission rule

**What is in the core.** One package, `render-core`, with four parts:

1. **Project host.** `openProject(dir)` opens one project's SQLite store under a lock file, installs its extensions into a fresh registry, opens the Harness, ensures the event conversation, and resumes. Server and local mode both call it.
2. **Decision.** `request` and `withdraw` for extension code. `answer` for the client transport only.
3. **Event.** `emit` and reading.
4. **Client transport.** A fixed set of operations on projects, conversations (create, submit, abort, watch), decisions (watch, answer), events and entries. Device tokens authenticate.

That makes a basic durable agent: pi-durable ships `read`, `write`, `edit` and `bash` as `coding-tools` (measured, `src/tools/index.ts:31-36`). Render ships `render-agent`, an ordinary extension adding one prose section.

Outside: workflows, roles, subagents, git, sandboxes, the prose helper, knowledge sharing, reactors, client UIs. Size: under 1,500 lines (guess), against 18,826 for v1 (measured in grounding).

**Admission rule.** A thing enters the core only if it passes four tests:

1. **Substrate.** pi-durable does not provide it.
2. **Boundary.** It keeps a promise extension code cannot keep from outside: who may act at the human and client boundary, or a record every extension and the client must read the same way. Convenience fails.
3. **Two workflows.** Two shipped workflows that differ use it with the same meaning, or the generic client cannot work without it.
4. **Shape.** It is a type plus a few functions over `Tx` or the host. No scheduler, loop, background process or storage engine.

Process: a one-page proposal names the need, both uses, why an extension cannot do it, and the cost in lines and words. The owner approves. `CORE.md` lists every exported name with its reason, and a build check fails when `src/index.ts` exports a name `CORE.md` lacks. The rule also removes: a part with fewer than two users goes back out.

Decision passes all four: tasks park only on tasks or a clock (measured, `src/types.ts:660-693`), and answering must stay client-side. Event passes narrowly: pi-durable makes a semantic event journal a non-goal (reported, `pi-durable.md` §9), both workflows emit (inferred), and the client needs one neutral timeline. If the client stays its only reader, Event leaves first.

## 2. How an extension hooks in

A Render extension is a module whose default export is a pi-durable `Extension`: a name plus tools, sections, hooks, wraps and tasks (measured, `src/harness/types.ts:424-433`). Render adds nothing to the type.

It reaches Decision and Event by importing plain functions from `render-core` and calling them inside its own commits (a tool's `api.commit`, a task's `runtime.commit`). No handle is injected. `emit` finds the event conversation through a session document read in the same `Tx`, and document access stays legal after table writes (measured, probe check 3).

A workflow is the list of extensions a project selects. `render.config.ts` maps names to modules with static imports, so TypeScript checks them at build. Each project has a `project.json`:

```json
{ "title": "render", "extensions": ["render-agent", "git", "w1"], "cwd": "/src/render" }
```

Each project has its own store and registry (section 4), so its registry holds exactly these extensions and every conversation gets them by default (measured, `src/harness/types.ts:632-633`). Stored names outlive code (measured, `README.md:402`), and a task whose definition is gone blocks as `missing_task` instead of vanishing (measured, `src/harness/types.ts:796`). Task names must be unique per registry (measured, `src/harness/registry.ts:24-26`), so each carries its extension prefix.

`render-core` depends on no extension. Extensions import `render-core`, never `render-core/host`; a build check enforces it against mistakes, not malice, since extensions are trusted.

## 3. Decision and Event

```ts
type Decision<C extends string = string> = {
  id: string                   // `${subject}#${n}`, one per request
  subject: string              // one open decision per subject
  title: string                // one line for the client's list
  basis: EntryId               // immutable entry the human reviews
  choices: readonly C[]
  conversation: ConversationId // owns the `then` task
  then: { task: string; input?: JsonValue }
} & (
  | { status: "open" }
  | { status: "answered"; choice: C; notes?: string; by: { device: string }; at: number }
  | { status: "superseded" | "withdrawn" }
)
```

Storage: a session document family `render.decision` keyed by `id`, plus one session document `render.decisions` of open ids per subject, which the client watches to see what needs the human.

**Basis is an entry ID in the same store.** Entries are immutable with session-global IDs (reported, `pi-durable.md` §1), so the client can always fetch and show one. External content, such as a commit to merge, enters as an entry recording the SHA and the summary the human reads. A bare digest names nothing the client can show; a document version can change.

**`request(tx, draft)`** takes `then` as a typed `Task` whose input is the answered decision, so TypeScript checks the task handles exactly the requested choices. Only the name is stored. `request` writes documents only, so it is legal anywhere in a commit; table reads after a table write throw (measured, `src/session/transaction.ts:1141-1149`). A repeat with equal subject, basis, choices and `then` returns the open id and writes nothing, because phases and hooks rerun after a crash (measured, `README.md:162`, `src/harness/types.ts:970`). Any difference supersedes. **`withdraw(tx, subject)`** withdraws the open one.

**`answer(id, basis, choice, notes)`** runs in one host commit, reads before writes:

1. Already answered with the same choice and notes: return the earlier result, `repeated: true`, write nothing. Answered differently: refuse. Retries after a lost response are safe without a receipt table.
2. Superseded or withdrawn: refuse with the subject's current open decision, so the client shows the new basis.
3. Quoted basis differs: refuse `stale_basis`. The per-request id is the real guard against stale answers; this check only catches a client that showed the wrong entry.
4. Unknown id, choice not offered, or `then.task` not installed: refuse, write nothing.
5. Otherwise record answer and actor, clear the open slot, create the `then` task.

Probe check 2 ran this shape: an unbound commit read and wrote a session document, then created a task found by `registry.snapshot().task(name)` with an explicit owning conversation (measured, 1.5.2; required by `src/types.ts:410-414`). The `then` task must be safe to rerun: it submits with the decision id as `requestId`, and a reused `requestId` returns the earlier submission (measured, `src/harness/submissions.ts:232-238`).

No agent tool reaches `answer`: the extension entry point does not export it, and the build check forbids the host module.

Stays out: expiry (a workflow sleeps and withdraws), quorum, agent delegation, inline annotations, per-decision permissions, and core events about decisions. An event is a table write, and `submit(tx)` after a table write throws (measured, `src/harness/submissions.ts:82`, probe check 5). Keeping `request` document-only keeps it safe anywhere.

**Event.** `emit(tx, token, data)` appends a typed entry, built with pi-durable's `defineEntry` (measured, `src/entries.ts:6-12`), to the project's event conversation. Kinds carry the emitter's name as prefix. Extensions read with `tx.scanEntries` or a task's `entries()`; the client pages and watches it (measured, `src/harness/types.ts:891`). The conversation is ownerless, never runs, and refuses submissions. Probe check 4 wrote and reread one across reopen (measured, 1.5.2). Callers emit after their table reads and any `submit(tx)`. Reactors wait until two extensions must hear each other; then Ultimate's cursor, advanced in the handler's transaction (reported, `ultimate.md` §4), is the path.

## 4. Topology

Recommendation: **one server process, one store per project.**

`render serve` opens every project under `~/.render/projects/<id>/` (`project.json` and `store.sqlite`), each as its own Harness and registry. Clients connect to that one server. `render local` opens one project from `<repo>/.render/` with the same `openProject`. Moving a project between devserver and laptop is moving one directory.

Probe check 1 ran two SQLite harnesses with separate registries in one process through close and reopen; each store held only its own work (measured, 1.5.2). pi-durable has no cross-process lock (measured, `README.md:894`), so `openProject` takes a lock file per store, as Ultimate does (measured in grounding, `server/harness.ts:228`).

Compared:

- **One store, project scope inside.** One commit line and failure domain: a failed storage call fails the whole session (reported, `pi-durable.md` §2). One registry holds every workflow while the default gives each conversation every installed extension (measured, `src/harness/types.ts:632-633`), so each needs an explicit list. Every query needs a project key. No project moves as a file. Its one gain, atomic writes across projects, is why the pluggable-kernels design chose it (measured in grounding, `storage-and-knowledge.md:13`).
- **One process per project** (measured, Ultimate `README.md:160-164`). Best isolation, but clients must connect to several hosts, which decision 8 rules out, or a router is built, which is this recommendation with more processes.

Knowledge sharing needs no shared transaction. Shared knowledge is immutable, so sharing is a copy into the receiving store with provenance `{ project, entry, digest }`, made by the server holding both, optionally gated by a Decision (inferred). It comes later, through the admission rule.

The cost: a crashing extension stops every project until a supervisor restarts the process.

## 5. Prose

The premise half holds. Workflows need no renderer of their own: pi-durable's sections already are a neutral one. They render in order before each request, read committed documents, and only changed ones are resent and stored in the transcript (measured, `src/harness/types.ts:395-414`, `README.md:370-376`). What each workflow would otherwise rewrite is small: load Markdown, insert named facts, fail on a missing or unused fact.

Recommendation: a tiny shared helper, `render-prose`, beside the core.

```ts
const designer = prose("w1/designer.md", ["goal", "repo"] as const)
section("w1-role", (input) => role(input) === "designer" ? designer.fill({ goal, repo }) : undefined)
```

`fill` replaces `{{name}}` slots. Declared names make a missing fact a compile error; a load-time check of the file's slots fails at startup, not mid-run. No conditions, loops or includes: another case gets another file. This follows the pluggable-kernels advice to bind facts, not logic, with no template engine (measured in grounding, `execution-skills.md:120-122`). Not template literals: prose is dense with backticks (measured in grounding: 342 in 404 lines of Ultimate agents), and prose in code is harder to review.

Not in the core: it fails test 2, guarding no boundary. Not nothing: one slot syntax lets the owner review every workflow's prose alike, and the strict checks are easy to get wrong.

Role prose goes in sections, not stored `instructions`. Those live in `pi.agent` (measured, `src/harness/types.ts:464-482`), so a prose fix never reaches an existing conversation; a section picks it up at the next request.

For the client view, pi-durable 1.5 removed `watchEvents` so clients render state (measured, `CHANGELOG.md:76`). The generic client shows conversations, decisions, basis entries and events, so no workflow needs its own view on day one.

## 6. Second proving workflow

**W2: Forecasts.** The owner states a claim. The agent sharpens it into a forecast entry: statement, probability, resolve-by date, resolution rule. Its tool `record_forecast` appends the entry and creates a `w2.due` task in one commit. The task sleeps until the date, then requests a decision with the latest forecast entry as basis, choices `["yes", "no", "void"]`, then `w2.score`. A revision supersedes the open decision; dropping the forecast withdraws it. `w2.score` computes the Brier score and emits `w2.resolved`. A `calibration` tool reads those events and reports the owner's calibration.

What it stresses that W1 does not: a clock-driven task requests the decision, not an agent tool. The answer is an observed fact, not an approval. Many decisions are open at once, and supersede and withdraw are routine. Weeks pass between steps, so leaving and returning is real. An extension reads events back. No repository or coding tools, proving the core assumes no git.

It needs no external tooling: a faux provider and the Harness `now` clock (measured, `src/harness/types.ts:729-732`) make it deterministic. Probe check 6 ran its key move: a task slept a week across a closed store and woke on reopen to write a decision-shaped document (measured, 1.5.2). It also seeds the owner's quant research: claims stated before results, then scored.

**Runner-up: Pick one of N.** A question fans out to three candidate conversations; the human picks among choices built at run time. It tests dynamic choices and fan-out, but its shape is close to W1's and it tests pi-durable's subagents more than Render's primitives.

## 7. Risks

1. pi-durable is experimental (measured, `README.md:3`). The core uses few of its APIs: `Tx`, `RegistrySnapshot.task`, `Harness.open`, watches.
2. One process is one crash domain.
3. No atomic writes across projects. If the owner needs them later, this topology is wrong.
4. A renamed `then` task leaves open decisions unanswerable; treat task names as stable.
5. The core cannot force `then` tasks and `request` callers to be rerun-safe.
6. A generic client may review poorly, creating pressure to add client actions to the core.
7. Processes sharing a store must share the clock (measured, `src/harness/types.ts:729-731`), and skipping the lock file lets two processes corrupt it.

## 8. Not verified

Nothing is built. The probe opened two harnesses, so memory and open time at scale are unknown. No workflow ran end to end; check 6 covers only sleep and wake. Also unchecked: the read-only viewer, the 1,500-line size, prose quality with a real model, and whether a generic client suffices for W1 review.
