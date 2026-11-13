# The protocol between a client and the server

[Host](host.md) lists the calls a client must be able to make. This file says how a call travels: the transport, the message shapes, how a watch streams, how a device gets a token, and how versions meet. The owner asked for it after the host pass.

**Proposed.** It comes from the fifth arena, and [Protocol arena](arena-wire.md) says which part came from where. All three designs chose the same transport. The moves it leans on ran in `spikes/wire.mjs`, checks W1 to W9, over real HTTP on `127.0.0.1` with a stand-in server. No Tau code exists, and no client is designed.

## Transport

**HTTP, from `node:http`.** A call is one `POST` with a JSON body and a JSON reply. A watch is the same `POST` answered by a server-sent event stream that stays open. The server needs no dependency for it.

| | HTTP, with event streams | One WebSocket | JSON lines on a Unix socket or over SSH | Chord's link and remote objects |
| --- | --- | --- | --- | --- |
| The server needs, beyond Node | Nothing | A package. Node has a WebSocket client and no server. | Nothing | A Chord host, and the same package |
| A browser, a phone, a CLI | `fetch` with a body reader. `EventSource` cannot send a header. | `WebSocket`, with the token in a first message | A CLI only | Chord's JavaScript client |
| A reconnect | Send the call again, or open the watch again | Everything in flight drops together. Needs request IDs and a resubscribe step. | The same | Chord holds its objects again |
| A proxy, TLS | Any HTTPS proxy that does not buffer | The proxy must pass upgrades | SSH does both | As a WebSocket |
| `node --test` | Port 0 and `fetch` | The package in the tests | A temporary socket | A memory link |

- **A WebSocket would put HTTP's work into our protocol:** matching replies to requests, status, and one watch that must not block a call. It gives better flow control, because a client can acknowledge each message. That is not enough to pay for a dependency and a multiplexer.
- **Chord's link needs a Chord host on both ends.** "The core does not use a Chord host" stays. The protocol takes only Chord's ops, as data.
- **JSON lines reach no browser.**
- **One response per watch has a cost.** Without HTTP/2, a browser allows six connections to one host, so a web page with three watches a tab stalls at two tabs on plain HTTP. HTTP/2 needs TLS. A browser client uses TLS.

Ultimate carries pi-durable's watches the same way (measured, `server/api.ts:96-106` at ultimate `7eb49b8`).

## A call

```
POST /v1/input HTTP/1.1
Authorization: Bearer tau.laptop.<43 characters>
Content-Type: application/json

{"project":"p","conversation":8,"text":"Use the existing serializer.","requestId":"r-02","whenBusy":"steer"}
```

The path is `/v1/` and the call's name from [Host](host.md). The body is one JSON object of at most 1 MiB. It has `project`, unless the call is `extensions`, `models`, `projects`, or `inbox`, and one field for each thing the call takes. IDs travel in the body and never in a path, so a decision ID such as `w1:42:design#3` needs no escaping. In a URL it would lose `#3`.

A reply has exactly one of three bodies.

| Body | Status | Meaning |
| --- | --- | --- |
| `{"result": …}` | 200 | Done. |
| `{"refused": {"code": …, "message": …, …}}` | 400, 401, 404, 409, 413 | The server decided, and wrote only what the call's refusal says. |
| `{"unknown": {"code": …, "message": …}}` | 500 | The server cannot tell whether the call took effect. |

**Only the body counts.** No reply, a cut connection, a timeout, and a reply whose body is none of the three all mean unknown, whatever the status. A proxy can answer 409 or 408 with a page of its own after the server has committed. A 409 that was not Tau's counted as unknown in the check (measured, W2). One design read every 4xx as "nothing happened", and the judge showed with a probe that this is unsafe.

After an unknown outcome the client sends the same body again, and the column "A resend" in [Host](host.md) says what follows. A storage call that pi-durable rejects has an unknown outcome (measured, `src/types.ts:1333-1344`), and the server answers `storage_failed`.

A client branches on `code`. `message` is for a person.

| Code | Status | When |
| --- | --- | --- |
| `bad_request` | 400 | The body does not fit the call. `errors` holds pi-schema's `{ path, keyword, message }`. An unknown field is one. |
| `bad_cursor` | 400 | A cursor that this call did not make |
| `unauthorized` | 401 | No token, an unknown one, or a revoked one |
| `unknown_call` | 404 | No such call. `calls` lists the ones the server has. |
| `unknown_project`, `unknown_conversation`, `unknown_decision` | 404 | |
| `too_large` | 413 | |
| Every refusal that [Host](host.md) and [Primitives](primitives.md) name | 409 | `conflict`, `not_open`, `stale_basis`, `unknown_choice`, `bad_annotation`, `extension_not_loaded`, `bad_options`, `options_invalid`, `not_a_workflow`, `unknown_model`, `busy`, and the rest |
| `idle` | 409 | An input marked "only if running" met no run. It is pi-durable's `ConversationIdle`. |
| `event_log` | 409 | `input`, `continue`, `stop`, or `setModel` on the event log |

### Three calls in full

```
→ POST /v1/bind {"project":"p","workdir":"/home/owner/src/export","extensions":["websearch","w1"]}
← 200 {"result":{"project":{"project":"p","workdir":"/home/owner/src/export","extensions":["websearch","w1"],"missing":[]},"repeated":false}}
```

Equal fields again give `"repeated":true`. Other fields give `conflict` with the stored `project`. `missing` lists the extensions that the project names and the server lacks.

```
→ POST /v1/input, the body above
← 200 {"result":{"submission":{"id":15,"conversationId":8,"requestId":"client:laptop:r-02","type":"input","status":"queued"}}}
```

`whenBusy` is `steer` or `followUp`, and `"whenIdle":"reject"` is "only if running". These are pi-durable's names (measured, `src/harness/types.ts:77-91`). `submission` is pi-durable's `SubmissionRecord`.

```
→ POST /v1/answer {"project":"p","decision":"w1:42:design#3","basis":118,"choice":"revise","annotations":[{"text":"Use NDJSON, not one array.","range":{"start":412,"end":468}},{"text":"What happens on a partial write?"}]}
← 200 {"result":{"decision":{"id":"w1:42:design#3", … ,"status":"answered","choice":"revise","annotations":[ … ],"by":"phone","at":1794548200000,"continuation":204},"repeated":false}}
```

`by` comes from the token. A body field such as `by` is refused as `bad_request` at its path (measured on `input`, W2). The `answer` table in [Primitives](primitives.md) maps row for row: `conflict` carries `decision`, and `not_open` carries `open`.

### A request ID belongs to one device

The host stores a client's request ID as `client:<device>:<requestId>`. A resend from the same device returns the first submission. The same ID from another device is a submission of its own (measured, W3).

[Host](host.md) had `client:` alone. No design of the arena caught that two devices that both send `r1` would collide: the second device gets the first one's submission back, and its text is gone. The judge showed it with a check.

### Every other call

The body has one field for each thing in the column "The client sends" of [Host](host.md), and `result` has one for each thing in "It gets back". A page is `{ items, next? }`, and no `next` is the end. "Done" is `{}`.

| Call | Body beside `project` | `result` |
| --- | --- | --- |
| `extensions` | | `items`: `{ name, workflow, schema? }` |
| `models` | | `items`: `{ model, name }` |
| `projects` | | `items`: the project as in `bind` |
| `addExtensions` | `extensions` | `project` |
| `options` | | `items`: `{ extension, schema, value, errors }` |
| `setOptions` | `extension`, `patch` | `value` |
| `create` | `workflow`, or `model` | `conversation` |
| `conversations` | `cursor?`, `limit?` | a page of `{ conversation, owner?, state }` |
| `open` | `conversation`, `after?` | a stream |
| `history` | `conversation`, `cursor?`, `limit?`, `minEntryId?`, `maxEntryId?`, `order?` | a page of `EntryRecord` |
| `continue` | `conversation`, `requestId` | `submission` |
| `stop` | `conversation` | `{}` |
| `setModel` | `conversation`, `model`, `thinkingLevel?` | `{}` |
| `inbox` | | a stream |
| `decision` | `decision` | `decision`, `text`, `then?` |
| `timeline` | `after?` | a stream |
| `faults` | `cursor?`, `limit?` | a page of `Fault` |

A model is the string `provider/modelId`. `then` is the state of the decision's `then` task. A secret option travels as `true`.

**A cursor is an opaque string.** The client sends `next` back as `cursor` to the same call. The server makes it as base64url of JSON that holds the query and pi-durable's own cursor, which names a record and no server memory (measured, `src/storage/scan.ts:36-40`). So a cursor works after a restart, and it carries its own bounds. `faults` scans several task kinds, so its cursor holds one position for each.

**The shapes that pi-durable owns are fixed at 1.5.2.** `ConversationView`, `EntryRecord`, `SubmissionRecord`, and the documents inside a view travel as pi-durable 1.5.2 shapes them (measured, `src/harness/view.ts:37-48`). pi-durable has renamed a field in `pi.live` before (measured, `src/harness/live.ts:197-205`). If a later pi-durable changes one of these, the server maps it back, or the protocol's version changes. Two designs sent the shapes with no such rule, and the judge named that as the hole in their versioning.

## A stream

`open`, `inbox`, and `timeline` answer with `Content-Type: text/event-stream` and `Cache-Control: no-store`. A refusal comes first, as an ordinary JSON reply. A frame is one line, `data: ` and a JSON object, and then a blank line. A line that starts with `:` is a heartbeat.

- `{"ops":[ … ]}` is a change. **The first frame replaces the whole value:** `{"ops":[["r", <value>]]}`. That is the state now.
- `{"end":{"reason": … }}` is the last frame when the server ends the stream: `stopping`, `revoked`, or `failed`.

The ops are Chord's, which pi-durable's watches hand to their listener (measured, `packages/chord/src/delta/index.ts:32-40`). A client applies them in order.

| Op | Does |
| --- | --- |
| `["r", value]` | Replaces the whole value |
| `["s", path, value]` | Sets the key or the index at the path |
| `["d", path]` | Deletes the key, or removes the array item |
| `["a", path, text]` | Appends the text to the string |
| `["t", path, n]` | Drops the string's first `n` UTF-16 code units |
| `["p", path, index, remove, items]` | Removes `remove` items of the array at `index`, then inserts `items` there |
| `["m", path, order]` | Reorders the array: `new[i] = old[order[i]]` |

A path is a list of keys and indexes. A client refuses the segments `__proto__`, `constructor`, and `prototype`. A JavaScript client can use Chord's `applyImmutable`. The check applied all seven with about thirty lines of its own, and the value it built equalled the first frame of a new watch (measured, W4).

**Why ops and not whole values.** One design sent the whole value on every change. It is simpler for a client, and it does not hold up: the judge's fixture turned an answer that grows to 100 KB into about 50 MB on the wire, against about 200 KB with ops. pi-durable commits partial text up to ten times a second (measured, `README.md:527`).

### `open`

The value is pi-durable's `ConversationView`: `conversation`, `entries`, `before`, and `docs`. In `docs`, `pi.agent` has the settings, `pi.inbox` the queue, and `pi.live` the run, the partial answer, the tool calls with their output, and the last failure.

`entries` is a window and not the transcript. It starts with the newest 50, takes appends, and drops its oldest once it would pass 100. `before` is the entry just before the window (measured, `src/harness/view.ts:50-66`). A client keeps every entry it has seen, by ID.

**The gap rule.** After each frame, if `before` is newer than the newest entry the client held, entries are missing in between. The client fetches them with `history`, from the entry after the one it held to `before`. This happens when a slow client gets a folded frame, and after a reconnect.

**`after`** is optional: the newest entry ID the client holds. The first frame then has only the entries after it, when there are at most 100, and the documents as they are now (measured, W6). Nothing is replayed.

### `timeline`

`timeline` is `open` on the event log. Its value names the log's conversation, and older events come from `history` with that ID. The gap rule is the same.

This changes two rows of [Host](host.md). `timeline` takes `after` and no cursor, because a call cannot both page and stream. And the event log can be read with `history`, though `input`, `continue`, `stop`, and `setModel` still refuse it.

### `inbox`

The value is each project's open list under the project's name: `{ "<project>": { "<subject>": { id, title, requestedAt, conversation } } }`. The host watches each store's list and puts the project's name in front of every path. A project that is bound while the stream is open arrives as a `s` op (measured, W7). If one store's watch fails, the stream ends with `failed`. A project never just drops out of the inbox.

So the open list in [Primitives](primitives.md) holds those four fields for each subject. With IDs alone, an inbox would need one more read for every decision on every change.

### A slow client, a dead link, the end

- **Slow.** When a write to the socket does not drain, the listener waits. pi-durable calls a listener one call at a time and folds what lands meanwhile: appends join, sets keep the last, and past 10,000 ops one `r` replaces them (measured, `README.md:525`, `packages/chord/src/delta/pending.ts:9-12`). A client that stopped reading got 300 commits as 6 frames, and the gap rule then filled its transcript to all 309 entries (measured, W5). No commit waits for a client. A write that has not drained in 60 seconds ends the stream.
- **Alive.** After 15 seconds with no frame the server writes a heartbeat. A client that reads nothing for 45 seconds, by a clock that counts sleep, opens the watch again.
- **The end.** A client closes its request, and the server stops the watch. The work goes on, because the host runs it under its own context. On a clean stop the server sends `end` first (measured, W9). A cut with no `end` is a crash or the network. Each time the client opens the watch again, after 1 second, then 2, up to 30, and gets the state now.

## Devices and tokens

**The token** is `tau.<device>.<secret>`. The device ID is a name the owner picks, such as `phone`, matching `^[a-z][a-z0-9-]{0,31}$`. It is never used twice, because answers keep it in `by`. The secret is 32 random bytes in base64url.

**Where it goes.** In `Authorization: Bearer <token>` on every request, streams included. Never in a URL, which proxies log, in a cookie, which another page could make a browser send, or in a body.

**What is stored.** The server keeps `~/.tau/devices.json`, readable by its user only: for each device its ID, the SHA-256 of its secret, and when it was paired and revoked. It compares in constant time. The device keeps the server's URL and its token.

**The first token.** A device is paired with a code, so the token is never typed.

1. On the server's machine, or over SSH to it, the owner runs `tau device pair phone`. It prints a code of 8 characters, good once, for 10 minutes.
2. On the device the owner types the server's URL and the code.
3. The device sends `POST /v1/pair {"code":"K7QM-3XRT"}`, the one request with no token, and gets `{"result":{"device":"phone","token":"tau.phone.…"}}`.

A code worked once, and the server held a hash and no token (measured, W1). Five wrong codes in a row cancel every pending code.

`tau device pair`, `tau device revoke`, and `tau device list` reach the server through a Unix socket, `~/.tau/admin.sock`, that only the server's OS user can open. Render v1 did the same. One design had the owner paste a whole token into the phone, and the judge counted the unsafe transfer against it. Another had the command write files that the server polls, which its own probe showed to be fragile.

**Revoking.** `tau device revoke phone` records it, ends that device's streams with `revoked`, and refuses its next request (measured, W8). A call that is already past the check finishes. An answer the device sent stays, with its name in `by`.

**The network.** The server listens on `127.0.0.1` only. A device on another machine comes through something that encrypts: Tailscale Serve, a TLS proxy, or an SSH tunnel. That is all that protects the token in transit. The server refuses an unexpected `Host`, refuses a request with another site's `Origin`, sends no CORS headers, never redirects, and keeps `Authorization` out of its logs.

**What this does not stop.** An agent's shell that runs as the server's OS user can open `admin.sock` and pair a device for itself, read a CLI's token file, or write the store. That is the accepted weak mode of "only a human answers". An answer sent that way names a device the owner never paired, which `tau device list` shows. Tools that run on another account, through pi-env, close it.

## Versions

The path carries the version, and every reply has `Tau-Protocol: 1`. Version 1 is the three reply bodies, the two frames, the seven ops, the header, and the pinned shapes.

No new version for a new call, a call that goes away, a renamed call, a new optional request field, a new field in a result, a new refusal code, a new `end` reason, or a new key in a stream's value. Anything else is `/v2/`, served beside `/v1/`.

- **A client ignores a field it does not know.** It treats an unknown refusal code as "not done" and shows the message.
- **A server refuses a field it does not know,** with `bad_request` at its path. Dropping it could turn "only if running" into a run.
- **A call that is gone** answers `unknown_call` with the server's calls. A renamed call may keep its old name for a while.
- **To learn the calls first,** a client sends `POST /v1/` with no name and reads that same refusal. No call is added.

So renaming `workflows` to `extensions` changed a row of the table and nothing in the protocol. An old client that still sends `workflows` learns from the refusal that the server has moved on (measured, W2).

## The script

The three designs walked eleven steps. Merged:

| Step | What travels |
| --- | --- |
| 1. A laptop on the server's machine gets a token, then a phone on another network. | `tau device pair laptop` on the server prints a code. The laptop sends `pair` over loopback. For the phone the owner runs the command over SSH and types the code and the HTTPS address into the phone. |
| 2. Bind, options, create, input, with one refused patch and two timeouts. | `bind`. `setOptions` answers `bad_options` with two `errors`, and nothing is stored. `create` times out and goes again: two conversations, the accepted limit. `input` goes again with the same request ID: one submission. |
| 3. The laptop watches a run. | One `r` frame, then ops: an entry spliced in, text appended to `docs["pi.live"].generation`, tool output appended, a steer added to `docs["pi.inbox"].items`, and at the end `pi.live.run` deleted. |
| 4. The phone answers a decision. The link drops, and a second device answers. | `inbox`, `decision`, `answer`. The resend gets `repeated: true`. The other device gets `conflict` with the record, whose `by` is the phone. Every open inbox gets a `d` op for the subject. |
| 5. The laptop sleeps for an hour in a run. | Its 45-second rule fires. It opens the watch with `after`. `docs` say whether the run ended or failed. The gap rule fetches what the window left out. |
| 6. The phone is on a bad link. | Fewer, larger frames, at worst one `r`. After 60 seconds without a drain the stream ends, and the phone opens it again. |
| 7. The owner pages back 500 events, and the server restarts. | `history` on the log's conversation, page by page. The cursor works after the restart. |
| 8. The phone is stolen. | `tau device revoke phone`. Its streams end with `revoked`, and its next call is `unauthorized`. |
| 9. The server is upgraded. | An old client ignores a new field and reads a new code as "not done". A call that is gone answers `unknown_call`. A new client on an old server gets `unknown_call`, or `bad_request` for a new field. |
| 10. The server restarts under three watches. | A clean stop sends `end`. A crash cuts the connections. Each client opens its watches again and gets an `r` frame. |
| 11. An agent's shell tries to answer. | With the network alone it has no token, and gets `unauthorized`. As the server's OS user it can pair itself a device. See "What this does not stop". |

## The changes, by the admission rule

**The protocol.** Core, host layer.

- **Checks 1 and 2.** Nothing carries the calls of [Host](host.md) to a second machine. pi-durable is a library and has no transport.
- **Checks 3 and 4.** Only the host checks a device and routes a call to a store. Every client needs it.
- **Check 5.** One listener, one envelope, two frames, and seven ops that pi-durable already produces.

**Pairing and the admin socket.** Core, host layer.

- **Checks 1 and 2.** A second device cannot get a token. pi-durable has no devices.
- **Checks 3 and 4.** It guards who acts at the boundary to the client, and every client pairs.
- **Check 5.** One file, one socket, and one request with no token.

**The open list holds four fields for each subject.** Core, store layer.

- **Checks 1 and 2.** An inbox cannot show a title without a read for each decision. pi-durable has no inbox.
- **Checks 3 and 4.** It is the core's own document, and a client that knows no workflow reads it.
- **Check 5.** The shape of one document that exists.

## Not verified

- No Tau code exists. `spikes/wire.mjs` is a stand-in server for `pair`, `input`, `history`, `open`, and `inbox`. The other calls did not travel.
- Everything ran on loopback. No TLS, proxy, HTTP/2, browser, or phone ran, and that a proxy passes an event stream unbuffered is inferred.
- The slow client stopped reading. A real slow link was not measured.
- The heartbeat, the 60-second cut, the limit on wrong codes, the admin socket, and the `Host` and `Origin` checks did not run.
- No reply was cut after a commit, and the equal resend of an answer whose `then` task faulted did not travel.
- The candidates' probes killed a server under open watches and paged across the restart. The merged spike did not repeat that.
