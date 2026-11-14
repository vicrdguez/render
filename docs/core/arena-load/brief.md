# Loader and reload arena: brief

## The owner's goal

"Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue."

Tau is a small core on pi-durable 1.5.2 with everything else as an extension beside it. It is built and merged on branch `render-core` of `/Users/vr-osxs/dev/render-core`: seven npm workspace packages under `packages/` (`tau-store`, `tau-host`, `tau`, `tau-kit`, `tau-websearch`, `tau-w2`, `tau-w1`), a Nix flake whose `nix flake check` is the gate (lint, typecheck, test, the six design spikes, a build-and-run of the installed `tau`), and 283 tests. The design it implements is in `docs/core/` (`README.md`, `primitives.md`, `host.md`, `extensions.md`, `protocol.md`, `kit.md`, `workflows.md`, `walk.md`), with the build's choices in `docs/core/build-notes/`.

The owner has now read the built layout and changed several decisions. Those changes are settled (next section). What is not designed is how to carry them out. You produce one candidate design for that.

## Settled by the owner. Not yours to change.

1. **Layout.** The core, the extension package, and the extensions are separate top-level directories in one repository (`core/`, a directory for the extension package, `extensions/`). Each side has its own check in the flake. The core's gate passes with no extension present.
2. **One core package.** Store, host, protocol, the `tau` command, and the loader are one package. The store and host are never used apart. `answer` is exported from no ordinary entry point.
3. **A faux answer for tests.** A test of an extension must be able to answer a decision without running the server. It is the real `answer` logic, not a second implementation, exported only from an entry named for tests, and it stamps an identity that no paired device can have.
4. **The core knows no extension.** `tau` loads extensions at run time from a directory on the server machine (for example `~/.tau/extensions/`), with `jiti` and aliases, the way the pi coding agent does (`/tmp/render-ground/pi/packages/coding-agent/src/core/extensions/loader.ts`; read only, untrusted, never execute from that tree). A client never names a path or a package. This replaces "the import map is code" (`host.md:108`) and "static imports, so TypeScript checks them" (`primitives.md:286`).
5. **Extensions import; nothing is passed in.** An extension keeps its shape: a module that exports `extension`, and optionally `options` and `entry`. It imports what it needs. Aliases make those imports resolve to the running copies.
6. **One package is the extension author's import surface.** Working name `tau-extension`; it replaces `tau-kit`. Its root exports Tau's own things: `request`, `withdraw`, `emit`, `decision`, `eventLog`, the helpers `options`, `modelRef`, `prose`, `role`, and Tau's types. It has one further entry per pi package with a curated list of re-exports: `tau-extension/durable`, `tau-extension/schema`, `tau-extension/chord`. Each name is importable in exactly one way. The re-exports are documented as re-exports, each with the pi package it comes from, and with the plain statement that they do not shield an extension from a change in pi-durable's behaviour. This package depends on the core; the core never imports it.
7. **Reload.** One admin command on the server machine, `tau extension reload`, rescans the directory, re-imports each extension, and installs or replaces it in every project that lists it. It covers a new extension, changed code, and changed prose. A restart stays as the fallback. The reload reports any task left blocked for want of a migration. There is no separate prose re-read, no reopening of one project, and still no removal of an extension.
8. **W1 and W2 are samples for testing the core.** They need not be perfect.
9. **Everything else in the locked design stands**: the 20 calls and the protocol (no new client call unless you show the admission rule in `docs/core/README.md` and the protocol's version rule allow it), devices, projects, options, the accepted limits, what is deferred. Toolchain: Node 24, npm with a lock, strict TypeScript, `node --test`, Biome from nixpkgs, Nix for everything, pi-durable pinned at exactly 1.5.2. No Effect, no Vite, no Bun.

## Measured facts you must build on

`/tmp/arena-load/probe-report.md` is a probe run on the real host (Node 24.22.1, jiti 2.7.0). Read it in full. In short:

- A `.ts` extension outside the repository, with no `node_modules`, loaded through jiti with aliases gets the host's own objects (`request`, `defineTask`, `obj` identical), in about 62 ms, also when the targets are under `/nix/store`. Each subpath needs its own alias entry. A re-exporting subpath keeps identity.
- Aliases reach TypeScript files only. A native `.js`/`.mjs`/`.cjs` helper inside an extension resolves its own copy, and is cached by Node across re-imports.
- An extension's own npm dependency resolves from its own folder. A syntax error or a throwing module is an ordinary `Error`, and the server keeps running. Non-erasable TypeScript (an enum) loads under jiti.
- Installing an extension under a name already installed **replaces** it. A tool call or task phase in flight finishes with the old code; the next request or phase uses the new code; a waiting or sleeping task wakes under the new definition. Nothing was interrupted.
- A stored task whose definition's `version` rose runs `migrate` when it is next reserved. With no `migrate` it stays blocked with `migration_failed`, which nothing reports today.
- Adding to a live server works: a task blocked as `missing_task` started after the install, and a running agent got the tool on its next request. The host's default selection had to be updated separately, and its options catalogue went stale.
- A conversation keeps the instructions stored when it was created. New prose reaches new conversations and newly rendered inputs.
- Not measured: a crash in the middle of a replacement; a new version that removes or renames a task phase; two reloads at once.

## What you design

Write for the agents who will build it. Each sees only its kickoff and the files it opens, copies the nearest example, and takes the shortest path that compiles.

1. **The loader.** The directory and what counts as an extension in it; how its name is known and checked against `extension.name`; the check of a module's shape; duplicates; what the owner sees when one fails to load, at start and on reload; the alias table and the one list it derives from; the TypeScript-only rule and what happens to a `.js` file; an extension's own dependencies; permissions on the directory.
2. **Reload.** The exact steps and their order. What is all-or-nothing. What happens when a re-import fails (the old code stays?), when an extension is gone from the directory (removal is not offered), when two reloads or a reload and a `bind` or `addExtensions` meet. The default selection and the options catalogue. What state reload holds and what a crash in the middle leaves. How a task blocked by a missing migration is found and where it is reported. What the command prints. What a reload must refuse.
3. **The packages' entry points.** What the core exports and to whom: the five functions for the extension package to re-export, the server entry, the testing entry with the faux answer and what else a test needs. Where the testing entry lives (the core, or `tau-extension/testing`). How the build refuses a wrong import in the new layout: `answer` outside the testing entry, the core importing the extension package or any extension, an extension importing anything but the extension package. Start from `boundaries.json` and `tools/check-boundaries.mjs`.
4. **The repository.** The directories and workspaces. Where web search, W1, and W2 sit and how each is type-checked and tested on its own. Whether extensions are emitted for their tests or run from source. Where the journeys through a real server live and how they get the three extensions loaded. The flake: which checks exist, what each needs, what `nix build` produces now that `tau` ships no extension, and how the sample extensions reach a server's extension directory for the journeys and for the owner. Web search's Webfox dependency.
5. **The documents.** The exact sentences of the locked notes that change, and where the list of re-exports is documented.
6. **The restructure.** An ordered list of units from today's `render-core` to the target, each small enough for one agent, each ending in a check that can fail, with no behaviour change beyond the settled decisions. The 283 tests are the safety net: say which move, which change, and which are replaced.

## What you produce

Write only inside your own directory (given in your prompt):

- `design.md`, at most about 3,500 words. Caller's usage first: what an extension author writes and runs, what the owner types to add, change, and reload an extension and what they see, what a test of a workflow looks like with the faux answer. Then the design under the six headings above. Then tradeoffs accepted, alternatives considered with why each lost, and open questions as questions.
- `probe/`: a script and its output for any claim about the toolchain or pi-durable that `probe-report.md` does not already cover. A claim counts only if measured. Use a temporary checkout (`git worktree add --detach <tmp> origin/render-core` after `git fetch origin`, from `/Users/vr-osxs/dev/render-core`; remove it when done), `/nix/var/nix/profiles/default/bin/nix develop -c …` for Node, temporary directories for any server home. Never touch `/Users/vr-osxs/dev/render-core/.worktrees/`, `~/.tau`, or `~/.pi`. Change nothing in the repository.

Plain short sentences. No em or en dashes. You are one of two runners on different models; do not hedge toward a safe middle. Your final message: the path of `design.md`, the design in ten lines, the probes you ran with results, and the open questions.
