# durable-workspace: failure cases and independent expected outcomes

The initial catalog was written before product code, as required by `AGENTS.md` and spec §13. Rework cases below
were added to the executable suite and run red before their repairs (commits `cdd162f`, `4642811`). Each case names the trigger and the literal
observable outcome. The catalog rows in `.render/verify.md` execute them. Literal content digests below were computed
with `shasum -a 256` over the literal bytes, independently of Render.

| Literal | Bytes (shown escaped) | Length | SHA-256 |
|---|---|---|---|
| `G1` | `Ground: keep acknowledged work safe\r\n\xEF\xBB\xBF☃ 𝄞 café\r\n` | 56 | `a9f5b6f878692c7bb3c76ed6b6eb4baa791a2e57d1fd15fa7e26b35e338c0c47` |
| `A1` | `Saved by A: first exact revision\n` | 33 | `d3cde75e8b37c8d63e0d03706480dc8a113966019d752963689be108e86f3c0b` |
| `B1` | `Stale edit from B\n` | 18 | `bd9a08c34d91f52c8fe5341e23b2433b78847b64c4147df447133a440a8ce135` |
| `B2` | `B rebased by hand onto A\n` | 25 | `c8365e8a2ef1088dcfe404861d81ddca597f4e02077a0a1e41f12f93ee476a71` |
| `BOM` | `\xEF\xBB\xBFBOM first\x00nul kept\n` | 22 | `8fbce4ab7c4e6c4da8282095f3d33ea1ff88a655970a425f9226f79746dfcf14` |
| `BAD` | `\xFF\xFE not utf8` | 11 | invalid UTF-8 |

## B1: Authority precedes disclosure

| Case | Trigger | Expected outcome |
|---|---|---|
| B1-01 | Command, receipt lookup, snapshot, artifact or observe request without `Authorization` | `401 unauthorized`; the body has no `receipt`, `result`, `sequence`, `workflows` or `content`. |
| B1-02 | Unknown device, wrong secret or malformed bearer | `401 unauthorized`, same body shape as B1-01. |
| B1-03 | Envelope adds `principal`, `by`, `device` or `capabilities` | `400 malformed_envelope`; the sequence is unchanged. |
| B1-04 | Header `X-Render-Principal: host` or `X-Forwarded-User` on a device request | Ignored: the device context still applies, so `enrollDevice` gets `403 forbidden_principal`. |
| B1-05 | A device sends `enrollDevice` or `revokeDevice` | `403 forbidden_principal`; no device is created or revoked. |
| B1-06 | A device sends the host-only `recordStartup` | `403 forbidden_principal`. |
| B1-07 | Unknown type `dropTables` | `400 unknown_command`. |
| B1-08 | Known future type `approveCheckpoint` from a device | `501 capability_unavailable`; never accepted. From a non-human principal: `forbidden_principal` (Kernel matrix). |
| B1-09 | Device A's accepted save reply is lost; device B (same human) retries the same ID and bytes | `200`, `duplicate: true`; the same `receipt`, `sequence` and `result`; `acceptedBy.device` is A. Exactly one revision exists. |
| B1-10 | Device B reuses A's ID with a changed payload | `409 command_conflict`; the body has no `receipt`, `result` or `sequence`. |
| B1-11 | A is revoked, then retries its own accepted ID | `401 unauthorized`; no receipt is disclosed. |
| B1-12 | Device S, scoped to `W1`, looks up a receipt of a `W2` command, reads a `W2` artifact or takes a snapshot | Receipt and artifact: `404 not_found`, byte-identical to a lookup of a nonexistent ID. Snapshot lists only `W1`. |
| B1-13 | Device S submits a command for `W2` | `403 forbidden_scope`. |
| B1-14 | Local-admin enrollment | The data directory is mode `0700` and `admin.sock` `0600`. The reply carries a bearer whose secret decodes to 32 bytes. The secret string appears nowhere in the store files, the host's stdout/stderr or a duplicate enrollment receipt. |
| B1-15 | In-process caller passes a hand-built context object to `Ledger.command` | Refused with `untrusted_context`; nothing commits. |
| B1-16 | Envelope with a different `authorityEpoch` | `409 authority_epoch_mismatch`. |

## B2: Acknowledgement is immutable and atomic

| Case | Trigger | Expected outcome |
|---|---|---|
| B2-01 | Save `G1` as `ground`, and `BOM` as another document | Artifact reads return byte-identical content with the literal digest and length above, including after host restart. |
| B2-02 | Save `BAD` | `400 invalid_content`; the sequence is unchanged. |
| B2-03 | A and B both hold basis `R0`. A saves `A1`, then B saves `B1` with expected `R0` | A: accepted revision `RA` with parent `R0`. B: `409 stale_basis` naming `refs.current = RA` and `refs.expected = R0`, with a reason and a repair. After restart, the current revision is `RA` with bytes `A1`; `B1`'s digest appears in no artifact. |
| B2-04 | B retries the same stale ID, then a new ID with expected `RA` and bytes `B2` | The retry is refused `stale_basis` again (no automatic rebase). The new ID is accepted with parent `RA`. Reads of `R0`, `RA` and the new revision each return their own exact bytes. |
| B2-05 | `expected: null` for an existing document; a revision ref for an absent document | Both `409 stale_basis`. |
| B2-06 | Saving document `notes` after B read `ground`'s basis | B's `ground` save with that basis is still accepted. |
| B2-07 | Kill the host at the barrier inside the commit, before commit completes | After restart there is no revision, receipt or sequence advance. The retried ID is accepted once (`duplicate: false`). |
| B2-08 | Kill the host after commit, before the reply | After restart the retry is `duplicate: true` with the original sequence. Exactly one revision exists. |
| B2-09 | Real disk full (tiny attached volume) during a large save | The response is never `accepted`: `503 outcome_unknown`, or the connection drops. The host exits. After freeing space and restarting, earlier revisions read exactly, the current pointer is unchanged, and a retry is accepted or duplicate (never both). |
| B2-10 | Offline tamper of the stored bytes of revision `RA` | Artifact read: `409 content_corrupt` with `refs.restore = RA`; no content. A save with expected `RA`: `409 content_corrupt`; nothing commits. No newer or older text is substituted. |
| B2-11 | Any accepted command | `sequence` advances by exactly 1. Snapshot, artifact and receipt agree, and none shows one without the others. |

### Rework size-boundary cases (B2-12/B2-13)

The HTTP save interface must accept 4,194,304 and 16,777,216 ASCII `A` bytes, preserve exact bytes after restart and
return the literal SHA-256 digests `a58789e910e5f939afc433a00fef5930702927dc192cb237fd9e7449bd6ffe1d` and
`e6c907c2d418fa03118465063701b759c4f0f0a9d70ae90aa7cec552e2d33931`, respectively (computed independently
with Python `hashlib`). A 16,777,217-byte document gets `400 malformed_envelope` with the byte limit, not an internal
error. Invalid base64 alphabet, lengths or padding refuse deliberately without advancing sequence. Empty content and
one-/two-byte padded content remain supported.

## B3: Observation is not ownership

| Case | Trigger | Expected outcome |
|---|---|---|
| B3-01 | Observe | The first frame is a snapshot. Every frame has `version: 1`, `scope`, `authorityEpoch` and `sequence`; change frames have `base` equal to the previous frame's `sequence`. |
| B3-02 | `?version=2` on snapshot or observe | `400 unsupported_version`, `supported: [1]`, with upgrade guidance. The client CLI refuses a version-2 frame with an upgrade message and a nonzero exit. |
| B3-03 | Client receives `base` ≠ last sequence | Client takes a fresh snapshot. Repeated or older sequences are discarded. |
| B3-04 | Reconnect | The stream starts with a snapshot at the current sequence. |
| B3-05 | An observer stops reading while 200 saves commit | Every save is acknowledged; p95 acknowledgement stays under 250 ms. The stalled stream is disconnected, not waited on. |
| B3-06 | Client aborts the HTTP request right after sending a save | The save is committed anyway; the retry is a duplicate. |
| B3-07 | A saves, disconnects and is revoked; fresh client B process attaches | Within 5 s B obtains the snapshot and the exact bytes of A's revision. The view has `commitment`, `owner`, `evidence`, `blocker` and `nextHumanAction`, with an `unavailable` list naming the absent capabilities. |
| B3-08 | A's open stream at revocation; A reads afterwards | The stream receives `end` `credential_revoked` and closes. Later reads are `401`. |
| B3-09 | A client's unsaved local bytes | Not on the host: no artifact or digest exists for bytes that were never acknowledged. |

## B4: Startup cannot silently weaken persistence

| Case | Trigger | Expected outcome |
|---|---|---|
| B4-01 | A second host process starts on the same data directory while the first runs, with `render.db` made unreadable | The second exits `3` with `startup_refused` `store_owned`, the code only the owner lock produces (opening the database first would report `store_unreadable`). The first keeps serving. |
| B4-02 | The owner is SIGKILLed | A new process acquires the lock and serves the same data. |
| B4-03 | Normal start | The ready event and snapshot report persistence `journal_mode: "wal"`, `synchronous: 2`, `fullfsync: 1`, `checkpoint_fullfsync: 1`. |
| B4-04 | Foreign SQLite file (`application_id` 0) as `render.db` | Exit `2` `startup_blocked` `unsupported_store`. File SHA-256 unchanged; no `durable_*` tables added. |
| B4-05 | Render store with `user_version` 99 | Exit `2` `unsupported_schema`; bytes unchanged. |
| B4-06 | Non-SQLite bytes as `render.db` | Exit `2` `store_unreadable`; bytes unchanged. |
| B4-07 | Read-only `render.db` | Exit `2` `persistence_unavailable`; bytes unchanged. |
| B4-08 | Store holding a pending Durable task of a definition this host lacks | Exit `2` `unsupported_definitions`, naming the task kind. The task is still pending afterwards and was never dispatched. |
| B4-09 | Ordinary restart | A new `executorEpoch` differs from every earlier one. `authorityEpoch` is unchanged; an enrolled bearer still works. |
| B4-11 | Change only a retained revision/message's application schema to 99, preserving its other fields and store header | Affected artifact/message reads and saves over that revision get `409 unsupported_schema`, with compatibility guidance and no content. Save refusal leaves sequence/pointer unchanged; records remain byte-identical. Unaffected documents still save; foreign-scope artifact reads remain `404`. |
| B4-10 | Startup ordering | A `startup` fact with the new `executorEpoch` is committed before admission. No submit, abort, wait or compact runs before `resume()` (inspection). |
