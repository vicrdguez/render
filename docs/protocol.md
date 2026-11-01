# Render host protocol, version 1

This is the client-facing wire contract delivered by `durable-workspace` and extended by `historical-export`. It implements the semantic envelope of
[spec §5.2–5.3](spec.md#53-command-receipt-and-snapshot-contract) on a loopback HTTP listener. Route names are
implementation choices; the envelope, receipt, refusal and frame semantics are the contract.

## Transports and authentication

| Route | Who | Authentication |
|---|---|---|
| `http://127.0.0.1:<port>/v1/...` | enrolled devices | `Authorization: Bearer <token>` only. No query-string or cookie credentials. |
| `<data>/admin.sock` (HTTP over a Unix socket) | the host OS owner (local admin) | Filesystem permissions: the data directory is `0700` and the socket `0600`. |

The loopback listener is meant to sit behind private Tailscale Serve HTTPS (spec §5.1); Serve itself is operator
provisioning, not part of this Slice. Tailnet membership, a loopback route or any request header or body field confers no
Render authority. Only the two adapters above establish human context; host context exists only inside the host process.

A device bearer is `render_<device>_<secret>`, where `<secret>` is 256 random bits in base64url. The host stores only the
SHA-256 verifier of the secret, with the device's principal, scope and revocation metadata. The secret is returned once,
in the enrollment reply. It is never written to the store, receipts, logs or observation frames. Bearers do not expire.
Ordinary restart preserves them, and revocation takes effect at once.

## Command envelope

`POST /v1/commands` (devices) or `POST /v1/admin/commands` (local admin) with:

```json
{
  "version": 1,
  "authorityEpoch": "authority-…",
  "commandId": "laptop-0001",
  "workflow": "workflow:3",
  "expected": { "document": "revision:41" },
  "command": { "type": "saveDocument", "document": "ground", "mediaType": "text/markdown", "content": "<base64>" }
}
```

- Unknown top-level or command fields are refused as `malformed_envelope`. That includes any attempt to name a
  principal, device, route or capability.
- `commandId` is 1–128 characters from `[A-Za-z0-9._:-]`. IDs are namespaced by the authenticated human, not the device.
  A second device of the same human may retry an ID and receives that human's original receipt.
- The payload fingerprint covers `command`, `workflow` and `expected`, not the device.

| Command | Fields | `workflow` | `expected` | Route |
|---|---|---|---|---|
| `createWorkflow` | `title` (1–200 chars) | absent | absent | device with `all` scope, or local admin |
| `saveDocument` | `document` (`[a-z0-9][a-z0-9._/-]{0,127}`; `ground` is the workflow's Ground), `mediaType` (`text/markdown` or `text/plain`), `content` (base64 of the complete UTF-8 bytes) | required | `document`: the current revision ref, or `null` for a new document | device or local admin |
| `postCoordinatorMessage` | `text` (1–65,536 chars) | required | absent | device or local admin |
| `enrollDevice` | `label` (1–100 chars), `scope`: `{ "workflows": "all" }` or `{ "workflows": ["workflow:1", …] }` | absent | absent | local admin only |
| `revokeDevice` | `device` | absent | absent | local admin only |

Other command families named in spec §4 are known to this host and refuse with `capability_unavailable`, or with
`forbidden_principal` when the principal is wrong. That covers human checkpoint/intake/cancel/local-prompt decisions, role
work, scheduling and source/effect work. Unknown types refuse with `unknown_command`.

## Receipts

```json
{
  "status": "accepted",
  "duplicate": false,
  "commandId": "laptop-0001",
  "receipt": "receipt:7",
  "sequence": 7,
  "authorityEpoch": "authority-…",
  "workflow": "workflow:3",
  "result": { "revision": "revision:41", "document": "ground", "digest": "sha256:…", "byteLength": 56, "parent": null },
  "facts": ["fact:42"],
  "acceptedBy": { "principal": "human", "route": "device", "device": "device:2" }
}
```

A receipt is returned only after the accepted state commits. A duplicate returns the original receipt with
`duplicate: true`; `acceptedBy` still names the original accepting device. `GET /v1/commands/<commandId>` looks up a
receipt by original ID. It answers `404 not_found` both when the receipt is absent and when it is outside the caller's
current scope.

A timeout, dropped connection or `503 outcome_unknown` means the outcome is unknown: an admitted commit can complete
after the client gave up. Retry the original ID and payload. Do not mint a new ID.

## Refusals

```json
{ "status": "refused", "code": "stale_basis", "reason": "…", "refs": { … }, "repair": [ { "action": "…", … } ] }
```

| Code | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | Missing, unknown or revoked credential. Nothing else is disclosed. |
| `forbidden_principal` | 403 | The command family does not admit this principal or route. |
| `forbidden_scope` | 403 | The workflow is outside the device's scope. |
| `malformed_envelope`, `unknown_command`, `invalid_content` | 400 | Rejected before any domain decision. |
| `unsupported_version` | 400 | Unknown protocol version; the body names supported versions and upgrade guidance. |
| `authority_epoch_mismatch` | 409 | The envelope names a different authority epoch. Take a fresh snapshot. |
| `command_conflict` | 409 | The command ID was already used with a different payload. Use a new ID. No original content is disclosed. |
| `already_revoked` | 409 | `revokeDevice` named a device that is already revoked. |
| `stale_basis` | 409 | The expected revision is not current. `refs.current` and `reason` describe the difference. Nothing is rebased automatically. |
| `unsupported_schema` | 409 | A retained revision or coordinator message has an unknown application schema. `refs.record` identifies it and `supported` lists readable versions. Run a compatible Render version; the record is preserved and affected saves are blocked. |
| `content_corrupt`, `missing_content` | 409 | Retained bytes failed integrity checks. `refs.restore` names the exact revision to restore. No other bytes are substituted. |
| `not_found` | 404 | Absent, or outside scope. |
| `payload_too_large` | 413 | The request body exceeds 32 MiB. Document content above 16 MiB instead gets `400 malformed_envelope` with the byte limit. |
| `untrusted_context` | 401 | In-process only: a caller passed a context no Ledger adapter established. |
| `capability_unavailable` | 501 | Known command whose capability is not delivered in this host version. |
| `outcome_unknown` | 503 | Storage failed during the commit; the host stops. Retry the original ID after restart. |
| `host_unavailable` | 503 | The host is not admitting commands. |

## Local-admin reads

`GET /v1/admin/status` (authority and executor epochs, sequence, persistence readback, startup fences) and
`GET /v1/admin/devices` (devices with scope and revocation, never verifiers) are available only on the admin socket.

## Reads

- `GET /v1/snapshot?version=1`: one snapshot frame (below).
- `GET /v1/artifacts/<revision-or-message>`: exact bytes and provenance:
  `{ artifact, kind, schema, workflow, document, mediaType, digest, byteLength, parents, createdBy, commandId, recordedAtSequence, content }`.
  `content` is base64. Also includes `supersedes`, `source`, `policy`, `assignment`, `attempt`, `decisionRefs`, `outcomeRefs` (null/empty when not applicable). A document save supersedes its previous revision, not a domain decision. Schema compatibility is checked before interpreting content; revision digest/length are re-verified on every read. Message digests/lengths are computed from retained UTF-8 text. Absent and out-of-scope immutable refs both answer `401 unauthorized`, without distinguishing existence.
- `GET /v1/workflows/<workflow>/messages?cursor=<next>&limit=<n>`: scoped coordinator messages, oldest first,
  `{ messages, next, complete }`. Pass `next` back as `cursor` for the following page; `complete: true` means there are
  no more.

## Fixed-cutoff history and portable export

`GET /v1/history` and `GET /v1/export` accept the same selectors: `workflow`, optional `kind`, optional opaque `cursor`, `limit` (integer 1–500, default 100), `version=1`. Unknown/duplicate selectors or invalid limits refuse `invalid_query`; unsupported versions refuse `unsupported_version`. `proposal`, `assignment`, `outcome` and not-yet-delivered kinds refuse `capability_unavailable`, never empty success. Delivered kinds: `workflow`, `ground`, `document`, `message`, `fact`, `receipt`.

Without a workflow selector, scope is the exact set of workflows currently visible to the caller; local admin and all-workflow devices also select global facts. Narrow devices never select global administration. Receipt authorization is unchanged: receipts inaccessible to the reader are explicitly redacted. Credentials, verifiers and cursor signing keys are never exported. History currently admits human readers only; future assignment/host reads require their own delivered scope semantics.

A page is `{ version, cutoff, scope, records, next, complete, missing, exclusions }`. `next` is null when traversal ends; `complete` additionally requires no missing data. Cursors are HMAC-bound to authority epoch, human, selected workflow set, filters, cutoff and position. They survive ordinary restart and can move between currently authorized devices of that human. A cursor is not authority: scope and revocation are checked again, including before final disclosure. Changed selectors, tampering or insufficient scope refuse `invalid_cursor`. New writes cannot enter an existing traversal; start without a cursor to see them. Live message pagination remains a legacy current read, not this history protocol.

An export with a page cursor exports the **whole selected traversal**, not just its remaining pages, at that cursor’s original cutoff. Without a cursor it selects a new cutoff. The JSON envelope is `{ version: 1, manifest, jsonl, text, content }`: `manifest` is a versioned `render-history` object; `jsonl` is normalized record-per-line text; `text` is a human-readable rendering; `content` maps immutable refs to base64 exact bytes. It is self-contained and can be saved as one JSON file. No SQLite/Git access or Render runtime is needed to read it:

```sh
node src/client/read-export.ts export.json > inspected.json
```

The standalone reader validates format/schema, scope/cutoff/order/count, links and exact byte digests/lengths, and returns normalized records and literal text. Nonzero exit returns named refusal JSON. Missing-data exports can be read as incomplete; they never contain substituted bytes. `externalRefs` declares links outside the included records (for example a kind filter); `redactions` declares inaccessible receipts; `omittedKinds` names unavailable future kinds. `complete` means all selected, delivered, non-redacted records are present, **not** every possible future kind or complete runtime evidence. Outcomes remain null where no domain classification exists; saved claims are human text, not runner receipts. Chronology alone adds no causal links. Equal bytes retain distinct identities/provenance and predecessor links.

The manifest always excludes `unsaved_client_buffers`, `uncommitted_provider_streams`, `unsnapshotted_worker_files`. No assignment/Attempt, retained packet, decision/policy, classified outcome, execution/effect or runtime transcript capability is fabricated. When introduced, those owners must extend this versioned protocol and reader. This export is inspection/history, **not a supported recovery backup**.

Engineering bound: pages and exports scan selected retained conversations and assemble results in memory; page size bounds returned records, not scan cost or export size. This intentionally avoids a new history index/storage migration. Old message records lack independently stored digest metadata: export/read computes their digest, while immutable document revisions verify their original stored digest. No new integrity guarantee for arbitrary filesystem/database replacement is claimed.

## Observation

`GET /v1/observe?version=1` returns NDJSON frames. Every frame carries `version`, `kind`, `scope`, `authorityEpoch` and
`sequence`.

- The first frame is always `kind: "snapshot"`: the complete scoped state at `sequence`.
- `kind: "change"` carries `base` (the sequence of the previous frame on this stream) and the updated workflow views.
  A client that sees `base` differ from its last sequence has a gap and must take a fresh snapshot. A client discards
  frames whose `sequence` is not greater than its last.
- `kind: "end"` carries `reason` (`credential_revoked`, `host_closing`) before the server closes the stream.
- A consumer that stops reading is disconnected once its backlog exceeds the bound; commits never wait for observers.
  Reconnect and take a fresh snapshot. Disconnecting cancels only observation, never accepted work.

A client must refuse a frame whose `version` it does not understand, and tell the user to upgrade.

The bundled client reconnects by itself when a stream drops or shows a gap. If the host is unreachable when it
reconnects, observation ends with a transport failure (CLI exit `3`). Start observing again once the host is back; the new
stream begins with a fresh snapshot.

Each workflow view carries `ground`, `documents`, `messages`, `commitment`, `owner`, `evidence`, `blocker`,
`nextHumanAction` and `unavailable`. `unavailable` names the capabilities this host version does not deliver yet, for
example coordinator replies, checkpoints, assignments and recovery packages. They are reported as
absent, never as empty successes. The snapshot also reports `hostMode`, `executorEpoch`, the persistence readback and
the backup state. Off-host protection is reported `unavailable` until it is delivered.
