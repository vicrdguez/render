# Render verification

Render's own repository verification asset (spec §8.2). Rows prove behavior only when they execute against the actual
source; scaffolding rows (build, lint) prove only what their command claims. Failure cases and their literal expected
outcomes are in `docs/verification/durable-workspace-failure-cases.md`, `docs/verification/durable-role-work-failure-cases.md` and `docs/verification/context-policy-continuity-failure-cases.md`.

## Ranks

Strongest first. Render's ladder replaces the generic tests → build → inspection fallback.

1. `process`: real host subprocesses, a real SQLite store on disk and real HTTP/Unix-socket transports, driven by
   independent clients.
2. `tests`: in-process executable oracles at a module interface (pure Kernel, Ledger over real SQLite).
3. `build`: typecheck and lint.
4. `inspection`: cited source inspection. Architectural commitments only; never a behavioral pass.

## Launch

- Install: `npm ci --ignore-scripts` (exact pins in `package-lock.json`).
- Own instance only. Every check starts its own host with `node src/host/main.ts serve --data <fresh temp dir> --port 0`
  and reads the `ready` line from stdout for the URL and admin socket. Never point a check at a live data directory.
- Enroll check devices through the admin socket of that instance (`node src/client/cli.ts admin enroll ...`).

## Doctor

- Node `24.21.0` (`node --version`), npm 11. Native `.ts` execution; no build step.
- macOS `hdiutil` for the real disk-full case (`B2-09`). Elsewhere that case reports `skipped: hdiutil unavailable`,
  not passed.
- Write access to the OS temp directory. Loopback TCP must be available.

## Channels

| Channel | Used for | Limits |
|---|---|---|
| Executable oracle | Pure Kernel schedules against a literal command-family × principal matrix and independent invariants | Covers Kernel legality only, not storage or transport. |
| Process | Host subprocesses, SIGKILL at fault barriers, two-process owner lock, startup refusal exit codes | One host OS (macOS/darwin-arm64 locally); no power-loss proof. |
| Driven surface | HTTP/NDJSON and admin socket, driven by the protocol client and the stateless CLI client | Loopback only; private Tailscale Serve HTTPS is not exercised. |
| Tests | `node:test` suites at the Kernel and Ledger interfaces | |
| Static | `tsc --noEmit`, `biome check` | Type and lint conformance only. |
| Human-observed | None in this Slice | Advisory only. |

## Catalog

| Name | Channel | Kind | Run | Expectations | Rank |
|---|---|---|---|---|---|
| kernel-authority-schedules | Executable oracle | executed | `npm run verify:kernel-authority-schedules` | V1: 10,000 seeded pure schedules, zero invariant violations; failures print a replay seed and a shrunk schedule. Literal family × principal matrix; refusals carry no writes; the Kernel never mutates its inputs; stale basis never accepted (B1, B2). | tests |
| sqlite-command-atomicity | Driven surface | executed | `npm run verify:sqlite-command-atomicity` | V2: 256 targeted schedules on real SQLite through the HTTP adapter: duplicate/conflict/stale/revocation/scope outcomes literal, atomic receipt + revision + pointer + sequence, authorization before dedup disclosure, exact bytes after reopen, 4 MiB/16 MiB saves with literal digests, oversized/malformed refusals, corrupt-content refusal, and unknown application revision/message schemas blocking reads/dependent saves without rewriting records (B1, B2, B4). The real two-process owner lock is in `persistence-startup`. | process |
| command-crash-recovery | Process | executed | `npm run verify:command-crash-recovery` (extended: `RENDER_V3_REPETITIONS=100`) | V3: SIGKILL at the before-commit and after-commit barriers, then restart and retry the original envelope: no partial commit, no duplicate accepted work; real disk-full refuses success (B2-07..09). | process |
| two-client-reattach | Driven surface | executed | `npm run verify:two-client-reattach` | V4: two device clients (separate CLI processes), stale-write race, cross-device lost-reply retry, revocation closing reads and streams, fresh attach ≤ 5 s with exact bytes and handover fields, frame version/gap/slow-consumer rules (B1, B3), plus fixed-cutoff history/export continuation across ordinary restart and same-human devices. | process |
| persistence-startup | Process | executed | `npm run verify:persistence-startup` | V7: owner lock before runtime open, WAL/FULL/fullfsync/checkpoint_fullfsync readback, incompatible stores blocked with bytes retained, fresh executorEpoch, preserved authorityEpoch and enrollment; role recovery additionally exercises unsafe-intent/orphaned startup refusal and explicit-resume-before-cancellation order (B4, R08). | process |
| local-command-load | Process | executed | `npm run verify:local-command-load` | V9 (early slice-1 measurement, not the full V9 workload): two clients, 100 workflows, saves at FULL/fullfsync; p95 acknowledgement < 250 ms, snapshot < 1 s. Prints measured values. | process |
| unsafe-controls | Tests | executed | `npm run verify:unsafe-controls` | Each of 28 named mutations makes its targeted check fail with that control's own assertion message, after the check passed unmutated: repair empty cursor key, restricted role resume, package-origin marker ignored, missing restored receipt treated as unsent, blocked-live slot release, inherited role tools, tool-owned role child, header and matrix principal forgery, stale-write acceptance, dedup before auth, dedup ignoring payload, device-bound dedup, lock after open, weakened synchronous, latest-only history, substituted corrupt bytes, revoked stream left open, Kernel mutating its inputs, slow consumer kept, latest-only export, cutoff drift, inherited-private-context, inherited-noncandidate-packet, inherited-candidate-report, inherited-experiment-candidate-report, adopt-back-revives-basis and policy-resets-review-count. Any other failure is reported as `failedOtherwise`, never as detection. | tests |
| package-clean-restore | Process | executed | `npm run verify:package-clean-restore` | V7: remove original, import solely from package, literal bytes/messages/cutoff/relationships, private cursor-key exclusion (including old bases/deltas/pages), live cursor continuity and restored scoped history/export; later writes cannot change snapshot cutoff; interrupted generation cannot replace prior package; policy-only package restore preserves future defaults, adopt-away/back provenance and literal policy payload after deleting the original database (recovery B1, continuity B4/B5). | process |
| package-origin-auth-fence | Process | executed | `npm run verify:package-origin-auth-fence` | V7: direct package-DB copy predating revocation refuses old bearer/receipt/outbox before auth; live DB never marked (recovery B1/B2). | process |
| package-validation | Process | executed | `npm run verify:package-validation` | V7: missing/corrupt/traversal/malformed/symlink inputs, checksummed semantic pointer/receipt/scope/parent/schema/unknown-kind and message digest/length/partial-metadata corruption; managed malformed input leaves durable admission-disabled mode; policy history/cache consistency and checksum-correct missing/schema/digest/meaning/binding/placement/cache damage refusals; empty role indexes supported, nonempty role stores explicitly refuse generation/import/repair while preserving the last good package (recovery B2/B3). | process |
| repair-crash | Process | executed | `npm run verify:repair-crash` (extended: `RENDER_V3_REPETITIONS=100`) | V3: SIGKILL immediately before/after atomic repair commit: marker remains or rotated restricted mode remains; executor fencing changes every start (recovery B3). | process |
| restore-newer-world | Process | executed | `npm run verify:restore-newer-world` | V7: re-pairing and scoped cutoff receipt reads, missing receipt uncertainty, epoch mismatch distinct from reconciliation refusal, no new command on lost dedup, restricted restart preserves new credentials/epoch/cursors; restored history/export scopes and pre/post-repair uncertainty remain explicit (recovery B4). Role direct copies retain diagnostic packet history/export but no Engine resume hooks, dispatch, assignment authority or implicit repair; restricted restarts fence permits without rebinding. No Effects/Forge reconciliation claimed. | process |
| durable-tool-replay | Process/tests | executed | `npm run verify:durable-tool-replay` | R02/R03: host-derived invocation identity, real SQLite commit-before-result interruption (extended: `RENDER_V3_REPETITIONS=100`), safe/unsafe nested-wrapper refusals. Not a live-provider authorization. | process |
| workflow-task-survival | Tests | executed | `npm run verify:workflow-task-survival` | R01/R07/R09: workflow-owned child survives turn abort; exact report/packet and handoff persist after reopen. | tests |
| role-capability-refusal | Tests | executed | `npm run verify:role-capability-refusal` | R03/R04: real handler scope, explicit tools/model/family/budget, no host fallback, visible missing prerequisites. | tests |
| cancellation-capacity | Tests | executed | `npm run verify:cancellation-capacity` | R05/R06/R08: pure legality plus actual simultaneous provider admissions, blocked ownership versus quiescence, cross-workflow Slice ownership, generation fence/stale receipt refusal, trusted late-result quarantine and unsafe/orphaned startup refusal. R10 additionally holds four silent providers with queued work, a waiting parent and all 32 child request keys before/after reopen: zero idle WAL writes, bounded host lag/human-command acknowledgement (< 1 s regression bound, not full V9), observation and automatic continuation on child results. R11 additionally SIGKILLs parent-results/capacity waits eight times (beyond the pinned restart limit): no parked task/startup refusal, retained blocked execution ownership, queued report completion after confirmed quiescence, and terminal parent cancellation when sandbox capability remains unavailable. | tests |
| history-command-load | Process | executed | `npm run verify:history-command-load` (extended, separate from smoke) | Retain 300 then 1,200 messages across ten workflows. Fourfold history must remain below 8× export time (600 ms noise floor), exact identities/bytes intact; concurrent pages/exports and writes acknowledgement p95 < 250 ms in this bounded local workload, not full V9. Prints measured values. | process |
| history-cutoff-export | Process | executed | `npm run verify:history-cutoff-export` | V7: separate equal-byte revisions, fixed-cutoff pagination/export across concurrent writes and restart; scope/revocation, default selection never widening, page redactions/omissions, local-admin/device receipt-view cursor transfers refused in both directions, named unavailable filters, missing/corrupt/unsupported revisions and missing/malformed/tampered messages declared. R12 adds exact role packet/report/quarantine documents and task receipt bindings, trusted provenance, unchanged cutoff after reopen, standalone-reader consumption and missing/corrupt/unsupported packet declarations. Preimplementation oracles: `docs/verification/historical-export-failure-cases.md` and `docs/verification/durable-role-work-failure-cases.md`. | process |
| independent-export-reader | Process | executed | `npm run verify:independent-export-reader` | V7: fresh standalone Node-builtins reader; literal content plus malformed/version/schema/digest/missing/link refusals. | process |
| context-continuation-independence | Tests/process | executed | `npm run verify:context-continuation-independence` | B1/B2, V3/V8: compatible interrupted role/child waiting reattachment, canceled-child replacement satisfying the same waiting parent (including repeated replacement and restart), fenced/quiescent replacement with fresh conversation and predecessor, private-packet canary refused across five independent roles, separate non-candidate Watchdog packet/candidate report/experiment-candidate report refusals (each guard independently mutation-detected), explicit human direction for same-family work. Missing sandbox/family stays blocked. | tests |
| native-compaction-history | Tests | executed | `npm run verify:native-compaction-history` | B3, V7/V8: actual pinned native compaction twice/reset, literal tool-result tail past 2,000 characters retained while summarizer input is lossy; stale cut and failed blocking compaction; integrated Engine two-compaction/reset/replacement literal-tail preservation, summary admission, serial execution and exact constraint refresh; scoped archived visible transcript/task receipts; missing/corrupt/unknown-schema archive refusal and unchanged reopen/export. Hidden reasoning/opaque fields and absent transients are labelled. | tests |
| policy-adoption | Tests | executed | `npm run verify:policy-adoption` | B4, V7/V8: child interruption/replacement resumes its waiting delivery owner with the replacement report and excludes awaiting parents from cancel guidance; future defaults versus active bindings, human selected-revision adoption, stale expected basis, away/back never revives a binding, immutable old/current packets, retained completed Watchdog assignments/reports (not a later full rework-cap implementation), missing/corrupt/unknown policy-source refusal before adoption, authorization before source diagnostics, digest-checked portable policy bytes through the independent reader; in-flight adoption retains ownership/slot until quiescence, fences old-basis provider continuation, preserves an existing runtime blocker, and exposes checked cancelWork handover with/without Ground followed by fresh linked replacement on the new binding. | tests |
| task-version-recovery | Tests/process | executed | `npm run verify:task-version-recovery` | B5, V7: missing/older/missing-migration/throwing task definitions retain input, checkpoint and owner; compatible executable reattach to the same retained store (a stopped database copy is created but not validated or restored); unsafe/orphaned recovery remains blocked. No production numeric migration or generic transformation engine is introduced. | tests |
| full-suite | Tests | executed | `npm test` | All rows with cheap counts (V1 10,000, V2 sampled 32, V3 one repetition per barrier) in < 5 min. | tests |
| typecheck | Static | executed | `npm run typecheck` | `tsc --noEmit` clean. | build |
| lint | Static | executed | `npm run lint` | `biome check` clean. | build |

## Slice6 shortened scripted continuity/handover chain

1. Run `context-continuation-independence`: interrupted same work retains owner/context; replacement requires fence/quiescence and supplies predecessor/current packet.
2. Run `policy-adoption`: publish future defaults, adopt selected revision with expected binding, reject stale adoption, adopt back without reviving old basis or resetting completed reviews.
3. Run `native-compaction-history`: compact twice/reset, read committed history rather than infer it from a summary, promote decisive report bytes before settlement, and export/reopen the retained scoped chain.
4. Run `task-version-recovery`: stop writers, create an unvalidated database copy, refuse incompatible definitions and preserve uncertainty; reopen the same store with its compatible executable without rewriting task meaning. This does not test backup restoration.
5. Run the three `policy-adoption: in-flight handover` rows: adopt during a held provider request, inspect retained delivery owner/Attempt and blocker, and use the snapshot's checked `cancelWork` identity after quiescence. Replace the canceled predecessor with fresh context/current binding and retain its link. Ground presence must not hide cancellation; an existing runtime diagnostic survives adoption. The snapshot's accepted-intake commitment is explicitly `none` in this host; packet/report/history retrieval is covered by steps 1–3, not a full accepted-commitment handover. Unsupported worker recovery remains bounded by unavailable provisioning; no successful worker continuation is claimed. A new context never by itself opens an implementation pass.

6. The three `child replacement` rows (in both continuity and policy checks) follow the blocked child's checked cancellation, refuse parent rebind before replacement submission, and continue the same parent Attempt with the fresh linked report. They cover policy interruption live/after reopening SQLite and a repeated ordinary child failure. The handover must not offer cancellation of an awaiting parent; a canceled leaf remains an obligation until its replacement submits.

This grows the executable V8 chain; it is not a complete design/delivery journey, semantic judgment-quality result or a timed human trial. Full V5, off-host V6, role-inclusive package restoration, later source/effects/verification paths and four concurrent streaming V9 remain absent. The extended V3 job currently covers delivered commit/reply and safe-tool barriers; no 100-repetition process-fault claim is made for a new compaction/settlement cut unless separately recorded.

## Cleanup

Every check removes its temp data directories, kills the host processes it started (SIGKILL after a 2 s grace period),
and detaches any disk image it attached (`hdiutil detach -force`). A leftover `/Volumes`-less mount named
`render-full-*` under the temp directory is from an interrupted `B2-09` run and is safe to detach.

## Extend

Each later Slice adds or changes rows for the records it introduces. Extend `kernel-authority-schedules` for new Kernel
rules and `sqlite-command-atomicity` for new atomic records. Add new unsafe controls for new consequential refusals.
Keep row names stable. Never lower an expectation to make a product change pass.

## Traps

- `RENDER_FAULT_BARRIER=<before-commit|after-commit>` with `RENDER_FAULT_COMMAND=<commandId>` makes the host announce
  `{"event":"barrier"}` on stdout and stop at that point so a check can SIGKILL it. It is inert unless set; never set it
  outside checks.
- `fullfsync` makes each commit wait for the device cache flush. Expect several milliseconds per commit on macOS.
- Recovery adds `package-snapshot`, `package-publish`, `repair-before-commit`, `repair-after-commit` barriers. SIGUSR2 releases an explicitly configured barrier for the snapshot/later-writes check. It is inert otherwise. Incomplete directories are not published packages.
- Recovery failure cases and literal expectations: `docs/verification/recovery-packages-failure-cases.md`. Source roots are empty because this target has no retained source owner; unknown future runtime/source records refuse.
- Do not inspect, copy or run skl tests.
- Never point a check at the user's live data directory or a live Render host.
