# The protocol between a client and the Tau server

**Proposed.** Nothing is implemented. Source paths are under `/tmp/render-ground/`. W1 to W9 are the checks of `probe.mjs` on pi-durable 1.5.2; `probe-output.txt` is what it printed.

## 1. Transport

**HTTP/1.1 from `node:http`.** Each call is `POST /v1/<call>` with a JSON body and a JSON reply. `open`, `inbox`, and `timeline` answer the same POST with a `text/event-stream` body that stays open. The server listens on `127.0.0.1:7340`, behind TLS for other machines (section 4).

It alone needs nothing beyond Node on the server and reaches a browser, a phone, and a CLI. A reconnect is a new request that starts with the state now.

| | HTTP, streams as SSE | One WebSocket | JSON lines, socket or SSH | Chord link |
| --- | --- | --- | --- | --- |
| Server, beyond Node | Nothing (measured, W1) | `ws`, which Chord takes as an optional peer (measured, `chord/src/node/http/README.md:8-9`) | Nothing | A Chord host and `ws` |
| Browser | `fetch` with a streamed body. `EventSource` cannot send a header (reported). | `WebSocket`, with the token in the first message (reported) | No | Chord's web client |
| Phone | As a browser | As a browser | An SSH app, no web UI | As a browser |
| CLI | Node's `fetch` (measured, W1) | Node's `WebSocket` (guess) | `ssh home tau …` | Chord's Node link |
| Reconnect | A new request | Built by hand: call IDs, watches, a heartbeat | A new session | Chord holds again and gets snapshots (reported, `chord/docs/design.md:471`) |
| Proxy, TLS | Any HTTPS proxy that does not buffer. Send `X-Accel-Buffering: no` (measured, `ultimate/server/api.ts:101`). | It must pass upgrades | SSH does both | As a WebSocket |
| `node --test` | Port 0 and `fetch` (measured, W1) | `ws` in the tests | In-process streams | `memoryLinkPair` (reported) |

A WebSocket rebuilds HTTP inside itself, flow control included; Chord found a byte cap left state 9.4 s old (reported, `chord/docs/design.md:380-381`). Chord's link needs a Chord host, and "hosts of different versions refuse each other" (measured, `chord/docs/design.md:2252`), which fails the versioning ruling. JSON lines reach no browser.

## 2. Message shapes

```
POST /v1/input HTTP/1.1
Host: home.tail1234.ts.net
Authorization: Bearer tau.laptop.<43 characters>
Content-Type: application/json

{"project":"p","conversation":8,"text":"Use the existing serializer.","requestId":"r-02","whenBusy":"steer"}
```

A request body is one JSON object of at most 1 MiB. A reply is `application/json` with exactly one of three bodies.

| Body | Status | Meaning |
| --- | --- | --- |
| `{"result":…}` | 200 | Done. |
| `{"refused":{"code":…,"message":…,…}}` | 400, 401, 404, 409, 413, 503 | Not done. Only what the call's refusal row says was written. |
| `{"unknown":{"code":…,"message":…}}` | 503 | The server cannot tell whether it took effect. |

No reply, a cut connection, a timeout, or any other body, such as a proxy's 502 page, also means unknown. The client may send the same body again, and host.md's column "A resend" says what follows: for `create` a second conversation, for `stop` the end of whatever runs then. A commit that pi-durable rejects "for an unknown outcome" gives `storage_failed` (measured, `durable/src/types.ts:1339-1341`). Clients branch on `code`; `message` is for people.

Any call can get `bad_request` (400, with pi-schema's `{path, keyword, message}` as `errors`), `bad_cursor` (400), `unauthorized` (401), `unsupported_protocol`, `unknown_call`, `unknown_project`, or `unknown_conversation` (404), `too_large` (413), or `unavailable` (503, the store is not open). The refusals of host.md and primitives.md keep their names, with 409, except `unknown_decision` (404). New: `not_running` (pi-durable's `ConversationIdle`), `event_log`, `unknown_workflow`.

**`bind`.**

```
→ POST /v1/bind {"project":"p","workdir":"/home/owner/src/export","workflows":["w1"]}
← 200 {"result":{"project":{"project":"p","workdir":"/home/owner/src/export","workflows":["w1"],"missing":[]},"repeated":false}}
```

Equal fields again give `"repeated":true`. Other fields give `409 conflict` with the stored `project`. `missing` lists the workflows that `Project` names and the server lacks.

**`input`.** The request is above.

```
← 200 {"result":{"submission":{"id":15,"conversationId":8,"requestId":"r-02","type":"input","status":"queued"}}}
```

`whenBusy` is `steer` or `followUp`, and `"whenIdle":"reject"` is "only if running": pi-durable's names (measured, `durable/src/harness/types.ts:77-91`). `submission` is pi-durable's `SubmissionRecord` without `trace` or the host's `client:` prefix. Refusals: `not_running`, `unknown_conversation`, `event_log`.

**`answer`.**

```
→ POST /v1/answer {"project":"p","decision":"w1:42:design#3","basis":118,"choice":"revise","annotations":[{"text":"Use NDJSON, not one array.","range":{"start":412,"end":468}},{"text":"What happens on a partial write?"}]}
← 200 {"result":{"decision":{"id":"w1:42:design#3","subject":"w1:42:design","title":"Design v2","basis":118,"choices":["approve","revise","abort"],"conversation":7,"then":{"task":"w1.design_answered"},"requestedAt":1794547000000,"status":"answered","choice":"revise","annotations":[…as sent…],"by":"phone","at":1794548200000,"continuation":204},"repeated":false}}
```

`by` comes from the token. A body field `by` is refused `bad_request` at `/by` (measured, W9). The `answer` table maps row for row. `conflict` carries `decision`, `not_open` carries `open` (the subject's open decision or `null`), and `bad_annotation` carries `index`.

**The rule for every other call.**

1. The path is `/v1/` and the call's label in host.md.
2. The body has `project`, except in `workflows`, `models`, `projects`, and `inbox`, and one field per item of "The client sends". The server refuses any other field.
3. `result` has one field per item of "It gets back". pi-durable records travel as pi-durable shapes them. A model is `provider/modelId`.
4. A paged call takes `cursor` and `limit` (1 to 500, default 50) and returns `items` and `next`. No `next` is the end.
5. "Then each change" makes a stream. A reply comes when the call is done; `stop` replies once nothing runs.

| Call | Body beside `project` | `result` |
| --- | --- | --- |
| `workflows` | none | `workflows`: `{name, schema}` |
| `models` | none | `models`: `{model, name, reasoning, contextWindow}` |
| `projects` | none | `projects`: as in `bind` |
| `bind` | `workdir`, `workflows` | `project`, `repeated` |
| `addWorkflows` | `workflows` | `project` |
| `options` | none | `workflows`: `{workflow, schema, value, errors}` |
| `setOptions` | `workflow`, `patch` | `value`, or `bad_options` with `errors` |
| `create` | `workflow` or `model` | `conversation`, or `options_invalid` with `errors` |
| `conversations` | `cursor`, `limit` | `items`: `{conversation, owner, state}`, `next` |
| `open` | `conversation`, `from` | a stream |
| `history` | `conversation`, `cursor`, `minEntryId`, `maxEntryId`, `order`, `limit` | `items`: `EntryRecord`, `next` |
| `input` | as above | `submission` |
| `continue` | `conversation`, `requestId` | `submission`, or `busy` |
| `stop` | `conversation` | `{}` |
| `setModel` | `conversation`, `model`, `thinking` | `{}`, or `unknown_model` |
| `inbox` | none | a stream |
| `decision` | `decision` | `decision`, `basisText`, `task` (`{status, outcome}` once answered) |
| `answer` | as above | `decision`, `repeated` |
| `timeline` | `from` | a stream |
| `faults` | `cursor`, `limit` | `items`: `Fault`, `next` |

**Cursors** are opaque strings, sent back unchanged to the same call. The server makes one as base64url of JSON holding the scan's query and pi-durable's cursor, on SQLite `{"after":<id>,"order":…}` (measured, `durable/src/storage/scan.ts:38-40`). It names a record ID, so it survives a restart (measured, W5). It is not signed: the token already reads all that a cursor names.

**IDs.** pi-durable's IDs are JSON numbers (measured, `durable/src/types.ts:22-34`); decision IDs and names are strings. IDs travel only in the body, so `w1:42:design#3` needs no escaping, where a URL would cut it at `#`. A store's ID always travels with its `project`.

## 3. Streaming

`POST /v1/open {"project":"p","conversation":8}`, `POST /v1/inbox {}`, and `POST /v1/timeline {"project":"p"}` start the streams. A refusal is an ordinary JSON reply. Otherwise the reply is `200` with `Content-Type: text/event-stream`, `Cache-Control: no-store`, and `X-Accel-Buffering: no`. Each message is `data: `, a JSON object, and a blank line. `JSON.stringify` writes no raw line break, so a message is one line. A line starting with `:` is a heartbeat.

- `{"kind":"value","value":…}` comes first, once: the state now.
- `{"kind":"ops","ops":[…]}` is one change, in Chord's `Op` tuples (measured, `chord/src/delta/index.ts:32-40`): `r` replace, `s` set, `d` delete, `a` append text, `t` cut text from the front, `p` splice, `m` reorder. The client applies them in order, with `applyImmutable` from `@earendil-works/chord/delta` or 80 lines of its own, refusing the segments `__proto__`, `constructor`, and `prototype` (measured, `chord/src/delta/README.md:201`). "Only the resulting value is contractual" (measured, line 123).
- `{"kind":"end","reason":…}` comes last when the server ends the stream: `stopping`, `revoked`, or `failed`.

**The values.** `open` sends pi-durable's `ConversationView` (measured, `durable/src/harness/view.ts:37-49`), as Ultimate does (measured, `ultimate/server/api.ts:400-402`): `conversation`, `entries` (the newest 50, growing to 100), `before`, and `docs`: `pi.agent` (settings), `pi.inbox` (the queue), `pi.live` (the run, partial answer, tool calls, `runFailure`), `pi.provider`, `pi.usage`. `timeline` sends that view of the event log. `inbox` sends `{"<project>": <its open list>}`: the host watches each store's list with `watchDoc` (measured, `durable/src/types.ts:1145`) and puts the project's name in front of each op's path, as pi-durable does for its documents (measured, `view.ts:375-393`; W7).

**Why ops.** Whole values would resend the partial answer up to ten times a second (measured, `durable/README.md:527`). Step 3's run took 17 messages and 4,773 bytes (W1).

**`from`** is the entry ID after the newest the client holds: pi-durable's `ConversationWindow.from` (measured, `view.ts:56-62`), which `ConversationTranscript.resume` computes (measured, `durable/src/harness/transcript.ts:89-97`). If at most 100 entries came since, the first value holds exactly those. Otherwise it holds the newest 50, `before` lies above what the client holds, and the client pages the gap with `history` (measured, W4). The client merges entries by ID and replaces `docs` whole.

**A slow client.** When `write()` returns false, the listener waits for `drain` before it returns. pi-durable calls a listener once at a time and folds what lands meanwhile: appends join, sets keep the last, and past 10,000 ops one `["r", view]` replaces them (measured, `durable/README.md:525`, `chord/src/delta/pending.ts:12`). The server holds one batch per watch beside the socket's buffers, and no commit waits for a client. A write that has not drained in 60 s closes the stream.

**Alive.** After 15 s without a message the server writes `:` and a blank line, as Ultimate does (measured, `ultimate/server/api.ts:104-106`). A client with no byte for 45 s by the wall clock, which counts sleep, reopens. TCP does not notice a sleeping laptop (reported, `chord/docs/design.md:366-367`).

**The end.** A client closes its request, and the server stops the watch. The server sends `end` with `stopping` before closing the harnesses, `revoked` on revocation, and `failed` when a harness fails (measured, `durable/README.md:927`). A cut without `end` is a crash or the network. Either way the client reopens, and nothing is replayed.

## 4. Auth

**The token** is `tau.<device>.<secret>`. The device ID is a name the owner picks, `^[a-z][a-z0-9-]{0,31}$`, never reused, because answers keep it in `by`. The secret is 32 random bytes in base64url.

**Where it goes.** `Authorization: Bearer <token>` on every request, streams included. Never in a URL, which proxies log, or a cookie, which a foreign page could make a browser send. A missing, unknown, or revoked token gets `401 unauthorized`.

**The server stores** `~/.tau/devices.json`, mode 0600: per device its ID, the SHA-256 of its secret, and when it was made and revoked. It compares in constant time and keeps pairing codes in memory, hashed, as Chord's app kit does (reported, `chord/src/node/app/README.md:110-143`). **The device stores** the server's URL and its token, in the OS keychain or a 0600 file.

**The first token.** Device administration is a Unix socket, `~/.tau/admin.sock`, mode 0600, with the same envelope: `POST /admin/pair`, `/admin/revoke`, `/admin/list`. Only the server's OS user can connect, there or over SSH, as in Render v1 (measured, `proposal-v1/src/host/transport.ts:277-303`). `tau device pair phone` prints a code from `/admin/pair`: 8 characters from 31 that cannot be misread, good once, for 10 minutes. On the device the owner types the server's URL and the code. The device sends `POST /v1/pair {"code":"K7QM-3XRT"}`, the only request without a token, and gets `{"result":{"device":"phone","token":"tau.phone.…"}}`. Five wrong codes in a row cancel every pending code.

**Revoking.** `tau device revoke phone` records the time, ends that device's streams with `revoked`, and refuses its next request (measured with a stand-in, W8). A call already past the check finishes.

**`answer`** gets the device from the token: `answer(id, fields, device)`.

**The network.** The server listens on 127.0.0.1. Other machines come through an HTTPS proxy there: Tailscale Serve ends TLS for the tailnet name, and the phone and laptop join the tailnet (reported, `proposal-v1/docs/protocol.md:14-16`; not run). Tailnet membership grants nothing. Without a proxy, a configured certificate serves `node:https`, and the server refuses any other address without TLS. The token crosses a network only inside TLS.

## 5. Versioning

The path carries the version. Version 1 is the three reply bodies, the three stream messages, the header, opaque cursors, and the meaning of the ops. Changing any of them makes `/v2/`, served beside `/v1/`.

No new version for: a new or renamed call (an old name may stay as an alias), a new optional request field, a new result field, a new refusal code, a new `end` reason, or a new key in a stream's value. Ruling 28 changes the table in section 2 and nothing here.

**A client** ignores unknown fields, treats an unknown refusal code as "not done" and shows `message`, and treats an unknown `end` reason as an end.

**A server** refuses an unknown request field with `bad_request` at its pointer, so a newer client learns that an older server did not understand it; dropping it could turn "only if running" into a run. An unknown call gets `unknown_call` with `calls`, and an unknown version `unsupported_protocol` with `supported`. Every reply carries `Tau-Server: tau/<version> pi-durable/<version>`. To learn the calls, a client sends `POST /v1/` with no name. No call is added.

**What this does not protect.** The value of `open` and `timeline` is pi-durable's view, which changes when pi-durable does: `pi.live` is at version 3 and renamed a field between 1 and 2 (measured, `durable/src/harness/live.ts:197-205`). This is the weakest point of the design.

## 6. The script, step by step

**1. First tokens.** On the server machine, `tau device pair laptop` gets `{"result":{"code":"H4CW-9TPN","expiresAt":1794549000000}}` from `/admin/pair`. `tau login http://127.0.0.1:7340` sends `POST /v1/pair {"code":"H4CW-9TPN"}` over loopback and writes the token to a 0600 file. `tau device pair phone` prints `K7QM-3XRT`. The owner types it and `https://home.tail1234.ts.net` into the phone app, whose request crosses Tailscale and TLS to Serve. The phone keeps the token in its keychain.

**2. Bind, options, create, input.**

```
→ /v1/bind {"project":"p","workdir":"/home/owner/src/export","workflows":["w1"]}   ← 200, as in section 2
→ /v1/setOptions {"project":"p","workflow":"w1","patch":{"reviewer":"openai/gpt-0","base":""}}
← 409 {"refused":{"code":"bad_options","message":"2 errors","errors":[{"path":"/reviewer","keyword":"format","message":"unknown model"},{"path":"/base","keyword":"minLength","message":"too short"}]}}
→ /v1/create {"project":"p","workflow":"w1"}   no reply in 30 s; the same body   ← 200 {"result":{"conversation":8}}
→ /v1/input {"project":"p","conversation":8,"text":"Add a --json flag.","requestId":"r-01"}   no reply; the same body
← 200 {"result":{"submission":{"id":10,"conversationId":8,"requestId":"r-01","type":"input","status":"placed","entry":9}}}
```

The refused patch stored nothing. The first `create` may have made an empty conversation 7, the accepted limit. The input exists once: pi-durable returns the earlier submission for a reused request ID (measured, `durable/src/harness/submissions.ts:231-239`, W2).

**3. Watching a run.** The exact bytes W1 printed after `POST /v1/open {"project":"p","conversation":3}`: message 1, 321 bytes, then messages 2 and 3, 272 and 324 bytes.

```
data: {"kind":"value","value":{"conversation":{"id":3},"entries":[],"docs":{"pi.agent":{"model":{"provider":"faux","modelId":"faux-1"},"extensions":["probe"],"tools":["count"]},"pi.live":{},"pi.inbox":{"items":[]},"pi.provider":{"sessionId":"01a1d437-1469-7003-9d21-0a76efb37271"},"pi.usage":{"models":{},"tools":{}}}}}

data: {"kind":"ops","ops":[["s",["docs","pi.live","run"],{"taskId":11,"inputs":[10],"turns":0,"first":9}],["p",["entries"],0,0,[{"model":[{"role":"user","content":"Count to three, then tell me.","timestamp":1794561741946}],"kind":"pi.user","id":9,"conversationId":3}]]]}

data: {"kind":"ops","ops":[["p",["entries"],1,0,[{"model":[{"role":"system","content":"","toolsAdded":[{"name":"count","description":"Counts to three.","parameters":{"type":"object","properties":{},"additionalProperties":false}}],"timestamp":1794561741950}],"kind":"pi.system","id":12,"conversationId":3,"byTaskId":11}]]]}

```

Later, also exact: the queued steer, a line of tool output, and a piece of the partial answer.

```
data: {"kind":"ops","ops":[["p",["docs","pi.inbox","items"],0,0,[{"id":15,"mode":"steer","content":"Use the existing serializer."}]]]}

data: {"kind":"ops","ops":[["a",["docs","pi.live","tools",0,"output"],"2\n"]]}

data: {"kind":"ops","ops":[["a",["docs","pi.live","generation","message","content",0,"text"],"hree, using the "]]}

```

After the tool round, one message moves the steer from `pi.inbox` into the entries. The last deletes `pi.live.run` and appends the answer. The client's value then equalled a fresh view (measured, W1).

**4. The phone answers.**

```
→ /v1/inbox {}
← data: {"kind":"value","value":{"p":{"open":{"w1:42:design":{"id":"w1:42:design#3","title":"Design v2","requestedAt":1794547000000,"conversation":7}}},"q":{"open":{"w2:f1:resolve":{"id":"w2:f1:resolve#1","title":"Did pi-durable ship 2.0?","requestedAt":1794540000000,"conversation":3}}}}}
→ /v1/decision {"project":"p","decision":"w1:42:design#3"}   ← 200 {"result":{"decision":{…"status":"open"},"basisText":"# Design v2\n…"}}
→ /v1/answer, the body in section 2   the link drops; the same body
← 200 {"result":{"decision":{…"choice":"revise","by":"phone"…},"repeated":true}}
← inbox: data: {"kind":"ops","ops":[["d",["p","open","w1:42:design"]]]}
```

`repeated` is `false` if the first send never landed. The laptop's `"choice":"approve"` then gets `409 conflict` with the phone's record.

**5. The laptop sleeps for an hour.** After 60 s without `drain` the server closes the stream. Awake, the client sees its last byte an hour old and, holding entries up to 142, sends `/v1/open {"project":"p","conversation":8,"from":143}`. If more than 100 entries came since, `before` lies above 142, say at 391, and `/v1/history {"project":"p","conversation":8,"minEntryId":143,"maxEntryId":391,"order":"ascending"}` pages the gap. Otherwise the first value's entries are exactly the missed ones. `docs` show the run now, with `runFailure` if it ended without an answer.

**6. A bad link.** The phone gets fewer, larger messages and the right value. In W3b a 3 MB answer streamed for 4 s: a stream read at once got 43 messages, one unread for 3 s got 26, and both ended equal, each carrying 6.2 MB. A tool that printed 4 MB cost 102 KB (W3), because pi-durable keeps 50 KB of running output (measured, `durable/src/truncate.ts:12-13`). After a 60 s stall the phone reopens with `from`.

**7. Paging 500 events.**

```
→ /v1/timeline {"project":"p"}   ← data: {"kind":"value","value":{"conversation":{"id":2},"entries":[…50…],"before":9120,"docs":{}}}
→ /v1/history {"project":"p","conversation":2,"maxEntryId":9120,"order":"descending","limit":100}   ← 200 {"result":{"items":[…],"next":"eyJxIjp7…"}}
→ /v1/history {"project":"p","conversation":2,"cursor":"eyJxIjp7…","limit":100}
```

The server restarts after page 3. Page 4 fails to connect, so the client sends it again later. Its cursor names an entry that is still there: in W5 a cursor paged on across a reopen and matched one scan.

**8. The phone is stolen.** The owner runs `ssh home tau device revoke phone`. The phone's streams get `data: {"kind":"end","reason":"revoked"}`, and its next request `401 {"refused":{"code":"unauthorized","message":"Send a valid device token."}}` (measured, W8). Its earlier answers keep `by: "phone"`. The next phone is `phone-2`.

**9. An upgrade.** An old client ignores a new field, such as `extensions` in a project, and treats a new code as not done. A call that is gone gets `404 {"refused":{"code":"unknown_call","message":"This server has no call workflows.","calls":["extensions",…]}}`, and the client says the server is newer. From an old server, a new client gets `unknown_call` with the old list, `bad_request` for a new field, and `unsupported_protocol` with `"supported":[1]` for version 2 (measured, W9).

**10. A restart with three watches open.** On a clean stop each stream gets `data: {"kind":"end","reason":"stopping"}` before the harnesses close (W6); a crash drops them silently. Each client retries after 1, 2, 4, and up to 30 s. The server listens once every project is open, and `open` and `timeline` return with `from`. pi-durable restarts the cut-off generation, so its partial text can be shorter than shown; about the last second of output is lost (measured, `durable/README.md:527`).

**11. An agent's shell tries to answer.** What stops it: it has no token, and extension code cannot import `answer`. The server's environment holds no token for `bash` to inherit (measured, `durable/src/tools/bash.ts:84-86`), and `devices.json` holds hashes. What does not: it runs as the server's OS user, so it can pair itself a device through `admin.sock`, read a CLI's token file there, or open the store, as the accepted weak mode allows. Its answer names a device the owner never paired. The fix is pi-env's `RemoteExecutionEnv` (reported, not run).

## 7. What changes in `docs/core`

1. **New `protocol.md`, this design.** Host layer, core. Proposed.
   - 1, 2: nothing carries host.md's calls to a phone; pi-durable exports no transport.
   - 3, 4: only the host checks devices and routes to a store; every client needs it.
   - 5: one listener, one envelope, three stream messages over pi-durable's watches.
2. **host.md, the table.** `open` and `timeline` take `from`, my reading of the timeline's "cursor". `history` takes `minEntryId`, `maxEntryId`, `order`, and `limit`, and pages the event log. "The event log is not a conversation for a client" should read "a client cannot write to it". Host wiring. Proposed.
3. **host.md, refusals.** Name `not_running`, `event_log`, `unknown_workflow`, and the protocol's codes. Host wiring. Proposed.
4. **host.md, how a device gets its token.** The admin socket, `/v1/pair`, `devices.json`. Host layer, core. Proposed.
   - 1, 2: a second device cannot get a token; pi-durable has no devices.
   - 3, 4: it guards who acts at the client's boundary; every client needs it.
   - 5: one file, one socket, one request without a token.
5. **primitives.md, the open list.** Each entry holds `id`, `title`, `requestedAt`, `conversation`. Store layer, core. Proposed.
   - 1, 2: the inbox shows titles without a read per decision per change; pi-durable has no inbox.
   - 3, 4: it is the core's own document; both workflows' decisions reach a client that knows neither.
   - 5: four fields in an existing document.
6. **README.md.** The decision log points to `protocol.md`. No Chord host is used; Chord's ops are only data. Docs. Proposed.
7. **README.md, accepted limits.** The admin socket gives an agent's shell another way to a token. Open.
8. **grounding.md.** Add W1 to W9. Docs.

## 8. Not verified

- No Tau code exists. The probe stands in for `open`, `input`, `history`, and `inbox`. `timeline`, `answer`, pairing, the admin socket, `unknown` replies, TLS, a proxy, a browser, and a phone were not run.
- That Tailscale Serve passes `text/event-stream` unbuffered is inferred.
- The heartbeat, the cut-offs, a sleeping laptop, and a real slow link did not run. Only loopback did. The open list ran as a stand-in.
