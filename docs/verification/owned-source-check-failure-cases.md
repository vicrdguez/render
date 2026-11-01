# Owned check: preimplementation failures and independent oracles

Authored before product implementation (T1). Exercise Effects.perform/reconcile, Sandboxes.prepare/execute/seal/stop,
and Engine/Ledger over real private Git, actual Linux containers and real SQLite. No worker report substitutes for execution.

| Row | Failure / trigger | Observable expected result |
| --- | --- | --- |
| literal-source-roundtrip | export-ignore, export-subst, CRLF, executable, symlink, worker ignore hides base | All literal bytes survive ingress and egress. Symlink target is data. Deleted base file is an actual deletion. Worker Git has no collection authority. |
| literal-source-roundtrip | gitlink, malformed/non-UTF8/reserved/case-colliding names, FIFO, sparse file beyond bound, excess entries/bytes | Actionable refusal; no truncated or substituted accepted tree. Hardlinked regular files are independent Git blobs. |
| literal-source-roundtrip | exclusion overlaps accepted base; command populates declared cache and undeclared deliverable | Refuse base conflict. Exclude and record the encountered host-declared cache; preserve the undeclared deliverable. Worker ignores cannot extend exclusions. |
| linux-profile-owned-check | command writes only declared dependencies/caches, then exits 0 or 7 | Receipt retains the unchanged source tree, actual encountered exclusions, and respectively `passed` or `failed`, never `source_changed`. |
| whole-container-quiescence | missing image or stop racing preparation before create | Stop confirms absence after preparation settles, including after reopen. No execute or workspace reuse. Engine releases execution capacity; cancellation releases Slice writer ownership. Previously created missing/uninspectable runtimes remain quarantined. |
| linux-profile-owned-check | model selects mount/privileged/env/host runtime options; stale generation | Refuse before execution. No host-shell fallback. |
| linux-profile-owned-check | worker probes home, authority DB, runtime socket, credentials; calls owned Render without credential | Nonroot constrained Linux; forbidden paths/credentials absent; Render unauthorized. |
| linux-profile-owned-check | worker calls owned host canary | Record actual reachability, not private-route isolation. Unsupported macOS checks remain unrun. |
| whole-container-quiescence | background child ignores TERM; concurrent execute after seal | Entire container becomes confirmed not-running before collection. New execute refuses. Freeze receipt binds runtime ID and generation. |
| whole-container-quiescence | runtime cannot inspect/stop; interrupted capture/restart | Quarantine persists; no capture, restart or workspace reuse based on a timeout. |
| source-root-crash | interrupt before durable root / before Ledger reference | No accepted recoverable-source claim; unreferenced objects confer no authority. Reconciliation verifies exact retained objects; missing bytes block, never substitute. |
| source-root-crash | modify .gitattributes/.gitmodules | Exact changed bytes retained, prominently flagged in receipt; inert diff cannot execute external diff/textconv. |
| retained-history | source receipt persists through history/export/reopen; stale cancellation races | Immutable trusted receipt with assignment/generation, command/exit/platform/verifier/source roots; late result quarantined, never accepted for different source. |

Resumption adds executable oracles before product recovery changes: transient runtime outage retries only the original
identity; failed collection retains exact pre-root command diagnostics without a pass; process death after stop and
before/after root/SQL preserves evidence or explicit blockage; cancellation at a rooted-effect barrier retains late
quarantined output and holds capacity until the admitted work settles. The integrated package surface must explicitly
refuse role/source stores it cannot restore, never omit their source roots. Execution-time workspace quotas are excluded
by the recorded slice decision; ingress/collection bounds and issue #39 remain honestly distinguished.

Unsafe controls must distinguish wrong behavior from setup failure: archive substitution, hidden-base loss,
symlink-follow collection, early capacity release and host fallback each have an independent literal assertion.
Default engineering bounds: 64 MiB literal bytes, 10,000 entries. Excluded directories must be explicitly declared generated;
worker ignore patterns never extend that declaration. Unsupported representations block. Container/image and owned fixture
prerequisites must be reported explicitly, not skipped into a green behavioral claim.
