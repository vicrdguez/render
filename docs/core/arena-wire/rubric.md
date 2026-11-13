# Rubric (the picker's tool; candidates never see it)

Score each criterion 1 to 5 with quoted evidence.

1. **An engineer can build both ends from it.** The three named calls are given in full. One rule gives every other call. Refusals, unknown outcomes, cursors, and IDs with awkward characters are each exact. Nothing is left to invent.
2. **It fits the stack and stays small.** The dependencies of the transport are counted honestly. A browser, a phone, and a CLI can all speak it. It can be tested with `node --test`. No client is designed and no call is added. A renamed or added call needs no protocol change.
3. **Streaming is right on pi-durable.** The state now, then each change. A slow client, a dead link, a reconnect, and a server restart are each answered. `inbox` across projects is answered. Check at least three load-bearing claims against the pi-durable and Chord source. A probe that ran counts for more than a citation.
4. **Auth is real for one owner with several devices.** The first token, a phone on another network, what is stored where, revocation, and the device ID on `answer`. The design is honest about what protects the token in transit and about the accepted weak mode.
5. **Versioning and resends hold.** Old and new in both directions, unknown fields, a removed call. The resend rules of `host.md` survive on the wire: request IDs, the equal resend of an answer, and a timeout with an unknown outcome.
6. **Candor and evidence.** Labels are used correctly. "Not verified" is complete. Nothing is claimed as run that was only read. The script's eleven steps are each walked.

Then answer:

- Which candidate is the best base for the next version of `docs/core`?
- Which one or two ideas from each other candidate are worth porting?
- Where do candidates disagree on a fact, and who is right?
- What did every candidate miss?
