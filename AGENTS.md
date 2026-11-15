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

Run commands through `/nix/var/nix/profiles/default/bin/nix develop -c <command>` or `/nix/var/nix/profiles/default/bin/nix run .#<command>`.
The shell manages root `node_modules`. Move an unmanaged directory aside first. No install step is needed.
Use `fmt` for formatting and `lint` for workspace checks. `typecheck`, `test`, and `check` accept a side (`core`, `extensions`, `e2e`), package name, or test file. No argument selects everything. Use `env test` in an interactive shell to avoid its builtin.
`check` without arguments includes `verify-build`, which exercises the installed server and extensions.
The acceptance gate is `/nix/var/nix/profiles/default/bin/nix flake check -L`.
Use `install-extension --home <temporary-directory> <name>` to try an extension without changing the user's Tau home. The flake sees only tracked files.

## Layout

`core/` is the `tau` package. Its store, host, command, and author helpers live under `core/src/`. `extensions/` holds W1, W2, and web search. `e2e/` holds real-server tests. `tools/` holds development commands.
Read [the design](docs/design.md) for layer boundaries, [extensions](docs/extensions.md) for author and loader rules, and [the export tables](core/README.md) for public entries.

### Add an extension package

Create its directory under `extensions/` with `package.json` and `tsconfig.json`. Add it to root TypeScript references and `boundaries.json`.
Update the lock inside `nix develop -c` with `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`.
Tests live under `<pkg>/test/`. Declare test-only dependencies in `devDependencies`.
Set `noEmit`, `allowImportingTsExtensions`, and `erasableSyntaxOnly`, and reference `core`. End relative TypeScript imports with `.ts`. Read Markdown beside the source module. The server loads `src/index.ts`, not a package export.

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
