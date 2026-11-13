# Wire design verdict

Recommend **candidate-2** as the base, not as ready to build unchanged. It best preserves the 20 calls, keeps errors distinct from unknown outcomes, and defines a stable contract. Its whole-value bandwidth cost needs work.

## Scores

Scores are 1 to 5, equally weighted. Evidence below refers to each candidate's `design.md` unless named otherwise.

| Criterion | candidate-1 | candidate-2 | candidate-3 |
| --- | ---: | ---: | ---: |
| 1. Build both ends | 3 | 4 | 3 |
| 2. Fits stack, stays small | 3 | 4 | 3 |
| 3. Streaming | 3 | 4 | 3 |
| 4. Auth | 4 | 3 | 2 |
| 5. Versions and resends | 2 | 4 | 2 |
| 6. Candor and evidence | 3 | 4 | 3 |
| **Total / 30** | **18** | **23** | **16** |

## Checks and runs

All designs have exactly the eight required sections, in order, and walk eleven steps. `wc -w` found design/rationale counts of **3395/396**, **3199/367**, and **3390/393**. All meet both limits. All carry awkward IDs such as `w1:42:design#3` safely in JSON bodies.

I read the candidates, including saved output, and reran all probes from `/tmp/arena-wire/judge` with the required `PI_MODULES`. `TMPDIR` kept their scratch files here. All exited 0; no candidate probe failed. Their last lines were:

- candidate-1: `ok: checks W1-W9 passed`
- candidate-2: `PASS SQLite reopen starts with current state`
- candidate-3: `ok: all steps ran in 4792 ms`

Logs are `probe-1.log`, `probe-2.log`, and `probe-3.log` here. Candidate-1 tested real HTTP drain and SQLite reopen. Candidate-2 tested a blocked watch callback, not a slow network. Candidate-3 tested real SIGKILL, three broken watches, and paging after restart. These are not equal levels of evidence.

I checked at least these three load-bearing claims **for each candidate** against downloaded source, without executing it. Below, D is `/tmp/render-ground/pi/packages/durable`; C is `/tmp/render-ground/pi/packages/chord`:

1. A view starts with 50 entries and trims after 100: confirmed, `D/src/harness/view.ts:37-69,354-369`.
2. Callbacks run one at a time and pending changes fold: confirmed, `C/src/watch.ts:43-54,279-286`; overflow becomes replacement, `C/src/delta/pending.ts:9-12,43-48`. This bounds op count, not bytes or unseen events.
3. Reused request IDs compare only submission type: confirmed, `D/src/harness/submissions.ts:231-239`.

Also confirmed: storage rejection can have unknown outcome, `D/src/types.ts:1333-1344`; native cursors contain record position and order, not process state, `D/src/storage/scan.ts:15-40`; seven plain ops differ from compressed WireOp, `C/src/delta/index.ts:14-65`.

## Evidence by candidate

### candidate-1

1. **Build, 3.** The named calls and three reply bodies are useful. But “one field per item” leaves work to the builder. The single native scan cursor does not settle paging the merged per-kind `faults` scan.
2. **Small, 3.** “HTTP/1.1 from `node:http`” counts transport costs well. Yet “one file, one socket, one request” hides three admin routes plus pairing. `timeline` loses its required cursor and `history` gains event-log access. These are admitted scope changes, not carriage of the table unchanged.
3. **Streaming, 3.** “`timeline` sends that view” inherits window loss under folding. Gap repair is described on reconnect, not during a live stalled stream. New projects joining an existing inbox are not covered. W3b is strong drain evidence.
4. **Auth, 4.** “the phone and laptop join the tailnet” gives a concrete remote route. Header tokens, hashed storage, revocation, device attribution, and the same-user shell limit are clear. Log redaction and redirect handling are not.
5. **Versions, 2.** “which changes when pi-durable does” is a serious contract hole. A stable envelope does not preserve renamed fields inside `pi.live`. The cited rename is real: `D/src/harness/live.ts:197-205`.
6. **Evidence, 3.** “This is the weakest point” is candid. But W6 actually emits reason `closed`, not the claimed `stopping`. W9 rejects `by` on `input`, not on `answer`. Source citations and passing probes do not prove those wire claims.

### candidate-2

1. **Build, 4.** “normative by reference to the 1.5.2 JSON shapes” and “Validate scope and safe integers” make both ends much less open to guesswork. The three calls, refusal details, page order, and cursor scope are explicit.
2. **Small, 4.** “No discovery call is added” is backed by headers on existing calls. No transport package, admin socket, or public pairing service is needed. Whole values spare non-JavaScript clients an op engine, at a large byte cost.
3. **Streaming, 4.** “Drain through the latest observed high ID” protects timeline events from window folding. It also covers bind-time inbox membership and project-watch failure. Actual drain, timeline scans, and inbox races were not tested.
4. **Auth, 3.** “pastes the printed token” leaves the safe transfer to a phone on another network unstated, while banning shared clipboard sync. Persist-before-print, revocation, Host/Origin checks, redacted logs, and honest weak-mode limits are good.
5. **Versions, 4.** “New runtimes must adapt incompatible shapes” addresses the hole in the other designs. Capability headers, absent calls, unknown refusal codes, and dangerous create/stop resends are clear. The shared request-ID gap below remains.
6. **Evidence, 4.** “illustrative wire fixtures, not measured output” correctly separates examples from runs. The blocked-callback probe proves folding, and the text expressly disclaims actual slow-network testing. It supplies no measurement of its main bandwidth trade-off.

### candidate-3

1. **Build, 3.** The seven op tuples are clearer than candidate-1's short list. But “A client sends `next` back as `cursor`” omits how query bounds survive: its probe repeats bounds separately; its cursor stores only position and order.
2. **Small, 3.** “The same name under `/v1/call/` answers the first value once” adds snapshot behavior for three streaming calls. Discovery, pairing, separate route families, and two file directories increase the surface beyond candidate-2.
3. **Streaming, 3.** “at worst one `r`” preserves current state, not every event. The real stall and kill tests are valuable, but live gap repair and newly bound inbox projects remain unspecified.
4. **Auth, 2.** “checks the modification time” does not detect an ordinary rewrite inside the device directory. W8 tests temp-file rename instead, a needed rule absent from the design. The remote route is also less concrete than candidate-1's.
5. **Versions, 2.** “A 4xx means ... wrote nothing” mistakes a status for a valid Tau refusal. Raw durable views remain unpinned. A new root replacement cannot repair an incompatible field rename.
6. **Evidence, 3.** SIGKILL and 500-event paging really ran. But “`create` and `input` each timed out” did not: the probe receives both replies and then resends. The same applies to the claimed dropped answer reply.

## Disagreements and rulings

**Whole values versus ops.** `facts.mjs`, using only Node's standard library, serialized 1,000 text updates of 100 bytes, with no old entries. Candidate-2's frames cost **50,217,061 bytes**, candidate-1's **200,157**, candidate-3's **187,148**. This is a byte fixture, not a network benchmark. Ops win bytes; whole values win client simplicity. Non-JavaScript ops clients must implement path, array, and UTF-16 string rules.

**Can timeline page and stream?** Candidate-2's separate page snapshot and live high ID refute the claimed need to remove its cursor. My approved-install probe folded 11,000 events into a replacement containing only **86**. Candidate-1/3 expose `before`, but do not require live gap repair. Final-view equality alone cannot prove event delivery.

**Refusals and revocation.** My standard-library probe delivered a proxy 408 after one app write. Candidate-1/2 correctly treat a non-protocol reply as unknown; candidate-3's status-only rule is unsafe. It also confirmed that rewriting a device file leaves directory mtime unchanged, while rename changes it.

**Chord versions.** Candidate-1/3 overstate lockstep upgrades. `C/src/link/channel.ts:245-249` compares wire protocol, not Tau release numbers. That is not proof Chord cannot serve older clients.

## Base, ports, and shared misses

Use **candidate-2**. Port candidate-1's measured plain-op approach and byte-exact fixtures. Port candidate-3's optional `after` optimization and real kill/restart test approach. Do not port status-only refusal handling.

Every candidate omits cross-device request-ID uniqueness. All use `client:` without a device namespace or a stated globally unique-ID rule. My approved-install check sent two different texts with `client:r1`: the phone got the laptop's submission, and its text vanished. See `durable-facts-final.log`. Its first attempt failed from my missing model-registry setup, then passed after correction.

No candidate probe cuts a reply after commit, tests a faulted continuation's equal-answer resend, or uses a real browser, TLS proxy, and remote phone. Those remain acceptance gaps, not proven behavior.
