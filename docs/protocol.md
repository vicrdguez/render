# Client protocol

Tau exposes its [host calls](host.md) over HTTP. A client sends JSON calls and reads JSON replies or server-sent event streams.

## HTTP calls

The server listens on `127.0.0.1`, port `6283` by default. Send `POST /v1/<call>` with a JSON object of at most 1 MiB. Send the device token in `Authorization: Bearer <token>`. Pairing is the exception and needs no token. Use `Content-Type: application/json` for JSON requests.

The server accepts loopback Host names and configured additional Host names. If an `Origin` header is present, its hostname must also be allowed. The server sends no CORS headers. A device on another machine needs an encrypted connection through a proxy or tunnel to the loopback listener. Configure the proxy's Host name as an allowed host when needed. See [server options](host.md#run-the-server).

JSON replies have `Content-Type: application/json`, `Cache-Control: no-store`, and `Tau-Protocol: 1`. A reply has one of these bodies.

| Body | HTTP status | Meaning |
| --- | --- | --- |
| `{ "result": ... }` | 200 | The call returned a result. |
| `{ "refused": { "code": ..., "message": ..., ... } }` | 400, 401, 404, 409, or 413 | The call was refused. Other fields can give details. |
| `{ "unknown": { "code": "storage_failed", "message": ... } }` | 500 | The outcome is unknown. |

Only the body counts. A missing, unreadable, or unrecognized body also leaves the outcome unknown, regardless of status. Branch on `code`; `message` is for a person. Resend with care. In particular, `create` can create a second conversation and `stop` can stop a newer run.

Every refusal has string `code` and `message` fields. The table names all additional fields. `errors` is an array of `{ path: string, keyword: string, message: string }`. Each `path` is a JSON pointer, with `""` for the root.

| Refusal code | HTTP status | Meaning and additional fields |
| --- | --- | --- |
| `bad_request` | 400 | The JSON or call body is invalid. `errors` gives validation details. |
| `bad_cursor` | 400 | The cursor does not fit the call or query. |
| `unauthorized` | 401 | The Host, Origin, token, or pairing code is not accepted. |
| `unknown_call` | 404 | No call matches. `calls: string[]` lists the host calls. |
| `unknown_project` | 404 | The project is not open. |
| `unknown_conversation` | 404 | The conversation does not exist in the project. |
| `unknown_decision` | 404 | The decision does not exist in the project. |
| `conflict` | 409 | A binding conflict carries `project: ProjectView`. An answer conflict carries `decision: Decision` with status `answered`. |
| `not_open` | 409 | The decision is not open. `open?: Decision` identifies a current open decision when present. |
| `stale_basis` | 409 | The answer uses an old basis. |
| `unknown_choice` | 409 | The choice is not offered. |
| `bad_annotation` | 409 | An annotation is invalid. |
| `extension_not_loaded` | 409 | The project or server lacks the extension code. |
| `bad_options` | 409 | The options patch is invalid or the extension has no options. `errors` gives validation details. |
| `options_invalid` | 409 | Workflow options are incomplete or invalid. `errors` gives validation details. |
| `not_a_workflow` | 409 | The project has no extension by that name, or the extension is not a workflow. |
| `unknown_model` | 409 | The server has no such model. |
| `busy` | 409 | The conversation is busy or the server is stopping. |
| `idle` | 409 | Input requiring a running conversation found none. |
| `event_log` | 409 | A call tried to run work in the event log. |
| `too_large` | 413 | The request body exceeds 1 MiB. |

## Transcript

The following exchange binds a project. The token is a placeholder for a paired device's token.

```http
POST /v1/bind HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{"project":"p","workdir":"/home/owner/src/export","extensions":["websearch","w1"]}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store
Tau-Protocol: 1

{"result":{"project":{"project":"p","workdir":"/home/owner/src/export","extensions":["websearch","w1"],"missing":[]},"repeated":false}}
```

Repeating that request returns the same project with `repeated` set to `true`. A later `POST /v1/projects` with body `{}` returns the open projects under `result.items`.

## Request IDs and cursors

`input` and `continue` require a nonempty `requestId`. The host prefixes it with `client:<device>:` before submission. A resend in the same conversation from the same device with the same ID returns the first submission. Send the same body on a retry. Another device has its own ID namespace.

A page's `next` is an opaque cursor. Send it as `cursor` to the same call and project. A history cursor also carries its conversation and query bounds. Supplied bounds must match the cursor. A cursor carries its position rather than naming server memory, so it can be used after a restart. History defaults to descending order. `minEntryId` and `maxEntryId` are inclusive.

## Streams

`open`, `inbox`, and `timeline` return `Content-Type: text/event-stream`, `Cache-Control: no-store`, and `Tau-Protocol: 1`. A refusal before the stream starts is a JSON reply. Each data frame is `data: ` followed by a JSON object and a blank line. The first frame replaces the entire value.

```text
data: {"ops":[["r",<value>]]}

```

Later `ops` frames carry Chord operations. Apply them in order.

| Operation | Effect |
| --- | --- |
| `["r", value]` | Replace the whole value. |
| `["s", path, value]` | Set the key or array index at the path. |
| `["d", path]` | Delete the key or remove the array item. |
| `["a", path, text]` | Append text to a string. |
| `["t", path, n]` | Remove the first `n` UTF-16 code units of a string. |
| `["p", path, index, remove, items]` | Splice an array. |
| `["m", path, order]` | Reorder an array so `new[i] = old[order[i]]`. |

A path is an array of keys and indexes. Reject `__proto__`, `constructor`, and `prototype` as path segments when applying operations to JavaScript objects.

An end frame has the form `data: {"end":{"reason":"stopping"}}`, followed by a blank line. The reasons are `stopping`, `revoked`, and `failed`. A cut connection can have no end frame. The server writes the comment `:\n\n` after 15 seconds without a frame. If a client receives nothing for 45 seconds, reconnect and open the watch again. The server cuts a response that does not drain for 60 seconds. While a write waits, the watch can fold changes.

`open` returns a pi-durable `ConversationView` with conversation, entries, `before`, and documents. Its entries are a window, not a complete transcript. The window starts with the newest 50 entries and drops old entries when it would exceed 100. With `after`, it starts after that ID if at most 100 entries follow it. Otherwise it starts with the newest 50. Keep entries by ID. If `before` is newer than the newest entry held by the client, use `history` with inclusive bounds `minEntryId: lastHeld + 1` and `maxEntryId: before` to fetch the gap. On reconnect, send the newest held entry ID as `after` to request entries after it. The documents still show current state.

`timeline` watches the event log with the same window and gap rule. Its value contains the log's conversation ID for `history`. `inbox` maps each project name to its open decisions by subject. A project bound during the watch arrives in an operation. A failed project watch ends the inbox stream.

Closing a stream stops its watch, not the work. On a lost stream, reconnect and obtain a fresh snapshot.

## Devices and administration

A token has the form `tau.<device>.<secret>`. The device name matches `^[a-z][a-z0-9-]{0,31}$`. The secret is 32 random bytes encoded in base64url. The server stores the SHA-256 hash of the secret and pairing and revocation times in `~/.tau/devices.json`, not the token itself.

The owner issues a pairing code through the local admin socket. Send `POST /v1/pair` with `{ "code": "<code>" }` to exchange it for `{ "result": { "device": ..., "token": ... } }`. A code works once and expires after ten minutes. Five wrong or expired codes in succession clear pending codes. The server ignores case, spaces, and hyphens in codes. If the pairing reply is lost, the token cannot be retrieved. The code is consumed and the device name remains used even after revocation. Pair again with another name.

The owner-only Unix socket is `~/.tau/admin.sock`. The `tau device pair`, `tau device revoke`, and `tau device list` commands use it, as does `tau extension reload`. Revocation ends that device's streams with `revoked` and rejects later requests. A request already past authentication can finish. No client call loads code. An extension or shell running as the server's OS user can access the socket and store, so the socket is not a boundary against that user.

## Versions and owned shapes

The path and reply header identify protocol version 1. Clients ignore fields they do not know and display unknown refusal codes as refusals. The server rejects unknown request fields with `bad_request`.

Tau uses pi-durable 1.5.2. Times are Unix epoch milliseconds unless a field states otherwise. IDs are numbers scoped to the project store. `Decision` and `OpenDecisions` are defined in the [Decision reference](primitives.md). `ProjectView` is defined in the [host reference](host.md#calls).

The following shapes are the JSON records sent by the host. JSON values can be objects, arrays, strings, numbers, booleans, or null.

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };
type ConversationRecord = {
	id: number;
	parent?: { conversationId: number; at: number };
	owner?: { conversationId: number; taskId: number };
};
type ContextEdit =
	| { target: number; action: "omit" }
	| { target: number; action: "replace"; messages: Message[] };
type EntryRecord = {
	id: number;
	conversationId: number;
	kind: string;
	model?: Message[];
	data?: JsonValue;
	head?: number;
	edits?: ContextEdit[];
	byTaskId?: number;
};
type ConversationView = {
	conversation: ConversationRecord;
	entries: EntryRecord[];
	before?: number;
	docs: Record<string, JsonObject>;
};
type OpenDecisions = Record<string, {
	id: string; title: string; requestedAt: number; conversation: number;
}>;
```

`history` returns `EntryRecord` items. `open` and `timeline` stream `ConversationView`. `inbox` streams `Record<string, OpenDecisions>`, keyed by project name. Extension entry kinds and their `data` are extension-defined. Built-in entry kinds include `pi.user`, `pi.assistant`, `pi.system`, `pi.tool-result`, `pi.reset`, and `pi.compaction`.

The `input` and `continue` results contain a submission. `requestId`, when present, is the prefixed ID stored by the host. The `trace` field is optional telemetry context.

```ts
type SubmissionBase = { id: number; conversationId: number; requestId?: string; trace?: Record<string, string> };
type SubmissionRecord = SubmissionBase & (
	| { type: "input"; status: "queued" }
	| { type: "input"; status: "placed"; entry: number }
	| { type: "input"; status: "done"; entry: number; answer: number }
	| { type: "input"; status: "unanswered"; entry?: number; reason: string; detail?: JsonValue }
	| { type: "continue"; status: "placed" }
	| { type: "continue"; status: "done"; answer: number }
	| { type: "continue"; status: "unanswered"; reason: string; detail?: JsonValue }
	| { type: "write"; status: "queued" }
	| { type: "write"; status: "done"; entry: number }
	| { type: "write"; status: "unanswered"; reason: string; detail?: JsonValue }
);
```

`decision.result.then`, when present, has this task state. Check `outcome.error.message` for failed or faulted work.

```ts
type TaskOutcome =
	| { status: "completed"; result: JsonValue }
	| { status: "failed"; error: { message: string; detail?: JsonValue }; result?: JsonValue }
	| { status: "aborted"; reason?: string; result?: JsonValue }
	| { status: "orphaned"; reason: string }
	| { status: "faulted"; error: { message: string; detail?: JsonValue } };
type TaskState =
	| { status: "pending" | "running"; checkpoint: JsonValue }
	| { status: "waiting"; checkpoint: JsonValue; on: number[]; policy: "failFast" | "allSettled" }
	| { status: "sleeping"; checkpoint: JsonValue; until: number }
	| { status: "completing" | "terminal"; outcome: TaskOutcome };
```

### Messages

`model` holds model-facing messages. Images contain base64 data. `timestamp` is in milliseconds.

```ts
type TextContent = { type: "text"; text: string; textSignature?: string };
type ImageContent = { type: "image"; data: string; mimeType: string };
type ThinkingContent = { type: "thinking"; thinking: string; thinkingSignature?: string; redacted?: boolean };
type ToolCall = { type: "toolCall"; id: string; name: string; arguments: JsonObject; thoughtSignature?: string; namespace?: string; argumentsError?: string };
type Usage = {
	input: number; output: number; cacheRead: number; cacheWrite: number;
	cacheWrite1h?: number; reasoning?: number; totalTokens: number;
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; totalFromProvider?: boolean };
};
type Tool = { name: string; description: string; parameters: JsonObject; constrainedSampling?: false | { type: "json_schema"; strict: "prefer" | "require" } | { type: "grammar"; variants: { openai_lark?: string; openai_regex?: string } } };
type AssistantDiagnostic = { type: string; timestamp: number; error?: { name?: string; message: string; stack?: string; code?: string | number }; details?: JsonObject };
type DeferredHandle = { provider: string; modelId: string; api: string; id: string; expiresAt?: number; pollAfterMs?: number; data?: JsonValue };
type NestedToolCalls = { calls: { id: string; name: string; arguments?: JsonObject; argumentsBytes?: number; status: "ok" | "error" | "unfinished"; durationMs?: number; error?: string }[]; complete: boolean };
type Message =
	| { role: "system"; content: string | TextContent[]; sections?: Record<string, string | null>; toolsAdded?: Tool[]; toolsRemoved?: { name: string }[]; timestamp: number }
	| { role: "user"; content: string | (TextContent | ImageContent)[]; timestamp: number }
	| { role: "assistant"; content: (TextContent | ThinkingContent | ToolCall)[]; api: string; provider: string; model: string; responseModel?: string; responseId?: string; providerThinkingLevel?: string; thinkingLevel?: string; diagnostics?: AssistantDiagnostic[]; usage: Usage; stopReason: "pending" | "stop" | "length" | "toolUse" | "error" | "aborted" | "deferred"; deferred?: DeferredHandle; errorMessage?: string; rawStopReason?: string; endTurn?: boolean; timestamp: number; durationMs?: number }
	| { role: "toolResult"; toolCallId: string; toolName: string; content: (TextContent | ImageContent)[]; details?: JsonValue; usage?: Usage; nestedCalls?: NestedToolCalls; isError: boolean; timestamp: number; durationMs?: number };
```

### Conversation documents

Only present documents appear in `docs`. `pi.agent` holds stored settings. `pi.inbox` holds queued submissions. `pi.live` holds the current run and presentation. `pi.usage` holds usage totals keyed by `provider/modelId` or tool name. `pi.provider` holds a provider-facing session identity as `{ sessionId: string }`.

```ts
type AgentState = {
	model?: { provider: string; modelId: string };
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
	extensions?: string[] | { add?: string[]; remove?: string[] };
	tools?: string[] | { remove: string[] };
	modelTools?: string[] | { remove?: string[]; add?: string[] };
	instructions?: string; cwd?: string; maxTurns?: number;
	compaction?: { enabled?: boolean; reserveTokens?: number; keepRecentTokens?: number; backgroundTokens?: number; modelOverrides?: Record<string, { enabled?: boolean; reserveTokens?: number; keepRecentTokens?: number; backgroundTokens?: number }> };
};
type InboxState = { items: (
	| { id: number; mode: "steer" | "followUp"; content: string | (TextContent | ImageContent)[]; entry?: { kind: string; data?: JsonValue } }
	| { id: number; mode: "write"; entry: JsonObject }
)[] };
type UsageState = { models: Record<string, Usage>; tools: Record<string, Usage> };
type ToolDiagnostic = { severity: "info" | "warn" | "error"; message: string; code?: string };
type ToolSlot = { callId: string; name: string; status: "pending" | "running" | "done"; output?: string; droppedBytes?: number; droppedLines?: number; details?: JsonValue; diagnostics?: ToolDiagnostic[]; taskId?: number; unoffered?: true; entry?: number };
type NestedToolSlot = Omit<ToolSlot, "taskId" | "unoffered" | "entry"> & { parentCallId: string; parentTaskId: number; taskId: number; arguments: JsonObject; summary?: { isError: boolean; durationMs?: number; usage?: Usage; error?: string } };
type LiveState = {
	run?: { taskId: number; inputs: number[]; turns: number; first?: number; afterRun?: { tasks?: number[] } };
	generation?: { attempt: number; message?: Extract<Message, { role: "assistant" }>; retry?: { at: number; error: string }; deferred?: { pollAt: number } };
	tools?: ToolSlot[]; nestedTools?: NestedToolSlot[];
	compactions?: { taskId: number; trigger: "manual" | "threshold" | "overflow"; blocking: boolean; attempt: number; retry?: { at: number; error: string } }[];
	compactionFailure?: { taskId: number; trigger: "manual" | "threshold" | "overflow"; error: string };
	runFailure?: { taskId: number; inputs: number[]; reason: "model_error" | "no_model" | "aborted" | "reset" | "faulted" | "orphaned" | "interrupted" | "restart_limit" | "nothing_to_answer" | "turn_limit"; detail?: string; first?: number };
};
```
