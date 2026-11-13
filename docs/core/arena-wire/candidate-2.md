## 1. Transport

Proposed throughout. Use HTTP POST for all 20 calls. Three responses are server-sent events, read through a streaming HTTP response. There is no session handshake or shared request channel.

Source prefixes below mean `/tmp/render-ground/pi/packages/durable` for `D`, `/tmp/render-ground/pi/packages/chord` for `C`, and `/tmp/render-ground/pi/packages/ai` for `A`. Platform claims have explicit evidence labels. Protocol requirements are proposals, not claims about existing code. Reported: durable's 1.5.1 source matches its 1.5.2 distribution, `docs/core/grounding.md:30`. The probe uses installed 1.5.2.

| Choice | Server cost beyond Node | Browser, phone, CLI | Reconnect, proxy, tests |
| --- | --- | --- | --- |
| HTTP with SSE | None for transport, measured by `probe.mjs:1-193`. Existing pi-schema checks requests. | Reported platform support: browser Fetch supports headers and streamed bodies. A phone uses that API or native HTTP. A CLI needs an HTTP reader, such as curl. | Repeat the watch POST. Configure TLS termination, disable stream buffering and compression, allow idle connections. Test HTTP bytes and cancellation on loopback with `node --test`. |
| One WebSocket | Inferred: use `ws`, rather than write a frame implementation. | Reported: browsers have WebSocket. Phone and CLI need a WebSocket reader. Authentication would need a first application message for a common browser contract. | Redial, authenticate, reopen watches. Proxy needs upgrade support. Tests need real sockets plus multiplexing, request correlation, and per-watch cancellation. |
| JSON lines over Unix socket or stdio through SSH | Inferred: Node's net and child-process modules suffice locally. SSH is an external program. | Reported: a browser cannot directly open either channel. Phone needs an SSH app or helper. CLI needs SSH and a line reader. | Restart SSH and reopen watches. SSH replaces TLS. HTTP proxies do not carry this directly. Test a temporary socket or child with `node --test`. |
| Chord links and remote objects | Measured: Chord host, object contracts, and HTTP adapter. Its adapter imports optional `ws`, `C/src/node/http/README.md:5-9`. | Inferred: all clients need Chord's contracts and link implementation. Browser and phone can use its web client. | Measured: references re-hold after reconnect, `C/docs/design.md:253,286-288`. WSS needs upgrade forwarding. Test a memory link, then real HTTP upgrades and auth. |

HTTP avoids inventing a multiplexer and avoids adopting a second host. Whole-value streams cost bandwidth. That is the trade I choose. The README's single client "connection" must mean one server relationship, not one socket. Measured precedent: pi's proxy uses POST, Authorization, and a streamed response reader, `/tmp/render-ground/pi/packages/agent/src/proxy.ts:147-176`. Browser operation remains reported, not tested here.

## 2. Message shapes

`POST /tau/1/<call>` carries UTF-8 `application/json`. The general body is `{"project":"p","args":{}}`. Omit `project` for `workflows`, `models`, `projects`, and `inbox`. All other calls require it. Names are case-sensitive path segments. IDs never appear in paths.

Three complete exchanges follow. Headers shared by every request are `Authorization: Bearer <token>` and `Content-Type: application/json`. Streams also send `Accept: text/event-stream`. Admitted calls use the host's context, not the HTTP abort signal. A disconnect cancels delivery, not work.

```json
{"project":"p","args":{"workdir":"/srv/p","workflows":["w1"]}}
{"kind":"ok","value":{"project":{"project":"p","workdir":"/srv/p","workflows":["w1"],"missingWorkflows":[]},"repeated":false}}
```

Those bodies go to `bind` and return from it. Equal fields yield `repeated:true`.

```json
{"project":"p","args":{"conversation":2,"text":"Build it.","requestId":"r9","mode":"steer","onlyIfRunning":true}}
{"kind":"ok","value":{"id":7,"conversationId":2,"requestId":"client:r9","type":"input","status":"queued"}}
```

Those are `input`. Map `mode` to `whenBusy` and true `onlyIfRunning` to `whenIdle:"reject"`. False omits that setting. Prefix the request ID with `client:`. Never change fields on resend. Measured: only the submission type is compared on reuse, `D/src/harness/submissions.ts:231-239`.

```json
{"project":"p","args":{"decision":"w1:42:design#3","basis":30,"choice":"approve","annotations":[{"text":"Keep this.","range":{"start":0,"end":4}},{"text":"Add tests."}]}}
{"kind":"ok","value":{"decision":{"id":"w1:42:design#3","subject":"w1:42:design","title":"Review","basis":30,"choices":["approve","revise"],"conversation":2,"then":{"task":"w1.next"},"requestedAt":1,"status":"answered","choice":"approve","annotations":[{"text":"Keep this.","range":{"start":0,"end":4}},{"text":"Add tests."}],"by":"d-phone","at":2,"continuation":8},"repeated":false}}
```

Those are `answer`. `by` and `at` are server fields. Annotation ranges are integer UTF-16 offsets with `0 <= start <= end <= text.length`.

Here is the complete mapping for the other calls. Braces name exact object fields. `?` means omission. All pages have `{items,next}`, with `next:null` at the end. Pages contain at most 100 rows, oldest last for conversation and fault lists, oldest first for entries.

| Call | `args` | Success `value`, or streamed value |
| --- | --- | --- |
| workflows | `{}` | `{items:[{name,schema}]}`. No options means schema `{type:"object",properties:{},additionalProperties:false}`. |
| models | `{}` | `{items:[{model,name}]}`. `model` is `provider/modelId`. |
| projects | `{}` | `{items:[Project]}` |
| addWorkflows | `{workflows:string[]}` | `Project` |
| options | `{}` | `{items:[{workflow,schema,value,errors}]}` |
| setOptions | `{workflow,patch}` | `{value}` |
| create | `{workflow}` or `{model}` | `{conversation}`. Exactly one selector. |
| conversations | `{cursor}` | page of `{conversation,owner,state}`. `owner` is the native owner object or null. `state` is `idle`, `running`, or `failed`. |
| open | `{conversation}` | `ConversationView` |
| history | `{conversation,cursor}` | page of `EntryRecord` |
| continue | `{conversation,requestId}` | `SubmissionRecord`, with the same prefix rule |
| stop | `{conversation}` | `{}` after idle |
| setModel | `{conversation,model,thinkingLevel}` | `{}` |
| inbox | `{}` | `{items:[{project,decision}]}` |
| decision | `{decision}` | `{decision,basis:{id,text},then:TaskRecord|null}` |
| timeline | `{cursor}` | snapshot `{items:EntryRecord[],next,liveAfter}`. Later `{items:EntryRecord[]}`. |
| faults | `{cursor}` | page of `Fault` from `host.md` |

`Project` is the four-field object in the bind result. `schema` is JSON Schema. `patch` and `value` are flat JSON objects. `errors` is an array of `{path,code,message}`, using JSON Pointer paths. Map a pi-schema error's `keyword` to `code`, measured at `/tmp/render-ground/pi/packages/schema/src/types.ts:38-43`. Missing errors remain in `options`, not in successful `setOptions`.

Strings in the mapping are nonempty unless they are text. Booleans and arrays are required where shown. `thinkingLevel` is `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`, measured at `A/src/providers/model-schema.ts:17-18`. Split model strings at the first `/`. Project names follow `host.md`'s regex.

Borrowed types are normative by reference to the 1.5.2 JSON shapes, not whatever release is installed later. Measured definitions: `ConversationView`, `D/src/harness/view.ts:37-48`; `EntryRecord` and `SubmissionRecord`, `D/src/types.ts:459-606`; `TaskRecord` and its state, `D/src/types.ts:616-766`. Assistant message fields are measured at `A/src/types.ts:593-624`. `Decision` and `Fault` use the complete shapes in `primitives.md` and `host.md`. Omit optional fields, never encode undefined. Documents and extension entry data remain JSON. Preserve all fields, including model messages. New runtimes must adapt incompatible shapes to this contract.

Numeric durable IDs are positive safe JSON integers. Project and device IDs are strings. Decision IDs are opaque strings, so `w1:42:design#3` crosses JSON unchanged. Do not split it or percent-encode it.

Success and refusals use HTTP 200, except admission errors use 400, 401, 404, 413, or 426. A refusal is always `{"kind":"refused","error":{"code":"conflict","message":"Already answered","details":{"decision":<record>}}}`. Bind conflict uses `details.project`. `not_open` uses `details.open`, a record or null. Other answer refusals carry empty details and retain every row of the answer table, including faulted-task replacement on an equal resend.

`bad_options` and `options_invalid` use `details.errors`. Example:

```json
{"kind":"refused","error":{"code":"bad_options","message":"Patch refused","details":{"errors":[{"path":"/designer","code":"format","message":"Unknown model"},{"path":"/extra","code":"additionalProperties","message":"Unknown key"}]}}}
```

A storage exception returns HTTP 500 with `{"kind":"failure","outcome":"unknown","error":{"code":"storage_failure","message":"Outcome unknown","details":{}}}`. No complete valid response, including a timeout or proxy error, also means unknown outcome. A refusal means the requested change did not occur, though its details can show an earlier answer. Measured: storage rejection has unknown outcome, `D/src/types.ts:1333-1344`. There is no universal retry policy. `create` can duplicate. `stop` can stop a newer run.

A cursor is a JSON object, not a token string:

```json
{"v":1,"call":"history","project":"p","conversation":2,"before":501}
```

`conversation` exists only for history. `cursor:null` starts at the newest row. `before` is exclusive, and the next cursor uses the smallest returned ID. Entries page by entry ID, conversations by conversation ID, faults by task ID across the installed kinds. Filter faults before selecting the page. Validate scope and safe integers. Invalid cursors return `bad_cursor`, never silently restart. Cursors have no expiry or process state. Mutable list states are current, not a frozen query. Timeline and history entries are immutable.

Map busy and idle submission rejections to `busy` and `idle`. Use `unknown_project`, `unknown_workflow`, `unknown_conversation`, `unknown_model`, and `reserved_conversation` for those preconditions. The event log refuses all four agent mutations, as `host.md` requires. Other shape errors use `invalid_request`. Refusals have no stack traces.

Reject malformed inputs and unknown argument fields with pi-schema before dispatch. Validate paths, headers, configuration, cursors, and incoming response frames at their boundaries. Unknown response fields are allowed. Limit request bodies to 1 MiB. Return `too_large` before dispatch.

## 3. Streaming

A successful watch returns HTTP 200 with `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-store, no-transform`, and no content length. Each event is exactly `data: `, compact JSON, and two LF bytes. JSON strings escape embedded newlines. A stream parser must handle split UTF-8 and split delimiters.

First send `{"kind":"snapshot","seq":0,"value":...}`. Then send `{"kind":"value","seq":1,"value":...}`, increasing `seq` per response. Values replace the earlier value, except timeline values append entries. No SSE `id`, `Last-Event-ID`, or resume offset exists. Sequence numbers do not compare across connections.

For open, acquire `Conversation.watch()`, retain `watch.value`, start the listener, and serialize that retained snapshot before queued callbacks. Never do a separate read followed by watch attachment. Use the default 50-to-100 entry window. The docs contain settings in `pi.agent`, queued input in `pi.inbox`, and run, partial answer, tool output, and last failure in `pi.live`. Measured: `D/src/harness/view.ts:78-84`, `D/src/harness/live.ts:21-43,159-194`, `D/src/harness/inbox.ts:8-21`.

For inbox, ensure each project's open-list document exists, then attach its watch. Treat it as an invalidation signal. Read open slots and their decision records in one read-only commit per project. Buffer notifications during initial reads, then repeat any invalidated read. Publish only after every project has a value. Sort by descending `requestedAt`, then project and decision ID. Add watches when bind publishes a project. There is no atomic cross-project instant. A project-watch failure fails the whole inbox, never silently removes its decisions.

For timeline, attach the event-log watch first as an invalidation signal. Read the requested page and current log high ID `liveAfter` in one read-only commit. Use zero for an empty log. After the snapshot, scan entries strictly above that high ID, oldest first, in batches of 100. Drain through the latest observed high ID before waiting again. Thus a folded watch window cannot discard an event from a healthy stream. Historical cursors select older pages. They do not request catch-up replay. Each new response's live boundary is current, regardless of its page cursor.

Measured: ordinary pi-durable watches fold changes while a callback waits, and may replace the whole value, `D/README.md:525`. `host.md`'s "each change" is too strong if it means every transient partial or every commit. This design preserves the latest folded state. Persistent events can be paged. Reconnect never recovers transient states.

Await response drain rather than queue unlimited frames. Keep at most one pending whole value per open or inbox. Timeline keeps a high ID, not a backlog in memory. If a write cannot drain within 30 seconds, destroy that response. Do not pause work. There is no frame-size cap, so a single large entry remains a memory risk.

Send `: ping\n\n` every 15 seconds without data. After 45 seconds without bytes, the reader treats the watch as lost. Serialize pings with data. Idle runs do not end a watch. Planned closure sends `{"kind":"end","reason":"shutdown"}`. A source failure sends `{"kind":"error","error":{"code":"watch_failed","message":"Reconnect","details":{}}}` and closes. Unexpected EOF is a failure. Disconnect releases watches, never the run.

## 4. Auth

Use bearer tokens in the Authorization header on every POST, streams included. No cookies, query tokens, or token in event data. Never redirect an authenticated request.

The owner runs `tau serve --console` on the home machine. Its local stdin accepts `device add d-laptop`, `device list`, and `device revoke <id>`. These are local administration, not added client calls. Add takes a new device ID with project-name syntax and uses that ID as its label. Refuse an existing ID, including a revoked one. Persist `{id,label,sha256,revoked:false}` in `~/.tau/devices.json`, mode 0600 under a 0700 directory. Replace the file atomically before printing a fresh `t1.<id>.<secret>` once. The console is its only writer. Startup validates the file and fails closed on corruption. Use 32 random secret bytes, base64url without padding. Inferred: Node crypto suffices. Compare secret hashes in constant time.

The laptop stores the token in its private credential store or a 0600 file. For the phone, the owner types `device add d-phone` at that same console, then pastes the printed token and server URL into the phone's credential input. No network pairing endpoint or public registration exists. This costs a manual transfer. Do not put the token in shell arguments or shared clipboard sync.

The server resolves the token to a device ID and passes that ID to `answer`. Client-supplied `by` is invalid. All devices have the owner's access to all projects.

Revocation persists first, then blocks new admission and closes that device's watches. Already admitted mutations may finish. Restart reloads the revoked state. Hash-only storage does not isolate the server's account from itself.

Assume a reachable home HTTPS origin, for example `https://tau.example`, with a valid certificate and port forwarding to a TLS proxy. Forward only to loopback HTTP. Local HTTP is allowed only on loopback, still with a token. Reject unexpected Host values and any present foreign Origin. Offer no CORS access. Redact Authorization and bodies from access logs. Reported: browsers permit same-origin Fetch with Authorization. This was not browser-tested.

## 5. Versioning

Every response advertises `Tau-Versions: 1` and `Tau-Calls`, a comma-separated list of implemented names. Learn these from any existing call, such as `projects`. No discovery call is added.

An unknown major returns 426 `unsupported_version` before dispatch, with those headers. An absent call returns 404 `unsupported_call`. The transport remains unchanged when calls are added or renamed. A rename can keep an alias. A removed alias is absent from the advertised set.

Within major 1, optional response fields and error codes may be added. Existing field meanings, required inputs, and retry semantics cannot change. Unknown response fields are ignored. Unknown refusal codes remain refusals, shown through `message`, without automatic retry. Unknown frame kinds or missing required fields invalidate a watch and require a fresh snapshot. Incompatible contracts require another major or call name. Supporting major 1 does not promise every capability forever.

## 6. The script, step by step

1. At the home console, issue laptop and phone tokens as above. Paste each only into its own device. The first network traffic is an authenticated POST to `projects`. Phone traffic traverses HTTPS, the proxy, then loopback HTTP.

2. Send the bind exchange above, then `setOptions` with `{workflow:"w1",patch:{designer:"missing/x",extra:true}}`. Receive the two-error refusal shown above. Nothing is written. Send a valid patch. Send `create` with `{model:"faux/faux-1"}` twice after a timeout. It can create conversations 1 and 2. Send input to 2 twice with `text:"Build it."`, `requestId:"r9"`, `mode:"followUp"`, and `onlyIfRunning:false`. Both return submission 7, initially placed as entry 10. Do not resend create implicitly.

3. Send `open` for 2. These are three complete illustrative wire fixtures, not measured output. Each block ends with two LF bytes. The first snapshot shows a run before generation starts. The later frames show partial text and a running tool's output. Omitted optional documents are absent.

```text
data: {"kind":"snapshot","seq":0,"value":{"conversation":{"id":2},"entries":[{"id":10,"conversationId":2,"kind":"pi.user","model":[{"role":"user","content":"Build it.","timestamp":1}]}],"docs":{"pi.agent":{"cwd":"/srv/p","model":{"provider":"faux","modelId":"faux-1"},"extensions":["coding-tools"]},"pi.inbox":{"items":[]},"pi.live":{"run":{"taskId":4,"inputs":[7],"turns":0,"first":10}}}}}

```

```text
data: {"kind":"value","seq":1,"value":{"conversation":{"id":2},"entries":[{"id":10,"conversationId":2,"kind":"pi.user","model":[{"role":"user","content":"Build it.","timestamp":1}]}],"docs":{"pi.agent":{"cwd":"/srv/p","model":{"provider":"faux","modelId":"faux-1"},"extensions":["coding-tools"]},"pi.inbox":{"items":[]},"pi.live":{"run":{"taskId":4,"inputs":[7],"turns":0,"first":10},"generation":{"attempt":1,"message":{"role":"assistant","content":[{"type":"text","text":"Reading"}],"api":"faux","provider":"faux","model":"faux-1","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"pending","timestamp":1}}}}}}

```

```text
data: {"kind":"value","seq":2,"value":{"conversation":{"id":2},"entries":[{"id":10,"conversationId":2,"kind":"pi.user","model":[{"role":"user","content":"Build it.","timestamp":1}]},{"id":11,"conversationId":2,"kind":"pi.assistant","model":[{"role":"assistant","content":[{"type":"toolCall","id":"c1","name":"bash","arguments":{"command":"pwd"}}],"api":"faux","provider":"faux","model":"faux-1","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"toolUse","timestamp":1}]}],"docs":{"pi.agent":{"cwd":"/srv/p","model":{"provider":"faux","modelId":"faux-1"},"extensions":["coding-tools"]},"pi.inbox":{"items":[]},"pi.live":{"run":{"taskId":4,"inputs":[7],"turns":1,"first":10},"tools":[{"taskId":5,"callId":"c1","name":"bash","status":"running","output":"/srv/p\n"}]}}}}

```

Send another input with `mode:"steer"`, `onlyIfRunning:true`, and a new request ID. A later whole value has its submission in `docs["pi.inbox"].items`, then removes it when placed. At run end, entries include the final answer and tool result, and `pi.live.run` is absent. The watch stays open.

4. Phone sends `inbox` with `{args:{}}`. Snapshot items include projects p and q. Send `decision` for p and `w1:42:design#3`. Its basis includes `{id:30,text:"Plan text"}`. Send the answer exchange above. After the drop, resend identical basis, choice, and annotations. Receive `repeated:true`, preserving `by:"d-phone"`. If its continuation faulted, this resend creates its replacement. Another device sending `choice:"revise"` receives conflict with the winner's record.

5. Wake and repeat `open`, without sequence or last-event headers. Receive a fresh snapshot numbered zero. Reconnection itself marks a discontinuity. Compare immutable entry IDs, and use history until the earlier known entry overlaps. Numeric IDs are not consecutive within a conversation. The protocol cannot count missed transient changes or recover lost partial text. Measured: progress can precede storage and disappear on crash, `D/README.md:527`.

6. On the bad link, whole values replace pending values. If drain stalls for 30 seconds, the server closes only that response. The phone reopens for current state. Timeline data remains available through pages, not through a retained network queue.

7. Send `timeline` with `cursor:null`, then follow five page cursors to read 500 older events. Read each page's snapshot and close that page watch when done. After a restart, resend the same cursor. It selects the same older immutable entries. New live delivery begins after the new `liveAfter`, not after the old connection's last event.

8. At the home console, list devices and revoke the phone ID. Its streams close. Later POSTs receive 401 `unauthorized`. A committed answer is not undone.

9. An old client ignores a new optional field. A new refusal code still means no new effect. A gone call yields `unsupported_call`, not a guessed replacement. A new client sees an old server's advertised set and cannot use an absent capability. An unsupported major yields 426.

10. All three watch connections end. On reconnect, all three acquire current snapshots. No protocol state needs recovery. The host independently reopens projects and resumes work as `host.md` requires.

11. No answer tool, no extension export, and token checks stop accidental answers. They do not prove a human acted. In this setup the same-account shell can read the laptop's token file or alter the store directly. Hashed server tokens do not fix that. Measured: bash inherits the server environment, `D/src/tools/bash.ts:84-86`. The accepted weak mode remains.

## 7. What changes in `docs/core`

1. `wire.md`, new protocol reference. Home: host. Status: Proposed. Copy sections 1 to 6 after acceptance.
   Checks 1-2: W0 cannot leave the process. Library watches are local handles, measured at `D/src/harness/types.ts:886-894`.
   Checks 3-4: A workflow-provided tool cannot serve a workflow-agnostic phone or guard answer admission. The client clause applies.
   Check 5: One HTTP adapter and credential file, no second scheduler. Watch heartbeats belong to connection lifetime, not work scheduling.
2. `host.md`, link each row to its wire mapping and add local device administration. Home: host. Status: Proposed under ruling 27.
   Checks 1-2: Retried writes and stolen credentials lack wire rules. The cited storage and submission contracts do not authenticate HTTP.
   Checks 3-4: An extension-owned login would still need host admission. Every client requires it.
   Check 5: Reuse item 1. No extra client call or store-layer change.
3. `README.md` and `topology.md`, replace "no protocol yet" and clarify one server relationship versus one socket. Home: docs. Status: Proposed. No additional core mechanism, so checks 1-5 are inherited from item 1.
4. `grounding.md`, add source citations and the probe result. Home: evidence. Status: Measured for that run only. No core change.

## 8. Not verified

The final command was `PI_MODULES=/tmp/render-spike/pi-1.5.2/node_modules/@earendil-works node /tmp/arena-wire/candidate-2/probe.mjs`. It printed exactly:

```text
PASS HTTP SSE snapshot, partial text, tool output, queued steer, run end
PASS input resend returns first submission
PASS late join starts with current tool and queue
PASS busy watch folds three commits into one value
PASS SQLite reopen starts with current state
```

Earlier probe attempts failed on extension-object setup, asynchronous conversation lookup, and a wrong expected entry kind. Those probe errors were corrected. No Tau code ran. The successful probe used a faux provider and a clean close, not a process kill. It did not test a browser, TLS, proxy buffering, actual slow network drain, inbox merge races, cursor paging, revocation, or upgrades. Those require tests before host code. Large whole values and the frozen borrowed schemas need review. No load claim follows from this probe. A separate document check parsed all three stream fixtures as JSON, counted eight sections, and found no long dashes.
