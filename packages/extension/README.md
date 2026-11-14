# tau-extension

These names are re-exports. They do not shield an extension from a change in pi-durable's behaviour.

`./helpers.js` denotes the local helper module, not a public package path. All other origins name their source package and subpath. Only tests import `tau-extension/testing`.

## `tau-extension`

| Name | Kind | Origin |
| --- | --- | --- |
| `Annotation` | type | `tau-store` |
| `Decision` | type | `tau-store` |
| `DecisionId` | type | `tau-store` |
| `DecisionInput` | type | `tau-store` |
| `EventData` | type | `tau-store` |
| `RequestDraft` | type | `tau-store` |
| `RoleSettings` | type | `./helpers.js` |
| `decision` | value | `tau-store` |
| `emit` | value | `tau-store` |
| `eventLog` | value | `tau-store` |
| `modelRef` | value | `./helpers.js` |
| `options` | value | `./helpers.js` |
| `prose` | value | `./helpers.js` |
| `request` | value | `tau-store` |
| `role` | value | `./helpers.js` |
| `withdraw` | value | `tau-store` |

## `tau-extension/durable`

| Name | Kind | Origin |
| --- | --- | --- |
| `Agent` | type | `@earendil-works/pi-durable` |
| `AgentChange` | type | `@earendil-works/pi-durable` |
| `AgentDoc` | value | `@earendil-works/pi-durable` |
| `CodingTools` | value | `@earendil-works/pi-durable/tools` |
| `Conversation` | type | `@earendil-works/pi-durable` |
| `ConversationId` | type | `@earendil-works/pi-durable` |
| `Cursor` | type | `@earendil-works/pi-durable` |
| `EntryId` | type | `@earendil-works/pi-durable` |
| `EntryRecord` | type | `@earendil-works/pi-durable` |
| `Extension` | type | `@earendil-works/pi-durable` |
| `GenerationTask` | value | `@earendil-works/pi-durable` |
| `Harness` | value | `@earendil-works/pi-durable` |
| `HarnessInspection` | type | `@earendil-works/pi-durable` |
| `HarnessOptions` | type | `@earendil-works/pi-durable` |
| `JsonObject` | type | `@earendil-works/pi-durable` |
| `LiveDoc` | value | `@earendil-works/pi-durable` |
| `MemoryStorage` | value | `@earendil-works/pi-durable` |
| `ModelRef` | type | `@earendil-works/pi-durable` |
| `NodeExecutionEnv` | value | `@earendil-works/pi-durable/env/node` |
| `PhaseHandler` | type | `@earendil-works/pi-durable` |
| `Registry` | type | `@earendil-works/pi-durable` |
| `RunningTask` | type | `@earendil-works/pi-durable` |
| `Storage` | type | `@earendil-works/pi-durable` |
| `Submission` | type | `@earendil-works/pi-durable` |
| `SubmissionDraft` | type | `@earendil-works/pi-durable` |
| `TaskId` | type | `@earendil-works/pi-durable` |
| `TaskRecord` | type | `@earendil-works/pi-durable` |
| `TaskRuntime` | type | `@earendil-works/pi-durable` |
| `ToolExecutionApi` | type | `@earendil-works/pi-durable` |
| `ToolExecutionResult` | type | `@earendil-works/pi-durable` |
| `ToolRegistration` | type | `@earendil-works/pi-durable` |
| `Tx` | type | `@earendil-works/pi-durable` |
| `configure` | value | `@earendil-works/pi-durable` |
| `createRegistry` | value | `@earendil-works/pi-durable` |
| `defineDoc` | value | `@earendil-works/pi-durable` |
| `defineEntry` | value | `@earendil-works/pi-durable` |
| `defineExtension` | value | `@earendil-works/pi-durable` |
| `defineTask` | value | `@earendil-works/pi-durable` |
| `defineTool` | value | `@earendil-works/pi-durable` |
| `hook` | value | `@earendil-works/pi-durable` |
| `openNodeSqliteStorage` | value | `@earendil-works/pi-durable/storage/sqlite/node` |
| `runEndTask` | value | `@earendil-works/pi-durable` |

## `tau-extension/schema`

| Name | Kind | Origin |
| --- | --- | --- |
| `JsonSchema` | type | `@earendil-works/pi-schema` |
| `arr` | value | `@earendil-works/pi-schema` |
| `compile` | value | `@earendil-works/pi-schema` |
| `int` | value | `@earendil-works/pi-schema` |
| `lit` | value | `@earendil-works/pi-schema` |
| `num` | value | `@earendil-works/pi-schema` |
| `obj` | value | `@earendil-works/pi-schema` |
| `oneOf` | value | `@earendil-works/pi-schema` |
| `opt` | value | `@earendil-works/pi-schema` |
| `str` | value | `@earendil-works/pi-schema` |

## `tau-extension/chord`

| Name | Kind | Origin |
| --- | --- | --- |
| `BACKGROUND_CONTEXT` | value | `@earendil-works/chord/context` |
| `Context` | type | `@earendil-works/chord/context` |
| `Draft` | type | `@earendil-works/chord/delta` |

## `tau-extension/testing`

| Name | Kind | Origin |
| --- | --- | --- |
| `AnswerInput` | type | `tau-store/testing` |
| `AnswerResult` | type | `tau-store/testing` |
| `FauxResponseStep` | type | `@earendil-works/pi-ai/providers/faux` |
| `Store` | type | `tau-store/testing` |
| `createModels` | value | `@earendil-works/pi-ai/models` |
| `fauxAnswer` | value | `tau-store/testing` |
| `fauxAssistantMessage` | value | `@earendil-works/pi-ai/providers/faux` |
| `fauxProvider` | value | `@earendil-works/pi-ai/providers/faux` |
| `fauxText` | value | `@earendil-works/pi-ai/providers/faux` |
| `fauxToolCall` | value | `@earendil-works/pi-ai/providers/faux` |
| `openStore` | value | `tau-store/testing` |
