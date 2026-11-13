# Protocol arena

This note records the fifth arena, run on 2026-11-13 beside the fourth. It produced [Protocol](protocol.md). The raw files are in `arena-wire/`, as their authors wrote them.

## What ran

The owner asked for the protocol in five parts: the transport, the message shapes, the streams, auth on the wire, and versions. The brief asked each author for those, and to walk one script of eleven steps. It told them that the list of calls was changing in the other arena, and that a renamed call must need no change to the protocol.

| Label | Author | Size | Ran code |
| --- | --- | --- | --- |
| Candidate 1 | `claude-opus-5-5` | 3,395 words | A probe, W1 to W9, with real HTTP |
| Candidate 2 | `gpt-6.1-sol` | 3,199 words | A probe, five checks, with real HTTP |
| Candidate 3 | The picker's model, in an agent with a fresh context | 3,390 words | A probe of all eleven steps, with real HTTP and a killed server |

- The picker wrote no candidate, for the reasons in [Extension arena](arena-ext.md).
- No author could read another's files or the rubric.
- A rate limit cut two authors off near the end. Each was resumed from its own saved session and finished its own files.
- The judge was `gpt-6-astra`. It ran all three probes again and wrote two checks of its own.

## Scores

| Criterion | C1 judge | C1 picker | C2 judge | C2 picker | C3 judge | C3 picker |
| --- | --- | --- | --- | --- | --- | --- |
| An engineer can build both ends | 3 | 4 | 4 | 4 | 3 | 4 |
| It fits the stack and stays small | 3 | 4 | 4 | 4 | 3 | 3 |
| Streaming is right on pi-durable | 3 | 4 | 4 | 3 | 3 | 4 |
| Auth is real for one owner with several devices | 4 | 4 | 3 | 3 | 2 | 3 |
| Versioning and resends hold | 2 | 3 | 4 | 4 | 2 | 3 |
| Candor and evidence | 3 | 4 | 4 | 4 | 3 | 3 |
| Total | 18 | 23 | 23 | 22 | 16 | 20 |

The judge and the picker disagree on the order of candidates 1 and 2, and both orders are close.

- **The judge weighs the contract.** Candidate 2 fixes the shapes that pi-durable owns, keeps a refusal apart from an unknown outcome, and carries all 20 calls as [Host](host.md) wrote them. Candidates 1 and 3 send pi-durable's view as it is and leave a client to break when pi-durable changes.
- **The picker weighs the stream.** Candidate 2 sends the whole value on every change. The judge's own fixture put that at about 50 MB for an answer that grows to 100 KB, against about 200 KB with ops. A phone cannot take that.

Both are right about what they weigh. The merged design is candidate 2's contract with candidate 1's stream.

## The base is candidate 2's contract

- Three bodies for a reply, and the rule that only the body counts.
- The shapes that pi-durable owns are fixed at 1.5.2.
- No discovery call, and no call added.
- Careful handling of the token: never in a URL, no redirect, no CORS, and none in a log.
- An inbox that takes in a project bound while the stream is open.

## What was changed in the base

| Change | Why | Source |
| --- | --- | --- |
| A stream carries pi-durable's ops, and the first frame replaces the whole value. | Whole values cost about 250 times the bytes in the judge's fixture. | Candidates 1 and 3. The frame with one kind is candidate 3's. |
| A device is paired with a code through an admin socket. | The base had the owner paste a whole token into the phone, and the judge counted that against it. | Candidate 1 |
| `open` takes `after`. | A client that reconnects then downloads only what it lacks. | Candidate 3. The judge asked for it. |
| The gap rule: when `before` is newer than what the client held, it pages with `history`. | A folded frame can leave entries out. The judge folded 11,000 events into a window of 86. | The picker, from the judge's finding. Candidates 1 and 3 had it for a reconnect only. |
| `timeline` is `open` on the event log, and `history` pages it. | One mechanism and one rule for both. The base kept the cursor on `timeline` with a second mechanism on the server. | Candidates 1 and 3. It changes two rows of [Host](host.md). |
| A request ID is stored under its device's name. | Two devices that both send `r1` collided. | The judge. No candidate had it. |
| A refusal has a 4xx status, and the rule that only the body counts stays. | A status helps a person with `curl`. The rule keeps a proxy's 409 from reading as a refusal. | Candidate 1 for the status, the base for the rule |
| A cursor is an opaque string that holds the query and the position. | The server is then free to change it. | Candidate 1 |
| The open list holds four fields for each subject. | The inbox then needs no read for each decision. | Candidate 1 |

## What all three found

- HTTP on `node:http`: one `POST` for a call, and the same `POST` answered by an event stream for a watch. No candidate chose a WebSocket, JSON lines, or Chord's link.
- `fetch` with a body reader on the client, because `EventSource` cannot send a header.
- The token in the `Authorization` header, and a hash of it on the server.
- IDs in the body and never in a path.
- A cursor that names a record, so that it works after a restart.
- A slow client is handled by waiting for the socket to drain and letting pi-durable fold.
- A client ignores a field it does not know, and a server refuses one.
- The server listens on loopback, and something that encrypts stands in front of it for other machines.

## Where the designs disagreed

| Question | Positions | Result |
| --- | --- | --- |
| What a stream carries | Candidates 1 and 3: ops. Candidate 2: whole values. | Ops. |
| How a refusal looks | Candidate 1: a `refused` body with a 4xx. Candidate 2: a `refused` body with 200. Candidate 3: any 4xx. | A `refused` body. The status repeats it. Any 4xx alone is unsafe. |
| The first token | Candidate 1: a code, through an admin socket. Candidate 2: a pasted token, from the server's console. Candidate 3: a code, through files the server polls. | A code, through an admin socket. |
| How a client learns the calls | Candidate 1: `POST /v1/`. Candidate 2: a header on every reply. Candidate 3: `GET /v1` with a schema for each call. | The refusal `unknown_call` lists them, and `POST /v1/` asks for it. |
| The timeline | Candidate 2: it pages and streams, with a scan on the server. Candidates 1 and 3: it streams, and `history` pages. | It streams, and `history` pages. |
| Whether Chord could serve old clients | Candidates 1 and 3: no, hosts of different versions refuse each other. | The judge found this overstated. It does not change the choice, which rests on needing a Chord host at both ends. |

## Rejected

| Part | Source | Why |
| --- | --- | --- |
| Whole values on every change | Candidate 2 | The bytes. |
| "A 4xx means the server wrote nothing" | Candidate 3 | A proxy can answer 4xx after a commit. The judge ran it. |
| Device files that the server polls by modification time | Candidate 3 | A rewrite in place does not change the directory's time. The judge ran it. |
| A pasted token | Candidate 2 | No safe way to carry it to a phone. |
| `GET /v1` with a schema for every call | Candidate 3 | More than a first client needs. |
| Two path families, one for calls and one for watches | Candidate 3 | One is enough. |

## What every design missed

**Request IDs across devices.** All three kept the host's `client:` prefix. The judge sent two different texts from two devices under one ID, and the second device got the first one's submission back. The fix is the device's name in the prefix, and W3 of the spike runs it.

## What the picker ran

`spikes/wire.mjs`, nine checks over real HTTP on loopback, with a client that applies the ops with its own code. W5 is the merged design's new rule: a client that stopped reading got 300 commits as 6 frames, `before` showed the gap, and `history` filled it.

## Verification

- `spikes/wire.mjs` printed `ok: checks W1-W9 passed` on four runs in a row.
- All three candidates' probes passed for their authors and for the judge.
- Every `path:line` citation in [Protocol](protocol.md) was resolved against its source.

Not verified: see the end of [Protocol](protocol.md). Nothing ran beyond loopback, and no browser or phone spoke the protocol.
