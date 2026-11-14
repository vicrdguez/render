# Layout, loading, and reload

**Decided.** The owner made these decisions on 2026-11-14 and 2026-11-15, after reading the built layout. They replace parts of [Extensions](extensions.md), [Host](host.md), [Kit](kit.md), [Primitives](primitives.md), and [Code arena](arena-code.md). [Loader arena](arena-load.md) records how the details were chosen. The detailed design is `arena-load/candidate-2/design.md`. Where this note differs from it, this note wins.

Nothing here changes the 20 calls, the protocol, devices, projects, options, or the accepted limits.

## What the owner decided

1. **Three sides, kept apart.** The core, the extension package, and the extensions are separate top-level directories in one repository: `core/`, `extension-package/`, and `extensions/`. Journeys through a real server are in `journeys/`. Each side has its own check in the flake. The core's check passes with no extension present.
2. **One core package, `tau`.** Store, host, protocol, the `tau` command, and the loader. The store and the host are never used apart. `answer` is exported from no entry point.
3. **A faux answer for tests.** `fauxAnswer` is the real `answer` logic with the fixed identity `!test`, which no paired device can have. It is exported only from a testing entry. A test of a workflow needs no server.
4. **The core knows no extension.** `tau` loads extensions at run time from `~/.tau/extensions/`, with `jiti` and aliases, as the pi coding agent does. A client never names a path or a package. This replaces "the import map is code".
5. **Extensions import what they need.** An extension is a module that exports `extension`, and optionally `options` and `entry`. Nothing is passed in.
6. **`tau-extension` is the one package an extension imports.** It replaces `tau-kit`. Its root has Tau's own things: the five functions, the helpers `options`, `modelRef`, `prose`, `role`, and Tau's types. It has one more entry for each pi package, with a curated list of re-exports: `tau-extension/durable`, `tau-extension/schema`, `tau-extension/chord`. Each name can be imported in exactly one way. It depends on the core. The core never imports it.
7. **The re-exports are called what they are.** Each is listed with the pi package it comes from. They give one import surface and one version. They absorb a rename. They do not shield an extension from a change in pi-durable's behaviour.
8. **`tau extension reload`.** One admin command on the server machine rescans the directory, imports each extension again, and installs or replaces it in every open project that lists it. It covers a new extension, changed code, and changed prose. A restart is the fallback. There is no removal, no reopening of one project, and no separate re-read of prose.

## The owner's answers on the details

| Question | Answer |
| --- | --- |
| One extension is broken when the server starts | The server starts with that extension missing and says so on stderr. A project that lists it shows it in `missing`. This overrides the base design, which refused to start. |
| What TypeScript an extension may use | Only syntax that needs no build, so no `enum`. Tests and the server run the files the owner edits. Extensions are not emitted. |
| A reload that drops a task kind, lowers a version, or removes a phase at the same version | Refused, also when no live task needs the old definition. A restart is how something is removed. Task names are unique across everything the server has loaded. |
| A restart that loads code without a phase a stored task waits in | Allowed. The task then faults for good. An accepted limit: a restart has no old code to compare with. |
| A project whose store was skipped at start | Reload updates the open projects and names the skipped one. |
| A new options schema that no longer marks a stored value as secret | An accepted limit. No machinery. Tau is a personal tool on private machines, and a key in an environment file is as readable. |
| Two extensions with the same tool name | The last one selected wins. Nothing reports it yet. |

## Taken from the other candidate

- `jiti` runs with `fsCache: false` and `moduleCache: false`. Its file cache would write transformed code under the system's temporary directory and run it later (measured, `arena-load/candidate-1/probe/`).
- `tau-extension/testing` is aliased to a module that throws, so a loaded extension cannot import the faux answer at run time.
- The alias table comes from the `exports` map of `tau-extension`'s `package.json`. There is no second list.
- An extension in the directory is a folder with an `index.ts`. There is no single-file form.
- Extensions and journeys are type-checked with `noEmit` and `erasableSyntaxOnly`, and their tests run from source with Node's own type stripping. The core and `tau-extension` are emitted (measured: W2's 17 tests, six of them with `SIGKILL`, pass from source).

## Reload, in order

1. **Prepare.** Check the directory's permissions. Find each folder, import it, and check its name and shape. Build the new catalogue from the current one plus what was found. An extension that is gone from the directory stays loaded, with a warning.
2. **Check.** Install everything into a scratch registry. Refuse a task name that two extensions share, a dropped task kind, a lowered version, and a phase removed at the same version.
3. **Refuse or go on.** If anything in steps 1 and 2 failed, nothing changes, the old code keeps running, and the command says why.
4. **Publish**, in one step with no waiting inside it: install each extension in every open project that lists it, rebuild each project's default selection, and swap the catalogue and the options together.
5. **Report.** One line for each extension that was added, replaced, or kept. One line for each task that is blocked, or that will block when it next wakes because its version rose with no `migrate`. One line for each skipped project.

One queue orders reload with `bind`, `addExtensions`, `options`, `setOptions`, and `create`. Model requests, tools, tasks, and answers are not in that queue and keep running. If publishing fails part way, the server stops and says that a restart is needed. It does not roll back.

Reload writes nothing to disk. After a crash the next start loads what the directory holds.

## Measured, and behind these choices

All in `arena-load/probe-report.md`, on Node 24.22.1 with `jiti` 2.7.0.

- An extension outside the repository, with no `node_modules`, gets the host's own `request`, `defineTask`, and `obj` through aliases, in about 62 ms. Each entry needs its own alias.
- Aliases reach TypeScript files only. A `.js` file inside an extension gets its own copy of a pi package and is not read again on reload. So the loader refuses an extension that holds one.
- Installing an extension under a name that is already installed replaces it. A tool call or a task phase in flight ends with the old code. The next one uses the new code. A waiting task wakes under the new code.
- A stored task whose version rose runs `migrate` when it is next reserved. With no `migrate` it stays blocked.
- A conversation keeps the instructions stored when it was created. New prose reaches new conversations and newly rendered inputs.

## Not settled by measurement

A crash in the middle of step 4, and two reloads at once. The design does not lean on either: step 4 holds no state on disk, and reloads wait in one queue.
