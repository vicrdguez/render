# The Tau wire protocol

A probe ran the moves this design leans on: `probe.mjs`, output in `probe-output.txt`, on pi-durable 1.5.2 with SQLite files and real HTTP on `127.0.0.1`. "W6" means step 6 of that run. Source paths start at `/tmp/render-ground/`, with `durable/` and `chord/` under `pi/packages/`.

## 1. Transport

**The choice is HTTP.** A call is one `POST` with a JSON body and a JSON answer. A watch is one `POST` whose answer is a server-sent event stream, one watch per response. The server uses `node:http` and no dependency.

HTTP has both shapes the 20 calls need: ask and get an answer, and ask and then listen. Its status separates done, refused, and unknown. A call never waits behind a stream. One socket per watch lets pi-durable do the flow control. The listener waits for that socket's `drain`, and pi-durable folds what piles up (measured, W6). Ultimate carries pi-durable watches the same way (measured, `ultimate/server/api.ts:96-105,400-402`).

| | HTTP, event streams | One WebSocket | JSON lines on a Unix socket or stdio, SSH for remote | Chord link, remote objects |
| --- | --- | --- | --- | --- |
| Server needs | Nothing | `ws`. Node 24 has only the client (measured, probe). | Nothing | A Chord host and `ws` (measured, `chord/src/node/http/README.md:8-9`) |
| Browser, phone, CLI | `fetch` with a body reader, since `EventSource` sends no header (reported, HTML standard) | `WebSocket`. The token is the first message. | A CLI only. No web page. | Chord's JavaScript client (inferred) |
| Reconnect | Resend the call, or open the watch again | Everything in flight drops together. Needs request IDs and a resubscribe step. | As WebSocket | Chord holds its objects again (measured, `chord/docs/design.md:360`) |
| Proxy and TLS | Any proxy carries it, with buffering off. Without HTTP/2, which needs TLS, a browser allows 6 connections per domain (reported, MDN, "Using server-sent events"). | Needs upgrade support (reported) | SSH encrypts. No proxy. | As WebSocket |
| `node --test` | `listen(0)`, `fetch`, read the body | Node's client against `ws` | `net.connect` | `memoryLinkPair()` (measured, `chord/docs/design.md:339`) |

- **WebSocket has the better flow control,** because a client can acknowledge each message. Chord measured state 9.4 s old with a buffer cap alone and 0.0 s with acks (reported, `chord/docs/design.md:380`). I reject it because it costs a dependency and moves request matching and status codes into our protocol.
- **Chord fails ruling 27.** "Hosts of different versions refuse each other" (measured, `chord/docs/design.md:2252`). So "The core does not use a Chord host" stays, and I take only Chord's ops.

**The 6-connection limit is the real cost.** A web page on plain `http://127.0.0.1` with three watches a tab stalls at two tabs. A browser client uses TLS.

## 2. Message shapes

```
GET  /v1                what this server can do, no token
POST /v1/pair           a pairing code for a token, no token
POST /v1/call/<name>    one call
POST /v1/watch/<name>   one watch, for a call that streams
```

`<name>` is a name from `host.md`'s table, so a renamed or added call changes no path (ruling 28). `/v1` and `/v1/pair` are not calls.

**Request.** `Authorization: Bearer <token>`, and a body of one JSON object, at most 1 MiB, with the call's fields.

**Response.** `{ result: R }` or `{ error: { code: string; message: string; data?: JsonObject } }`.

- **200.** Done. `result.repeated` is `true` for a resend the server recognised.
- **400 `bad_request`.** The body does not fit the call. `data.errors` says where.
- **401 `unauthenticated`, 404 `unknown_call`.**
- **409, any other code.** The call refused by its own rules.
- **Anything else, such as a 5xx, a timeout, or a dropped connection.** Unknown. The client sends the same bytes again, and the "A resend" column of `host.md` says what comes back.

**A 4xx means the server decided and wrote nothing. Anything else means nobody knows.** pi-durable rejects a failed storage call "for an unknown outcome" (measured, `durable/src/types.ts:1341`), and the server answers 500. Section 6 shows two refusals as they ran.

Three calls in full:

```ts
// POST /v1/call/bind
type BindParams = { project: string; workdir: string; workflows: string[] };
type Project = BindParams & { missing: string[] }; // workflows the server no longer has
type BindResult = Project & { repeated?: true };
// 409 conflict, data { project: Project }. 409 unknown_workflow.

// POST /v1/call/input
type InputParams = {
	project: string;
	conversation: number;
	text: string;
	requestId: string; // the same on a resend
	whenBusy?: "steer" | "followUp";
	whenIdle?: "reject"; // "only if running"
};
type InputResult = { submission: SubmissionRecord }; // pi-durable's record
// 409 idle. 409 unknown_conversation, also for the event log.

// POST /v1/call/answer
type AnswerParams = {
	project: string;
	decision: string; // "w1:42:design#3"
	basis: number; // the entry the human read
	choice: string;
	annotations: { text: string; range?: { start: number; end: number } }[];
};
type AnswerResult = { decision: Decision; repeated?: true };
// 409 unknown_decision, stale_basis, unknown_choice, bad_annotation, workflow_not_loaded.
// 409 conflict, data { decision: Decision }. 409 not_open, data { open?: Decision }.
```

`whenBusy` and `whenIdle` are pi-durable's names (measured, `durable/src/harness/types.ts:83-89`). The record shows `requestId: "client:r1"`, with the host's prefix. A field that the call does not have, such as `device`, is `bad_request` (measured, W9).

**Every other call follows one rule.** The body has `project`, unless the call is `workflows`, `models`, `projects`, or `inbox`, and one field for each thing in "The client sends". The result has one field for each thing in "It gets back". A list is `{ items }`, a page is `{ items, next? }`, and "Done" is `{}`. A named refusal is a 409.

```
call           fields besides project          result
workflows                                      list of {name, schema?}
models                                         list of {model, name}
projects                                       list of Project
addWorkflows   workflows                       Project
options                                        list of {workflow, schema, set, errors}
setOptions     workflow, patch                 {set}, or bad_options {errors}
create         workflow or model               {conversation}, or options_invalid {errors}
conversations  cursor?, limit?                 page of {conversation, owner?, state}
open           conversation, after?            watch of ConversationView
history        conversation, minEntryId?, maxEntryId?, order?, cursor?, limit?
                                               page of EntryRecord
continue       conversation, requestId         {submission}, or busy
stop           conversation                    {}
setModel       conversation, model, thinkingLevel   {}, or unknown_model
inbox                                          watch of {[project]: {[subject]: Decision}}
decision       decision                        {decision, text, then?}
timeline       after?                          watch of the event log's ConversationView
faults         cursor?, limit?                 page of Fault
```

`model` is `"provider/modelId"`, and `then` is `{ task, status, error? }`.

**Two rows of `host.md` cannot be carried as written.** `history` needs a place to start as well as a cursor, so it takes pi-durable's `EntryQuery` (measured, `durable/src/types.ts:838`), and a client starts from the view's `before`. `timeline` both pages and streams, so on the wire it only streams, and `history` pages the event log.

**A cursor is an opaque string.** A client sends `next` back as `cursor`. The server makes it as base64url of JSON around pi-durable's cursor, which on SQLite is `{ after, order }`: a position and no server memory (measured, `durable/src/storage/scan.ts:38-39`). An unreadable cursor is 400 `bad_cursor`.

**IDs travel in the body, never in a URL.** pi-durable's IDs are JSON numbers (measured, `durable/src/types.ts:23`). A project name and a decision ID are strings. As a URL, `/v1/decision/w1:42:design#3` loses `#3` to the fragment (measured, W4).

## 3. Streaming

**Start.** `POST /v1/watch/open`, `/v1/watch/inbox`, or `/v1/watch/timeline`. A refusal comes first, as a JSON error. Otherwise the answer is 200 with `Content-Type: text/event-stream`. The same name under `/v1/call/` answers the first value once, as `{"result":<value>}`.

**Frames.** A frame is one line, `data: <JSON object>`, and a blank line. The object is `{"ops":[...]}` or `{"error":{...}}`. A line that starts with `:` is the heartbeat.

**The first message is the whole value as one op,** `{"ops":[["r",<value>]]}`. Each later message holds the ops of one or more commits, as pi-durable hands them to the listener in `call.ops` (measured, `durable/README.md:479-492`). Frames that arrive before the listener starts wait in the watch (measured, `chord/src/watch.ts:279`), so no change is lost in between.

The ops are Chord's `Op` tuples, with no path IDs (measured, `chord/src/delta/index.ts:32`):

```
["r", value]                         replaces the whole value
["s", path, value]                   sets the value
["d", path]                          deletes the key or the array item
["a", path, text]                    appends to the string
["t", path, n]                       drops the string's first n characters
["p", path, index, remove, items]    splices the array
["m", path, order]                   reorders the array: new[i] = old[order[i]]
```

A client refuses the segments `__proto__`, `constructor`, and `prototype` (measured, `chord/src/delta/index.ts:145`).

**`open`.** The value is pi-durable's `ConversationView`, unchanged: `{ conversation, entries, before?, docs }` (measured, `durable/src/harness/view.ts:37`). The settings are `docs["pi.agent"]`, and the queue is `docs["pi.inbox"].items`. `docs["pi.live"]` has the run in `run`, the partial answer in `generation`, the tool calls and their output in `tools`, and the last failure in `runFailure` (measured, `durable/src/harness/live.ts:160-193`).

`entries` is a window, not the transcript: the newest 50 at first, and pi-durable drops the oldest once it would pass 100. `before` names the entry just before the window (measured, `durable/src/harness/view.ts:55-69,361`). A client keeps the entries it has seen, by ID.

`after` is optional: the newest entry ID the client holds. The server passes `{ from: after + 1 }` to `watch()` (measured, `durable/src/harness/view.ts:61`), and the first message then holds only the entries the client lacks, when at most 100 exist. It is still the state now: `docs` is current, and no change is replayed.

**`timeline`** is `open` on the event log, which the host finds with `eventLog`. Older events come from `history`, with the `conversation.id` that the value names.

**`inbox`** merges the projects: each store's open list under its project's name. The host holds one `watchDoc` per store and puts the project's name in front of every path, as pi-durable's `prefixed()` does (measured, `durable/src/harness/view.ts:375`).

**A slow client gets fewer, larger messages.** When `write()` returns `false`, the listener waits for `drain`. pi-durable calls a listener one call at a time and folds what arrives meanwhile (measured, `chord/src/watch.ts:43`). Past 10,000 pending ops it hands over one `r` with the newest value (measured, `chord/src/delta/pending.ts:12`). In the probe a client that read got 13,001 frames for 13,000 commits. One that stopped reading got 283: the server wrote 877,111 bytes, waited, and then sent one `r`. Both ended with the same value (W6).

- **A slow client is behind by what the buffers hold,** 877 KB on loopback. Only acks would fix that.
- **The bound is 10,000 ops, not bytes.**
- **A client that takes nothing for 60 seconds is cut off.**

**Alive.** After 15 seconds of silence the server writes a `:` line. A client that reads nothing for 45 seconds opens the stream again.

**End.** The client closes the connection, and the server calls `watch.stop()`. Or the server sends a last frame, `{"error":{"code":"closing","message":"..."}}`, and closes. The other codes are `failed` and `revoked`. Or the connection drops. Each time the client opens the watch again, after 1 second, then 2, up to 30.

## 4. Auth

**Where the token goes.** In `Authorization: Bearer <token>`, on every call and every watch. Never in a URL, a cookie, or a body. A watch is checked when it opens and on every heartbeat.

**The token** is `<device>.<secret>`: a device ID such as `d_d95e609dc4`, and 32 random bytes in base64url. The server keeps only the SHA-256 of the secret, as Chord's app kit does (measured, `chord/src/node/app/README.md:112`). A token does not expire.

**How a device gets one.** The server has two commands that only write files.

1. On the server machine the owner types `tau pair phone`. It prints a code such as `K7QF-3M9T`, valid for 10 minutes, and writes `~/.tau/pairing/<SHA-256 of the code>.json` with `{ name, expires }`.
2. The owner types the server's URL and the code into the device, which sends `POST /v1/pair {"code":"K7QF-3M9T"}`.
3. The server reads that file and deletes it in one step, so a code works once (measured, W1). It writes `~/.tau/devices/<device>.json` with `{ device, name, hash, createdAt }` and answers `{"result":{"device":"d_d95e609dc4","name":"phone","token":"d_d95e609dc4.<43 characters>"}}`.

A wrong code is 401 `bad_code`. Five wrong codes in a minute close `/v1/pair` for a minute.

**What each side stores.** The server stores one file per device, with a hash and no token. The device stores the URL and the token.

**Revoking.** The owner types `tau revoke phone`, which writes the device's file again without `hash`. The server checks the modification time of `~/.tau/devices/` on every request and every tick (measured, W8).

**How a device ID reaches `answer`.** The server resolves the token to the device record before it reads the body, and passes its `device` to `answer`.

**The network.** The server listens on `127.0.0.1` in plain HTTP, and I assume it is never open to the internet. A device on another network comes through something that encrypts: a VPN such as Tailscale, or a TLS proxy. That encryption is all that protects the token in transit.

## 5. Versioning

`GET /v1` answers:

```json
{"result":{"protocol":1,"durable":"1.5.2","calls":{"input":{"watch":false,"params":{"type":"object","properties":{...},"additionalProperties":false}},...}}}
```

`calls` has every call, whether it can be watched, and the JSON Schema of its body. `durable` is there because the inside of `docs` is pi-durable's shape, not Tau's.

**No new version:** a new call, a call that goes away, a new optional request field, a new field in a result, a new error code, and a new key in a watch value. A call that must break its fields gets a new name.

**`/v2`:** a change to the paths, the envelope, the frames, the auth header, or the seven ops.

**A client ignores a field it does not know. A server refuses one,** because an ignored field might have mattered, such as `whenIdle`.

- **An old client, a newer server.** A new field is ignored. A new error code is handled by its status. A call that is gone answers 404 `unknown_call`.
- **A new client, an old server.** `GET /v1` lacks the call or the field, and the client hides the feature. A field sent anyway gets 400 with its path.
- **A new op verb never reaches a `/v1` client.** Chord's `apply` throws on one (measured, `chord/src/delta/index.ts:203`), so the server sends an `r` with the whole value instead.

## 6. The script, step by step

**1. First tokens.** On the home machine the owner types `tau pair laptop`, which prints a code. In the laptop's client the owner enters `http://127.0.0.1:7428` and the code. `GET /v1` and `POST /v1/pair` travel. For the phone, the owner types `tau pair phone` at home or through `ssh home`, and enters `https://home.example.ts.net` and the code. The same requests travel, inside TLS.

**2. Bind, options, create, input.**

```
POST /v1/call/bind {"project":"p","workdir":"/srv/p","workflows":["w1"]}
200 {"result":{"project":"p","workdir":"/srv/p","workflows":["w1"],"missing":[]}}
POST /v1/call/setOptions {"project":"p","workflow":"w1","patch":{"reviewer":"faux/none","colour":"red"}}
409 {"error":{"code":"bad_options","message":"2 options do not fit.","data":{"errors":[{"path":"/reviewer","keyword":"format","message":"expected format model"},{"path":"/colour","keyword":"additionalProperties","message":"unknown field"}]}}}
POST /v1/call/create {"project":"p","model":"faux/faux-a"}
200 {"result":{"conversation":18}}
POST /v1/call/input {"project":"p","conversation":18,"text":"Run the tests.","requestId":"r1"}
200 {"result":{"submission":{"conversationId":18,"requestId":"client:r1","type":"input","status":"placed","entry":24,"id":25}}}
```

`create` and `input` each timed out and went again with the same bytes. The first `create` had made conversation 12, which stays empty. Both `input` requests got submission 25 (W2, W3).

**3. Watching a run.** `POST /v1/watch/open {"project":"p","conversation":18}` gave 17 frames. Frames 1, 6, and 11, byte for byte, each followed by a blank line:

```
data: {"ops":[["r",{"conversation":{"id":18},"entries":[],"docs":{"pi.agent":{"model":{"provider":"faux","modelId":"faux-a"},"extensions":["probe-tools"],"cwd":"/srv/p"},"pi.live":{},"pi.inbox":{"items":[]},"pi.provider":{"sessionId":"01a1d446-c044-7737-8be8-97da59153d15"},"pi.usage":{"models":{},"tools":{}}}}]]}
data: {"ops":[["p",["docs","pi.live","generation","message","content"],1,0,[{"type":"toolCall","id":"call-1","name":"shout","arguments":{}}]],["a",["docs","pi.live","generation","message","content",0,"text"],"he tests first."]]}
data: {"ops":[["a",["docs","pi.live","tools",0,"output"],"12 tests passed\n"]]}
```

Frame 6 is partial text and the tool call. Frame 11 is tool output. Frame 10 queued the steer: `{"ops":[["p",["docs","pi.inbox","items"],0,0,[{"id":30,"mode":"steer","content":"Also report the count."}]]]}`. Frame 17 deleted `docs["pi.live"].run` and appended the answer. The value built from the frames equalled a new snapshot (W3).

**4. The phone and a decision.** `POST /v1/watch/inbox {}` gave `{"ops":[["r",{"p":{"w1:42:design":{"id":"w1:42:design#3",...}},"q":{"w2:f7:due":{...}}}]]}`. `POST /v1/call/decision {"project":"p","decision":"w1:42:design#3"}` gave the record and the basis `text`. Then:

```
POST /v1/call/answer {"project":"p","decision":"w1:42:design#3","basis":35,"choice":"revise","annotations":[{"text":"Name the flag --format json.","range":{"start":6,"end":12}},{"text":"Good otherwise."}]}
```

The connection drops, so the outcome is unknown. The phone sends the same bytes again and gets 200 with `"repeated":true`. The laptop then sends `"choice":"approve"` and gets 409 `conflict` with the record, whose `by` is the phone. Every open inbox gets `{"ops":[["d",["p","w1:42:design"]]]}` (W4).

**5. The laptop sleeps for an hour.** Its 45-second rule fires when it wakes. It sends `POST /v1/watch/open {"project":"p","conversation":18,"after":35}`, with the newest entry ID it holds, and gets one `r`. `docs` is the state now: a missing `docs["pi.live"].run` says the run ended, and `runFailure` says whether it failed. The entries are those after 35. If `before` is greater than 35, `history` with `minEntryId: 36` and `maxEntryId: before` fetches the rest. With nothing missed the answer was 470 bytes, against 10,602 with no `after` (W5).

**6. The phone on a bad link.** The server waits for `drain`, and the phone gets fewer and larger frames, at worst one `r` (section 3). Its `answer` goes on its own request.

**7. Paging back 500 events.** The timeline value holds the newest 50 and `before`. The client sends `history` with the log's conversation, `maxEntryId: before`, and `limit: 100`, then again with each `cursor`. The server restarts after page 2, and the cursor still works. In the probe that restart was a `SIGKILL`, and all 500 events came back once (W7).

**8. The stolen phone.** The owner types `tau revoke phone`. The phone's next request gets 401, and its open streams end with `revoked` within 15 seconds (W8). Its earlier answers stay, each with the phone in `by`.

**9. The upgrade.** Section 5 has both directions. In the probe, a missing call got 404 `unknown_call`, and an unknown field got 400 with its path (W9).

**10. A restart under three watches.** On `SIGTERM` each stream gets `{"error":{"code":"closing",...}}`. On `SIGKILL` each got `ECONNRESET`. Either way the client opens each watch again, and each first frame is an `r`. The token still works, because devices are files (W10).

**11. An agent's shell.** `curl` to `/v1/call/answer` with no token gets 401. The server's environment holds no token, and the device files hold hashes. That stops an agent that has only the network.

It does not stop a shell that runs as the server's OS user, the accepted weak mode. That shell can run `tau pair`, write a device file, read a client's token on the same account, or write the store. The first two leave a device the owner never paired, which `by` shows. The last two leave no trace. With tools on another account, the shell has neither token nor code.

## 7. What changes in `docs/core`

Each core change lists checks 1 and 2, checks 3 and 4, and check 5.

1. **`host.md`, a new section "The protocol".** Sections 1 to 5 here. Home: host layer. Status: Proposed.
   - No second machine can make a call, and pi-durable exports no transport.
   - Only the host checks devices and reaches the stores, and every client uses it.
   - Four paths, one envelope, Chord's seven ops, and one heartbeat timer.
2. **`host.md`, `open` takes an optional `after`.** Home: host layer. Status: Proposed.
   - A phone that reconnects downloads 50 entries it holds, and only a host can pass pi-durable's `from`.
   - Only the host calls `watch()`, for `open` and `timeline`.
   - One optional number.
3. **`host.md`, `history` and `timeline`.** `history` takes pi-durable's `EntryQuery` and reads the event log, and `timeline` loses its cursor. Home: host layer. Status: Proposed. Its checks are those of change 2.
4. **`host.md`, pairing.** The server reads `~/.tau/devices/` at start, and has `tau pair` and `tau revoke`. Home: host layer. Status: Proposed.
   - No device can get a token, and pi-durable has no devices.
   - Only the host can say who sent an answer, and every client pairs.
   - Two directories of small files.
5. **`primitives.md`, the open list holds the whole open `Decision` per subject.** Home: store layer. Status: Proposed.
   - With IDs alone an inbox needs one more watch per decision, and a pi-durable watch does not join documents.
   - Only the store layer writes the list, and every client reads it.
   - The shape of one existing document.
6. **`host.md`, `stop`.** A `stop` that times out goes again and can end a newer run. A `run` field would fix it, which changes a call. Status: Open.

## 8. Not verified

- No Tau code exists. The probe's store layer, `answer`, and `setOptions` are stand-ins, and its `answer` creates no `then` task.
- The probe ran on loopback: no proxy, TLS, HTTP/2, browser, or phone.
- The slow client stopped reading. Staleness on a real slow link was not measured.
- The 60-second cut, the pairing limit, and a failed store under a watch did not run.
- The probe wrote the files of `tau pair` and `tau revoke` itself.
- `bind`, `conversations`, `continue`, `stop`, `setModel`, and `faults` did not travel.
