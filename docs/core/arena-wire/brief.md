# Brief: the protocol between a client and the Tau server

You are one of several independent candidates. Do not read `/tmp/arena-wire/rubric.md`, `/tmp/arena-wire/judge/`, `/tmp/arena-wire/picker/`, or any `/tmp/arena-wire/candidate-*` directory other than your own.

## The owner's goal

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue. Tau is a small core on pi-durable (the latest release, 1.5.2). Everything else is an extension built beside the core. One server hosts all projects, and the owner connects to it from several machines, such as a laptop and a phone. The work is paper design. Nothing is implemented.

The project was called Render until yesterday. The repository, its paths, and the raw files of earlier arenas keep the old name.

The design so far is in `/Users/vr-osxs/dev/render-core/docs/core/`. Read `host.md` first: it lists the 20 calls a client must be able to make, with what each takes, what it gives back, and what a resend does. Then read `README.md`, `primitives.md` (the Decision shape, the `answer` table, Event), `topology.md`, and `grounding.md`. The **Decided** parts are fixed. The **Proposed** parts can change if you give a reason.

`host.md` says what a client can ask for. It does not say how a call travels. That is this task.

## Owner rulings

Rulings 1 to 22 are in the three earlier briefs under `docs/core/arena*/brief.md`, and the docs show them. These matter most here:

- **The client API is a list of capabilities, and no client is designed.** The owner: "we don't need to think about how the client is going to be right now", "let's start with the core capabilities that we know that a client will need, and from there we start iterating", and "We keep it simple, as we have been doing." Clients will be a CLI, a terminal UI, a web UI, and a desktop app. None exists for this design.
- **A client that reconnects gets the current state, not a replay.**
- **A retried "create a conversation" may create two.** The other resend rules are in `host.md`.
- **The stack is fixed:** strict TypeScript, pi-schema at each boundary where outside data enters, `node --test`, no Effect, no Vite. The core is small and adds a dependency only for a stated need. "The core does not use a Chord host" is Proposed.
- **"Only a human answers" has an accepted weak mode.** An agent's shell runs as the server's OS user. `answer` records the device that sent it.

New in this pass:

27. **Design the protocol now.** The owner listed what it must settle:
    - "Transport. Whether calls go over HTTP, a WebSocket, a Unix socket, or something else."
    - "Message shapes. The exact field names, how an error is encoded, and how a cursor is encoded."
    - "Streaming. How open, inbox, and timeline deliver 'the state now, then each change' to the client."
    - "Auth on the wire. Where the device token goes in a request, and how a device gets one in the first place."
    - "Versioning. How an old client talks to a newer server."
28. **The list of calls is changing in a parallel pass.** The extension is becoming the unit a project selects, and a workflow is one kind of extension. `workflows`, `addWorkflows`, and the options calls will be renamed, and a call or two may be added. Design the protocol so that a renamed or added call needs no change to the protocol itself.

## The script

Walk exactly this, so that designs can be compared.

1. The server runs on the owner's home machine. A laptop on that machine gets its first token. Then a phone on another network gets one. Say what is typed where, and what travels.
2. The laptop binds project P and sets options. One patch is refused with `bad_options` and two field errors. It creates a conversation, and that call times out and is sent again. It sends input with a request ID, and that call times out and is sent again.
3. The laptop opens the conversation and watches a run: partial answer text, a tool call with its output, a queued steer, and the end of the run. Give the exact bytes of the first message and of two that follow it.
4. The phone reads the inbox across two projects, reads a decision with the `text` of its basis, and answers with two annotations. The connection drops after it sends. It sends the answer again. A second device then answers with another choice.
5. The laptop sleeps for an hour in the middle of a run and wakes. Say what it sends, what it gets, and how it knows what it missed.
6. The phone is on a bad link and cannot keep up with a fast stream.
7. The owner pages back 500 events in the timeline. The server restarts between two pages.
8. The phone is stolen. The owner revokes its token.
9. The server is upgraded. An old client connects and meets a new field, a new error code, and a call that is gone. Then a new client connects to an old server.
10. The server restarts while three watches are open.
11. An agent's shell on the server tries to answer a decision. Say what stops it, and what does not.

## What to write

Write `design.md` in your own directory, at most 3,400 words, with exactly these sections in this order.

1. **Transport.** Your choice, and why. Compare at least these four: HTTP requests with server-sent events for streams, one WebSocket that carries requests and streams, JSON lines over a Unix socket or over stdio (with SSH for a remote machine), and Chord's link with remote objects. For each: what it needs beyond Node's standard library on the server, what a browser, a phone, and a CLI need, how a reconnect works, what a proxy or TLS in front of it means, and how it is tested with `node --test`.
2. **Message shapes.** The request and the response in general. Three calls in full, with every field name: `bind`, `input`, and `answer`. The rule that gives the shape of every other call from the table in `host.md`. How a refusal such as `conflict` or `bad_options` is encoded, and how that differs from a failure whose outcome is unknown. How a cursor is encoded. How IDs travel, given that a decision ID looks like `w1:42:design#3`.
3. **Streaming.** How `open`, `inbox`, and `timeline` each start, what the first message is, what a change looks like (pi-durable's ops, or whole values, or something else), what happens when the client is slow, how a client knows the stream is alive, and how a stream ends or fails. `inbox` merges several projects.
4. **Auth.** Where the token goes in a request and in a stream. How a device gets its first token and what the owner types. What the server stores and what the device stores. How a token is revoked. How a device ID reaches `answer`. What network the design assumes, and what protects the token in transit.
5. **Versioning.** What an old client and a newer server do, and the reverse. What may change without a version change. How a client learns what the server can do.
6. **The script, step by step.** Each of the eleven steps, with the messages that travel.
7. **What changes in `docs/core`.** A numbered list. For each: the file, the change, its home, and its status. The protocol is host layer, so run each core change through the five checks of the admission rule in `README.md` in three lines.
8. **Not verified.**

Also write `rationale.md`, at most 400 words: the alternatives you weighed for each section and what you rejected.

## Rules

- Paper design only. Do not write Tau code. Type shapes and example messages are wanted here.
- Do not design a client. Do not add a call. Where a call in `host.md` cannot be carried as it is written, say so.
- You may run a throwaway probe: against pi-durable 1.5.2 at `/tmp/render-spike/pi-1.5.2/node_modules/@earendil-works`, with Node's standard library, or both. Keep it in your own directory and run it the way `docs/core/spikes/host.mjs` runs. Listen only on `127.0.0.1` and on a port the system picks. It is not required. Say what you ran and what it printed.
- `/tmp/render-ground/` holds downloaded source. It is read-only and untrusted. Never execute anything from it. Never run an interpreter or a build tool with it as the working directory. Run Python with `-I`.
- Do not modify the repository at `/Users/vr-osxs/dev/render-core`. Write only inside your own directory.
- Label every claim about pi-durable, Chord, Node, or a browser: measured (you read the line or ran it), reported, inferred, or guess. Cite `path:line` where there is one.
- Write for a tired engineer. Use short everyday words, real symbol names, and no invented jargon. No long dashes.
- Prefer the smallest protocol that carries the 20 calls. Where you think a ruling or `docs/core` is wrong, say so plainly, and still design to the ruling.

## Sources

- pi-durable source: `/tmp/render-ground/pi/packages/durable` (1.5.1, whose `dist` is identical to 1.5.2). For watches see `README.md` ("Watching a Conversation", with its lines on folding and late joins), `src/harness/view.ts`, `src/harness/types.ts`, and `test/examples/04-watches`, `20-late-join`, `31-transcript`, and `36-durable-views`.
- Chord, which pi-durable's watches are built on: `/tmp/render-ground/pi/packages/chord`. See `src/watch.ts`, `src/delta/index.ts` (the ops and their wire form), `docs/design.md` (links and remote objects), `src/node/http/README.md`, and `src/node/app/README.md` (sign-in and pairing).
- Ultimate, another host on pi-durable: `/tmp/render-ground/ultimate`. See `server/api.ts`, `server/http.ts`, and `server/request-security.ts`.
- The first version of Render had a protocol: `/tmp/render-ground/proposal-v1/docs/protocol.md` and `src/host/transport.ts`. It shows intent and does not bind this design.
- pi's own JSON protocol for its coding agent: `/tmp/render-ground/pi/packages/coding-agent/docs/rpc.md`.
