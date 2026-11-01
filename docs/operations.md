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
