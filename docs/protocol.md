# Client protocol

Tau exposes its [host calls](host.md) over HTTP. A client sends JSON calls and reads JSON replies or server-sent event streams.

## HTTP calls

The server listens on `127.0.0.1`, port `6283` by default. Send `POST /v1/<call>` with a JSON object of at most 1 MiB. Send the device token in `Authorization: Bearer <token>`. Pairing is the exception and needs no token. Use `Content-Type: application/json` for JSON requests.

The server accepts loopback Host names and configured additional Host names. If an `Origin` header is present, its hostname must also be allowed. The server sends no CORS headers. A device on another machine needs an encrypted connection through a proxy or tunnel to the loopback listener. Configure the proxy's Host name as an allowed host when needed.

JSON replies have `Content-Type: application/json`, `Cache-Control: no-store`, and `Tau-Protocol: 1`. A reply has one of these bodies.

| Body | HTTP status | Meaning |
| --- | --- | --- |
| `{ "result": ... }` | 200 | The call returned a result. |
| `{ "refused": { "code": ..., "message": ..., ... } }` | 400, 401, 404, 409, or 413 | The call was refused. Other fields can give details. |
| `{ "unknown": { "code": "storage_failed", "message": ... } }` | 500 | The outcome is unknown. |

Only the body counts. A missing, unreadable, or unrecognized body also leaves the outcome unknown, regardless of status. Branch on `code`; `message` is for a person. Resend with care. In particular, `create` can create a second conversation and `stop` can stop a newer run.

| Refusal code | HTTP status | Meaning |
| --- | --- | --- |
| `bad_request` | 400 | The JSON or call body is invalid. `errors` gives validation details. |
| `bad_cursor` | 400 | The cursor does not fit the call or query. |
| `unauthorized` | 401 | The Host, Origin, token, or pairing code is not accepted. |
| `unknown_call` | 404 | No call matches. `calls` lists the host calls. |
| `unknown_project` | 404 | The project is not open. |
| `unknown_conversation` | 404 | The conversation does not exist in the project. |
| `unknown_decision` | 404 | The decision does not exist in the project. |
| `conflict` | 409 | A binding or answer conflicts with the stored value. |
| `not_open` | 409 | The decision is not open. |
| `stale_basis` | 409 | The answer uses an old basis. |
| `unknown_choice` | 409 | The choice is not offered. |
| `bad_annotation` | 409 | An annotation is invalid. |
| `extension_not_loaded` | 409 | The project or server lacks the extension code. |
| `bad_options` | 409 | The options patch is invalid or the extension has no options. |
| `options_invalid` | 409 | Workflow options are incomplete or invalid. |
| `not_a_workflow` | 409 | The named project extension is not a workflow. |
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

`input` and `continue` require a nonempty `requestId`. The host prefixes it with `client:<device>:` before submission. A resend from the same device with the same ID returns the first submission. Send the same body on a retry. Another device has its own ID namespace.

A page's `next` is an opaque cursor. Send it as `cursor` to the same call and project. A history cursor also carries its conversation and query bounds. Supplied bounds must match the cursor. A cursor carries its position rather than naming server memory, so it can be used after a restart.

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

`open` returns a pi-durable `ConversationView` with conversation, entries, `before`, and documents. Its entries are a window, not a complete transcript. The window starts with the newest 50 entries and drops old entries when it would exceed 100. Keep entries by ID. If `before` is newer than the newest entry held by the client, use `history` to fetch the gap. On reconnect, send the newest held entry ID as `after` to request entries after it. The documents still show current state.

`timeline` watches the event log with the same window and gap rule. Its value contains the log's conversation ID for `history`. `inbox` maps each project name to its open decisions by subject. A project bound during the watch arrives in an operation. A failed project watch ends the inbox stream.

Closing a stream stops its watch, not the work. On a lost stream, reconnect and obtain a fresh snapshot.

## Devices and administration

A token has the form `tau.<device>.<secret>`. The device name matches `^[a-z][a-z0-9-]{0,31}$`. The secret is 32 random bytes encoded in base64url. The server stores the SHA-256 hash of the secret and pairing and revocation times in `~/.tau/devices.json`, not the token itself.

The owner issues a pairing code through the local admin socket. Send `POST /v1/pair` with `{ "code": "<code>" }` to exchange it for `{ "result": { "device": ..., "token": ... } }`. A code works once and expires after ten minutes. Five wrong or expired codes in succession clear pending codes. The server ignores case, spaces, and hyphens in codes.

The owner-only Unix socket is `~/.tau/admin.sock`. The `tau device pair`, `tau device revoke`, and `tau device list` commands use it, as does `tau extension reload`. Revocation ends that device's streams with `revoked` and rejects later requests. A request already past authentication can finish. No client call loads code. An extension or shell running as the server's OS user can access the socket and store, so the socket is not a boundary against that user.

## Versions and owned shapes

The path and reply header identify protocol version 1. Clients ignore fields they do not know and display unknown refusal codes as refusals. The server rejects unknown request fields with `bad_request`.

`ConversationView`, `EntryRecord`, `SubmissionRecord`, and the documents in a conversation view travel in their pi-durable shapes. Their definitions are in the installed `@earendil-works/pi-durable` package. Tau uses pi-durable 1.5.2. The stream operations are Chord operations.
