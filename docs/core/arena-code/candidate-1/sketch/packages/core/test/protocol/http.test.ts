/**
 * The transport (docs/core/protocol.md). Unit 2. The checks of docs/core/spikes/wire.mjs, against the real server.
 * Seam: `serve(host, { port: 0 })` on 127.0.0.1 and `fetch`; a client in the test applies the ops with its own code.
 */

import { test } from "node:test";

test.todo("pair: a code from the admin side gives a token once; devices.json holds a hash and no token (W1)");
test.todo(
	"pair: a wrong code is bad_code; five wrong codes in a row cancel every pending code; a code expires at 10 min",
);
test.todo("a reply is exactly one of result, refused, unknown; every reply has Tau-Protocol: 1");
test.todo("the status of each refusal code comes from refusalStatus; unknown is 500");
test.todo("a body over 1 MiB is too_large; a body that is not JSON is bad_request");
test.todo("an unexpected Host header is refused; an Origin of another site is refused; no CORS header is ever sent");
test.todo("Authorization never appears in a log line");
test.todo("a storage call that rejects answers unknown storage_failed, and the same body resent converges");
test.todo("revoke ends the device's streams with revoked and its next call is unauthorized (W8)");
test.todo("the server listens on 127.0.0.1 only");
