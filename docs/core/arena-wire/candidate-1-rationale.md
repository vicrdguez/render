# Rationale

**Transport.** One WebSocket was the closest rival. I rejected it because Node has no WebSocket server, so the core would take `ws`, and because calls and streams on one socket need IDs and flow control that HTTP already has. Chord's link was rejected because its hosts refuse another protocol version and it needs a Chord host. JSON lines over SSH reach no browser or phone. For the stream body, `text/event-stream` beat NDJSON for its heartbeat comment line and a content type that proxies recognise (reported). HTTP/2 was left out: three streams fit a browser's HTTP/1.1 connection limit (reported).

**Message shapes.** JSON-RPC on one endpoint was rejected: a call name in the path shows in logs and makes an unknown call a plain 404. REST paths with IDs were rejected, because `w1:42:design#3` would need escaping. An idempotency key on every call was rejected: the owner accepted the duplicate `create`, and the other calls already converge. A signed cursor, as in Render v1, was rejected: one owner's token reads everything.

**Streaming.** Whole values resend the full partial answer up to ten times a second. Named events such as Render v1's `text_delta` need a mapper that follows pi-durable, which removed its own event stream in 1.5 (reported, grounding.md). Chord's `WireOp` path interning adds decoder state, so plain `Op` tuples won. Event IDs with `Last-Event-ID` were rejected, because the ruling says no replay. Cutting a slow client after N queued messages, as Render v1 did, lost to waiting for `drain`, which lets pi-durable fold.

**Auth.** Chord's public pairing request needs an owner session in a browser, and no browser client exists. A whole token is long to type on a phone. A cookie session needs CSRF guards. Tailscale's identity headers were rejected as authority. I kept the admin socket although an agent's shell can reach it: the accepted weak mode already allows as much.

**Versioning.** A version field in every body and a handshake lost to the path prefix. A `capabilities` call would add a call; the `unknown_call` refusal already lists them. A server that ignores unknown fields was rejected, because a dropped `whenIdle` changes what a call does.

**Where I think the docs are wrong.** The `timeline` row's one "cursor" cannot both page and stream. I read it as `from` and page with `history`. The admin socket widens the weak mode, and the owner should confirm that.
