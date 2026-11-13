# Build notes for unit K

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Kit dependency declarations | Declare test imports as development dependencies. Or use dependencies as the sketch does. | Declare Chord and pi-ai as development dependencies. | The refreshed workspace base supports test-only dependencies and requires this declaration. Production imports only pi-durable, pi-schema, and Node. No new library is added. |
| Markdown after emit | Copy source Markdown only. Or also copy test Markdown beside emitted test modules. | Copy both source and test Markdown with the same relative paths. | The emitted fixture must test module-relative loading without putting test prose in production source. |
| Asset build entry | Change the root build script. Or extend the flake typecheck command that already emits TypeScript. | Copy assets after the flake typecheck command emits. | Build, test, check, and the gate already use that command. No second build path is needed. |
| Prose slot names | Restrict names to an identifier grammar. Or match the exact text inside each complete double-brace slot. | Match exact names and compare sets. Repeated slots are allowed. | The design fixes the delimiters but no identifier grammar. There is no template language or recursive substitution. |
| Prose facts | Validate typed internal facts again at render time. Or require the declared string fields in TypeScript. | Require the fields in TypeScript. | Extension code supplies facts. Files are checked at load. Render does no file access or second validation. |
| Invalid model strings | Add a new rejection rule to modelRef. Or keep the string cut in the sketch and spike. | Keep the string cut. | The host checks model availability. The helper receives a provider and model ID separated by a slash. Behavior outside that input contract is not promised. |
| Options defaults and document shape | Store filled defaults. Or keep only explicit keys and fill defaults during read. | Keep a version 1 session document with no wrapper and no checkpoints. Compile the supplied closed schema once. | This matches the host spike. Changed defaults reach an unset key when the extension module is loaded again. |
| Options read errors | Add a new error type. Or throw Error with pi-schema errors. | Throw Error with the extension name and validation errors. | The design requires a throw but names no error class. The host owns client refusal codes. |
| Workspace base advanced after each push | Force-push the rebased branch. Or publish the rebased head on a new branch. | Publish on `tau/k-kit-final` and replace PRs 91 and 92. | The unit rules forbid force-pushes. The final base is `a91bae611c1283b107c72709b2c393a4e8ab6357`. Its last update changes only the workspace build notes. |

## Verification limits

The kit tests use real pi-durable MemoryStorage and faux model requests. They make no real model calls. The package does not own SQLite crash recovery, client patch validation, secret masking, or provider login checks. Those remain with their owning units. The existing design spikes still run unchanged in the cumulative gate.

The extension callers are being built in other units. This branch checks the locked types and the structural host options contract without importing those units.

## Measured checks after the base refresh

On base `6c317ec`, `test tau-kit` passed all 14 tests with no failures, skips, or TODOs. Node reported 583.488791 ms. The full command took 1.80 seconds.

The cumulative `check` exited 0 in 20.91 seconds. It reported 68 tests, 40 passes, no failures, and the unchanged store's 28 TODOs. All six design spikes passed. The store still had 20 lint warnings.

## Measured checks before the base refresh

All commands ran from the unit worktree through `/nix/var/nix/profiles/default/bin/nix develop -c`.

| Command | Result |
| --- | --- |
| `test tau-kit`, with the behavior stubs | Exit 1. Thirteen behavior tests failed. The export contract passed. |
| `test tau-kit`, with the implementation | Exit 0. Fourteen tests passed. No failures, skips, or TODOs. Node reported 524.684708 ms. The full command took 1.67 seconds. |
| `check` | Exit 0. Fourteen kit tests and five workspace tests passed. The unchanged store had 28 TODOs and 20 lint warnings. All six design spikes passed. The full command took 14.03 seconds. |
| `test packages/kit/test/model-ref.test.ts`, after replacing `indexOf` with `lastIndexOf` | Exit 1. The model ID became `claude` instead of `anthropic/claude`. |
| `test packages/kit/test/options.test.ts`, after removing key deletion from `set` | Exit 1. Two tests failed. An omitted base stayed `release` instead of returning to `main`. |
| `test packages/kit/test/role.test.ts`, after removing `configure` | Exit 1. Four tests failed. The ownerless agent stayed empty, and the model request could not finish. |

Each mutation was applied alone and reverted before the next. The final source diff after the reversions was empty. The times are single-run test costs, not performance comparisons. Load averages were 2.59, 2.50, and 2.34 on 12 CPUs before the measured runs.

A Node import of `tau-kit` printed `[ 'modelRef', 'options', 'prose', 'role' ]`. An emitted fixture imported its adjacent Markdown and rendered `You own pass 2 for C4`, with the Markdown backticks preserved. Child imports exited 1 before the module body completed for a missing file, an undeclared slot, a declared slot absent from the file, and template control syntax. The TypeScript contract test checks the locked role, options, and model signatures and rejects missing or non-string prose facts.
