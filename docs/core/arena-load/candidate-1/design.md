# Loading and reloading extensions

Candidate 1. A claim that `probe-report.md` does not cover cites a log in `probe/`.

## Usage first

### An extension author

An extension is a directory named after the extension.

```
w2/
  index.ts        export * from "./src/index.ts";
  src/index.ts    exports extension, and optionally options and entry
  src/*.ts, *.md
  test/*.test.ts
  package.json    depends on tau-extension, and on its own npm packages
```

It imports only `tau-extension`:

```ts
import { defineExtension, defineTask, type Tx } from "tau-extension/durable";
import { obj, str } from "tau-extension/schema";
import { decision, emit, options, prose, request } from "tau-extension";
```

Relative imports end in `.ts`, and syntax is erasable TypeScript, so no `enum`. In this repository the author runs `nix develop -c check extensions`, or `test tau-w2`. Tests run from source.

### The owner

Adding an extension and changing one are the same act: put the directory under `~/.tau/extensions/`, then reload.

```
$ nix build .#extensions -o ~/.tau/samples
$ ln -s ~/.tau/samples/w2 ~/.tau/extensions/w2
$ tau extension reload
w2         added      in p
$ vi ~/.tau/extensions/notes/src/agent.md
$ tau extension reload
notes      replaced   in p, q
w2         replaced   in p
```

A client then adds the extension to a project with `addExtensions`, as today. When something is wrong, the command says so and the old code keeps running:

```
$ tau extension reload
notes      kept       src/index.ts:21:3 ParseError: Unexpected token. The code loaded at 2026-11-14T10:42:07Z keeps running.
w2         replaced   in p
blocked    p  task 33  w2.due v1, sleeping until 2026-11-21T10:00:00Z: v2 has no migrate from 1. It blocks when it wakes.
$ echo $?
1
```

At start the server prints the same facts to stderr (`tau: extension notes not loaded: …`) and serves anyway. A project that lists a failed extension shows it in `missing`. A restart stays the fallback, and it is how the owner overrides a refused replacement.

### A test with the faux answer

```ts
import { BACKGROUND_CONTEXT as context } from "tau-extension/chord";
import { createRegistry, MemoryStorage } from "tau-extension/durable";
import { decision } from "tau-extension";
import { createModels, FAUX_DEVICE, fauxAnswer, fauxProvider, openStore } from "tau-extension/testing";
import { extension } from "../src/index.ts";

const registry = createRegistry();
registry.install(extension);
const models = createModels();
models.setProvider(fauxProvider().provider);
const store = await openStore(new MemoryStorage(), { registry, models }, context);
store.harness.resume();
// ... the workflow opens decision `id` ...
const open = await store.harness.commit((tx) => decision(tx, id), context);
const result = await fauxAnswer(store, id, { basis: open!.basis, choice: "yes", annotations: [] });
assert.equal(result.kind === "answered" && result.decision.by, FAUX_DEVICE);
```

`fauxAnswer` is the core's `answer` with the device `test:faux` and the background context. A device name must match `^[a-z][a-z0-9-]{0,31}$`, so pairing refuses that name. W2's 17 tests passed this way, from source (`probe/b-run.log`).

## 1. The loader

**The directory** is `<home>/extensions/`, so `~/.tau/extensions/`. The server creates it with mode 700. A client never names it.

**What counts.** Each entry whose name does not start with `.` is one extension. After `realpath` it must be a directory holding `index.ts`. Its name matches `^[a-z][a-z0-9-]{0,62}$`, is not `coding-tools`, and equals the module's `extension.name`. One directory per name, so duplicates cannot occur. An entry that breaks a rule is reported with the rule.

**The shape.** The server keeps three exports and ignores the rest: `extension`, an object with a string `name`; `options`, absent or `{ schema, get, set }` with an object and two functions; `entry`, absent, a function, or an object. It compiles `options.schema` through the host's `Options` class. pi-durable does the rest: each module is installed into a scratch registry holding `coding-tools` and every module that stays loaded, which refuses a colliding task name and stays as it was (`probe/a-load.log`). These checks run in the server, so they apply to a test's map too.

**TypeScript only.** The loader walks the extension's real directory, skipping `node_modules` and dot entries. A `.js`, `.mjs`, `.cjs`, or `.jsx` file refuses it: "src/helper.js is JavaScript. Only TypeScript is re-imported and sees the aliases." A native helper gets its own copies of pi and is never re-imported.

**Permissions.** The same walk checks each directory and file: owned by the server's user or by root, and writable by neither group nor others. Root admits the Nix store. A failure refuses that extension. If `~/.tau/extensions/` itself fails, nothing loads and a reload changes nothing. In `node_modules` only the top entry is checked.

**Import.** A new jiti per load, `createJiti(import.meta.url, { moduleCache: false, fsCache: false, alias })`, then `jiti.import(realIndex)`. By default jiti writes transformed code to `$TMPDIR/jiti` and later runs any file there whose trailer matches (`probe/a-default-cache.log`), which another user can plant on a shared `/tmp`. Without the cache the samples load in 63, 22, and 7 ms and re-import in 44, 13, and 6 ms (`probe/a-load.log`).

**The alias table and its one list.** The list is the `exports` map of `tau-extension`'s `package.json`. The loader walks up from its own directory to `node_modules/tau-extension/package.json` and reads it as data, never importing the package. Each subpath `./x` becomes the alias `tau-extension/x` for its `import` target. `./testing` points instead at a core module that throws "tau-extension/testing is for tests. An extension cannot import it at run time.", which fails the load as an ordinary `Error` (`probe/a-extra.log`). A new entry needs no change in the core. The table is built only when the directory holds an extension, so the core runs alone with an empty one.

**An extension's own dependencies** are declared in its `package.json` and installed in a `node_modules` above its real path, by npm or Nix. Node resolves and caches them natively, so changing one takes a restart. They must not include `tau`, `tau-extension`, or `@earendil-works/*`, whose second copy breaks identity. The import check enforces that here. The loader does not look.

**A failure never stops the server.** At start the extension is absent and shows in `missing`; at reload the old module stays. The reason is the error's first line, its path relative to the extension.

## 2. Reload

`tau extension reload` sends `{ "command": "reload" }` on `admin.sock`. Reloads run one at a time from a queue: a second command waits, then rescans. A stopping server refuses with "The server is stopping."

1. **Load.** Scan and import the directory, as in section 1.
2. **Admit.** Check each module's name and shape, and compile its options schema.
3. **Dry run.** Install into a scratch registry: `coding-tools`, the modules that stay, then the candidates in name order. A candidate whose install throws is refused.
4. **Live check.** `harness.inspect()` in each open project. A candidate is refused if a live task of one of its kinds has the same version as the new definition and is checkpointed at a phase that definition lacks. Such a task faults when it runs, and a fault is final (`probe/c-inspect.log`). The old code can still finish it.
5. **Commit.** One synchronous block, no `await`. Build the next catalogue: each accepted candidate adds or replaces its name; refused names and names gone from the directory keep their old module. Build the options map from it, reusing unchanged `Options`. Swap both on the host. In every open project, install each listed module whose installed object differs, and rebuild the default selection.
6. **Report.** One line per extension, `added`, `replaced`, `kept` (with the reason and the kept code's load time), or `not loaded`, with the projects it reached. Then, from a second `inspect()` per project: tasks held `blocked`, with the reason; live tasks stored below a definition's version that has no `migrate`, which block when they wake and read `sleeping` until then (`probe/c-inspect.log`); and tasks stored above it.
7. **Reply.** The CLI prints the lines, and exits 0 only when every extension was added or replaced and no task is blocked.

**All-or-nothing per extension.** Step 5 changes an extension's catalogue entry, options, and every project's registry together, or none of them. One broken extension does not hold back a fix to another. If the directory is unreadable or unsafe, nothing changes.

**A failed re-import keeps the old code** in the catalogue and every project, reported `kept`. **An extension gone from the directory keeps running**, since removal is not offered: "kept: gone from the directory. A restart drops it."

**Reload meets `bind` or `addExtensions`.** No lock. Both install in a synchronous block after their commit, through the same `#install`, reading the catalogue there. Step 5 is synchronous too, so whichever runs first, the other sees its result. A call already running keeps the module it read, as pi-durable does for a tool call in flight.

**The default selection and the options catalogue** are rebuilt in step 5. An added or replaced tool extension reaches each conversation that follows the default from its next model request. `extensions`, `options`, `setOptions`, and `create` read the new map on their next call, which fixes the stale catalogue the probe report found.

**Prose.** `prose()` reads files at module load, so new prose reaches new conversations and newly rendered inputs. A conversation keeps its stored instructions.

**State.** In memory only: the catalogue (module, options, load time per name) and the queue. Reload writes nothing to disk: `registry.install` commits nothing (`probe/c-install-writes.log`), and jiti writes no cache. A crash at any step leaves the stores as they were, and the next start loads what the directory holds.

**What reload refuses.** The whole command, while stopping or when the directory is unreadable or unsafe. One extension, keeping its old code: an import error, a JavaScript file, unsafe permissions, a bad or mismatched name, `coding-tools`, a bad shape, a schema that does not compile, a task name collision, or a phase a live task needs. Start applies the same rules except the live check, because it has no old code to keep. That makes a restart the owner's override.

**What the core gains.** `startServer` takes `extensions`, a function returning the modules found and the failures, in place of `modules`, and calls it at start and on each reload. `Projects.#install` installs when the installed object differs, and `Projects.refresh()` runs it in every open project. `Server` gains `reload()`, and the admin unions gain `reload`.

## 3. Entry points

The core package, `tau`:

| Entry | Exports | Imported by |
| --- | --- | --- |
| `.` | `startServer`, `requestAdmin`, `fromDirectory`, and the types `ServerOptions`, `Server`, `ExtensionModule`, `AdminRequest`, `AdminResult` | The journeys |
| `./extension` | `request`, `withdraw`, `emit`, `decision`, `eventLog`, and their types | `tau-extension` only |
| `./testing` | `fauxAnswer`, `FAUX_DEVICE`, `openStore`, and the types `Store`, `AnswerInput`, `AnswerResult` | `tau-extension` only |
| bin `tau` | The command | |

`answer` is in no entry. The host imports it by a relative path.

`tau-extension`:

| Entry | Holds |
| --- | --- |
| `.` | The five functions, `options`, `modelRef`, `prose`, `role`, and the types `Decision`, `DecisionId`, `DecisionInput`, `RequestDraft`, `Annotation`, `DeviceId`, `EventData`, `RoleSettings`, `ExtensionModule` |
| `./durable` | Curated names from pi-durable's root and its `tools`, `env/node`, and `storage/sqlite/node` subpaths |
| `./schema` | Curated pi-schema names |
| `./chord` | `BACKGROUND_CONTEXT`, `Context`, `Draft` |
| `./testing` | The core's `./testing`, and pi-ai's `createModels`, `fauxProvider`, `fauxAssistantMessage`, `fauxToolCall`, `fauxText`, `FauxResponseStep` |

The testing entry is `tau-extension/testing` because an author imports one package. Its logic stays in the core because the faux answer must be the real `answer`. Test-only pi-durable names such as `MemoryStorage` sit in `./durable`, keeping one pi package per entry. Only tests use pi-ai, so its few names sit in `./testing`. A name joins a curated list in the change that first uses it. The lists start as what W1, W2, websearch, and their tests import today.

**How the build refuses a wrong import.** `tools/check-boundaries.mjs` keeps its parser and finds packages from the root `workspaces` globs. The policy:

```json
{
  "tau": {},
  "tau-extension": { "tau": ["./extension", "./testing"] },
  "tau-journeys": { "tau": ["."] },
  "extensions/*": {
    "tau-extension": [".", "./durable", "./schema", "./chord"],
    "testOnly": { "tau-extension": ["./testing"] }
  }
}
```

- The core imports no workspace package. Its flake check also runs with no `extension/` or `extensions/` code present.
- Under `extensions/`, an `@earendil-works/*` import fails with the entry to use instead. Importing `tau` or another extension fails as a forbidden capability. A relative specifier must end in `.ts`: `tsc` accepts `./x.js`, then Node fails (`probe/b-run.log`). `package.json` may not declare `tau` or `@earendil-works/*`, and has no `exports`. `./testing` is allowed only under `test/`.
- `core/test/exports.test.ts` pins each core entry's names and asserts none is `answer`. `extension/test/exports.test.ts` pins each entry of `tau-extension` against its README.

## 4. The repository

```
core/         "tau": src/store, src/host, src/loader, src/command, test/
extension/    "tau-extension": src/{index,durable,schema,chord,testing,kit}.ts, README.md, test/
extensions/   w1/, w2/, websearch/: "tau-w1", "tau-w2", "tau-websearch", private, no exports
journeys/     "tau-journeys", private: journeys through a real server, and verify-build.ts
tools/, docs/, flake.nix, package.json, package-lock.json, tsconfig*.json, boundaries.json
```

One npm root and one lock: `"workspaces": ["core", "extension", "extensions/*", "journeys"]`. One lock gives one copy of each pi package, which the aliases rely on.

**Emitted, or from source.** What ships as JavaScript is emitted: `core` and `extension` stay composite `tsc -b` projects tested from `dist/`. What is loaded or only tested runs from source. Each extension and `journeys` set `noEmit`, `allowImportingTsExtensions`, and `erasableSyntaxOnly`, and reference `extension`. `tsc -b` checks them and fails on a type error or an enum (`probe/b-run.log`). `tools/tests.mjs` runs their `test/**/*.test.ts` directly, and Node 24.22.1 strips the types without a warning. The server loads the same files through jiti. Prose needs no copy. Each extension is checked alone, `tsc -b extensions/w2` and `test tau-w2`, against `tau-extension`.

**Web search and Webfox.** `extensions/websearch/package.json` declares `webfox` 4.11.0, locked in the one lock. Node resolves it from websearch's real path through an ancestor `node_modules`: the checkout's managed one, or `$out/node_modules` in the Nix output. A symlinked extension found Webfox both ways (`probe/a-load.log`). Webfox lists pi-durable only as a peer dependency, and websearch imports only its root.

**The journeys.** `journeys/` holds W0, W1, W2, search, the W1 SIGKILL journey, and a new reload journey. Its helper makes a temporary home whose `extensions/` holds symlinks to `<repo>/extensions/{w1,w2,websearch}`, then calls `startServer({ home, extensions: fromDirectory(join(home, "extensions")), models: faux, … })`, in process or in a child: the loader and aliases `tau` uses. Search writes a fixture `websearch/index.ts` there that imports `createSearchExtension` from the real source by absolute path and passes the local provider address, so `tau-websearch/testing` goes. The reload journey copies W2 instead of linking it, edits it, and calls `requestAdmin(home, { command: "reload" })`.

**The flake.**

| Check | Source | Runs |
| --- | --- | --- |
| `core` | Root files, `tools/`, `core/`, every `package.json` (manifests only, for the lock) | Lock, boundaries, Biome on `core tools`, nixfmt, `tsc -b core`, core tests |
| `extension` | The same and `extension/` | Biome, `tsc -b extension`, its tests |
| `extensions` | Everything | Biome, `tsc -b`, extension tests and journeys from source |
| `spikes` | As today | The six spikes |
| `verify-build` | `.#tau`, `.#extensions` | Below |

`core`, `extensions`, and `verify-build` keep the macOS local networking allowance. Dev-shell commands take a side or a package: `typecheck core`, `test tau-w2`.

`nix build` (`.#tau`) produces the core and `tau-extension`, built, with their `node_modules`, under `$out/lib/tau`, and `$out/bin/tau`. No extension. `.#extensions` produces `$out/{w1,w2,websearch}` with `index.ts`, `src/`, and `package.json`, and `$out/node_modules` linked to the locked dependencies, for Webfox.

`verify-build` starts the installed `tau` on a temporary home, and `extensions` must be empty. It links the three outputs into `$HOME/.tau/extensions/` and runs `tau extension reload`, which must exit 0 with three `added` lines. `extensions` must then list three, and after a `bind` with W2 and websearch, `options` must list both schemas. SIGTERM ends it with exit 0.

Samples reach a server's directory by symlink everywhere: the journeys link the checkout, `verify-build` links the Nix output, and the owner links from `nix build .#extensions -o ~/.tau/samples`.

## 5. The documents

| Place | Now | Becomes |
| --- | --- | --- |
| `host.md:31` | "The host's import map" | "The extensions loaded from `~/.tau/extensions/`" |
| `host.md:108` | "The import map is code." | Removed. New item 2: "The extension directory, `~/.tau/extensions/`. Each `<name>/index.ts` loads with jiti. A failure is reported and skipped." |
| `host.md:112` | "each listed extension that the import map has" | "each listed extension that loaded from the directory" |
| `host.md`, after "**Removing an extension is not offered.**" | | "`tau extension reload` re-imports the directory and installs or replaces each extension in every open project that lists it. An extension gone from the directory keeps running until a restart." |
| `host.md`, "What the host knows" | "It does not import the kit." | "It does not import `tau-extension`." |
| `extensions.md:11` | "The host knows one module for each name, from an import map that is code." | "The host knows one module for each name: `~/.tau/extensions/<name>/index.ts`, loaded at start and at each `tau extension reload`." New sections "Loading and reloading" and "What an extension imports", which points to `extension/README.md`. |
| `primitives.md:286` | "The host maps each name to a module through static imports, so TypeScript checks them." | "The host maps each name to the module it loaded from `~/.tau/extensions/<name>/index.ts`. TypeScript checks an extension against `tau-extension` where it is built, not where it is loaded." |
| `primitives.md`, "How an extension reaches the core" | "It imports five functions from the core." | "It imports five functions from `tau-extension`, which re-exports them from the core." |
| `primitives.md`, "Only a human answers" | "`answer` is exported to the host only. The entry point for extensions does not have it, no tool wraps it, and an import check can enforce that." | "`answer` is exported from no entry point. `tau-extension/testing` has `fauxAnswer`, the same function with the device `test:faux`, which no paired device can have, and the loader refuses that entry at run time. No tool wraps it. The import check and the export tests enforce this." |
| `kit.md:3` | "Tau has one kit beside the core, the package `tau-kit`. …" | "The helpers for extension authors, `prose()`, `role()`, `options()`, and `modelRef()`, are exported from the root of `tau-extension`, the one package an extension imports. The core never imports it." The entry rule governs that root. |
| `README.md:37` | "One kit sits beside the core, the package `tau-kit`. …" | "One package, `tau-extension`, is what an extension imports: the core's five functions, the helpers, and curated re-exports of pi. The core never imports it, and loads extensions at run time from `~/.tau/extensions/`." |
| `README.md`, layers | "Neither imports an extension or the kit." | "Neither imports an extension or `tau-extension`." Row "Kit" becomes "Extension package". The decided table gains "Extensions load at run time and reload with `tau extension reload`". |
| `AGENTS.md` | "Add a package" | "Add an extension", and commands per side. |

The re-exports are listed in `extension/README.md`: one table per entry, each row a name, value or type, and the pi package and subpath it comes from. Above the tables: "These names are re-exports. They do not shield an extension from a change in pi-durable's behaviour." The exports test reads these tables, so document and package cannot drift. The build adds `docs/core/build-notes/unit-8-load.md`.

## 6. The restructure

Each unit is one pull request for one agent, ends in the named check written to fail first, and leaves the suite green.

1. **Workspaces from the root.** The boundary checker, test runner, lock check, link script, and asset copier read the root `workspaces` globs, and the runner runs `.test.ts` directly for a `noEmit` package. Check: new `tools/workspace.test.mjs` cases.
2. **The catalogue seam.** `startServer({ extensions })`, the shape and name checks, the scratch registry, the start report. The command passes its import map as a source. Check: host tests for a bad shape, a name mismatch, `coding-tools`, a collision, and a bad schema, each reported while the server serves.
3. **Reload.** Section 2's steps, `Projects.refresh()`, the admin command, the CLI. Check: host tests with a source that changes between calls, one per behaviour of section 2.
4. **The directory loader.** jiti 2.7.0 joins the lock; `fromDirectory(directory, aliases?)`. Check: tests on temporary directories, with aliases pointing at the host's pi-durable, for identity and each refusal of section 1.
5. **The faux answer** in `tau-store/testing`. Check: `by` is `test:faux`, and `tau device pair test:faux` is refused.
6. **`tau-extension`** in `extension/`, with the kit moved in, the five entries, the README tables, the exports test. `packages/kit` goes. Check: the kit tests in their new place, and the exports test.
7. **W2 and websearch through `tau-extension`**, rewritten in place. Check: their tests and the journeys.
8. **W1 through `tau-extension`.** Check: its tests, walk rows 6 and 7 changed.
9. **`tau` loads from the directory.** `modules.ts` goes. Each extension gets a root `index.ts`; jiti accepts the `.js` specifiers still in place, as the probe report's W2 copy showed. Journeys build temporary directories, search uses the fixture, `.#tau` ships no extension, and `.#extensions` and the new `verify-build` arrive. Check: the journeys, `verify-build`, and a mutation in which unlinking W2 fails the W2 journey.
10. **One core package.** Store, host, and command merge into `core/` as `tau` with three entries; `tau-extension` switches to them. Check: the core exports test and the moved tests.
11. **Extensions from source** in `extensions/`: `.ts` specifiers, `noEmit`, `erasableSyntaxOnly`, tests from source, and the checker's extension rules. Check: the extension tests, and a workspace test per new rule.
12. **Journeys** move to `journeys/`, and the reload journey is added: new prose, a task with `migrate`, a broken file kept, websearch added to a live project. Check: the journeys.
13. **The flake** of section 4. Check: `nix flake check`, and a deliberate `import "tau-extension"` in `core/src` fails the `core` check.
14. **The documents** of section 5.

**The current tests.** They **move**, changing only paths and specifiers: store, host, command, credentials, kit, websearch, W2, most of W1. They **change**: the host test helper turns `modules` into a source, as does `devices.test.ts` at its one direct `startServer`; W1 walk rows 6 and 7 lose their device argument and expect `test:faux`; W2 and websearch take `fauxAnswer` and `openStore` from `tau-extension/testing`; the missing-extension journey removes and restores the W2 link instead of passing a smaller map; search uses the fixture; `store/test/exports.test.ts` becomes the core exports test; `tools/workspace.test.mjs` follows the new discovery. They are **replaced**: `tau/test/modules.test.ts`, whose repeated-name test becomes the loader's name-mismatch test and whose listing becomes a journey; and `verify-build.ts`. The two-device facts of rows 6 and 7 stay covered by the core's decision tests and the W1 journey's two paired devices.

## Tradeoffs accepted

- Reload works per extension, so the catalogue can hold code a restart would not load. Each such name is reported `kept`.
- An extension gone from the directory runs until a restart.
- The live phase check runs only at reload, and a restart overrides it. A task entering the dropped phase between steps 4 and 5 can still fault.
- No transform cache: each start and reload transforms again, about 90 ms for the three samples.
- Every native `.js` file is refused, even a harmless one.
- Tests strip types with Node, and the server transforms with jiti. `erasableSyntaxOnly` keeps both on one subset, but they are two transformers.
- Changing an extension's `node_modules`, or `tau-extension`, takes a restart.
- A third-party extension that installs its own pi packages gets second copies. Documented, not checked.
- No install command. The owner links or copies.

## Alternatives that lost

- **All-or-nothing across the directory.** One broken extension would hold back every other fix.
- **Reopening a project to apply new code.** In the probe report it ended streams and resent a model request. Replacing in place interrupted nothing.
- **The testing entry only in the core.** Test authors would import a second package, against the owner's ruling.
- **Extension tests through jiti's register hook.** One transformer, but a hook in every test process, when Node strips types already.
- **Emitting extensions and loading `dist/`.** The server would not run the files the owner edits.
- **Aliasing `@earendil-works/*` for extensions.** Each pi name would have two import paths.
- **A transform cache under `~/.tau`.** 3 ms warm for W1, but a second copy of code to protect, to save 90 ms.
- **One lock per side.** Two copies of each pi package at run time.
- **Single-file extensions such as `notes.ts`.** A second shape to check and document.

## Open questions

1. Should a client see blocked tasks, for example in `faults`, or is the owner's terminal enough?
2. Should start also leave an extension unloaded when its new code would fault a live task, so the task blocks and can recover?
3. Should the server send pi-durable's `onReport` to its log, so a task that blocks days after a reload is logged when it does?
4. Is `^[a-z][a-z0-9-]{0,62}$` the right rule for extension names?
5. Should the loader refuse an extension whose own `node_modules` holds `@earendil-works/*`?
