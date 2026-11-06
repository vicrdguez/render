# Target preparation failure cases

Acceptance oracles written before product changes. These are requirements, not run results.

| Case | Trigger | Literal expected outcome | Seam |
|---|---|---|---|
| TP01 | Diverged B and T1, disjoint edits | clean X contains `implementation=B` and `target=T1`; exact B/T0/T1 retained; deterministic rooted commit after reopening | Effects.perform/reconcile |
| TP02 | T1 already included in B, unrelated recorded T0 | operational error; no ancestry bypass | Effects.perform |
| TP03 | Rewritten T1 not descending from T0 | operational error | Effects.perform |
| TP04 | Changed retained manifest/format, missing object or blob input | operational error, never conflict | Effects.perform |
| TP05 | Both sides change `common` | conflict, `conflicts=[common]`, rooted result, unchanged originals | Effects.perform/reconcile |
| TP06 | Exit 1 with empty stdout | operational error retaining stderr; no authorized conflict return | Effects.perform |
| TP07 | Truncated framing or exit 0 with conflict messages | operational error | Effects.perform |
| TP08 | Git aborts | operational error including SIGABRT and stderr | Effects.perform |
| TP09 | HOME-only / XDG-only hostile default union attributes | production still reports conflict; each unsafe control changes it to clean and fails the intended assertion | Effects.perform, unsafe controls |
| TP10 | Authorized conflict return | exactly one successor based on T1, original B/T0/T1 evidence read-only; new Audit required, zero added Watchdog completions | Engine/Ledger/Sandboxes |
| TP11 | Clean X whose required behavior check fails | non-pass; recorded actual X verifier/results; repair opens successor, no old-pass edits or Watchdog completion | Engine/Ledger/Sandboxes |
| TP12 | Operational verification failure or unchanged-source retry | retain B/pass/Audit; operational blockage and explicit safe retry | Engine/Ledger |
| TP13 | T2 arrives between verification and review launch | prepare/recheck T2; no stale Watchdog launch, no new pass or Audit | Engine/Effects |
| TP14 | Pause/restart/agent failure after retained preparation | exact immutable records/export and scoped continuation, no duplicate transitions | Ledger/Engine |

Effects-only cases do not establish Engine orchestration, Ledger acceptance, actual Linux checks, review judgments, or full V8/V9. Those remain explicit coverage obligations until their real seams are exercised. Run narratives and raw output belong outside the source tree.
