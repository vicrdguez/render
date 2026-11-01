# Slice6 failure cases and independent oracles (before product changes)

Source baseline: 0c36b60aad07c6e67846396832739434c370dc56. Authority: docs/spec.md at 768f43c13b0675fae553f4ad09ec754f799a19fb (§§6.4–6.5, Version policy); local spec has the same SHA-256.

These are literal acceptance expectations, not generated snapshots.

| Named row | Failure / required observable outcome |
| --- | --- |
| context-continuation-independence | Interrupted same assignment must preserve conversation, packet and ownership. A current-binding mismatch must refuse rebind. Unknown effects or environment must refuse quiescence. A fenced, physically quiescent predecessor may be replaced only with a new conversation, current packet, predecessor link and no inherited permissions. Replacement before quiescence refuses. |
| context-continuation-independence | Independent candidate/challenger/Audit/Watchdog creation cannot receive an earlier role packet or candidate-private result. Canary bytes must never enter the provider transcript or read_artifact scope. Unknown model/family remains blocked. Existing same-review recovery must not create a new independent assignment. |
| native-compaction-history | A committed tool output containing a literal tail beyond character 2,000 must remain readable after two native compactions and reset. Summary input loses the tail, not stored history. Stale first-kept cuts refuse. Failed blocking compaction is observable and must not count as successful continuation. Exact mandatory constraints are supplied independently of summaries. |
| native-compaction-history | Historical reads/export preserve assignment/conversation/task provenance and declared absent live/uncommitted/nested material. Unknown/corrupt/missing retained bytes must be reported, not reconstructed. Important decision evidence is retained as Ledger revisions before settlement. |
| policy-adoption | Future defaults do not mutate active binding. Human adoption names an immutable revision and compares an expected binding revision. Wrong principal/stale binding refuses atomically. Adopt away/back creates distinct binding revisions; an old prepared basis never becomes current again. Submitted Watchdog assignments/history remain intact. Checkpoint routing is not part of ordinary policy. |
| task-version-recovery | Missing/newer/older task definitions and a throwing migration block without changing ownership or history. Compatible definitions can resume; incompatible semantics require distinct names and old handlers. Orphaned abort remains an uncertainty blocker. Rollback is supported only with a compatible executable/store and declared cutoff/reconciliation. |

## Rework regressions (before product repairs)

- Distinguish an earlier non-candidate Watchdog packet, a candidate report and an experiment-candidate report. Each is refused as `forbidden_scope` for a fresh Watchdog; disabling only its corresponding guard must accept the input and fail that oracle. Keep the five independent destination-role checks too.
- Adopt policy while a scripted provider request is held in flight. The assignment stays blocked, retains its execution slot and delivery ownership, and the next request on the old basis never reaches the provider. With or without Ground, the handover must name checked `cancelWork` with the current assignment/generation/Attempt, not `saveGround` or `none`. After confirmed quiescence/cancellation, a fresh linked replacement uses the new binding and submits.
- If execution was already blocked, adoption must preserve the original runtime diagnostic in the current snapshot while refreshing its packet/binding. Cancellation still uses the same checked route.
- The small-context compaction fixture must inherit the production enable/background settings, not substitute its own safe values.

Integration with delivered recovery packages: a role-free store must package and restore policy defaults, immutable human revisions and adopt-away/back binding provenance using only the package after the original database is deleted. Missing/schema/digest/meaning/binding/placement/cache damage must refuse even with a recomputed outer checksum. Nonempty role work, including archived runtime/task records, remains explicitly unsupported rather than silently omitted or resumed. Restored admission remains fenced until the existing repair/reconciliation procedure; no role recovery capability is added.

Unsafe controls must actually admit inherited private context or reuse the old adoption binding, then fail the corresponding behavioral oracle. Import/compilation/setup errors do not establish an unsafe control.

Verification is through Kernel.change, Ledger.command/observe/artifact, Engine.render/reconcile and pinned Durable on owned SQLite fixtures. No live credentials or user services. Operational backups and physical-loss guarantees remain unproved; no generic transformation engine is introduced.
