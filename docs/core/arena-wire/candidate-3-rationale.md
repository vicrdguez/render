# Rationale

## Transport

- **One WebSocket.** Rejected. Its acks are the better flow control, but Node has no server for it, and request matching and status would become our protocol.
- **JSON lines over a Unix socket, stdio, or SSH.** Rejected as the first carrier, because no browser can use it.
- **Chord's link.** Rejected. Its versions refuse each other.
- **One event stream per client for every watch, as Ultimate has.** Rejected for now. It lifts the browser's 6-connection limit, and it costs stream IDs and subscribe requests.
- **Long polling with a watch handle on the server.** Rejected. It keeps state between requests.

## Message shapes

- **Refusals as 200 with a flag.** Rejected. The status splits done, refused, and unknown before any parsing.
- **The call name in the body.** Rejected. A path shows in proxy logs.
- **IDs in URL paths.** Rejected, because the `#` in a decision ID is cut off.
- **A signed cursor.** Rejected. It protects nothing.
- **A `timeline` call that pages and streams.** Rejected for `history` on the event log.

## Streaming

- **Whole values on each change.** Rejected for size.
- **Named events such as "text added".** Rejected. The host would diff `pi.live`, and pi-durable removed its own events.
- **Chord's `WireOp` form.** Rejected. It needs a decoder with state.
- **A view shaped by the host.** Rejected. Every op path would need rewriting. The cost is that clients see pi-durable's shapes.
- **Cutting off a slow client, as Render v1 did.** Rejected. Waiting for `drain` lets pi-durable fold.
- **`EventSource` with the token in the URL.** Rejected. URLs reach logs.
- **No `after`.** Weighed. It is smaller, and each reconnect then resends 50 entries.

## Auth

- **An admin socket for pairing, as Render v1 had.** Rejected for two directories of files.
- **Pairing that a paired device approves.** Rejected. It adds a call.
- **Trust by loopback or by Tailscale identity, as Ultimate does.** Rejected. `answer` must record a device.
- **Cookies.** Rejected. They need cross-site checks.
- **Tokens that expire.** Rejected for now. Revoking covers theft.

## Versioning

- **A version per call.** Rejected. A new name does the same.
- **A `features` list.** Rejected for the request schemas that the server already has.
- **A server that ignores unknown fields.** Rejected. A dropped `whenIdle` would start a run.
