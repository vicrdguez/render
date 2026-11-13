/**
 * Streams (docs/core/protocol.md, "A stream" and "A slow client, a dead link, the end"). Unit 2.
 * Seam: `serve` on port 0 and a raw `http.request` client that can pause reading.
 */

import { test } from "node:test";

test.todo(
	"the first frame is r with the whole value; the value built from the ops equals a new watch's first frame (W4)",
);
test.todo("a client that stops reading gets fewer frames than commits, and history fills the gap before shows (W5)");
test.todo("after 15 s with no frame the server writes a heartbeat line");
test.todo("a write that has not drained in 60 s ends the stream");
test.todo("a clean stop ends every open stream with end stopping (W9)");
test.todo("a store's watch that fails ends the inbox with end failed");
test.todo("a client that closes its request stops the watch, and the run it watched goes on");
test.todo("a refusal before a stream comes as an ordinary JSON reply, not as a stream");
