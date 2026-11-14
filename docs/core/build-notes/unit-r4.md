# Unit R4

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Source contract, no concrete type in candidate 2 | A callback can return typed modules or imported values. | `ExtensionSource` returns `ExtensionScan`, directly or by promise. `modules` maps names to unknown values. `failures` holds name, optional path, stage and error. | The host checks imported values. A static map and a later directory scanner both fit. A source uses the path as the name when there is no logical name. |
| Startup failures, candidate 2 section 1 versus load.md | Abort startup or omit a broken module. | Omit it and print one line. | load.md wins. Projects see the same missing name as absent code. |
| Candidate order at this boundary | Sort again or preserve the source order. | Preserve source order. The first accepted owner of a task name stays. A later conflicting module is omitted. | R4 must not change the static command's catalogue order. Its existing host catalogue test asserts that order. R5 can return discoveries in name order. |
| Options schema, candidate 2 section 1 | Any object schema or a closed object schema. | Require type object and additionalProperties false, then construct the existing Options class once. | The detailed design explicitly says closed object. Compilation and custom model formats remain owned by Options. |
| Object exports, verdict wrong-shape row | JavaScript arrays and null count as objects, or only non-null non-array objects do. | Refuse null and arrays for extension, options, schema and entry. | These exports are records, not sequences. Entry objects receive no deeper validation. |
| Definition checks, verdict wrong-shape row and point 3 | Validate every nested member or use pi's install boundary. | Use a disposable registry holding CodingTools and accepted extensions. | No second Extension checker. Failed installs have no subscribers and do not change that registry's state. |
| Source rejection | A thrown source error is a candidate failure or a broken source contract. | Sources return candidate failures as data. A thrown or rejected scan still rejects startup. | A scanner can identify each bad candidate. R4 does not invent a policy for a scanner that cannot return its result. |

## Validation boundary

The host refuses invalid or reserved names, missing or mismatched extension exports, malformed outer options contracts, noncompiling schemas, and non-object/non-function entries. Scratch installation also refuses duplicate tools within one extension, invalid/reserved/duplicate section keys, malformed structures it cannot iterate, and task-name collisions including built-in task names.

It does not type-check author code. Missing nested tool execute functions, bad task handlers, invalid AgentChange fields, entry return values, get/set bodies, migrations, and schema mistakes accepted by pi-schema remain author errors. For example, pi-schema accepts an unknown type keyword; the noncompiling fixture instead has a scalar property schema. No entry, get, set or migration is called during checks. Cross-extension tool duplicates remain allowed. The last selected Project provider wins without a warning.

## Test inventory

Before, the normal test command passed 283 tests. The prescribed top-level name filter saved 249 names in `/tmp/r4-before.txt`.

The only removed name is `a module map key that differs from its extension name stops the start`. Its replacement is `a module map key that differs from its extension name is reported and left out`. The owner changed startup from fatal to best effort.

The 23 new tests are in `packages/host/test/source.test.ts`.

Nineteen names start with `startup reports and leaves out ` and end with the following text:

- a name outside the extension grammar
- the reserved coding-tools name
- a missing extension export
- a null extension
- an array extension
- null options
- array options
- options without a schema
- options without callable get
- options without callable set
- a non-object options schema
- an open options schema
- an options schema that cannot compile
- a scalar entry
- a null entry
- an array entry
- a shared task name
- duplicate tools in one extension
- a reserved section key

The other four names are:

- startup calls an async source once and reports its failures once
- startup checks do not execute entry, get, set, or migrations
- a task of a broken extension waits and runs after restart with good code
- cross-extension tool collisions use the last Project selection without a warning

The tests were committed before production changes. The initial focused run had 29 tests, 7 passed and 22 failed. See `/tmp/r4-red.log`. The two already-supported protections, no author callback invocation and Project-order tool selection, passed before the change.

Three independent source mutations were emitted and tested, then restored. Reversing the extension-name comparison failed 23 tests. Skipping Options construction failed 2 tests. Skipping the scratch install failed 3 tests. Logs are `/tmp/r4-mutant-name.log`, `/tmp/r4-mutant-options.log` and `/tmp/r4-mutant-install.log`. The restored source suite passed 23 tests in 411.801167 ms. This is test-runner duration, not a startup benchmark.

The last full emitted-runtime run passed 306 tests, with 272 top-level names. `/tmp/r4-after-runtime.txt` differs from the before inventory only by the named replacement and the 23 additions. `/tmp/r4-after-runtime.log` holds the output. The real command and W0, W1, W2 and search journeys pass. No test assertion in those journeys changed.

## Scope blocker

`packages/host/test/devices.test.ts:227` calls `startServer` with `modules`. R1 owns that file and the unit brief forbids touching it. R4 migrated every other caller. The owner was asked to have R1 change that call to `source: () => ({ modules: {}, failures: [] })` or authorize the one-line edit.

Typecheck currently stops only at that call:

```text
packages/host/test/devices.test.ts(227,31): error TS2353: Object literal may only specify known properties, and 'modules' does not exist in type 'ServerOptions'.
```

The 306-test runtime result is not a green normal test command or acceptance gate. It used `node tools/tests.mjs` on emitted output after TypeScript emitted with that error. The direct devices call currently rejects for a missing source, so that assertion is not valid evidence of the home-lock refusal until R1 migrates the call. No compatibility API was added to hide the blocker.
