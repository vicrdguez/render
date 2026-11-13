# Tau code architecture, candidate 1

The sketch is in `sketch/`, a real npm workspace. The probes are in `probe/`, each with its script and its output.
Everything below that is about the toolchain cites a probe case.

## Problem

Tau's behaviour is locked in `docs/core/`. Nothing is built. Five units follow, in order: the store layer, the host layer
with the protocol, web search, W2, W1. Each is written by an agent that sees only its kickoff and the files it opens,
copies the nearest example, and takes the shortest path that compiles.

So the layout must make the locked rules the easy path. Four constraints make the shape non-obvious.

- `answer` and `request` write the same documents, so they belong in one module. But an extension may import `request`
  and must not reach `answer` (primitives.md, "Only a human answers").
- The host owns the import map of extensions, yet "the host layer knows no particular extension" (README.md).
- The kit sits beside the core and "the core never imports it", while the kit builds the core's options contract.
- Node 24 runs TypeScript itself, but not under a `node_modules` path, and npm workspaces reach every package through a
  `node_modules` link.

## Usage (caller's view)

The repository, from a shell in the Nix dev shell:

```sh
npm run check            # tsc, biome, node --test, the six spikes. `nix flake check` runs the same.
tau serve                # ~/.tau, 127.0.0.1:6283. Opens every project, then listens.
tau device pair phone    # prints a code; the phone sends it to POST /v1/pair once
```

An extension author writes against two packages. This is W2's timer asking its question (walk.md, W2 row 4):

```ts
// extensions/w2/src/tasks.ts
import { emit, request } from "tau-core";

wake: async (task, runtime, context) => {
	await runtime.commit(async (tx) => {
		const book = await tx.doc(Book, runtime.conversationId);
		const f = book.forecasts[task.input.key];
		if (f?.latest !== task.input.forecast || f.timer !== runtime.taskId) return done; // row 10
		const basis = await tx.entry(Forecast, f.latest); // a table read, first
		if (basis === undefined) return done;
		const asked = await request(tx, {
			subject: `w2:${task.input.key}`, // `${extension}:${key}`, checked by the type
			title: `Due: ${basis.data.text}`,
			basis, // a TypedEntry with `text`, checked by the type
			choices: ["yes", "no", "void", "not yet"],
			conversation: runtime.conversationId,
			then: Score, // tsc refuses a task that does not accept every choice
			requestedAt: runtime.now(),
		});
		f.round = asked.id;
		await emit(tx, Asked, { text: `Asked: ${basis.data.text}`, at: runtime.now(), forecast: basis.id, decision: asked.id });
		return done;
	}, context);
};
```

The same author tests W2 the way a client uses it, against a real host:

```ts
// extensions/w2/test/w2.test.ts
import { deviceId, openHost } from "tau-core/host"; // allowed in test/, refused in src/
import * as w2 from "../src/index.ts";

let host = await openHost({ root, modules: [w2], models: faux, now: () => clock.now });
await host.call(phone, "bind", { project: "q", workdir: root, extensions: ["w2"] }); // the body is typed from the list
await host.call(phone, "setOptions", { project: "q", extension: "w2", patch: { model: "faux/a" } });
const made = await host.call(phone, "create", { project: "q", workflow: "w2" });
// ...the faux model calls record_forecast...
clock.now += WEEK;
await host.close();
host = await openHost({ root, modules: [w2], models: faux, now: () => clock.now }); // down for a week
const reply = await host.call(phone, "answer", { project: "q", decision: "w2:ship-2#1", basis, choice: "yes", annotations: [] });
```

The composition root is the only place that names extensions:

```ts
// apps/tau/src/extensions.ts
export const modules = [websearch, w2, w1] as const satisfies readonly ExtensionModule[];
// apps/tau/src/main.ts
process.exitCode = await main(process.argv.slice(2), modules);
```

A client sees none of this. It sends `POST /v1/<call>` with a JSON body, as protocol.md says.

## Shape

### Packages

| Package | Directory | Exports | Declares, so may import | Born |
| --- | --- | --- | --- | --- |
| `tau-core` | `packages/core` | `.`: `request`, `withdraw`, `emit`, `decision`, `eventLog`, and the types of primitives.md and host.md. `./host`: `openHost`, `main`, `callNames`, `deviceId`, `DEFAULT_PORT`, and the types of `Host` and the calls. | pi-durable, chord, pi-ai, pi-schema, all `1.5.2` | Unit 1. `./host` in unit 2. |
| `tau-kit` | `packages/kit` | `options`, `modelRef`, `prose`, `role` | `tau-core`, pi-durable, pi-schema | Unit 3 |
| `tau-websearch` | `extensions/websearch` | `extension`, `options` | `tau-core`, `tau-kit`, pi-durable, pi-schema, and webfox, which unit 3 pins | Unit 3 |
| `tau-w2` | `extensions/w2` | `extension`, `options`, `entry` | the same, without webfox | Unit 4 |
| `tau-w1` | `extensions/w1` | `extension`, `options`, `entry` | the same | Unit 5 |
| `tau` | `apps/tau` | nothing; the bin `tau` | `tau-core` and each extension | Unit 2 |

The store layer, the host layer, the protocol server, and the logic of the `tau` command are one package, in
`src/store/`, `src/host/`, `src/protocol/`, and `src/cli.ts`. This is the decision the rest leans on.
`answer` sits in `src/store/decision.ts` beside `request`, as the one writer of the decision documents. It is exported
from no entry, so nothing outside the package can name it. The host reaches it by a relative import. Two packages would
force an export of `answer` that every extension could also import (see "Alternatives").

`apps/tau` holds the import map and a three-line bin. It is the one package that depends on extensions, so the core
never does. An extension's module exports `extension`, `options`, and `entry` by name, so `import * as w1` is an
`ExtensionModule` and `satisfies` checks it.

### Where each locked shape lives

| Shape | Source | Sketch file |
| --- | --- | --- |
| `Annotation`, `Decision`, `request`, `withdraw`, `decision`, `answer` | primitives.md | `packages/core/src/store/decision.ts` |
| `EventData`, `emit`, `eventLog` | primitives.md | `packages/core/src/store/event.ts` |
| `ExtensionModule` and its `options` contract | host.md, extensions.md | `packages/core/src/module.ts` |
| The 20 calls, their bodies and results | host.md, protocol.md | `packages/core/src/host/calls.ts` |
| Refusal codes and statuses | protocol.md, primitives.md | `packages/core/src/host/refusals.ts` |
| `Fault` | host.md | `packages/core/src/host/faults.ts` |
| The seven ops, the two frames, the end reasons | protocol.md | `packages/core/src/host/feed.ts` |
| `options`, `modelRef`, `RoleSettings`, `role` | kit.md | `packages/kit/src/` |
| `prose` | prose.md | `packages/kit/src/prose.ts` |
| `WebsearchOptions`, `W1Options`, `W2Options`, W1's roles | extensions.md, kit.md | `extensions/*/src/` |

The field names and structure are copied. Three types are narrowed to encode a format the design states in prose:
`subject` is `` `${string}:${string}` ``, a decision ID is `` `${subject}#${number}` ``, and a device ID is a branded string
that only the host's device check makes. A draft's `then` is a task whose input accepts every offered choice.

### The boundaries, enforced by the build

| Rule | Mechanism | Fails at | Probe |
| --- | --- | --- | --- |
| A package's internals are not importable by name | `exports` lists `.` and `./host` only. tsc with `nodenext` and Node both refuse any other path. | tsc, Node | S1, B1 |
| Nor by a relative path into another package | Biome `noRestrictedImports`, pattern `**/packages/**`, `**/extensions/**`, `**/apps/**`, on every file | biome | S2, B2 |
| The core never imports the kit, nor an extension | Biome `noUndeclaredDependencies`: tau-core's package.json lists neither. The dependency graph is the package.json files. | biome | S5, S6 |
| An extension imports the five functions, not `answer` | tau-core's `.` re-exports exactly five functions. `test/exports.test.ts` pins the list. | test | S9 |
| An extension's code and the kit cannot import `tau-core/host` | Biome override on `extensions/*/src/**` and `packages/kit/src/**`, with a message that cites primitives.md. Tests may. | biome | S3, S4, S8 |
| The store layer knows no host | Biome override on `packages/core/src/store/**` refusing `../host/**`, `../protocol/**`, `../cli.ts` | biome | S7 |
| A test-only dependency stays in tests | `noUndeclaredDependencies` with `devDependencies: ["**/test/**"]` | biome | S8b |
| A module in the import map fits the host's contract | `satisfies readonly ExtensionModule[]` | tsc | S10 |
| Only syntax Node can strip | `erasableSyntaxOnly` | tsc, Node | B6 |

S cases ran on the sketch itself (`probe/sketch-check/boundaries.out.txt`). B cases ran on a smaller workspace of the same
shape (`probe/toolchain/boundaries.out.txt`). The gate is `tsc`, `biome check`, and `node --test`, so every row fails
`nix flake check`.

### How TypeScript runs

Node 24 runs the `.ts` sources as they are, with its own type stripping: in `node --test`, in the `tau` bin, and in the
children that crash tests kill. Nothing is emitted. There is no `dist/` and no build step. Each package's `exports`
points at `./src/*.ts`. tsc 7.0.2 only checks, with `noEmit`, in one program over every package (root `tsconfig.json`).
The flags that make this work are `module: nodenext`, `allowImportingTsExtensions`, `verbatimModuleSyntax`, and
`erasableSyntaxOnly`.

What `probe/toolchain/run.out.txt` shows, on Node 24.21.0 with the real pi-durable 1.5.2:

- T0: one tsc program checks four packages across package names, against pi-durable's `.d.ts`.
- T1, T6: a `.ts` entry point and the bin symlink run, with nothing on stderr.
- T3: `node --test` runs `.ts` tests in two packages. An extension's test imports `tau-core` by name.
- T4: a child process runs a `.ts` file; a child killed with SIGKILL reports the signal.
- T5: pi-durable's SQLite storage opens on `node:sqlite` with no warning.
- T2: the same tree under a `node_modules` path fails with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Workspace links
  are fine, because Node resolves them to their real path. The Nix package must install the tree outside any
  `node_modules` directory, for example `$out/lib/tau`, with `$out/bin/tau` running
  `node $out/lib/tau/apps/tau/src/main.ts`.
- T3b: plain `node --test` also runs every `.ts` file under a `test/` directory. So the `test` command passes explicit
  `**/*.test.ts` globs, and helpers live in `test/**/support/`.

`probe/sketch-check/run.out.txt` runs the gate on the sketch: tsc passes, biome passes, `npm test` runs 242 tests (8 real,
234 `todo`), and the bin loads all six packages and stops at `main`'s `not implemented`.
`probe/sketch-check/spikes.out.txt` runs the six spikes against the workspace's own `node_modules`: all pass.

### Data structures

The store layer keeps four session documents in each project's store. Each has one writer.

| Document | Holds | Writer |
| --- | --- | --- |
| `tau.decision`, a family keyed by decision ID | the `Decision` record | `src/store/decision.ts` |
| `tau.open` | for each subject, `{ id, title, requestedAt, conversation }`; the inbox streams it as it is | the same |
| `tau.decision.next` | for each subject, the last `n`; a new request gets `#n+1`, and `${subject}#${n}` exists iff `n` is at most this | the same |
| `tau.events` | the log's conversation ID | `src/store/event.ts` |

The third document is there because of a measured fact: `tx.doc(family, key, seed)` creates the member when it only
reads it (`probe/pi-facts/family-read.out.txt`). Without the counter as an index, a client's `decision` call with a
made-up ID would write a document.

The host adds `tau.project` (`{ project, workdir, extensions }`), written only by `src/host/project.ts`. In memory,
`HostState` holds the modules by extension name, the open projects by name, the open feeds by device, and one join
function per open inbox. Each access pattern is one map lookup: a call finds its entry in `calls`, its validator, and its
project; a revoke finds the device's feeds; a bind finds the open inboxes.

An answer is one commit: three document reads, two table reads (the basis text, the old `then` task), one `createTask`,
then the document writes. That is substrate rule 1's order, and the TODO in `answer` spells it row by row.

### The 20 calls, as one list

`src/host/calls.ts` holds `calls`: one entry per call of host.md, each with its scope, whether it streams, its pi-schema
body, and a `run` that adapts the body to one domain function. From it derive:

- the routes. `src/protocol/http.ts` serves `POST /v1/<name>` for every key and knows no call by name;
- the `calls` field of `unknown_call`, which is `callNames`;
- the check of each body: a validator compiled once per entry. Objects are closed, so an unknown field is `bad_request`;
- the types `CallBody<N>` and `CallResult<N>`, which type `Host.call` and every test;
- which calls stream: `stream(...)` entries must return a `Feed`, by type;
- the tests. `test/protocol/calls.test.ts` checks the list against host.md's 20 names, and loops over `callNames` for
  what every call shares (token, unknown field, unknown project).

Refusal codes are a second list, `refusalStatus`, with the HTTP status of each. A type assertion fails the build if the
`answer` table names a code that list lacks.

`Host.call(device, name, body)` is the one way in. HTTP calls it after the token check; a test calls it with a device ID.
Both take the same check, routing, refusals, and `unknown` on a storage failure.

### Where the tests attach

Each test file starts as the list of the ways its unit can fail, as `test.todo` lines taken from the design's tables.
The sketch has 234 of them. A unit turns them into tests before it writes the code they test.

| Layer | Seam | Files | Unit |
| --- | --- | --- | --- |
| `request`, `withdraw`, `decision`, `answer`, `emit` | `openStore` on `MemoryStorage`; commits written as a tool or task writes them | `packages/core/test/store/*.test.ts` | 1 |
| The log across a reopen | SQLite in a temporary directory | `test/store/event.test.ts` | 1 |
| K1 to K6, against the real functions | a child on SQLite killed with SIGKILL. To die inside a commit, the child wraps the `Storage` it passes to `openStore` (`probe/pi-facts/storage-wrap.out.txt`: killed inside, nothing landed; after, both). | `test/store/crash.test.ts`, `support/crash-child.ts` | 1 |
| Type invariants | tsc on `@ts-expect-error` cases | `test/types.test.ts` | 1 |
| Every call | `openHost` on a temporary root with SQLite stores, `host.call` as a device | `test/host/*.test.ts` | 2 |
| Start order and lock | close and reopen on one root; a killed child | `test/host/start.test.ts`, `lock.test.ts` | 2 |
| The protocol | `serve` on port 0 and `fetch`; a raw `http.request` that pauses reading | `test/protocol/*.test.ts` | 2 |
| The command | the bin as a child with `--port 0` | `apps/tau/test/main.test.ts` | 2 |
| The kit | `MemoryStorage`; files in a temporary directory | `packages/kit/test/` | 3, 4, 5 |
| Each extension | `openHost` from `tau-core/host` with the extension's module, the faux provider, a clock the test moves | `extensions/*/test/` | 3, 4, 5 |

No production code has a test switch. Storage, models, the clock, and the root are parameters that production sets too.
`types.test.ts` already holds, and tsc checks: a `then` task that lacks a choice, a basis without `text`, a subject without
a prefix, an empty `choices`, and an event without `text` all fail to compile (`probe/sketch-check`, tsc passes with
every `@ts-expect-error` used).

### What each unit adds

| Unit | Adds | Kit helpers | Its tests |
| --- | --- | --- | --- |
| 1. Store layer | Root `package.json`, lock, `tsconfig.json`, `biome.json`. `packages/core` with `.` only: `src/index.ts`, `src/store/`. | none | `test/store/`, `types.test.ts`, the first test of `exports.test.ts` |
| 2. Host and protocol | `src/module.ts`, `src/host/`, `src/protocol/`, `src/cli.ts`, the `./host` export. `apps/tau` with `modules = []`. | none | `test/host/`, `test/protocol/`, `apps/tau/test/` |
| 3. Web search | `packages/kit` with `options()`. `extensions/websearch`. One line in `apps/tau`. | `options` | `kit/test/options.test.ts`, `websearch/test/` |
| 4. W2 | `extensions/w2`. One line in `apps/tau`. | `modelRef`, `prose` | `kit/test/{model-ref,prose}.test.ts`, `w2/test/` |
| 5. W1 | `extensions/w1`. One line in `apps/tau`. | `role` | `kit/test/role.test.ts`, `w1/test/` |

No unit changes the structure of an earlier one. Unit 2 adds a type re-export to `src/index.ts`; types are erased, so the
exports test does not move. Each later unit adds a package and one line to the import map.

### What the shape does not do

No emit, no `dist/`, no project references, no tsconfig per package, no custom export conditions, no test-only export,
no shared test package, and no client library. A workflow concept never appears in `tau-core`.

### Interface depth

`tau-core` gives an extension five functions over the `tx` it holds. They hide the store layer's four documents, the
supersede rule, and the log's conversation. `tau-core/host` gives the composition root `main` and a test `openHost`. Behind `Host.call` sit locks,
stores, the start order, registries, the project default, options checks, cursors, feeds, and devices. One dispatch
serves twenty calls. A caller learns the protocol's calls and nothing of how a store is opened.

## Synthesis decision

Not filled in. This is one candidate.

## Tradeoffs accepted

- We accept that five of the boundary rules are Biome rules, not compiler errors, in exchange for one tsconfig, one tsc
  program, and no emit. The gate runs `biome check`, so they fail the build all the same.
- We accept that the store and the host share a package, so "the store knows no host" is a lint rule (S7), in exchange
  for an `answer` that no entry exports.
- We accept that `tau-core/host` resolves for an extension's code and is fenced by lint (S3), in exchange for extension
  tests that drive the real host with the client's calls instead of a test-only door to `answer`.
- We accept that `Host.call` returns the protocol's three bodies in-process, in exchange for tests that see exactly what a
  client sees.
- We accept two copies of two small rules, because the core cannot import the kit: "cut `provider/modelId` at the first
  `/`" (`src/host/models.ts`, `kit/src/model-ref.ts`) and "the set keys over the schema's defaults" (`src/host/options.ts`,
  the kit's `read`).
- We accept that each extension's tests carry a copy of the faux host setup, about 40 lines
  (`packages/core/test/host/support/host.ts`), rather than a test package.
- We accept Biome's `noThenProperty` turned off for the whole repository. The locked `Decision` has a field named `then`,
  and every `request` call writes `then:` (found by running Biome on the sketch). The field holds an object, never a
  function, so a decision is never taken for a promise.
- We accept that one type error anywhere fails `typecheck` for every package. tsc 7 checks the whole sketch in about 270 ms
  (`probe/sketch-check/run.out.txt`).

## Alternatives considered

- **`tau-store` and `tau-host` as two packages.** It makes "the store knows no host" a dependency fact. But `answer` must
  then be exported from `tau-store` to `tau-host`, through an entry every extension also depends on. Fencing it needs a
  custom condition or the same lint rule. It adds a package and moves the risk to the most sensitive function.
- **Emit with tsc and run `dist/`.** It allows any syntax. But tests would run source and the bin would run output, with
  export conditions to choose between them, a build before every test run, and source maps for stack traces. Type
  stripping removes all of it; the cost, erasable syntax only, is enforced by tsc (B6).
- **A custom export condition on `./host`**, so tsc and Node refuse it for extensions with no lint. It needs a tsconfig
  per package with `customConditions`, a `--conditions` flag on every `node` and `node --test` call, and a separate
  tsconfig for extension tests, which do need the host. One lint override says the same with a message.
- **A `tau-core/testing` entry that exposes `answer` for tests.** A test-only surface that production code can import.
  `Host.call(device, "answer", ...)` gives tests the same power through the real path.

## Open questions and risks

1. protocol.md says the server "refuses an unexpected `Host`" and "a request with another site's `Origin`", and names no
   code for either. Should both be `bad_request` (400), or a new code?
2. Which `Host` values are expected behind Tailscale Serve or a TLS proxy? The sketch proposes `tau serve --allow-host`.
   Is a flag the right home, or the server's configuration file?
3. The sketch adds two codes the design does not name: `unknown_extension` (409) for `bind` and `addExtensions` with a
   name the server lacks, and `bad_code` (401) for a pairing code that fails, as `spikes/wire.mjs` already does. Are
   these the names you want?
4. Can Webfox's root library be pointed at a local HTTP server? If yes, `web_search` is tested with `fetch` against port 0
   and no key. If not, unit 3 needs a seam for the provider call, and the sketch would rather pass the search function to
   a factory than add a switch. Also, `webfox@4.11.0` has a required peer `typebox` and pulls `openai`, `cloudflare`, and
   others into the lock.
5. The Nix package must not put the tree under a `node_modules` path (T2). Does the flake's packaging install to
   `$out/lib/node_modules/...` by default? If it does, `tau` will not start.
6. Node has no `flock`. Which lock survives a server killed with SIGKILL without blocking the next start, and refuses a
   second live server? `src/host/project.ts` leaves the choice to unit 2's failure list.
7. Which pi-ai call reads the owner's pi login on the server's machine? host.md decides that the login is pi's own, and
   the sketch leaves the call to unit 2.
8. W1's roles must name the `w1` extension, and W1's tools and tasks create roles, so W1's modules import each other. The
   sketch keeps the cycle safe by using the extension only inside functions. Is that acceptable for a sample, or should a
   role take the extension from `api.registry` instead?

## Next implementation step

Unit 1: turn `packages/core/test/store/answer.test.ts` and `request.test.ts` from `test.todo` into tests on
`openStore` over `MemoryStorage`, then fill `src/store/decision.ts` until they pass.
