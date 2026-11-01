# Render verification

Render's own repository verification asset (spec §8.2). Rows prove behavior only when they execute against the actual
source; scaffolding rows (build, lint) prove only what their command claims. Failure cases and their literal expected
outcomes are in `docs/verification/durable-workspace-failure-cases.md` and `docs/verification/durable-role-work-failure-cases.md`.

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
| unsafe-controls | Tests | executed | `npm run verify:unsafe-controls` | Each of 27 named mutations makes its targeted check fail with that control's own assertion message, after the check passed unmutated: blocked-live slot release, inherited role tools, tool-owned role child, header and matrix principal forgery, stale-write acceptance, dedup before auth, dedup ignoring payload, device-bound dedup, lock after open, weakened synchronous, latest-only history, substituted corrupt bytes, revoked stream left open, Kernel mutating its inputs, slow consumer kept, latest-only export and cutoff drift. Any other failure is reported as `failedOtherwise`, never as detection. | tests |
| scoped-web-research | Process/tests | executed | `npm run verify:scoped-web-research` | B1–B5 / V3/V5/V7: real root Webfox 4.8.0 behind Engine/Durable with owned HTTP responses and SQLite; sequential classified fallback, actual provenance, empty/failure cases, uncertain timeout, abort/current revocation, SIGKILL at primary/fallback, scoped equal-byte observations/tail and host-selection refusals. Extended: `RENDER_V3_REPETITIONS=100 npm run verify:scoped-web-research`. Nine targeted web unsafe controls are included above (including omitted declaration, damaged support, expired deadline and partial top-up). Continuation also covers mandatory declaration at Kernel/Ledger/tool boundaries, explicit no-reliance export/restart, exact damaged-support restoration, mixed partial batches/both failures, fake-clock deadlines and credential echoes. No live provider authorization/quality or Linux proof. | process |
| web-negative-journey | Process/tests | executed | `npm run verify:web-negative-journey` | B4 / available V8 composition: negative observation → exact selected Ledger revision → declared report support → cache expiry → reopen → exact historical evidence/export. Not future checkpoint/annotation/experiment/human-judgment functionality. See `docs/web-research.md` for retention/recovery and evidence-ordering limitation. | process |
| durable-tool-replay | Process/tests | executed | `npm run verify:durable-tool-replay` | R02/R03: host-derived invocation identity, real SQLite commit-before-result interruption (extended: `RENDER_V3_REPETITIONS=100`), safe/unsafe nested-wrapper refusals. Not a live-provider authorization. | process |
| workflow-task-survival | Tests | executed | `npm run verify:workflow-task-survival` | R01/R07/R09: workflow-owned child survives turn abort; exact report/packet and handoff persist after reopen. | tests |
| role-capability-refusal | Tests | executed | `npm run verify:role-capability-refusal` | R03/R04: real handler scope, explicit tools/model/family/budget, no host fallback, visible missing prerequisites. | tests |
| cancellation-capacity | Tests | executed | `npm run verify:cancellation-capacity` | R05/R06/R08: pure legality plus actual simultaneous provider admissions, blocked ownership versus quiescence, cross-workflow Slice ownership, generation fence/stale receipt refusal, trusted late-result quarantine and unsafe/orphaned startup refusal. R10 additionally holds four silent providers with queued work, a waiting parent and all 32 child request keys before/after reopen: zero idle WAL writes, bounded host lag/human-command acknowledgement (< 1 s regression bound, not full V9), observation and automatic continuation on child results. R11 additionally SIGKILLs parent-results/capacity waits eight times (beyond the pinned restart limit): no parked task/startup refusal, retained blocked execution ownership, queued report completion after confirmed quiescence, and terminal parent cancellation when sandbox capability remains unavailable. | tests |
| history-command-load | Process | executed | `npm run verify:history-command-load` (extended, separate from smoke) | Retain 300 then 1,200 messages across ten workflows. Fourfold history must remain below 8× export time (600 ms noise floor), exact identities/bytes intact; concurrent pages/exports and writes acknowledgement p95 < 250 ms in this bounded local workload, not full V9. Prints measured values. | process |
| history-cutoff-export | Process | executed | `npm run verify:history-cutoff-export` | V7: separate equal-byte revisions, fixed-cutoff pagination/export across concurrent writes and restart; scope/revocation, default selection never widening, page redactions/omissions, local-admin/device receipt-view cursor transfers refused in both directions, named unavailable filters, missing/corrupt/unsupported revisions and missing/malformed/tampered messages declared. R12 adds exact role packet/report/quarantine documents and task receipt bindings, trusted provenance, unchanged cutoff after reopen, standalone-reader consumption and missing/corrupt/unsupported packet declarations. Preimplementation oracles: `docs/verification/historical-export-failure-cases.md` and `docs/verification/durable-role-work-failure-cases.md`. | process |
| independent-export-reader | Process | executed | `npm run verify:independent-export-reader` | V7: fresh standalone Node-builtins reader; literal content plus malformed/version/schema/digest/missing/link refusals. | process |
| full-suite | Tests | executed | `npm test` | All rows with cheap counts (V1 10,000, V2 sampled 32, V3 one repetition per barrier) in < 5 min. | tests |
| typecheck | Static | executed | `npm run typecheck` | `tsc --noEmit` clean. | build |
| lint | Static | executed | `npm run lint` | `biome check` clean. | build |

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
