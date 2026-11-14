# Unit R10

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Extension package exports | Keep exports that point to absent output. Point them at source. Remove them. | Remove them. | No caller imports an extension package. The loader and journeys use `src/`. Candidate 1 also specifies private extensions with no exports. |
| TypeScript build metadata | Keep it in extension `dist/`. Put it in the ignored dependency cache. | `node_modules/.cache/tau-<name>.tsbuildinfo`. | `tsc -b` still records build state. This keeps every extension free of `dist/` without changing root ignore rules. No JavaScript, declarations, or maps are emitted. |
| Source test and asset selection | Keep another extension name list. Read `noEmit` from each package config. | Read `noEmit`. | The same explicit setting controls type checking, test execution, and asset copying. No inherited setting or new config helper is needed by these packages. |
| Flake outputs and journeys | Change their source links. Keep the R9 setup. | Keep the R9 setup. | They already use source folders. The full `check`, including journeys and installed outputs, passed with `.ts` specifiers. No flake change is needed. |
| Package lock | Regenerate it after removing exports. Keep it. | Keep it. | Exports are not lock metadata. `check-lock.mjs` passes and dependencies did not change. |
| Existing local build output | Delete it automatically during a check. Leave cleanup to the migration. | No automatic deletion. | A clean checkout creates no extension output. The baseline's generated directories were moved to `/tmp/r10-emitted-baseline.h64b2P` before verification. |

## Source conversion

Changed 46 relative specifiers or child fixture paths in 24 files. Tests and child fixtures now use `.ts`. The three configs retain their reference to `packages/extension` and enable `noEmit`, `allowImportingTsExtensions`, and `erasableSyntaxOnly`.

No non-erasable constructs required rewriting. All three extensions passed `erasableSyntaxOnly` without a behavior change.

## Tests first

The test commit preceded the implementation. `node --test tools/workspace.test.mjs` first reported:

```text
ℹ tests 103
ℹ pass 89
ℹ fail 14
```

Failures covered the six relative-specifier cases, source test execution, asset copying, and no-output and enum checks for each extension. Existing type-error and misplaced-test protection passed before the implementation and remains covered.

After the implementation, the same command reported:

```text
ℹ tests 103
ℹ pass 103
ℹ fail 0
ℹ duration_ms 13798.185209
```

The 18 new names are:

- `extensions require .ts relative specifiers: import "./local.js";`
- `extensions require .ts relative specifiers: export { value } from "./local.js";`
- `extensions require .ts relative specifiers: const value = import("./local.js");`
- `extensions require .ts relative specifiers: type Value = import("./local.js").Value;`
- `extensions require .ts relative specifiers: import "./local";`
- `extensions require .ts relative specifiers: import "./local.mts";`
- `source extensions reject tests outside the runner's discovery pattern`
- `noEmit tests run source with types and prose, select nested files, and propagate failure`
- `assets preserve emitted prose and leave noEmit packages without dist`
- Each of `websearch`, `w2`, and `w1`, followed by `typecheck enforces no output`, `typecheck enforces type errors`, and `typecheck enforces non-erasable syntax`.

The runtime checks invoke the existing tools on temporary fixture trees. The config checks invoke the real compiler with each extension's config and a temporary source file. They retain the real reference to the emitted author package.

## Negative probes and mutations

Temporary W2 files exercised the real commands, then were removed. Type errors, enums, and misplaced tests ran through `nix develop -c typecheck`. The failing test ran through `nix develop -c env test tau-w2`.

```text
type error: exit=1
error TS2322: Type 'string' is not assignable to type 'number'.
enum: exit=1
error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
failing source test: exit=1
Error: R10 source failure
undiscovered source test: exit=1
tests must live in <pkg>/test/**/*.test.ts
```

Each mutation changed one implementation line, ran its focused tests, and restored the line before the next mutation:

| Mutation | Result |
| --- | --- |
| Disable the relative `.ts` boundary condition. | Exit 1, all six specifier regressions failed. |
| Force the runner to select emitted paths. | Exit 1, the source execution regression failed. |
| Disable the noEmit asset skip. | Exit 1, the no-dist prose regression failed. |

Logs are `/tmp/r10-red.log`, `/tmp/r10-green.log`, `/tmp/r10-negative-probes.log`, and `/tmp/r10-mutation-{relative,runner,assets}.log`.

## Verification before the clean-checkout gate

`nix develop -c check` passed lint, type checking, 473 tests, all six spikes, and installed verification. The baseline passed 455 tests. No existing name was removed or renamed.

All 106 extension tests passed before and after. The normalized names match, including the nested W1 tests. One combined run of the three extensions took 3372.925 ms before and 3632.224916 ms after, as reported by Node. These are single-run observations on a shared machine, not a speed comparison. Both runs executed all tests without skips or failures. The source run includes the crash children and real SQLite recovery tests.

The installed verification reported:

```text
empty extensions []
models HTTP 200; paired device listed
SIGTERM exit 0
extension source and Markdown installed
loaded w1, w2, websearch with options schemas
project missing []; W2 conversation created without a model call
models HTTP 200; paired device listed
SIGTERM exit 0
```

After the full check, no `dist` directory exists under the three extensions. Full local output is in `/tmp/r10-check.log`. Fresh-checkout gate and forced-rebuild results belong to the final handoff report, so this note does not claim them before they run.

Linux and other architectures were not tested. R8, reload commands, directory moves, and core package changes are outside this unit.
