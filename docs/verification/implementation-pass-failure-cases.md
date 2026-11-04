# Implementation-pass failure cases

Preimplementation oracles for B1–B5 / A1–A3. Expected outcomes come from the accepted Contract and spec §6.2.1, not from snapshots of the implementation.

## Kernel / Ledger

- First accepted delivery assignment opens ordinal 1 with the accepted Contract as its basis. Unaccepted work cannot acquire delivery ownership. Replacement after fencing/quiescence and same-store restart preserve the pass; they do not create ordinal 2.
- A second delivery owner or writer cannot overlap the open pass. Standards and Contracts are non-delivery, read-only children; both have new conversations and current assignment-agent principals.
- Audit cannot start without a trusted retained quiescent source A, its exact obligations and verifier inputs. A failed seal, missing/corrupt source, missing required family or incompatible profile remains an explicit blockage.
- A single Audit request atomically retains both immutable packets and stages both tasks. A crash before commit leaves neither; after commit/reply loss replay returns the original identities. A different request ID cannot create a second invocation.
- The two reports are bound by the host to the actual pass, A and their own Assignment. Model-selected pass/source identities, a predecessor-pass report and an unrelated role report cannot satisfy the current invocation.
- Interruption retains a completed axis and resumes/replaces only the incomplete report role. Replacing an implementer retains the pass and original Audit; replacing a reviewer cannot change its axis, A or obligations.
- Before both reports, handoff refuses. Every finding needs exactly one disposition and a reason. Fixed findings identify the changed source and relevant rechecks; unresolved product/Contract questions block handoff.
- After Audit, repairs and verifier changes stay in ordinal 1. No command may reset the completed Audit. Final B may differ from A; reports continue to name A.
- A sealed handoff atomically retains pass/A/reports/dispositions/B/current completion table and a preparation intent/task. Execution cannot occur before commit. Missing preparation/Watchdog capability is visible blockage, not successful delivery.
- Lost handoff reply yields the authorized original receipt; another submission cannot create a second handoff or task. Revoked/stale principals cannot obtain dedup disclosures.
- Authorized post-handoff source/verifier repair opens ordinal 2 with predecessor and cause/basis (see Successor passes). Equal source bytes do not reuse ordinal-1 reports. Operational preparation retries alone never open a pass.

## Successor passes

Oracles from spec §§6.2.1, 9.4 and 11 and the recorded return-to-implementation decision. `target-preparation` and `watchdog-rework` own real production of these results, so the transition is exercised through a closed `openSuccessorPass` Effects-scope observation, never a free-text reason.

- A validated preparation conflict opens exactly `(work, 2)` with cause, predecessor, B, T0, T1 and the retained literal observation, on a new linked current Attempt whose fresh workspace starts from T1. It starts no Watchdog and adds no completed review. P1, A1, its reports, B1, its handoff and its preparation outcome stay byte-identical.
- Failed prepared-source checks that need repair open a successor from X and require nonzero real check exits on named catalog rows. Timeouts, 126/127 launch failures, signals and any other unchanged-source operational retry cannot open a pass.
- Authorized Watchdog rework names a submitted Watchdog Assignment on this Slice whose retained report binds its verdict to this exact pass, handoff, B, X and T. A `pass` or `needs-human` verdict, an unrelated pass/B/X/T, another Slice's report or an incomplete review refuses.
- Successors obey the completed-review cap for the workflow's current bound policy: at the cap a non-pass stops for the human, for every cause. Explicit D004 adoption of a larger cap permits it. Counts derive from retained reviews, so opening a pass neither adds nor resets one.
- Arbitrary text, unknown causes, extra fields, wrong repository/B/commit, malformed object IDs, an empty conflict, or a conflict target equal to its base all refuse without writes. So do assignment agents, humans and scheduling/recovery host scopes.
- A pass still open, a writer not yet quiescent, a superseded Contract, a missing/corrupt B or predecessor record, or a stale generation/Attempt all refuse without opening a pass.
- A pass opens at most one successor. Replay of the same command returns the original receipt. A different command ID, or any later request from the predecessor's owner, refuses.
- P2 has no Audit until its own fresh A2 and invocation. P1's reports cannot satisfy P2 handoff, P1's reviewers cannot report into P2, and this holds when A2's bytes equal A1's. A second P2 Audit request refuses.
- The first P2 capture must name the opening base. A worker-chosen parent refuses.
- P2 owner reads the predecessor's B, reports and observation. P2's reviewers read only A2 and their obligations, not the observation or predecessor reports.
- Replacement or restart within P2 keeps ordinal 2. A late P1 preparation outcome is retained on P1 and does not disturb P2.
- SIGKILL before commit leaves one pass and no extra task. After commit, replay returns one successor and one task. Export and reopen retain P1 and P2 with their real provenance.
- Scripted two-pass journey on real Docker and Git: P1 handoff, conflict against a real T1, P2 from T1, fresh Audit on A2, B2 and its own handoff, each reporting the source it actually examined.

## Actual source / execution

- Capture seals and stops the entire original runtime. Fresh preparation materializes retained literal A under the same implementing conversation and exclusive ownership, without reusing the stopped workspace.
- CRLF, symlinks, executable bits, new files and deletions survive A→fresh workspace→B. Services, cache and local Git metadata need not survive. Setup may be rerun.
- Exclusions conflicting with accepted-base files or intended deliverables refuse. Bounds conflicts and unknown runtime death never count as successful capture.
- Exact source/verifier/Contract/role evidence is required for the current completion table. A failed check cannot be made passing by lowering an expectation. Bootstrap an absent verification asset and retain its deliverable as ordinary source work.

## Durability / cumulative coverage

- Real SQLite reopen, fixed-cutoff history and independent export retain all added records and exact provenance. Missing/corrupt bytes are explicit gaps, never replaced by current bytes.
- V1 seeded schedules exercise pass identity and one invocation; V2 real transactions exercise paired staging and handoff; V3 SIGKILL cuts exercise before/after commit and lost results; V5 actual Linux capture and V6 A→B lineage; V8 a scripted two-pass journey. Extended V3 repetitions stay outside the edit loop.
- Unsafe controls must fail their named observable assertion, not compilation/setup: old-pass reuse, A-as-X relabel, same-pass re-Audit, and pass-on-restart.
- Final-source verification must name available cumulative commands and their actual outcomes. Full V8/V9 and later preparation/Watchdog capabilities are not inferred from earlier fixture successes.
