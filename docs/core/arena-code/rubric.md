# Code architecture arena: rubric (picker and judge only)

Score each criterion 0 to 5.

1. **Fidelity to the locked design.** Every shape the design fixes appears unchanged. Nothing is added to the core. Nothing deferred or dropped is designed. A doubt about the design is raised as a question with evidence, not resolved by a quiet change.
2. **Boundaries enforced by the build.** A wrong import (core to kit, extension to `answer` or host internals, any import of a package's internals) fails `typecheck` or `lint`. Shown, not asserted.
3. **Depth and reader load.** The fewest packages, files, and layers that still satisfy criterion 2. One list of the 20 calls with everything else derived. A short path from an HTTP request to a commit. Screen against `architect/references/design-red-flags.md`.
4. **Builds unit by unit.** The store layer stands and is tested alone. Each later unit adds files without restructuring an earlier one. Each kit helper lands with its first caller.
5. **Toolchain proven.** How TypeScript runs under `node --test` and in the server, across two packages, is backed by a probe that ran. It fits a flake that builds `node_modules` from the lock file.
6. **Tests attach at honest seams.** Each layer's failure-list tests have a named seam and home. Crash tests can kill a real process. No test-only switch in production code.
