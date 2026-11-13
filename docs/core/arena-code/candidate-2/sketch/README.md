# Sketch map and handoff

This is a design sketch, not Tau. Behavior bodies throw. Task declarations describe the code to write. Files with `test.todo` are failure lists, not passing verification. The architecture probe lives next to this directory at `../probe/`.

## Files an implementing agent opens first

| Work | Open these files | Locked source |
| --- | --- | --- |
| Decision and Event | `packages/store/src/index.ts`, `types.ts`, `decisions.ts`, `host.ts`, `events.ts`, then `test/*.test.ts` | `docs/core/primitives.md` |
| Bind and startup | `packages/host/src/projects.ts`, `store-lock.ts`, `index.ts`, then `test/projects.test.ts` | `host.md`, `topology.md`, `extensions.md` |
| All client calls | `packages/host/src/calls.ts`, `http.ts`, `streams.ts`, then `test/protocol.test.ts`, `test/streams.test.ts` | `host.md`, `protocol.md` |
| Options and device authority | `packages/host/src/options.ts`, `devices.ts`, then their tests | `host.md`, `extensions.md`, `protocol.md` |
| Kit | `packages/kit/src/index.ts`, then the test for the helper being added | `kit.md`, `prose.md` |
| Web search | `packages/websearch/src/index.ts`, `web-search.ts`, `test/search.test.ts` | `extensions.md` |
| Forecasts | `packages/w2/src/index.ts`, `forecast.ts`, `tasks.ts`, `test/forecast.test.ts` | `walk.md` W2 rows 1 to 15 |
| Design to merge | `packages/w1/src/work.ts`, `tools.ts`, `tasks.ts`, `roles.ts`, `git.ts`, then `test/*.test.ts` | `walk.md` W1 rows 0 to 19, E1 to E3, X1 to X6 |
| Server command | `packages/tau/src/command.ts`, `modules.ts`, `test/command.test.ts` | `protocol.md`, `README.md` |

## Package graph

```
tau -> tau-host -> tau-store
  |                    ^
  +-> tau-websearch ---+
  +-> tau-w2 ----------+
  +-> tau-w1 ----------+
           |            
           +-> tau-kit
```

All three extensions may import `tau-kit` and only the root of `tau-store`. Each package may use its declared pi packages and Node. The kit uses pi only. It needs no core import today. Store and host do not import kit or any extension. Host receives a structural `ExtensionModule` map from the command. Extensions need no host type import. The command checks their exports with `satisfies Record<string, ExtensionModule>`.

Exports are literal, with no wildcard or source subpaths:

| Package | Export | Burden it removes |
| --- | --- | --- |
| `tau-store` | root: five functions and their domain types; `/host`: openStore, answer, watchOpen and their types | One owner of Decision, its open index, and the log identity. No extension knows document names. |
| `tau-host` | startServer, requestAdmin and configuration/module/admin types | One owner of project lifecycle, device authority, HTTP and watches. No pass-through protocol package. |
| `tau-kit` | prose, options, modelRef, role, RoleSettings | Keeps repeated extension author work beside, not inside, core. |
| `tau-websearch` | extension, options | One tool module and its own options, with no entry or task. |
| `tau-w2` | extension, entry, options, W2Options | Owns forecasts, timers, rounds, scoring and receipts. |
| `tau-w1` | extension, entry, options, W1Options | Owns evidence, stages, roles, Git plans, cancellation and receipts. |
| `tau` | run; bin tau | Only place that names particular extensions or constructs server-machine credentials. |

`W1Options` and `W2Options` retain the names in `kit.md`. The host uses their `options` alias. Internal tool and task exports are module-local and cannot be imported through an npm subpath. No types-only package, plugin SDK, registry framework, model abstraction, scheduler, client or global secret store is added.

## Build enforcement

`npm run build` first runs `tools/check-boundaries.mjs`. It parses TypeScript syntax, including type imports, re-exports and literal dynamic imports. It checks `boundaries.json`, dependency declarations and explicit package exports. A cross-package relative path is forbidden even if TypeScript could compile it. Computed dynamic imports and compiler path aliases are forbidden. Source symlinks are forbidden. npm export maps then reject hidden paths in both TypeScript and Node. Named import `answer` from the store root fails TypeScript. Importing `/host` from an extension fails the build checker even though the host can import it.

These are guardrails for trusted contributors, not a sandbox against code using eval, filesystem reads or OS credentials. That accepted limit stays intact.

## TypeScript and Nix contract

Choose an emit step for tests and server. Use `.js` in relative source imports, strict NodeNext TypeScript, one composite project per package, rootDir `.`, outDir `dist`. Root project references follow the package graph. Exports point only to `dist/src/*.js` and declarations. Node executes emitted `.js` under `node --test`; the built command executes `packages/tau/dist/src/main.js`. There is no runtime loader, Node type-stripping mode, bundler, path alias or custom export condition. `tools/assets.mjs` copies Markdown next to emitted extension modules, so module-load `prose(import.meta.dirname, ...)` works in the build too.

`package-lock.json` is real and pins pi-durable, pi-schema, pi-ai and Chord to 1.5.2. TypeScript, Node types and Biome are exact versions too. Webfox is deliberately not guessed. Unit 3 adds its proven root-library dependency and updates this lock.

The flake agent owns the flake, not this sketch. Its `node_modules` derivation consumes this committed lock and supplies workspace links. No worker installs packages. Expose `typecheck`, `test`, `fmt`, `lint`, `spikes`, `check` as the root scripts spell them. `typecheck` also emits incrementally; `check` builds once, lints, runs emitted tests, then real-function crash spikes. `nix flake check` invokes `check` on actual candidate source. Do not count the architecture probe or the old stand-in spikes as that gate. The real-function `spikes` command intentionally fails until the store agent ports K1 to K6.

## Verification seams and cost

Failure lists are already named in `test/*.test.ts`. Replace TODOs with tests that fail on the missing behavior before replacing behavior stubs. No production test mode is permitted. Measure each new test's runtime in its node:test output and record the unit's cumulative time at handoff. The three architecture probes currently take well under a second of test time; they do not measure Tau's future runtime.

| Layer | Primary seam and location | Expand only for the named guarantee |
| --- | --- | --- |
| Store transitions | Real functions over pi MemoryStorage in `store/test/decision.test.ts` and `events.test.ts` | SQLite under a temporary directory for reopen. Child processes and SIGKILL for `recovery.test.ts` and real K1 to K6. Commit barriers belong to test callers and fixtures, not store code. |
| Host lifecycle and options | `startServer` with normal temporary home and real SQLite in `host/test/projects.test.ts`, `options.test.ts` | Two OS processes for store lock and bind/start crash repair. No in-memory fake filesystem or test-only startup bypass. |
| Protocol and authority | `fetch` against `127.0.0.1` port 0 in `host/test/protocol.test.ts`, `devices.test.ts`, `calls.test.ts` | Real Unix admin socket, file permission checks, two device tokens and child server restart. Calls tests derive names from calls; expected replies come from independent locked examples. |
| Streams | Real fetch body readers in `host/test/streams.test.ts` | A paused raw HTTP reader for backpressure and bounded drain. Node mock timers for 15/60 second timer logic, one real socket check for drain. Pinned ConversationView is observed, not reconstructed by mocks. |
| W0 and faults | Same server seam with faux pi model and restart in `host/test/w0.test.ts` | Failure-producing installed test extension, no magic production fault route. Scan finished tasks by installed kind, never a fault table. |
| Kit | Direct helper calls in `kit/test/*.test.ts`, pi MemoryStorage for Tx helpers | Child module import for load-time prose failure, built Markdown packaging check for deployment. |
| Web search | Real extension installed in a pi harness with an ordinary project options document in `websearch/test/search.test.ts` | Local provider HTTP fixture through Webfox's normal provider URL/configuration if supported, otherwise its documented transport seam. Unit 3 proves this seam before selecting the dependency. Separately run an intentional real-provider spike for retained content. Never a fake Webfox result object as compatibility evidence. |
| W2 | Installed extension on MemoryStorage with pi faux model, injected Harness now and timer in `w2/test/forecast.test.ts` | Temporary SQLite and killed child for overdue reopen, stale timer, score replay. No real week wait and no fake core functions. |
| W1 | Installed extension, faux designer/implementer/reviewer models and real temporary Git repo/worktree in `w1/test/*.test.ts` | SIGKILL between plan/effect/receipt; pinned Git objects; actual nested tool rejection. No mocked Git or synthetic evidence chain. |
| Command | Child built tau process and admin.sock in `tau/test/command.test.ts` | Process signals and dist-only Markdown load. This is a server command test, not a new client. |

Fault cursors hold one position per kind. History cursors hold the query and pi cursor. Both are validated base64url JSON and retain no server memory. A call's limit bounds returned records, not SQLite work. State is per actor: separate stores per project, one Work per D, a Book in each W2 conversation, and one receipt key per publishing task. The host merges inbox paths and event time at read, without a shared ledger.

## Build units

| Order | Files added or filled | Independent build and verification |
| --- | --- | --- |
| 1 Store | Root workspace/tooling, tau-store, its five extension calls and host-only entry. No kit or host required. | `tsc -b packages/store`; `node tools/tests.mjs store`; port and run real-function K1 to K6. Store knows neither project nor working directory. |
| 2 Host and protocol | tau-host and tau with an empty static map. All 20 calls, devices, lock, default selection, admin socket and built command. | `tsc -b packages/host packages/tau`; host/store/command tests; W0 restart journey and fetch on port 0. Options are tested with a hand-written structural module contract, not an early kit dependency. |
| 3 Web search | tau-websearch; tau-kit with options only; add command map member and package dependency. Resolve Webfox version, entry point and provider options here. | Build host, websearch and tau; websearch tests plus default/secret/missing-code callers; real-provider content spike. Core files do not change. |
| 4 W2 | tau-w2; add kit prose and modelRef because W2 calls them. Add W2 module map member and package dependency. | Build W2 and tau; W2 tests, prose module-load checks and current-state inbox with an overdue timer after restart. Core files do not change. |
| 5 W1 | tau-w1; add kit role because prepare and publish_build are its two callers. Add W1 map member and package dependency. | Build W1 and tau; W1 evidence, failure, role and real-Git tests; cumulative final gate. Earlier interfaces do not change. |

The tree shows the final layout. At each step only that row and prior rows are admitted to the workspace references, command imports and dependencies. This adds packages and helpers at first use, instead of making the store compile future code. The order does not require moving earlier files. Prose assets belong to their workflow and load at module import, never during section rendering. No plan calls for model-call limits, extension removal, unbind, deletion, a client, sandboxing or shared secrets.
