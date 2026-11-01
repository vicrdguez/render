# Recovery package failure cases (written before implementation)

Current retained types: Meta, Workflow, Device, RevisionLocation, Receipt; immutable revision/message/fact entries;
Durable conversations and runtime records. There is no source/effect/assignment owner in this target. A package must
explicitly declare an empty source-root map, and unsupported future records must refuse, not disappear.

| Row | Independent expected consequence |
|---|---|
| package-clean-restore | Snapshot at sequence 5 contains `first\r\n` and `hello`, revision:4, workflow:3. Later sequence 6 bytes and sequence 7 revocation do not change it. Remove original data; restore solely from package. Live DB remains active/unmarked. |
| package-origin-auth-fence | A direct DB copy predating revocation refuses old bearer, receipt read and outbox with recovery_required, without content or accepted result. No runtime resume in marked/restricted recovery. |
| package-validation | Missing DB/manifest, altered DB, malformed manifest, unexpected/traversal filenames, symlinks, incompatible schema, invalid semantic pointers/parents/receipts/facts/device scope and unknown retained kinds all refuse. No previous generation is overwritten. |
| managed-restore | Take the destination owner lock and durably disable admission BEFORE reading any package input. Malformed input leaves a clean destination blocked across restart. A nonclean destination refuses before import without overwriting bytes or disabling the existing store: restart retains active mode, authority, credentials, receipt/artifact reads, saves and packaging. |
| repair-crash | Kill at repair-before-commit / repair-after-commit. Restart either retains marker/old epoch or cleared marker/new epoch/recovery-reconciling. No old credential, dispatch or writes. Successful rotation occurs once; executor epoch changes on every restart. |
| restore-newer-world | Local admin repairs, re-enrolls once, and reads cutoff receipts under current scope. Missing later receipt is outcome_unknown_after_restore; old epoch envelope is authority_epoch_mismatch. Current epoch writes are recovery_required until newer-world reconciliation exists. No automatic reissue/exit is implemented. Scoped users cannot disclose other workflow receipts: restricted-mode status and response body for an out-of-scope workflow receipt or local-admin receipt equal those for a never-used command ID. An all-workflow device likewise cannot disclose local-admin receipt existence. |

Unsafe controls must make the origin-fence and missing-receipt oracles fail on their literal behavioral assertions,
not import/setup errors. Existing slice1 ordinary-restart tests must still preserve enrollment.

Local packages are not off-host backups. SIGKILL is not physical power loss. Extended repair checks use 100 repetitions
per barrier, separately from smoke. Future Effects/Sandboxes/Engine reconciliation, V5/V6, full V8 and four-stream V9
remain unavailable, never passed by the empty source-root map.
