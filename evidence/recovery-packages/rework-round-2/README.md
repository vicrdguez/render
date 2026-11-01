# Recovery / historical-export integration evidence

Product/verifier candidate: `f7a569cbe52ce4015154830bcbc4b76a485a2839`.
Freshly fetched integrated target/cutoff: `3bb0bbd43c1268a19153b5bb248f51adbde9d2b8`.
Previous reviewed head/fixed point: `0319d98f0bf593509609b563f90f77d1c0cd734f`.
Tests/failure cases committed first in `60d7b35`; product integration/resolution in `f7a569c`.

All successful logs below begin with the exact candidate SHA. Node v24.21.0, darwin-arm64,
owned temporary SQLite stores and subprocesses only; no live services, deployment or skl tests.

| File | Exact command at candidate | Outcome |
|---|---|---|
| full-gate.txt | `npm test && npm run typecheck && npm run lint` | 64 pass, 0 failed/skipped; 56.562 s tests; types clean, Biome 37 files clean |
| named-checks.txt | `npm run verify:<name>` for package-clean-restore, package-origin-auth-fence, package-validation, restore-newer-world, repair-crash, history-cutoff-export, independent-export-reader (serial) | all seven exit 0 |
| unsafe-controls.txt | `npm run verify:unsafe-controls` | 17/17 detected, all baselines pass, zero failedOtherwise |
| v2-extended.txt | `npm run verify:sqlite-command-atomicity` | 256 real-SQLite schedules, 22 tests pass, 24.143 s |
| v3-command-extended.txt | `RENDER_V3_REPETITIONS=100 npm run verify:command-crash-recovery` | 100 at each before/after barrier, plus actual disk exhaustion; 3 tests pass, 140.052 s |
| v3-repair-extended.txt | `RENDER_V3_REPETITIONS=100 npm run verify:repair-crash` | 100 at each repair barrier; one aggregate test passes, 116.366 s; count derives from invocation and checked-in loop |
| history-load.txt | `npm run verify:history-command-load` | separate 300/1,200 message workload passes; exports 4.402/16.221 ms; concurrent acknowledgement p95 41.879 ms |

The regression logs were captured during implementation, before the responsible product changes, not on a clean
committed candidate. `w4-red.txt` ran `node --test --test-name-pattern='history scope|checksummed but' test/recovery-packages.test.ts`
after textual merge conflict resolution, with recovery semantics still from 0319d98: both rows fail on the intended
message-text acceptance and raw-key inclusion assertions. `w4-uncertainty-red.txt` ran the history-scope row after
key/content repairs but before the admission-disabled uncertainty extension: the expected recovery declaration was
absent. These are not clean-head full-gate runs. Later setup corrections shortened socket paths, copied the sole
package outside the original before deleting it, and used the repaired epoch for enrollment. Their incidental
setup failures are not counted as bug detection. All corrected rows pass at the candidate.

Audit reports are the prescribed sequential self-review fallback: Standards finished before Contracts began because
Agent discovery returned no tools. Neither is independent Watchdog. Both reviewed the same candidate and recorded
gate. No new findings; existing W1/W2/W3/F1 remain fixed and W4 is resolved. The evidence-only retention commit after
the candidate changes no product/verifier code; final-head gate/inspection logs are retained in the submission result
directory. No post-Audit functional edit or second Audit.

V1 10,000, sampled V2, real two-process owner lock, V4 reattach (135 ms), V7 and early V9 pass in the Full Gate.
Early V9 is 400 saves/two clients/100 workflows: acknowledgement p95 78.112 ms, snapshot p95 1.757 ms, not four streams.
V5/V6, full V8, executing attempts and four-stream V9 remain unavailable/unrun, not passed. No human usability or
physical-device observation. Off-host storage, source/effect/task reconciliation, generic migrations, recovery exit,
unmarked arbitrary rollback and physical zero-loss/RTO guarantees remain outside this delivery. Legacy messages with
both integrity fields absent remain unverified by inspection; the new executed corruption cases cover stored metadata.
Fixture helpers remove owned temporary directories, stop/kill owned processes and detach owned disk-full volumes.
