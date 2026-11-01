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
| unsafe-controls | Tests | executed | `npm run verify:unsafe-controls` | Each of 21 named mutations makes its targeted check fail with that control's own assertion message, after the check passed unmutated: blocked-live slot release, inherited role tools, tool-owned role child, header and matrix principal forgery, stale-write acceptance, dedup before auth, dedup ignoring payload, device-bound dedup, lock after open, weakened synchronous, latest-only history, substituted corrupt bytes, revoked stream left open, Kernel mutating its inputs, slow consumer kept, latest-only export and cutoff drift. Any other failure is reported as `failedOtherwise`, never as detection. | tests |
| durable-tool-replay | Process/tests | executed | `npm run verify:durable-tool-replay` | R02/R03: host-derived invocation identity, real SQLite commit-before-result interruption (extended: `RENDER_V3_REPETITIONS=100`), safe/unsafe nested-wrapper refusals. Not a live-provider authorization. | process |
| workflow-task-survival | Tests | executed | `npm run verify:workflow-task-survival` | R01/R07/R09: workflow-owned child survives turn abort; exact report/packet and handoff persist after reopen. | tests |
| role-capability-refusal | Tests | executed | `npm run verify:role-capability-refusal` | R03/R04: real handler scope, explicit tools/model/family/budget, no host fallback, visible missing prerequisites. | tests |
| cancellation-capacity | Tests | executed | `npm run verify:cancellation-capacity` | R05/R06/R08: pure legality plus actual simultaneous provider admissions, blocked ownership versus quiescence, cross-workflow Slice ownership, generation fence/stale receipt refusal, trusted late-result quarantine and unsafe/orphaned startup refusal. R10 additionally holds four silent providers with queued work, a waiting parent and all 32 child request keys before/after reopen: zero idle WAL writes, bounded host lag/human-command acknowledgement (< 1 s regression bound, not full V9), observation and automatic continuation on child results. R11 additionally SIGKILLs parent-results/capacity waits eight times (beyond the pinned restart limit): no parked task/startup refusal, retained blocked execution ownership, queued report completion after confirmed quiescence, and terminal parent cancellation when sandbox capability remains unavailable. | tests |
| history-command-load | Process | executed | `npm run verify:history-command-load` (extended, separate from smoke) | Retain 300 then 1,200 messages across ten workflows. Fourfold history must remain below 8× export time (600 ms noise floor), exact identities/bytes intact; concurrent pages/exports and writes acknowledgement p95 < 250 ms in this bounded local workload, not full V9. Prints measured values. | process |
| history-cutoff-export | Process | executed | `npm run verify:history-cutoff-export` | V7: separate equal-byte revisions, fixed-cutoff pagination/export across concurrent writes and restart; scope/revocation, default selection never widening, page redactions/omissions, local-admin/device receipt-view cursor transfers refused in both directions, named unavailable filters, missing/corrupt/unsupported revisions and missing/malformed/tampered messages declared. R12 adds exact role packet/report/quarantine documents and task receipt bindings, trusted provenance, unchanged cutoff after reopen, standalone-reader consumption and missing/corrupt/unsupported packet declarations. Preimplementation oracles: `docs/verification/historical-export-failure-cases.md` and `docs/verification/durable-role-work-failure-cases.md`. | process |
| independent-export-reader | Process | executed | `npm run verify:independent-export-reader` | V7: fresh standalone Node-builtins reader; literal content plus malformed/version/schema/digest/missing/link refusals. | process |
| context-continuation-independence | Tests/process | executed | `npm run verify:context-continuation-independence` | B1/B2, V3/V8: compatible interrupted role/child waiting reattachment, fenced/quiescent replacement with fresh conversation and predecessor, private-packet canary refused across five independent roles, explicit human direction for same-family work. Missing sandbox/family stays blocked. | tests |
| native-compaction-history | Tests | executed | `npm run verify:native-compaction-history` | B3, V7/V8: actual pinned native compaction twice/reset, literal tool-result tail past 2,000 characters retained while summarizer input is lossy; stale cut and failed blocking compaction; integrated Engine two-compaction/reset/replacement literal-tail preservation, summary admission, serial execution and exact constraint refresh; scoped archived visible transcript/task receipts; missing/corrupt/unknown-schema archive refusal and unchanged reopen/export. Hidden reasoning/opaque fields and absent transients are labelled. | tests |
| policy-adoption | Tests | executed | `npm run verify:policy-adoption` | B4, V7/V8: future defaults versus active bindings, human selected-revision adoption, stale expected basis, away/back never revives a binding, immutable old/current packets, retained completed Watchdog assignments/reports (not a later full rework-cap implementation), missing/corrupt/unknown policy-source refusal before adoption, authorization before source diagnostics, and digest-checked portable policy bytes through the independent reader. | tests |
| task-version-recovery | Tests/process | executed | `npm run verify:task-version-recovery` | B5, V7: missing/older/missing-migration/throwing task definitions retain input, checkpoint and owner; a stopped-store backup and compatible executable reattach; unsafe/orphaned recovery remains blocked. No production numeric migration or generic transformation engine is introduced. | tests |
| full-suite | Tests | executed | `npm test` | All rows with cheap counts (V1 10,000, V2 sampled 32, V3 one repetition per barrier) in < 5 min. | tests |
| typecheck | Static | executed | `npm run typecheck` | `tsc --noEmit` clean. | build |
| lint | Static | executed | `npm run lint` | `biome check` clean. | build |

## Slice6 shortened scripted continuity/handover chain

1. Run `context-continuation-independence`: interrupted same work retains owner/context; replacement requires fence/quiescence and supplies predecessor/current packet.
2. Run `policy-adoption`: publish future defaults, adopt selected revision with expected binding, reject stale adoption, adopt back without reviving old basis or resetting completed reviews.
3. Run `native-compaction-history`: compact twice/reset, read committed history rather than infer it from a summary, promote decisive report bytes before settlement, and export/reopen the retained scoped chain.
4. Run `task-version-recovery`: stop writers/back up, refuse incompatible definitions and preserve uncertainty; return to the compatible executable/store pair without rewriting task meaning.
5. Handover: snapshot identifies assignment commitment, retained owner/Attempt, packet/report/history evidence, blocker and next action. For unsupported workers or policy-refresh interruption, next action is explicit checked fencing/quiescence and fresh linked replacement, not a guessed continuation. A new context never by itself opens an implementation pass.

This grows the executable V8 chain; it is not a complete design/delivery journey, semantic judgment-quality result or a timed human trial. Full V5/V6, later source/effects/verification paths and four concurrent streaming V9 remain absent. The extended V3 job currently covers delivered commit/reply and safe-tool barriers; no 100-repetition process-fault claim is made for a new compaction/settlement cut unless separately recorded.

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
- Do not inspect, copy or run skl tests.
- Never point a check at the user's live data directory or a live Render host.
