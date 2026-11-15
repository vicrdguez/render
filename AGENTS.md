<!-- dev-pipeline:start -->
## Workflow

Only a human merges to `main`.

## Simplicity

Choose the least complexity that satisfies the accepted scope, repository standards and required verification. Preserve invariants, error handling, security and accessibility. When a simpler approach would change the agreed behavior, raise the trade-off before reducing scope.

- **Understand and reuse.** Trace the affected behavior and its callers first, and fix causes at the boundary responsible for them. Before adding a mechanism, look for existing code, standard-library and platform features, and installed dependencies, and check that a candidate meets the required semantics and failure modes.
- **Justify structure.** Add abstractions, configuration, dependencies and test infrastructure for concrete current needs. Prefer the approach that leaves less for callers and maintainers to understand over the one with the fewest lines. Apply the deletion test while preserving behavior: if removing an abstraction removes complexity, simplify it; if it spreads responsibilities into callers, keep those responsibilities together. A boundary can earn its keep through encapsulation or testability, even with one production implementation.
- **Keep tests direct.** Test observable behavior at the agreed seams with the project's existing test tools, direct setup and expected results independent of the implementation. Keep each test that protects against a distinct meaningful regression. Simplify repeated setup and incidental coupling to the implementation. Remove a test only when its behavioral and failure-mode protection stays covered at the appropriate interface.
- **Review concrete alternatives.** Judge a simplification by the burden it removes: name the simpler alternative, the burden it removes, and why behavior and verification stay intact. A code-smell name alone does not justify it. Keep cleanup within the change's scope, and raise unrelated opportunities separately.
- **Before adding complexity** for a speculative or vanishingly unlikely race or security edge case, explain the concrete failure mode, likelihood, and complexity cost to the user and get their buy-in. Do not silently expand scope for theoretical robustness.

**Remember**: the best code is the code that was never written.
<!-- dev-pipeline:end -->

## Commands

From any repository directory, run `/nix/var/nix/profiles/default/bin/nix develop -c <command>` or `/nix/var/nix/profiles/default/bin/nix run .#<command>`.
The shell creates a managed root `node_modules` directory. External dependencies link to the read-only Nix store, and workspace names link to this checkout. An existing unmanaged directory is refused. Move it aside first. No install step is needed.
`fmt` formats with Biome and nixfmt. `lint` checks the lock, Biome, and Nix formatting. `typecheck` checks the lock and import boundaries, then runs `tsc -b`. Core packages and `tau-extension` emit JavaScript. Extensions are checked without emitting code.
`test` runs `typecheck`, then runs extension tests from TypeScript source with Node's type stripping and emitted tests for the other packages. Use `/nix/var/nix/profiles/default/bin/nix develop -c env test tau-w2` for one extension. Use `/nix/var/nix/profiles/default/bin/nix run .#test -- tau-store` for one package, or `/nix/var/nix/profiles/default/bin/nix run .#test -- packages/store/test/decision.test.ts` for one file. File paths may also be relative to your current directory. In an interactive shell, use `env test` to avoid the shell's `test` builtin.
`install-extension` lists this repository's extensions and marks those installed. `install-extension w2` builds its source output and replaces `~/.tau/extensions/w2` with a Nix store link that is a garbage-collection root. Use `--home <dir>` for a temporary Tau home. The flake sees only tracked files. Installation reloads a running server on that home and prints its report. Without a server, the extension loads at the next start. Use `tau extension reload` after a code or Markdown edit. Exit 0 means applied, 3 means applied with warnings, 1 means refused or restart required, and 2 means a usage error. The server loads each `<home>/extensions/<name>/index.ts` and its module-relative Markdown, not an extension bundled with the command. A source checkout can also be linked by its `src/` folder, but the installer uses a store snapshot so unfinished edits do not reach the server.
`spikes` runs the six unchanged design spikes. `verify-build` starts the installed `tau` with an empty extension directory, links the three extension outputs while it runs, and checks three `added` lines from `tau extension reload`. It then replaces W2 with a Markdown-edited copy and checks a `replaced` line. It checks schemas, prose, pairing, projects, models, a W2 conversation, and clean SIGTERM exits on an ephemeral port with a temporary home. In the dev shell, it builds the outputs on demand with `nix build`. `nix run .#verify-build` and the flake check pass the built executable and extension outputs directly. Opening the shell does not build the package. `check` runs `lint`, `typecheck`, `test`, `spikes`, and `verify-build`. Each command has a ten-minute limit, with ten seconds to kill a process that does not stop.
`/nix/var/nix/profiles/default/bin/nix flake check -L` is the acceptance gate. It runs all five checks on the candidate source in writable copies. The `verify-build` check has the macOS local-networking allowance and exercises the installed package.

### Add a package

Create its directory under `packages/` with a `package.json` and `tsconfig.json`.
Add the package to the root `tsconfig.json` references and to `boundaries.json`.
Update the lock with `npm install --package-lock-only`.
Tests live in `<pkg>/test/*.test.ts`; nested directories under `test/` are allowed.
Extensions import Tau and pi names only through `tau-extension`, `tau-extension/durable`, `tau-extension/schema`, and `tau-extension/chord`. Tests may also import `tau-extension/testing`. Other imports stay within the extension, Node built-ins, or its declared non-Tau, non-pi dependencies.
Declare test-only dependencies in `devDependencies`.
Extension `tsconfig.json` files set `noEmit`, `allowImportingTsExtensions`, and `erasableSyntaxOnly`, and reference `packages/extension`. Use erasable TypeScript, with explicit fields instead of constructor parameter properties and plain objects or unions instead of enums. Every relative import or re-export, including in tests, ends in `.ts`. Crash fixtures run as `.ts` files. Read Markdown beside the source module; no extension `dist/` is built or copied. Extensions are loaded by their `src/index.ts`, not a package export.

## Rules

- NEVER write unit tests after you write code
• If you must test a system in isolation, FIRST write all the ways it cold fail, THEN write the    code

## Fast developer feedback

Separate the edit loop from acceptance verification. Use focused checks while iterating; run the required cumulative gate at the workflow’s verification boundary on the actual candidate source.

- **Select deliberately.** Inspect what a test command runs before invoking it. Choose the smallest set that covers the changed behavior, its affected callers and relevant failure modes—not merely the changed files.
- **Expand with cause.** Broaden checks when changes cross boundaries, touch shared infrastructure or leave impact uncertain. A focused pass is not evidence that the full suite passed.
- **Avoid redundant runs.** During iteration, run overlapping checks once and rerun when relevant source, dependencies, configuration or environment changes. Preserve required source-specific verification at handoff.
- **Keep expensive checks intentional.** Run load, repeated-fault, platform and infrastructure checks when the change affects their guarantees or the required gate calls for them, rather than after every edit.
- **Preserve evidence.** Reduce unrelated setup, wasted waits and duplicate execution—not assertions, meaningful failure triggers or required real-system boundaries. Report what ran, what did not and any remaining verification required.
- **Budget new coverage.** When adding or substantially changing tests, measure their runtime and consider their impact on the default test command. Use the least expensive existing seam that faithfully exposes the failure; reserve broader integration checks for guarantees that require those boundaries.
