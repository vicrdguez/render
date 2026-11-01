# Operating the Render host

This covers the host delivered by the `durable-workspace` Slice: authenticated Ground, document and coordinator-message
saves, immutable SQLite history, enrollment and revocation, and safe startup. The wire protocol is in
[protocol.md](protocol.md); the design authority is [spec.md](spec.md) §5 and §10.

## Prerequisites

- macOS home server (personal deployment, spec §5.1). Node `24.21.0`; install with `npm ci --ignore-scripts`.
- A local filesystem for the data directory that supports SQLite WAL with full synchronization. Network or synced
  folders are not supported.
- Private remote access is operator provisioning: run Tailscale Serve HTTPS in front of the loopback listener. Do not
  use Funnel or a public listener. This Slice does not configure or verify Serve.
- Off-host backup is not delivered yet. Snapshots report `backup.health: "unavailable"`, and no acknowledged work is
  protected off-host until that capability lands.

## Start and stop

```sh
node src/host/main.ts serve --data ~/.render/data --port 7420
```

The host prints one `ready` line on stdout with the URL, admin socket path, `authorityEpoch`, the new `executorEpoch` and
the persistence readback. `SIGTERM` or `SIGINT` stops it cleanly. An ordinary restart keeps enrollments and
`authorityEpoch`, and mints a new `executorEpoch`.

Startup takes these steps in order, before admitting any request:

1. Take the OS-lifetime owner lock (`owner.lock`). A second process exits `3` with `startup_refused` / `store_owned`
   without opening the store.
2. Identify `render.db` read-only: its SQLite `application_id` must be Render's and its `user_version` supported.
3. Open with WAL, `synchronous=FULL`, `fullfsync=1` and `checkpoint_fullfsync=1`, and read the effective values back.
4. Open the Durable runtime without dispatching, and inspect retained tasks.
5. Commit a `recordStartup` fence with the fresh `executorEpoch`. Only then resume scheduling and start listening.

## Devices

Enrollment and revocation use the owner-only admin socket inside the data directory (directory `0700`, socket `0600`):

```sh
node src/client/cli.ts admin --data ~/.render/data enroll --label laptop            # all workflows
node src/client/cli.ts admin --data ~/.render/data enroll --label phone --workflows workflow:3
node src/client/cli.ts admin --data ~/.render/data revoke --device device:7
node src/client/cli.ts admin --data ~/.render/data devices
```

The bearer is printed once. Store it in a `0600` file on the client device. If the enrollment reply is lost, revoke that
device and enroll again; a retried enrollment returns the original receipt without the secret. A stolen bearer works
until it is revoked. Revocation refuses the device's next request and closes its open observation streams.

## Clients

Clients are stateless: every view comes from the host.

```sh
export RENDER_URL=http://127.0.0.1:7420 RENDER_TOKEN_FILE=~/.render/laptop.token
node src/client/cli.ts create-workflow --title "Keep work safe"
node src/client/cli.ts save --workflow workflow:3 --document ground --file ground.md --expected none
node src/client/cli.ts snapshot
node src/client/cli.ts read --revision revision:4 --out ground.md
node src/client/cli.ts observe
```

A save names the revision it was edited from. If another client saved first, the host refuses with `stale_basis` and
names the current revision. Read that revision, merge by hand, and save again with the new basis and a new command ID.
After a timeout or dropped connection the outcome is unknown: retry with the same `--command-id`, from any device of the
same human.

## Refusals at startup and what to do

| Event / code | Meaning | Action |
|---|---|---|
| `startup_refused` `store_owned` (exit 3) | Another host owns the data directory. | Stop the other host. Nothing was opened. |
| `startup_blocked` `store_unreadable` (exit 2) | `render.db` is not readable SQLite. | Restore the file from a known-good copy or move it aside. It was not modified. |
| `startup_blocked` `unsupported_store` (exit 2) | The file is SQLite but not a Render store. | Point `--data` at a Render data directory. It was not modified. |
| `startup_blocked` `unsupported_schema` (exit 2) | Store schema newer or older than this host supports. | Run the matching Render version. It was not modified. |
| `startup_blocked` `persistence_unavailable` (exit 2) | Store or directory not writable, or the effective WAL/FULL/fullfsync settings differ. | Fix permissions or move the data directory to a supported local filesystem. |
| `startup_blocked` `unsupported_definitions` (exit 2) | Retained tasks have no compatible definition in this host. | Start the Render version that owns them. They were not run, aborted or migrated. |
| `host_failed` (exit 1) | A storage commit failed, for example on a full disk. The in-flight command got `outcome_unknown`. | Free space or repair storage, restart, and retry the original command ID. |

## Retained-record compatibility

The database and runtime definitions are checked at startup. Application revision and coordinator-message schemas are
also checked at their read/use boundary: an unknown schema returns `409 unsupported_schema` with `refs.record`, the
supported versions and compatible-version guidance, without returning content. Saves over an unsupported current
revision are blocked without a receipt or sequence advance. Unaffected documents remain usable. The host preserves the
record rather than migrating it or relabeling it as version 1; run a Render version that supports its actual schema.
No automatic migration or package recovery is available in this Slice.

## Content integrity

Every document revision artifact read re-verifies the stored bytes against their SHA-256 digest and length. Newly saved messages also retain and verify their original digest/length. Legacy message reads compute a digest/length from retained text and explicitly report `integrity: unverified_legacy`; no independent original digest is invented. A mismatch answers
`content_corrupt`, with `refs.restore` naming the exact revision. A save over that revision is refused the same way.
The host never substitutes other bytes. Supported restore of an exact revision needs recovery packages, which a later
Slice delivers. Until then there is no supported restore: the corrupt bytes stay preserved and the affected document
stays blocked. Do not roll the data directory back to an older file copy. Unmarked file-level rollback is unsupported
(spec §5.3.1) and can bring revoked devices back.

## Durable role work

The `durable-role-work` slice adds workflow-owned role requests, independent non-fork conversations, immutable packet
and report artifacts, atomic result notifications, and current-assignment tool enforcement. Full design/delivery
playbooks are not installed: there is no model-controlled scheduler, coding shell, source publication or live-provider
authorization. Human/device routes cannot schedule assignments by impersonating the host.

The trusted composition uses `Engine.options` with explicit `apiKey` and a model-ID-to-family map; production uses the
pinned native `anthropicProvider` from Pi AI 1.4.0. A scripted provider may be supplied at that external seam for owned
fixtures. The ordinary CLI intentionally supplies no provider credentials: role work reports
`native_provider_configuration_missing`, not ambient home/config discovery. No credential is a packet input. Required
models/families must match exactly; an unavailable family blocks. Packets pin exact immutable input, full principles,
instructions, policy and profile refs, model/family/thinking, input-byte/output-token/turn budgets, expected output and
submission method. Only host-authored predefined request keys can create child role work. Packet request trees are
bounded to four levels, 32 children per packet and 256 additional input refs per packet; reports are at most 1 MiB.
These are engineering bounds, not silently truncated content.

Role tools are exactly `read_artifact`, `request_role`, `submit_role_result` and `request_own_stop`. The handlers check the
real Durable task/call, conversation binding, effective current role, generation and Attempt. All nested mutation
wrappers are initially unverified and refused, even if a wrapper declares safe replay. Tool envelopes are captured in
a Durable memo before the first Ledger command; identity includes workflow/conversation, assignment/generation/Attempt,
task ID and call ID. Accepted work belongs to the workflow conversation, not the requesting tool or turn.

Four executing Attempts across all roles is a separate limit from Slice delivery ownership. A human-blocked live Attempt
continues consuming its slot. Read-only conversations have no execution environment or external effect tools; joining
provider/runtime work establishes their absence. Linux-writer profiles block with `sandbox_capability_unavailable`:
there is no host fallback. No worker workspace is provisioned or retained in this slice; workspace-storage quotas and
container execution/stop remain unavailable prerequisites, separate from the four-slot policy.

Queued roles and parents awaiting child results suspend their existing durable task phases on Ledger observation;
waiting does not repeatedly commit sleeps or retry admission. The watch is an in-memory wakeup hint, not authority or
retained evidence. Its initial check plus postcommit observations avoid a missed state change; cancellation/host close
ends the invocation's watch. After explicit startup resume, each run/resume phase checkpoints the fresh executorEpoch
before reattaching. This is one durable reattachment per phase and host start, not periodic progress: it prevents Pi
Durable's consecutive interrupted-invocation counter from treating one healthy long wait as repeated failed execution.
The optional `observingExecutorEpoch` checkpoint field is not an execution permit, does not release a slot, and does not
change the runtime restart limit or retry parked tasks. Committed assignment state is rechecked after subscribing.
An older checkpoint without this field acquires it on its next compatible run/resume invocation. The provider-turn
`wait` phase and its inherited restart-limit behavior are unchanged; no generic parked-task repair is delivered.
The task checkpoint records consumed child identities so an already-delivered result cannot cause an endless
continuation when the resumed role does not submit. Older checkpoints without that optional list start with no consumed
results. Admission still passes through Kernel/Ledger, and only confirmed quiescence frees an executing slot.

`cancelWork` must name the current assignment, generation and Attempt. Ledger commits the new generation before Engine
cancels/joins the role conversation. An unavailable whole-environment stop stays visible as a blocker and cannot release
capacity. Late old-generation report text, when received, is retained as a quarantined artifact, never the role's
accepted report or authority over a newer owner. A previously admitted provider response may still arrive.

On restart, compatible read-only work resumes its own conversation/Attempt only after the store-owner lock, definition
and uncertainty inspection and fresh executor fence. Unsafe interrupted tools or orphaned tasks block startup with
`uncertain_execution`; timeout does not establish death. There is no generic repair/replay override: retain the store,
inspect original task/effect evidence, and use a compatible, explicitly authorized recovery implementation. Do not delete
task records or issue a new command to guess away an unknown effect. Missing/corrupt packet inputs require restoration
of those exact refs. Full history/export/package/restore are not delivered by the prepared dependency; packet/report
revisions and their binding identities are retained for those later owners, not advertised as a supported package.

## Historical browsing and export

Use authenticated `GET /v1/history?workflow=<ref>&limit=100`; retain its opaque `next` cursor and fixed `cutoff` for continuation. `GET /v1/export` with the same selectors/cursor returns the whole selection at that cutoff, including superseded revisions, normalized facts/receipts and exact bytes. Save the response JSON as `export.json`; inspect with `node src/client/read-export.ts export.json`. Use the same paired transport/admin socket as other reads. Handle refusal responses before treating a downloaded file as an export. See [protocol](protocol.md#fixed-cutoff-history-and-portable-export) for version, completeness, redaction and exclusion semantics.

Ordinary restart preserves enrollment, epoch and a private cursor HMAC key. Existing schema-1 stores acquire that optional housekeeping key atomically before admission; immutable records/receipt identities and Render sequence are not rewritten. Never export the live Meta document or cursor key. A cursor is not a credential: revoked/narrowed devices cannot use it to recover broader history. Start a new traversal for later writes or a changed selection. Local-admin and device receipt views differ, so cursors cannot move between those routes: `invalid_cursor` requires starting again on the desired route. Cursors issued before receipt-view binding similarly require a fresh traversal; saved version-1 exports remain readable.

Missing/corrupt or unknown-schema content appears in `manifest.missing` with its exact ref and makes the export incomplete; exact reads refuse with the corresponding named outcome. Preserve the store and use a compatible version for unsupported schemas. Exact-content restore/package repair is not delivered yet: do not fabricate replacement bytes, silently drop the declaration, edit the DB as a repair, or claim export is a backup. Unsaved buffers/uncommitted streams/unsnapshotted files are always outside history. Classified outcomes, retained role packets and runtime records are not yet produced; their unavailable kinds are explicit. No external service, worker, model or human trial is required for these local history checks.

Pages/exports scan their whole selection on each request. Message validation reuses the entries from that scan, but sorting, serialization and shared SQLite/event-loop work can still delay writes as history grows. Page limits do not bound that work or memory; prefer a workflow/kind filter for large stores. Run `npm run verify:history-command-load` separately from the cheap suite to measure the bounded ten-workflow, 1,200-message concurrent workload; this is not a latency guarantee for an arbitrary retained store.

## Evidence limits

- Checks run on darwin-arm64 (Node 24.21.0, SQLite bundled with `node:sqlite`). Persistence readback shows the
  effective settings; it does not prove physical power-loss durability.
- The real disk-full check uses an 8 MiB attached volume. Outcomes on other filesystems were not exercised.
- Cross-device command recovery and revocation were exercised with two local device credentials over loopback HTTP. No
  physical second machine, Tailscale Serve endpoint or private TLS was exercised.
- A silent persistence mismatch, where SQLite accepts the pragmas but reports different effective values, could not be
  produced on this platform. The readback check exists, and the `weakened-synchronous` unsafe control shows that the
  startup readback test detects a weakened setting.
- V9 numbers are an early slice-1 measurement (two clients, 100 workflows, saves only). They are not the full V9
  workload with executing attempts and runtime streams.
