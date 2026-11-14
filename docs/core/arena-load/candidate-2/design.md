# Candidate 2: prepare together, publish without reopening

## What callers do

An author writes `extensions/demo/src/index.ts`:

```ts
import { modelRef, options as defineOptions, prose } from "tau-extension";
import { defineExtension } from "tau-extension/durable";
import { obj, str } from "tau-extension/schema";

export const extension = defineExtension({ name: "demo" });
export const options = defineOptions("demo", obj({ model: str({ format: "model" }) }));
const instructions = prose(import.meta.dirname, "agent.md", [])({});
export async function entry(tx: import("tau-extension/durable").Tx) {
  return { model: modelRef((await options.read(tx)).model), extensions: [extension], instructions };
}
```

They run `nix develop -c typecheck tau-demo` and `nix develop -c env test tau-demo`. These commands select that workspace and its dependencies, not all extensions.

On the server, the owner runs:

```sh
install -d -m 700 ~/.tau/extensions
ln -s "$PWD/extensions/demo/src" ~/.tau/extensions/demo
tau extension reload
```

It prints `added demo; projects: none`. The existing client uses `addExtensions` to select `demo`, sets its model, then creates it. A project already listing a missing `demo` needs no extra call. Editing its TypeScript or Markdown and running the same reload replaces it everywhere it is listed. Nobody sends a code path over HTTP. Restart is the fallback. New prose does not rewrite saved conversation instructions.

A workflow test keeps today's direct registry, faux model and `openStore` setup. Its answer becomes:

```ts
import { answer, openStore } from "tau-extension/testing";
// store is openStore(storage, harnessOptions, context); fixture installs extension.
const result = await answer(store, id, { basis, choice: "yes", annotations: [] }, context);
assert.equal(result.kind, "answered");
if (result.kind === "answered") assert.equal(result.decision.by, "!test");
// Wait for result.decision.continuation and assert the workflow's event.
```

No server, token, or caller-supplied identity is involved.

## 1. The loader

Discover only immediate entries in `<home>/extensions`, normally `~/.tau/extensions`. Accept `name.ts`, or `name/index.ts`, including owner-created symlinks. A directory's basename, or a file's stem, is its extension name. Use the existing project-name grammar. Reserve `coding-tools`. Ignore dot entries and `node_modules`. Other visible entries are preparation errors, not silently ignored. No package discovery, manifests naming entry files, project-directory scanning, or recursive extension discovery.

Resolve real paths before importing. Two candidates with one logical name, including `x.ts` beside `x/`, invalidate the scan. Two logical entries resolving to one entry file also fail. Require the named export `extension`, an object whose `name` exactly matches the logical name. Optional `options` must have a closed object schema and callable `get` and `set`. Construct the existing `Options` validator during preparation. Optional `entry` must be an object or function. Extra exports such as W2Options are harmless. Do not invoke entry, get, set or migration code to validate a module. Dry installation into pi's registry supplies its existing definition checks. Do not invent another Extension implementation.

Use jiti 2.7.0, pinned in the npm lock, with `moduleCache:false` and a fresh importer per scan. Re-import every candidate, even when no TypeScript timestamp changed. This rereads top-level prose. Module top levels define code and read assets only. They must not start work or register process listeners. Failed imports cannot undo arbitrary trusted JavaScript effects.

`extension-imports.json` at the repository root is the one surface list. Each row names an author-package entry, whether it is test-only, and its named exports with their origins. Generate/check package export keys, facade re-export lists, reference tables and alias keys against it. Production aliases include exactly the four non-test entries. Resolve their targets from the **server installation**, never an extension's node_modules. Every subpath gets its own alias. Do not alias an entire package prefix and hope subpaths follow.

Helpers remain implemented in the author package. Its root re-exports core functions; its other production entries re-export pi. The installed application assembles core and that package under one node_modules tree, sharing core and pinned pi dependencies. The loader resolves facade filenames but does not import the package. Only extensions import it. Core source has no dependency on it. Empty startup needs no facade; a nonempty load without the installed facade fails preparation with a repair instruction. Identity checks belong to the author-package check.

Runtime extension code is `.ts`, not `.js`, `.mjs`, `.cjs`, `.mts` or `.cts`. Walk each real extension source directory before import and reject local JavaScript anywhere except node_modules. Reject relative escapes from that tree in the authoring check. Today's `.js` relative specifiers may resolve to `.ts`, as the measured W2 probe does; an actual JavaScript target is refused. Emit tests outside the deployed source tree. Native npm dependencies are allowed and resolve from the extension's own location. They are not reloadable code. Editing or upgrading one requires restart. They must not wrap Tau or pi imports; native dependency internals bypass aliases. These are trusted-code conventions, not a sandbox.

Create the scan directory as 0700. Refuse a root not owned by the server user or writable by group/others. Refuse writable-by-others source targets. Permit owner-controlled targets and read-only Nix-store targets. Do not chmod someone else's tree. Symlink deployment is intentional. No extra race-proof filesystem subsystem is proposed.

At startup, any invalid candidate aborts startup before opening projects. An absent directory is an empty catalogue. Print logical name, path, stage and error to stderr. Reload preparation errors print the same fields, leave the running generation intact and keep serving. This is stricter than silently starting with half the requested code.

## 2. Reload

Add `{command:"extension_reload"}` to the existing owner-only Unix admin socket. It accepts no names or paths. Extend its request/result schemas and CLI parser. Add no HTTP call and change no protocol version. Protocol's version rule permits calls, but this operation does not belong to clients and needs none.

One server structural queue owns reload, bind, addExtensions, options, setOptions and workflow create. Acquire it before project queues, never in reverse order. Two reloads run FIFO, each taking its own fresh scan. A bind or addExtensions finishes entirely before reload or uses the new catalogue afterwards. Serializing options and create prevents an old contract writing after a replacement schema is published. Input, answers, model requests, watches and task execution keep running. Shutdown drains this queue and refuses new structural operations.

Order inside reload:

1. Check running/closing state and directory permissions. Discover, resolve and check duplicates. Import and shape-check every candidate in sorted name order.
2. Build the proposed catalogue from the current catalogue plus all candidates. A previously loaded name absent from disk is **retained**, with a warning. Never uninstall it. On restart it will be missing if still absent.
3. Build replacement Options objects. Dry-install CodingTools and the proposed catalogue into a disposable registry to detect definition and task-name conflicts. Reject task-name deletion, version downgrade, and removal of a phase at the same version relative to the loaded definition. A version bump may change phases. With no migrator it is allowed, but can block stored work. Startup has no previous definition to compare.
4. Inspect live tasks in every open project for the diagnostic baseline. Preparation failure anywhere means no catalogue, registry, default or options change anywhere. Imports themselves are not transactional. Skipped/unopened project stores are listed separately and are not claimed as updated.
5. In one synchronous publication turn, install each imported extension in every open project listing its name. Install even when the registry already has that name. Keep the same harnesses, locks and watches. Rebuild each project's default as CodingTools plus its available non-workflow extensions in Project order. Then replace the single catalogue snapshot containing modules and Options together. No await belongs inside publication.
6. Inspect projects again and return a report. Do not wait for sleeping tasks, run migrators eagerly or await workflow completion.

Preparation is all-or-nothing. Registry publication is not a distributed transaction. The new probe shows a subscriber can throw **after** its registry adopted the replacement. Unexpected application failure therefore reports which project/install was reached, marks restart-required and gracefully shuts down with failure. Do not claim rollback or keep accepting structural changes against a mixed generation. No automatic second install to pretend to undo effects.

Reload holds old and proposed modules, Options objects and the report in memory. It writes no generation, journal or Project change. A crash can leave tasks advanced under either definition. At restart the loader reads disk and each unchanged Project list, just as startup does today. This is recovery from current disk, not restoration of old code. Do not edit deployment trees during a scan; publish a completed directory/symlink update first.

The supplied measurements establish the handover: an old phase or tool finishes; later phases/requests use new definitions. Waiting and sleeping tasks also use replacements. Instructions already stored in pi.agent stay stored. Newly created conversations, newly rendered sections and newly generated inputs can use changed prose. Open decisions retain the accepted upgrade limit. Reload does not certify their meaning.

Use `harness.inspect(context)`, not the terminal-only `faults` scan, for every task whose inspection state is blocked/migration_failed. Include project, task ID, kind, conversation, stored/installed versions and safe error message. Inspect all live tasks, not just the new module's task list. Also report older live records without a replacement migrator as `migration-needed-on-reservation`. The probe found that an unmigratable timer still looks sleeping before due time. Do not print "all tasks migrated".

Pass a host `onReport` callback when opening stores. Print later migration_failed/task_outdated reports to server stderr with project/task identifiers. It is diagnostic, not durable authority. Each reload's inspection rediscovers current blockage; existing `faults` and its accepted limits stay unchanged.

CLI output has one line per added/replaced/retained extension with affected projects, one per blocked or migration-needed task, skipped projects, and totals. For example: `blocked p task=33 kind=w2.due version=1->2 migration_failed: no migration from 1`. No options values, tokens or complete module objects appear. Exit 0 means applied without warnings; 3 means applied with warnings; 1 means preparation refused with old code retained; 2 remains usage error. Lost admin replies mean unknown. Rerunning rescans; it is not receipt-based exactly-once reload. Refuse malformed requests, closing/degraded state, invalid permissions, aliases, module shapes, duplicates, incompatible structural changes and dry-install failures. A missing disk entry is a warning, not a removal request.

## 3. The packages' entry points

The one core npm package is `tau`, under `core/`.

- `tau`: the five functions from today's store root and Tau-owned decision/event/module types. No helper, store token or answer.
- `tau/server`: startServer, its types, requestAdmin and admin types. No openStore or answer. Production startup uses the loader, not a public modules map.
- `tau/testing`: openStore, Store, watchOpen, answer input/result types, and the faux `answer`. The wrapper has the real answer's parameters minus device. It calls the same private implementation with `!test`. That string cannot match DEVICE or TOKEN. It offers no identity override.
- The bin runs the current command internally. No wildcard exports or deep filesystem export.

`extension-package/` contains `tau-extension`. Its root has the five functions, four existing helpers, RoleSettings and Tau-owned types. `durable`, `schema`, `chord` contain explicit re-exports, never export-star. Initial durable values are defineExtension, defineTool, defineTask, defineDoc, defineDocFamily, defineEntry, configure, submit, hook, runEndTask, AgentDoc, GenerationTask, CodingTools, createRegistry, Harness and MemoryStorage. Also include LiveDoc and ReadAfterWrite. Durable types are Agent, AgentChange, Conversation, ConversationId, ConversationOwnership, Cursor, EntryId, EntryRecord, Extension, HarnessInspection, HarnessOptions, JsonObject, ModelRef, PhaseHandler, Registry, RunningTask, Storage, Submission, SubmissionDraft, Task, TaskId, TaskRecord, TaskRuntime, ToolExecutionApi, ToolExecutionResult, ToolRegistration and Tx. Schema contains arr, bool, compile, int, num, obj, str, oneOf, opt, lit, map, union, unknown, JsonSchema and Schema. Chord holds BACKGROUND_CONTEXT, applyImmutable, Context, Draft, JsonValue, Op and WatchHandle, sourced from their explicit pi subpaths. Do not re-export JsonValue again from durable.

`tau-extension/testing` re-exports tau/testing, NodeExecutionEnv, openNodeSqliteStorage, and pi-ai's createModels, fauxProvider, fauxAssistantMessage, fauxToolCall, fauxText, FauxResponseStep and the journey's AssistantMessage type. Keep those names out of every other author entry. Pi-owned types remain at their pi entry, not the root. Every symbol has one canonical author import. Both testing entries are explicit test-only capabilities. Production aliases exclude testing.

Extend `boundaries.json` and the existing TypeScript-AST checker. Discover workspaces from package.json, not a hard-coded packages directory. Preserve dependency checks, literal import/export/import-type checks, relative escape checks, test placement and CommonJS bans. Canonicalize relative targets, including symlinks, and forbid production access to test-entry implementations. Only facade src/testing.ts may re-export tau/testing. Check inherited compiler aliases too.

Core may depend on neither facade nor extensions. Extension production source may use only its own relative TS, Node builtins, the four production facade entries and declared non-Tau/non-pi dependencies such as Webfox. Raw pi, tau, another extension, testing, package deep imports and alternative spellings fail even if declared. Tests add only the facade testing entry and their own source. Journeys have a separate explicit test policy. The facade alone may re-export core and pi at listed entries. Core's private answer symbol is usable only by the host call implementation, testing wrapper and internal core tests. Resolve symbol aliases and namespace access. Check transitive public exports with the TypeScript checker, not a grep for the word answer. Add negative checker fixtures before altering it. These checks prevent accidents, not hostile code.

## 4. The repository

Root npm workspaces are `core`, `extension-package`, `extensions/*`, and private `journeys`. Keep one npm lock, Node 24, strict NodeNext TypeScript, Biome from nixpkgs, node --test and exact pi 1.5.2. Keep one shared dependency cache rather than invent lock projection now.

Move host/store/command into core/src/{host,store,command}. Preserve their private seams and stored names. Move kit to extension-package. Move three extensions intact to extensions/{websearch,w1,w2}. Each workspace has its own tsconfig and tests. Emit extensions and their tests into build output, copy Markdown, and run emitted tests as today. Deploy **src**, not emitted JavaScript. This preserves existing crash-child testing and permits jiti's non-erasable TypeScript. Own dependencies remain declared on their extension.

Websearch alone keeps Webfox 4.11.0 and the existing createWebfox root-library integration. Do not switch to its durable adapter or fix accepted key/proxy/redirect limits in this restructure.

`journeys/test` receives the real HTTP/process journeys. Populate each temporary server home with links/copies of the three actual TypeScript source directories and their dependency links. Use the loader, never import a production modules map. For local search, copy the actual websearch source and generate its entry calling the existing constructor with the loopback provider address. Keep its existing testing export for the journey's explicitly allowed tests.

Flake checks: `workspace` for lock/layout/import policy and lint; `core` for core typecheck/tests and installed bare-server smoke; `extension-package` for helper/types/exports and installed alias identity; one check each for websearch, w1, w2; `journeys`; and `spikes` for all six unchanged design spikes. Each check builds only its TS dependency closure. Core check must pass with sample source directories absent and no extension installed. Shared lock/cache metadata is not extension code and need not be pruned. Overall acceptance remains nix flake check on the candidate source.

Use separate core build and facade build derivations, then assemble the default installed tau application from both in a shared resolution tree. This does not add a core npm dependency on the facade. The core-only build starts empty without it. Default nix build ships bin/tau, core, the author facade and dependencies, but **no extension or sample prose**. Installed smoke asserts extensions=[] and exercises pairing, W0 and shutdown. Facade check exercises loading from an outside TS directory with no node_modules and verifies identical running objects.

A separate `sample-extensions` output contains source, prose and dependency links under w1/, w2/, websearch/. Journeys use this output too. The owner builds it and symlinks chosen directories into ~/.tau/extensions. Nothing installs there automatically. W1/W2 remain samples, not production promises.

## 5. The documents

Make these exact sentence replacements in the locked notes; leave historical arena files alone.

- host.md: "The import map is code." becomes "The server loads its extension catalogue from ~/.tau/extensions before opening projects." Replace "each listed extension that the import map has" with "each listed extension that loaded successfully". The extensions call table's source becomes "The loaded catalogue".
- extensions.md: "The host knows one module for each name, from an import map that is code." becomes "The loader checks one module per name from the server's extension directory."
- primitives.md: "The host maps each name to a module through static imports, so TypeScript checks them. The host does not scan a project directory for code to run." becomes "The host resolves each selected name from its runtime catalogue. It scans only the server's extension directory. jiti loads TypeScript; the extension's own check type-checks it."
- primitives.md: "`answer` is exported to the host only." becomes "The authenticated host calls private answer logic. Only the test-named entry exports a faux answer, which stamps !test."
- kit.md: replace its opening Decided paragraph with "The extension author's package is tau-extension, beside the core. Its root exports Tau's functions, helpers and types. Its durable, schema and chord entries are curated re-exports. The core never imports it." Keep helper admission rules and implementations unchanged.
- prose.md: "A missing file or a wrong slot then stops the server before the project opens." becomes "A missing file or wrong slot fails loader preparation: startup stops before projects open; reload retains the running generation."

Update current README package/layout rows and kit links to this terminology. Update AGENTS.md's Commands/Add a package sections, test-only allowance and gate instructions. Keep the 20-call table and protocol shapes unchanged. Add the reload contract above to host.md and deployment rules to extensions.md. In kit.md document the complete surface table, generated from extension-imports.json, with origin package/subpath beside every re-export. State plainly: "These are re-exports. They do not shield an extension from a change in pi-durable's behaviour."

## 6. The restructure

Each build unit starts by writing its failing contract checks. Only a human merges.

1. Add the author facade and faux wrapper in today's layout. Temporarily re-export today's store root and a new store/testing entry; move kit helpers unchanged. Convert sample imports. Check negative-import fixtures, identities, decision and helper tests. Existing host-only answer exposure is removed in step 3, not broadened.
2. Add loader preparation and replace static startup wiring. Move modules-based fixtures to a private journey workspace. Add source deployment outputs. First test duplicates, shapes, prose/import failures, actual JS refusal and Nix aliases. Check empty installed startup and all existing loaded journeys. Production no longer imports samples.
3. Move directories and collapse store/host/command into core. Establish tau/server/testing and remove old package exports. Retarget the facade, workspace discovery, TS references, assets, lock and flake checks. Check each workspace independently, boundary/export fixtures and all 283 tests. No temporary core-to-extension allowance survives.
4. Introduce the catalogue snapshot and structural queue. First test options/default freshness and bind/addExtensions ordering. Check host projects/options/create and journeys.
5. Add reload preparation/publication and public server-local operation. First test failed preparation retention, absent entries, queued reloads, old/new in-flight handover and Markdown replacement. Check reload and host tests, plus W1/W2 loaded journeys.
6. Wire admin/CLI schemas, delayed migration diagnostics and partial-publication shutdown. First test CLI outcomes, missing migration before/after due time, repair and subscriber failure. Check command/process tests and the full flake gate.
7. Apply sentence edits and author examples. Check examples compile and surface documentation matches, then final nix flake check on actual source.

All 283 existing tests remain obligations. Store and host tests move inside core; command/credentials tests and W0 smoke follow them. Kit tests move to the facade. Extension behavior and SIGKILL tests move with their extensions. W1/W2/search and cross-process journeys move to journeys. Change fixture imports and faux by assertions, not behavior assertions. Replace store/exports' privileged host-export assertion with server/testing exclusion and identity checks. Replace modules.test's static-map duplicate test with discovery duplicates; retain its real catalogue/schema assertion through loading. Installed smoke's bundled-extension/prose assertions become empty-core assertions plus sample-output journey assertions. Workspace fixtures change paths/policies, not escape coverage. Measure added test runtime separately. Baseline here passed 283/283 in 13.171 seconds; no new implementation or gate result is claimed.

## Tradeoffs, alternatives, questions

Accepted: one broken candidate prevents a batch; imports can have unrollbackable effects; native dependencies need restart; existing instructions remain pinned; publication is not crash-atomic. Shared dependency caching retains unrelated downloaded dependencies, but not extension imports in core.

Rejected: per-extension best effort leaves projects on an unexplained mix. Reopening projects interrupts work and streams without updating persisted instructions. Wildcard pi exports lose the single import vocabulary. Moving helpers into core evades their admission rule. Journaling generations would imply code rollback that stored effects cannot provide.

Questions: Should the public package name be tau-extension before publication? Should a later owner-facing client show migration-blocked work, under a separate admission proposal? When will Linux and sandboxed Nix verification become available? None changes this design's server-local command or current protocol.
