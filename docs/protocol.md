# Render host protocol, version 1

This is the client-facing wire contract delivered by `durable-workspace` and extended by `durable-role-work`, `historical-export`. It implements the semantic envelope of
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
| `requestLocalVerificationPrompt` | `source` (exact retained source-observation ref), `expectedSequence` (observed snapshot sequence) | required | absent; basis is in the command | human device in current workflow scope or local admin; see [advisory handoff](local-verification.md) |
| `enrollDevice` | `label` (1–100 chars), `scope`: `{ "workflows": "all" }` or `{ "workflows": ["workflow:1", …] }` | absent | absent | local admin only |
| `revokeDevice` | `device` | absent | absent | local admin only |
| `changePolicy` | `expectedRevision`, `policy`: `{ completedReviewLimit: nonnegative integer, reviewerDiversity: different-family or human-directed-same-family, minimumEvidenceRank: process or tests or build or inspection }` | absent | absent | project-wide human device or local admin |
| `adoptPolicy` | selected immutable `revision`, current `expectedBinding` | required | absent | scoped human device or local admin |
| `cancelWork` | `assignment`, current `generation` and `attempt` | required | absent | scoped device or local admin |

The trusted in-process Engine can schedule `assignTask`, `stageTask`, `fenceAttempt`, `recordBlocker`,
`recordQuiescence`, `replaceTask`, `recordRuntimeHistory` and checked `rebindAttempt`; none is a device/admin scheduling override. Assignment tools admit only
`requestRole` for a predefined packet key, `submitRoleResult` for their own report, `retainWebEvidence` for exact scoped passages, and `requestOwnStop`. `submitRoleResult` requires `text` and `supports` (at most 32 exact promoted revision refs). An empty list explicitly declares no web reliance; omission is malformed, not an implicit empty list. Required missing/corrupt support blocks acceptance. Accepted report receipts retain `webEvidence: none|retained` and exact support refs; older receipts without the field remain unclassified. Owned-check receipts, retained under `owned-check/<assignment>`, also lack the field: the host records them from a command run with no model conversation, so they declare no web reliance by construction. See [scoped web research](web-research.md). Recovery alone
can retain fenced late results with `recordRecoveryState`; they are quarantined artifacts, not accepted role reports.
`replaceTask` names the fenced, quiescent predecessor `assignment`, `generation`, `attempt` and a fresh explicit `packet`; the Slice/ownership mode follows that retained predecessor. `recordRuntimeHistory` names the current assignment identity and bounded capture `key`; bytes are read from the owned native store, never command-supplied history. These commands require a workflow and strict typed fields; task names, principals and transaction callbacks are never
command fields. See [role operations](operations.md#durable-role-work).

Other command families named in spec §4 remain known and refuse with `capability_unavailable`, or with
`forbidden_principal` when the principal is wrong. This includes forge/source publication work. The human advisory local-verification prompt is delivered through the existing artifact interface, with no execution or completion gate. Editable technical checkpoints, persistent routing settings and human-only Contract intake are delivered; only local-admin may import settings; see `checkpoints.md` and `intake.md` for exact command schemas and basis rules. The opt-in owned-check
path admits `recordRunnerObservation` only from the trusted Effects host scope, with current assignment/generation/Attempt
and complete receipt text; it is not a worker/device/admin capability. It retains an immutable `owned-check` document,
not a general effect/publication protocol. See [owned checks and limits](owned-checks.md). Unknown types refuse with `unknown_command`.

Delivery assignment on an accepted Slice opens an implementation pass, whose retained record freezes the configuration the pass executes with; the packet stays as retained input. The owner must be a `linux-writer` `implementer` with a `verification` selection and two or three `requests`. The selection names the Slice's accepted Contract and a `path` retained source can represent. Its `rows` are unique and include `full-suite`, `typecheck`, `lint` and every `behavioralRows` entry; `behavioralRows` are unique and nonempty. The selected file need not exist yet: creating it is accepted source work. The requests are one `audit-standards` and one `audit-contracts` packet, each `read-only` with `family` equal to `requiredFamily`, and no `verification`, `experiment`, `investigation` or nested `requests`; reviewers read the verifier and implementer results retained with A. An optional third request is exactly one `watchdog` packet under the same reviewer rules; it is frozen as the reviewer every Watchdog round of the pass starts fresh from. Without it a checked pass stays visibly `awaiting_watchdog` and no review is invented. Anything else refuses with `invalid_content` before any pass, assignment or Contract consumption, so the Slice stays assignable and a corrected assignment can proceed. Replacement keeps the configuration and a successor inherits it. `requestImplementationAudit` still checks current family authority, and Engine still checks model availability, source configuration and catalog contents; those can change while the pass is open.

`openSuccessorPass` is the one authorized return from a sealed handoff to implementation. It is admitted only from the Effects host scope, and names the handed-off owner's `assignment`, `generation`, `attempt` and `text`. `text` holds one closed JSON result: `schema: 1`, `cause`, `repository`, `source` (B's revision), `sourceCommit`, `baseCommit` and `targetCommit`, plus the fields for its cause.

| `cause` | Extra fields | New pass starts from |
|---|---|---|
| `preparation-conflict` | `algorithm`, `resultTree`, `conflicts` (paths) | `targetCommit` |
| `prepared-check-failure` | `preparedCommit`, `verifierRevision`, `failed` (`name`, real nonzero `exitCode`) | `preparedCommit` |
| `watchdog-rework` | `preparedCommit`, `review`, `report` | `preparedCommit` |
| `human-direction` | `preparedCommit`, `review`, `report`, `direction` | `preparedCommit` |

A cited Watchdog report is JSON with `schema: 1`, `verdict` (`pass`, `rework` or `needs-human`), `passRef`, `handoff`, `source`, `prepared` and `target`. Ledger reads it from retained bytes and Kernel checks every field against the pass and result. Only a host-launched round (below) authorizes rework. A `human-direction` result cites the same round plus the human direction recorded for it (below); it is the only return a Needs Human or review-limit stop admits, and a `human-direction` return citing no recorded direction for its exact round is refused `human_direction_required` even below the limit. A rework successor's inputs include the cited report, and a directed one's also the direction, so it reads exactly what it must address. Unchanged-source operational retries have no shape here and retain the handed-off pass.

Kernel checks the result's lineage against retained B. It cannot see Git, so the producer owns classification and the object and ancestry validation in spec §9.4; `target-preparation` and `watchdog-rework` are those producers. Each successor is a new linked Assignment and conversation with predecessor records as read-only references, which spec §6.2.1 permits.

### Watchdog rounds

Two Effects-host-only commands produce a round; neither is a device, admin, scheduling or agent capability.

- `requestWatchdogReview` names the handed-off owner's `assignment`, `generation`, `attempt`, its latest `preparation` record and the `target` commit the host re-observed immediately before launch. Kernel requires a `checked` record whose target equals it, recorded under the workflow's current policy binding (Ledger verifies the policy bytes), no open or completed round of that X, a frozen Watchdog reviewer and reviewer diversity. It creates one fresh `parent: null` Watchdog Assignment and conversation whose `watchdogReview` binding names pass, handoff, B, preparation, X commit/tree, T, X's verifier digest and `prior` (earlier rounds' reports, return observations and the human directions that resolved stopped rounds, read as optional context in the round's own scope; an unavailable item means a full review).
- `recordReviewChecks` names that Watchdog's `assignment`, `generation`, `attempt` and `text`: `{schema:1, source, evidence}` with literal X and the Watchdog's own scoped Linux catalog receipt (`role: "watchdog"`). Ledger refuses entries that do not form the claimed tree; Kernel binds it once to the current executing scope, X and X's verifier, retained as `watchdog-checks/<assignment>`.

The Watchdog submits with `submitRoleResult`: the verdict JSON above, copied exactly from its binding, plus a `verification` assessment. A `pass` needs a passing assessment over its own successful, unchanged-source checks at the policy minimum. Every accepted round reports `reviews`, the Slice's completed-review count, and stages its owner's preparation task, which settles the verdict: rework requests `openSuccessorPass` (refused `human_direction_required` after Needs Human or at the limit), Needs Human blocks with `needs_human`, and a pass whose X/T and policy are still current integrates automatically (below); a stale pass prepares again under the same pass. `retryPreparation` refuses while a round is open, re-settles the latest completed round (`settles`), and otherwise prepares again. Cancelling a round whose own checks may be running stops that check environment before quiescence is recorded; an unconfirmed stop stays a visible `watchdog_check_quiescence_unconfirmed` blocker holding the slot.

`directRework` is the human's direction on a stopped round, a `human-decision` command no host or agent can issue. It names the handed-off owner's `assignment`, `generation`, `attempt`, the exact `review` and the direction `text` (nonblank, at most 1 MiB). Kernel admits it once per handoff, only for the latest completed round of the current pass's latest preparation after its stop settled, and refuses a passing round. Ledger retains the text as `watchdog-direction/<review>`; the owner's preparation task settles the round again and requests a `human-direction` return from X. The direction is implementer input within the frozen Contract, never a waiver: the successor needs its own fresh Audit, and completed reviews, reports and the count stay. A larger review limit alone never resolves Needs Human. Each successor is a new linked Assignment and conversation with predecessor records as read-only references, which spec §6.2.1 permits.

### Proposal integration

A completed passing round on current X/T integrates without any human approval, grant or setting (spec §9.3). Three Effects-host-only commands, never a device, admin, scheduling or agent capability, carry it; each names the handed-off owner's `assignment`, `generation` and `attempt`.

- `stageOperation` with `text`: the closed intent `{schema:1, kind:"proposal-integration", proposal, ref, slice, contract, passRef, handoff, source, captureA, audit, reports, preparation, prepared, tree, target, review, report, result:{commit, tree, parent, message}, policy, assignment, generation, attempt, unresolved:[]}`. Kernel checks lineage to the current handoff and owner generation, the Slice's current accepted Contract, the latest checked preparation, a bound passing round of it on that target, the current policy basis, R with exactly X's tree on parent T, and no unresolved operation anywhere in the proposal. The intent is retained as `integration-intent/<passRef>/<sequence>` and is `planned`: it permits nothing. One operation per prepared X; after a stale CAS that X needs a new preparation.
- `admitEffect` with `operation` rechecks the same eligibility and commits attempt `integration-attempt:<sequence>` bound to the current `executorEpoch`. Only a `planned` or `unapplied` operation takes an admission; a committed cancellation refuses it (`assignment_closed`).
- `recordIntegration` with `operation` and `text`: `{schema:1, operation, attempt, mode:"dispatch"|"reconcile", dispatch:"applied"|"refused"|null, ref, observed:{commit, tree, parents}|null, lock}`, retained as `integration-observation/<passRef>/<sequence>`. Only the executor epoch that holds the attempt may report `mode:"dispatch"` (`stale_executor` otherwise). Kernel derives `outcome`: exactly R with X's tree and parents `[T]` is `applied` and records the one qualification; exactly T is `unapplied` and needs a fresh admission; a dispatch refused on a moved ref is `stale` and the same pass prepares again; anything else, including a held ref lock, is `divergent`, sets an `integration_divergent` blocker and serializes the proposal until a human `retryPreparation` reconciles again.

Effects performs the CAS as one `git update-ref --stdin` transaction that commits only after `prepare: ok`, then observes the ref. Every observation, after a dispatch or in reconciliation, first removes a ref lock older than the current Effects instance (a dead executor's; Effects is the only writer of private Git), then fsyncs the private store, then reads the ref back. A failed fsync yields no observation, so the attempt stays admitted behind an operational blocker until a retry observes after a successful barrier. A host restart never dispatches an earlier epoch's attempt; it reconciles the ref without rewriting it. While another operation of the proposal is unresolved, the host's staging or admission is refused `ownership_conflict`; the host then waits, with no blocker, until the proposal's operation resolves and evaluates the pass again. A human `cancelWork` on a handed-off, unqualified owner fences its generation, refuses later admissions, preparations and reviews, and lists in `handoff.canceled.inFlight` an admitted attempt that may still complete and is still recorded. Its receipt carries `inFlight` (the count) and `inFlight0`, `inFlight1`, … (each attempt's identity). Work begun before the cancellation that is refused afterwards leaves the `canceled:` blocker in place. Only recorded qualification clears same-proposal dependencies (`dependency_blocked` before); a pass, an admission or publication never does.

### Proposal publication

After the first recorded qualifying integration, Engine publishes the canonical head and keeps one draft proposal PR beside local work (spec §§9.2–9.3). Publication state lives on the workflow; Kernel derives every payload from it, so the host names only a kind. Local integration and dependents never read it: a forge outage, divergence or unknown outcome blocks no eligible local work. Three Effects-host-only commands and two human-only commands exist; no command closes, merges or edits an arbitrary PR.

- `stageForgeOperation {kind}` (host Effects): `publish-source` pins `{canonical, expected}` (latest qualified R and last observed published head, `null` when absent; refused `stale_basis` before any qualification, before a head observation, on divergence or when already published); `create-proposal` once per proposal (`role_already_requested` after) with marker `render-proposal:<workflow>:<operation>`, title, the published head and a body of the marker comment plus the host-owned summary (`capability_unavailable` without draft support); `update-summary` for the associated PR (`stale_basis` without association or with unresolved risk; a newer stage supersedes a planned one). Intents are retained as `forge-intent/<sequence>`.
- `admitForgeOperation {operation}` (host Effects) commits `forge-attempt:<sequence>` bound to the current `executorEpoch`. Only a `planned` operation, or a create a human reissued, is admitted; a create also needs a complete pre-create listing with no open PR on the proposal branch. An `unknown` outcome is never readmitted (`stale_basis`).
- `recordForgeObservation {text}` (host Effects): `{schema:1, operation, attempt, mode, outcome, reason, created, head, proposals, capabilities, observedAt}`, retained as `forge-observation/<sequence>`. Only the admitting epoch reports a `dispatch` (`stale_executor`). A head outside canonical lineage is divergence. Before the create, one open PR on the branch is reused and two or more are listed as duplicates for the human to close on GitHub. After an unknown create, only a complete listing with exactly one candidate carrying the operation's marker and opened by the configured identity associates it; zero, incomplete or several keep it `unknown`.
- `authorizeForgeReissue {operation}` (human): one more attempt of an unknown create; sticky duplicate risk then spans every attempt, and no response or listing associates a PR until `resolveForgeRisk {operation, pr, text}` (human) names a verified candidate from the latest complete listing, records the statement as `forge-resolution/<sequence>` and lists the other candidates as duplicates.

The workflow view carries `publication: {status, canonical, published, divergence, association, duplicates, risk, unsupported, operations, blocked, choices}` with `status` one of `awaiting-integration`, `blocked`, `uncertain`, `lagging`, `published`. The GitHub token comes only from trusted host configuration (`forge` in Engine configuration) and is held by Effects alone; it never appears in Ledger records, packets or exports. Ready promotion and main-merge observation are later Slices.

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
  `content` is base64. Also includes `supersedes`, `source`, `policy`, `assignment`, `attempt`, `decisionRefs`, `outcomeRefs` (null/empty when not applicable). A document save supersedes its previous revision, not a domain decision. Schema compatibility is checked before interpreting content; revision digest/length are re-verified on every read. New message saves retain a digest/length and verify them on reads. Older messages without these fields remain readable with `integrity: unverified_legacy`; their digest/length is measured from retained UTF-8 text, never represented as verified original metadata. Revision and new-message reads report `integrity: verified`. Absent and out-of-scope immutable refs both answer `401 unauthorized`, without distinguishing existence.
- `GET /v1/workflows/<workflow>/messages?cursor=<next>&limit=<n>`: scoped coordinator messages, oldest first,
  `{ messages, next, complete }`. Pass `next` back as `cursor` for the following page; `complete: true` means there are
  no more.

## Fixed-cutoff history and portable export

`GET /v1/history` and `GET /v1/export` accept the same selectors: `workflow`, optional `kind`, optional opaque `cursor`, `limit` (integer 1–500, default 100), `version=1`. Unknown/duplicate selectors or invalid limits refuse `invalid_query`; unsupported versions refuse `unsupported_version`. `proposal`, `assignment`, `outcome` and not-yet-delivered kinds refuse `capability_unavailable`, never empty success. Delivered kinds: `workflow`, `ground`, `document`, `message`, `fact`, `receipt`.

Without a workflow selector, scope is the exact set of workflows currently visible to the caller; local admin and all-workflow devices also select global facts. Narrow devices never select global administration. Receipt authorization is unchanged: receipts inaccessible to the reader are explicitly redacted. Credentials, verifiers and cursor signing keys are never exported. History currently admits human readers only; future assignment/host reads require their own delivered scope semantics.

A page is `{ version, cutoff, scope, records, next, complete, missing, redactions, omittedKinds, exclusions }`. `next` is null when traversal ends; `complete` additionally requires no missing data. Cursors are HMAC-bound to authority epoch, human, receipt-view class (local admin or device), selected workflow set, filters, cutoff and position. They survive ordinary restart and can move between currently authorized devices of that human. A cursor is not authority: scope and revocation are checked again, including before final disclosure. Changed selectors, tampering, insufficient scope or a transfer between the local-admin and device routes refuse `invalid_cursor`; start a new traversal on that route. Cursors predating the receipt-view binding also refuse and require a fresh traversal. Export format version 1 is unchanged. New writes cannot enter an existing traversal; start without a cursor to see them. Live message pagination remains a legacy current read, not this history protocol.

An export with a page cursor exports the **whole selected traversal**, not just its remaining pages, at that cursor’s original cutoff. Without a cursor it selects a new cutoff. The JSON envelope is `{ version: 1, manifest, jsonl, text, content }`: `manifest` is a versioned `render-history` object; `jsonl` is normalized record-per-line text; `text` is a human-readable rendering; `content` maps immutable refs to base64 exact bytes. It is self-contained and can be saved as one JSON file. No SQLite/Git access or Render runtime is needed to read it:

```sh
node src/client/read-export.ts export.json > inspected.json
```

The standalone reader validates format/schema, scope/cutoff/order/count, links and exact byte digests/lengths, and returns normalized records and literal text. Nonzero exit returns named refusal JSON. Missing-data exports can be read as incomplete; they never contain substituted bytes. `externalRefs` declares links outside the included records (for example a kind filter); `redactions` declares inaccessible receipts; `omittedKinds` names unavailable future kinds. `complete` means all selected, delivered, non-redacted records are present, **not** every possible future kind or complete runtime evidence. Outcomes remain null where no domain classification exists; saved claims are human text, not runner receipts. Chronology alone adds no causal links. Equal bytes retain distinct identities/provenance and predecessor links.

The manifest always excludes `unsaved_client_buffers`, `uncommitted_provider_streams`, `unsnapshotted_worker_files`,
and `private_git_source_objects`. Owned-check receipt documents retain exact manifests/roots and command/platform/verifier
observations, not a portable source-object package. Attribute/module change warnings are part of those exact receipts. Role packets, submitted reports and quarantined evidence use delivered `document` records, including exact bytes and trusted assignment/generation/Attempt fields on newly retained entries. Original acceptance receipts retain task bindings; packet refs participate in declared export relationships and missing-data checks. Older entries without role provenance keep null metadata, not inferred bindings. These records do not constitute standalone assignment/Attempt chronologies: those selectors, decision/policy, classified outcome, execution/effect and runtime transcript export remain unavailable. This export is inspection/history, **not a supported recovery backup**.

Engineering bound: every page and export scans selected retained conversations and assembles results in memory; page size bounds returned records, not scan cost or export size. Message entries are located and validated once per scan, rather than rescanning conversations for each message; sorting and serialization still grow with the selection. The shared SQLite runtime and host event loop mean scan/validation/serialization work can delay concurrent command acknowledgements. There is no snapshot-isolation worker or fixed latency guarantee for arbitrarily large selections; use workflow/kind filters to reduce work, and measure the actual store. `verify:history-command-load` exercises 300/1,200 retained messages over ten workflows and concurrent page/export writes; it is a bounded local regression, not full V9. This intentionally avoids a new history index/storage migration. Legacy message records lack independently stored digest metadata: export/read computes their digest and labels them `unverified_legacy`, while immutable document revisions and newly saved messages verify their original stored digest. No new integrity guarantee for arbitrary filesystem/database replacement is claimed.

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
example full coordinator replies. Accepted intake appears explicitly in `commitment.acceptedIntake`; `intakes` carries current drafts, concerns, Slice revisions, permanent consumption and explicit dependency state. Undelivered capabilities are reported as absent, never as empty successes. The snapshot also reports `hostMode`, `executorEpoch` and the persistence readback. Disaster-recovery commands, startup modes and protection fields are outside v1; ordinary runtime quarantine/continuation remains supported.

For blocked assignments other than a parent awaiting role results, `nextHumanAction` identifies `cancelWork` with `workflow`, `assignment`, `generation`, `attempt` and an explanatory `reason`. This takes priority over initial Ground setup. To submit it, place `workflow` on the envelope and only `type`, `assignment`, `generation`, `attempt` in `command`; `reason` is display guidance, not a command field. Cancellation still requires a human principal and the current identity. Quiescence and host-scheduled fresh replacement remain separate checked steps, not authority conveyed by the snapshot.

Role-aware snapshots add scoped `assignments`, including exact packet/report refs, generation/Attempt, ownership,
executing capacity and visible blockers. Workflow owner/evidence summaries reflect these assignments. A blocked owner
may still consume a slot; `executing: false` does not surrender ownership. Assignment-agent reads expose only their own
packet and explicitly granted immutable inputs/results, not the workflow's general document listing. Accepted packets
and reports use the same exact-byte artifact route and integrity checks as other retained revisions.

Snapshot `history.completeThroughSequence` identifies the acknowledged traversal head, not an integrity scan. Page/export `missing` and `complete` report completeness when read.
