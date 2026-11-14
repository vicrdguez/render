# Unit R2

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Arena section 3 names | Export its proposed list, or use the current callers. | Use the imports of W1, W2, and websearch. | R2 requires a caller for each pi name. |
| Explicit Tau types | Apply the caller rule to all types, or keep the types named in R2. | Include RequestDraft, AnswerInput, and AnswerResult as required. | R2 names RequestDraft and asks for the testing functions and their types. These are the only additions to the collected names. |
| Helper module | Put helper bodies in the root, or preserve their separate module. | Move the old kit source unchanged to helpers.ts. | The old four-helper export assertion still has its original meaning. The root test checks all nine functions and identity with the helper module. |
| Moved helper tests | Broaden the curated lists for the helper tests, or preserve their direct pi imports. | Preserve direct pi imports in these package tests. | The caller inventory is the three extensions, not the package's own tests. |
| README check | Parse values only, or check emitted declarations too. | Use the existing TypeScript compiler to read emitted declarations. | Type-only names and origins must match too. TypeScript is a test dependency at its existing version. |
| Temporary kit | Keep its implementation, or forward its old exports. | The kit forwards only the four helpers and RoleSettings. | R3 moves the callers and deletes the kit. R2 leaves no kit tests. |

The unit adds no loader, alias, host change, or extension change. The five entries use explicit exports. The README is checked against emitted declarations and runtime values. No second API manifest is added.

## Import inventory

Run from the root after entering the Nix shell.

```sh
node packages/extension/tools/imports.mjs
```

The script reads named imports and import types through the TypeScript AST.

```text
@earendil-works/chord/context -> tau-extension/chord: BACKGROUND_CONTEXT, Context
@earendil-works/chord/delta -> tau-extension/chord: Draft
@earendil-works/pi-ai/models -> tau-extension/testing: createModels
@earendil-works/pi-ai/providers/faux -> tau-extension/testing: FauxResponseStep, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall
@earendil-works/pi-durable -> tau-extension/durable: Agent, AgentChange, AgentDoc, Conversation, ConversationId, Cursor, EntryId, EntryRecord, Extension, GenerationTask, Harness, HarnessInspection, HarnessOptions, JsonObject, LiveDoc, MemoryStorage, ModelRef, PhaseHandler, Registry, RunningTask, Storage, Submission, SubmissionDraft, TaskId, TaskRecord, TaskRuntime, ToolExecutionApi, ToolExecutionResult, ToolRegistration, Tx, configure, createRegistry, defineDoc, defineEntry, defineExtension, defineTask, defineTool, hook, runEndTask
@earendil-works/pi-durable/env/node -> tau-extension/durable: NodeExecutionEnv
@earendil-works/pi-durable/storage/sqlite/node -> tau-extension/durable: openNodeSqliteStorage
@earendil-works/pi-durable/tools -> tau-extension/durable: CodingTools
@earendil-works/pi-schema -> tau-extension/schema: JsonSchema, arr, compile, int, lit, num, obj, oneOf, opt, str
tau-kit -> tau-extension: RoleSettings, modelRef, options, prose, role
tau-store -> tau-extension: Annotation, Decision, DecisionId, DecisionInput, EventData, decision, emit, eventLog, request, withdraw
tau-store/testing -> tau-extension/testing: Store, fauxAnswer, openStore
```

The emitted declaration names match this inventory plus the three required Tau types.

```text
tau-extension/chord missing: [] extra: []
tau-extension/testing missing: [] extra: []
tau-extension/durable missing: [] extra: []
tau-extension/schema missing: [] extra: []
tau-extension missing: [] extra: []
```

## Emitted exports

These are printed from runtime modules and their emitted declaration files.

```text
tau-extension values: decision, emit, eventLog, modelRef, options, prose, request, role, withdraw
tau-extension declarations: Annotation, Decision, DecisionId, DecisionInput, EventData, RequestDraft, RoleSettings, decision, emit, eventLog, modelRef, options, prose, request, role, withdraw
tau-extension/durable values: AgentDoc, CodingTools, GenerationTask, Harness, LiveDoc, MemoryStorage, NodeExecutionEnv, configure, createRegistry, defineDoc, defineEntry, defineExtension, defineTask, defineTool, hook, openNodeSqliteStorage, runEndTask
tau-extension/durable declarations: Agent, AgentChange, AgentDoc, CodingTools, Conversation, ConversationId, Cursor, EntryId, EntryRecord, Extension, GenerationTask, Harness, HarnessInspection, HarnessOptions, JsonObject, LiveDoc, MemoryStorage, ModelRef, NodeExecutionEnv, PhaseHandler, Registry, RunningTask, Storage, Submission, SubmissionDraft, TaskId, TaskRecord, TaskRuntime, ToolExecutionApi, ToolExecutionResult, ToolRegistration, Tx, configure, createRegistry, defineDoc, defineEntry, defineExtension, defineTask, defineTool, hook, openNodeSqliteStorage, runEndTask
tau-extension/schema values: arr, compile, int, lit, num, obj, oneOf, opt, str
tau-extension/schema declarations: JsonSchema, arr, compile, int, lit, num, obj, oneOf, opt, str
tau-extension/chord values: BACKGROUND_CONTEXT
tau-extension/chord declarations: BACKGROUND_CONTEXT, Context, Draft
tau-extension/testing values: createModels, fauxAnswer, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall, openStore
tau-extension/testing declarations: AnswerInput, AnswerResult, FauxResponseStep, Store, createModels, fauxAnswer, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall, openStore
```

## Tests first

The test commit precedes the implementation commit. The initial package check failed because its emitted root did not exist. The six boundary regressions failed with the old policy, which reported only `no policy for tau-extension` rather than rejecting the capability and dependency. All six pass with the new policy.

The two R1 follow-ups were tested against mutants in disposable copies of the store. Store production files in this checkout were not changed.

```text
trailing identity mutant exit 2
error TS2578: Unused '@ts-expect-error' directive.
fourth path mutant exit 1
✖ the store exposes exactly the root, host, and testing entries
+ './extra'
```

Each of the following changes was made alone, tested, and restored.

| Changed line | Observed failure |
| --- | --- |
| Remove request from the root re-export. | README table mismatch and request identity assertion. TypeScript also rejects the missing property. |
| Add bool to schema.ts without a README row. | README table mismatch with an extra emitted bool. |
| Export defineTool as defineTask in durable.ts. | Identity assertion compares Function defineTool with Function defineTask. |
| Add a bool README row without its export. | README table mismatch with a missing emitted bool. |

After restoration, the focused extension run reported 18 passed and 0 failed. The README check took about 0.8 seconds in the focused runs. It uses the existing compiler and no process fixture. The six boundary cases took about 1.3 seconds together. These are observed test costs, not a benchmark.

## Test retention

Before and after name lists are saved in `/tmp/r2-before.txt` and `/tmp/r2-after.txt`. Full runs are in `/tmp/r2-before.log` and `/tmp/r2-after.log`. The requested filter captures top-level test names. The runner totals also include nested tests.

```text
Before: 262 top-level names, 296 tests passed, 0 failed.
After: 272 top-level names, 306 tests passed, 0 failed.
Removed: []
```

All 15 old kit test names remain under `packages/extension/test`. The old exact-four-helpers test now imports the moved helper module. New root coverage checks its expanded exports. No assertion was removed.

New names follow.

```text
✔ README tables match every emitted value, type, and origin exactly once
✔ extension re-exports preserve Tau and pi object identity
✔ tau src cannot import tau-extension
✔ tau test cannot import tau-extension
✔ tau-extension exposes exactly five package entries
✔ tau-host src cannot import tau-extension
✔ tau-host test cannot import tau-extension
✔ tau-store src cannot import tau-extension
✔ tau-store test cannot import tau-extension
✔ the store exposes exactly the root, host, and testing entries
```

## Evidence paths

The before-code failures are in `/tmp/r2-exports-red.log` and `/tmp/r2-boundaries-red.log`. Passing focused checks are in `/tmp/r2-focused.log` and `/tmp/r2-boundaries-green.log`. R1 mutant output is in `/tmp/r2-store-mutants.log`. The extension mutants are in `/tmp/r2-mutant-missing-request.log`, `/tmp/r2-mutant-undocumented-export.log`, `/tmp/r2-mutant-wrong-identity.log`, and `/tmp/r2-mutant-unexported-documentation.log`. Restoration is in `/tmp/r2-mutations-restored.log`.

Fresh-checkout gate evidence belongs to the final head report. Other platforms and runtime alias identity are not tested in R2. R5 owns the loader and aliases.
