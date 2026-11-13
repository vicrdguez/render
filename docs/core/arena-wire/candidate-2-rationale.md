# Why this protocol

1. HTTP carries one call per request, so it needs no request IDs beyond the two capabilities that already require them. I rejected WebSocket multiplexing because cancellation, authentication, and reconnect would need another shared protocol. SSH is attractive for a CLI but excludes a browser without a helper. Chord provides more than Tau needs. Keeping its existing watch library is different from adopting its host.

2. I chose one envelope and explicit named arguments instead of positional arrays or a different route family for every resource. JSON IDs avoid URL fragment mistakes. Structured cursors need no codec, signing key, expiry, or server memory. I rejected universal mutation receipts because they would contradict the accepted create behavior. Borrowed durable types save host projection code, but freezing them makes future runtime upgrades more work.

3. Whole values remove delta decoding and recovery rules. I rejected Chord's compressed operations for this first contract. Bandwidth is the cost. For timeline, however, whole-window replacement could hide events when a watch folds. Scanning immutable entries after a high ID preserves that call's append behavior without keeping a network backlog. A reconnect deliberately starts elsewhere, at current state.

4. Local token issuance avoids new pairing calls, cookies, pairing secrets, and a public registration service. The cost is manual transfer from the home console to the phone. Hashes reduce credential disclosure from the server file. They do not make a same-account shell harmless. I rejected claims of human identity stronger than the accepted environment allows.

5. Capability headers avoid a discovery call. I rejected application-build version matching. A major version fixes meanings, while the name list describes available capabilities. A removed call fails explicitly rather than acquiring a guessed meaning.

6. The script keeps retries at their actual boundaries. A response timeout does not cancel server work. Create and stop are intentionally not safe automatic retries.

7. All mechanisms remain in the host. I rejected new store records for network sessions and stream replay. Documentation links replace duplicate specifications.

8. The probe tests the chosen transport with a real watch, not a mock emitter. It does not establish browser support, hostile-network behavior, or upgrade compatibility. Those need separate evidence before implementation.
